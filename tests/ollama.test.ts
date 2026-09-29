import {
  beforeAll,
  afterAll,
  describe,
  it,
  expect,
} from "vitest";

import {
  createServer,
  type Server,
} from "node:http";

import type { AddressInfo } from "node:net";

import { OllamaClient } from "../apps/api/src/ollama.ts";

let server: Server;
let client: OllamaClient;
let mode = "ok";

const requests: {
  url: string;
  body: Record<string, unknown>;
}[] = [];

beforeAll(async () => {
  server = createServer(
    async (req, res) => {
      let raw = "";

      for await (const data of req) {
        raw += data;
      }

      const body = raw
        ? JSON.parse(raw)
        : {};

      requests.push({
        url: req.url!,
        body,
      });

      res.setHeader(
        "Content-Type",
        "application/json",
      );

      if (mode === "bad-json") {
        res.end("no");
        return;
      }

      if (mode === "error") {
        res.statusCode = 404;

        res.end(
          JSON.stringify({
            error:
              "model not found",
          }),
        );

        return;
      }

      if (req.url === "/api/tags") {
        res.end(
          JSON.stringify({
            models: [
              {
                name: "nomic-embed-text:latest",
              },
              ...(mode === "missing"
                ? []
                : [
                    {
                      name: "llama3.2:latest",
                    },
                  ]),
            ],
          }),
        );
      } else if (
        req.url === "/api/embed"
      ) {
        res.end(
          JSON.stringify(
            mode === "bad-vector"
              ? {
                  embeddings: [[]],
                }
              : {
                  embeddings: [
                    [0.1, 0.2, 0.3],
                  ],
                },
          ),
        );
      } else {
        res.end(
          JSON.stringify({
            response: "Model answer",
          }),
        );
      }
    },
  );

  await new Promise<void>(
    (resolve) =>
      server.listen(
        0,
        "127.0.0.1",
        () => resolve(),
      ),
  );

  client = new OllamaClient(
    `http://127.0.0.1:${
      (server.address() as AddressInfo)
        .port
    }`,
  );
});

afterAll(
  () =>
    new Promise<void>((resolve) =>
      server.close(() =>
        resolve(),
      ),
    ),
);

describe(
  "Ollama HTTP adapter",
  () => {
    it(
      "accepts latest-tag model names and detects missing generation model",
      async () => {
        expect(
          await client.status(),
        ).toEqual({
          available: true,
          missingModels: [],
        });

        mode = "missing";

        expect(
          (
            await client.status()
          ).missingModels,
        ).toEqual([
          "llama3.2",
        ]);

        mode = "ok";
      },
    );

    it(
      "uses the documented embed payload and non-streaming generate endpoint",
      async () => {
        expect(
          await client.embed("hello"),
        ).toEqual([
          0.1,
          0.2,
          0.3,
        ]);

        expect(
          requests.at(-1),
        ).toEqual({
          url: "/api/embed",
          body: {
            model:
              "nomic-embed-text",
            input: "hello",
            truncate: false,
          },
        });

        expect(
          await client.generate(
            "question",
          ),
        ).toBe("Model answer");

        expect(
          requests.at(-1)?.body.stream,
        ).toBe(false);
      },
    );

    it(
      "rejects malformed embeddings, bad JSON and provider errors",
      async () => {
        mode = "bad-vector";

        await expect(
          client.embed("hi"),
        ).rejects.toThrow(
          "invalid embedding",
        );

        mode = "bad-json";

        await expect(
          client.embed("hi"),
        ).rejects.toThrow(
          "invalid JSON",
        );

        mode = "error";

        await expect(
          client.embed("hi"),
        ).rejects.toThrow(
          "model not found",
        );

        mode = "ok";
      },
    );
  },
);