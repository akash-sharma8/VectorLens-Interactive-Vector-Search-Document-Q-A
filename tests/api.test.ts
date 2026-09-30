import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
} from "vitest";
import { vi } from "vitest";
import { createApp } from "../apps/api/src/app.ts";
import type { AIProvider } from "../apps/api/src/ollama.ts";
import { ApiError } from "../apps/api/src/ollama.ts";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

class TestAI implements AIProvider {
  embedModel = "test-embed";
  genModel = "test-generate";
  calls = 0;
  failAt = 0;
  dimension = 2;
  lastPrompt = "";

  async status() {
    return {
      available: true,
      missingModels: [],
    };
  }

  async embed(text: string) {
    this.calls++;

    if (this.calls === this.failAt) {
      throw new ApiError(
        "Injected embedding failure",
        503,
      );
    }

    return text.includes("irrelevant")
      ? [-1, 0]
      : Array.from(
        {
          length: this.dimension,
        },
        (_, i) =>
          i === 0 ? 1 : 0,
      );
  }

  async generate(prompt: string) {
    this.lastPrompt = prompt;

    return "Answer from test provider";
  }
}

const ai = new TestAI();
const { app, db, docs } = createApp(ai, { documentStorage: "memory" })

let server: Server;
let origin: string;

beforeAll(async () => {
  await new Promise<void>(
    (resolve) => {
      server = app.listen(
        0,
        "127.0.0.1",
        () => resolve(),
      );
    },
  );

  origin = `http://127.0.0.1:${(server.address() as AddressInfo)
      .port
    }`;
});

afterAll(
  () =>
    new Promise<void>(
      (resolve, reject) =>
        server.close(
          (error) =>
            error
              ? reject(error)
              : resolve(),
        ),
    ),
);

async function request(
  path: string,
  body?: unknown,
  method?: string,
) {
  const response = await fetch(
    origin + path,
    {
      method:
        method ||
        (body === undefined
          ? "GET"
          : "POST"),
      headers: {
        "Content-Type":
          "application/json",
      },
      ...(body === undefined
        ? {}
        : {
          body: JSON.stringify(body),
        }),
    },
  );

  return {
    status: response.status,
    data: await response.json(),
  };
}

describe(
  "API contracts and RAG lifecycle",
  () => {
    it(
      "seeds demo data and serves search/stats/benchmark/graph contracts",
      async () => {
        expect(
          (await request("/items"))
            .data,
        ).toHaveLength(20);

        expect(
          (await request("/stats"))
            .data.dims,
        ).toBe(16);

        const vector =
          db
            .all()[0]
            .embedding.join(",");

        for (const algo of [
          "hnsw",
          "kdtree",
          "bruteforce",
        ]) {
          const result =
            await request(
              `/search?v=${vector}&k=5&algo=${algo}`,
            );

          expect(
            result.status,
          ).toBe(200);

          expect(
            result.data.results[0].id,
          ).toBe(1);

          expect(
            result.data.latencyUs,
          ).toBeGreaterThanOrEqual(0);
        }

        expect(
          (
            await request(
              `/benchmark?v=${vector}`,
            )
          ).data.itemCount,
        ).toBe(20);

        expect(
          (
            await request(
              "/hnsw-info?metric=manhattan",
            )
          ).data.nodeCount,
        ).toBe(20);
      },
    );

    it("skips generation when document-only mode has no matches", async () => {
      const generate = vi.spyOn(ai, "generate")
        .mockResolvedValue("This must not be used.");

      try {
        // Existing TestAI maps questions containing "irrelevant"
        // to an embedding opposite to the stored test vectors.
        const result = await request("/doc/ask", {
          question: "irrelevant question",
          k: 3,
          documentsOnly: true,
        });

        expect(result.status).toBe(200);
        expect(result.data.contexts).toEqual([]);
        expect(result.data.documentsOnly).toBe(true);
        expect(result.data.generated).toBe(false);

        expect(result.data.answer).toContain(
          "could not find relevant information",
        );

        expect(generate).not.toHaveBeenCalled();
      } finally {
        generate.mockRestore();
      }
    });

    it(
      "rejects bad dimensions, empty coordinates, metrics, k, and JSON",
      async () => {
        const v =
          db
            .all()[0]
            .embedding.join(",");

        for (const path of [
          "/search?v=1,2",
          `/search?v=${v}&k=0`,
          `/search?v=${v}&metric=bad`,
          `/search?v=${v}&k=-1`,
          "/search?v=" +
          Array(16)
            .fill("")
            .join(","),
        ]) {
          expect(
            (await request(path))
              .status,
          ).toBe(400);
        }

        expect(
          (
            await request(
              "/insert",
              {
                metadata: "x",
                category: "cs",
                embedding: [1],
              },
            )
          ).status,
        ).toBe(400);

        expect(
          (
            await fetch(
              origin + "/insert",
              {
                method: "POST",
                headers: {
                  "Content-Type":
                    "application/json",
                },
                body: "{broken",
              },
            )
          ).status,
        ).toBe(400);
      },
    );

    it(
      "inserts and deletes a demo vector",
      async () => {
        const result =
          await request(
            "/insert",
            {
              metadata: "test",
              category: "cs",
              embedding:
                Array(16).fill(
                  0.5,
                ),
            },
          );

        expect(
          result.status,
        ).toBe(201);

        expect(
          (
            await request(
              `/delete/${result.data.id}`,
              undefined,
              "DELETE",
            )
          ).data.ok,
        ).toBe(true);

        expect(
          db.size,
        ).toBe(20);
      },
    );

    it(
      "makes document ingestion atomic when a later embedding fails",
      async () => {
        ai.failAt =
          ai.calls + 2;

        const result =
          await request(
            "/doc/insert",
            {
              title: "failed",
              text: Array(500)
                .fill("word")
                .join(" "),
            },
          );

        expect(
          result.status,
        ).toBe(503);

        expect(
          docs.size,
        ).toBe(0);

        expect(
          db.size,
        ).toBe(20);

        ai.failAt = 0;
      },
    );

    it(
      "links document IDs to markers and deletes only the correct marker after the last chunk",
      async () => {
        const first =
          (
            await request(
              "/doc/insert",
              {
                title: "Notes",
                text: Array(300)
                  .fill("hello")
                  .join(" "),
              },
            )
          ).data;

        const second =
          (
            await request(
              "/doc/insert",
              {
                title:
                  "Notes extra",
                text: "hello",
              },
            )
          ).data;

        expect(
          first.chunks,
        ).toBe(2);

        expect(
          docs.size,
        ).toBe(3);

        expect(
          db
            .all()
            .find(
              (v) =>
                v.id ===
                first.markerId,
            )?.documentId,
        ).toBe(
          first.documentId,
        );

        const answer =
          await request(
            "/doc/ask",
            {
              question:
                "What do the notes say?",
              k: 3,
            },
          );

        expect(
          answer.status,
        ).toBe(200);

        expect(
          answer.data.contexts,
        ).toHaveLength(3);

        expect(
          ai.lastPrompt,
        ).toContain("hello");

        expect(
          answer.data.answer,
        ).toBe(
          "Answer from test provider",
        );

        expect(
          (
            await request(
              "/doc/search",
              {
                question: "hello",
                k: 3,
              },
            )
          ).data.contexts[0]
            .documentId,
        ).toBe(
          first.documentId,
        );

        await request(
          `/doc/delete/${first.ids[0]}`,
          undefined,
          "DELETE",
        );

        expect(
          db
            .all()
            .some(
              (v) =>
                v.id ===
                first.markerId,
            ),
        ).toBe(true);

        await request(
          `/doc/delete/${first.ids[1]}`,
          undefined,
          "DELETE",
        );

        expect(
          db
            .all()
            .some(
              (v) =>
                v.id ===
                first.markerId,
            ),
        ).toBe(false);

        expect(
          db
            .all()
            .some(
              (v) =>
                v.id ===
                second.markerId,
            ),
        ).toBe(true);

        await request(
          `/doc/delete/${second.ids[0]}`,
          undefined,
          "DELETE",
        );

        expect(
          db.size,
        ).toBe(20);

        expect(
          docs.size,
        ).toBe(0);
      },
    );

    it(
      "allows general knowledge with empty context and returns explicit provider failures",
      async () => {
        const result =
          await request(
            "/doc/ask",
            {
              question:
                "General question",
            },
          );

        expect(
          result.data.contexts,
        ).toEqual([]);

        expect(
          ai.lastPrompt,
        ).toContain(
          "use your own general knowledge",
        );

        ai.failAt =
          ai.calls + 1;

        expect(
          (
            await request(
              "/doc/ask",
              {
                question: "fail",
              },
            )
          ).status,
        ).toBe(503);

        ai.failAt = 0;
      },
    );

    it(
      "detects embedding model dimension changes without adding chunks",
      async () => {
        await request(
          "/doc/insert",
          {
            title: "stable",
            text: "hi",
          },
        );

        ai.dimension = 3;

        expect(
          (
            await request(
              "/doc/insert",
              {
                title: "mismatch",
                text: "hi",
              },
            )
          ).status,
        ).toBe(422);

        expect(
          docs.size,
        ).toBe(1);

        expect(
          (
            await request(
              "/doc/search",
              {
                question: "hi",
              },
            )
          ).status,
        ).toBe(422);

        ai.dimension = 2;

        const status =
          (
            await request(
              "/status",
            )
          ).data;

        expect(
          status.docDims,
        ).toBe(2);

        expect(
          status.modelsReady,
        ).toBe(true);
      },
    );
  },
);