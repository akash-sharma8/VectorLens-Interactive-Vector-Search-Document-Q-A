// TEST ONLY: deterministic HTTP fixture for browser verification. Not used by the app.
import { createServer } from "node:http";

let failedOnce = false;
const server = createServer(
  async (req, res) => {
    res.setHeader(
      "Content-Type",
      "application/json",
    );

    let raw = "";

    for await (const part of req) {
      raw += part;
    }

    const body = raw
      ? JSON.parse(raw)
      : {};

    if (req.url === "/api/tags") {
      return res.end(
        JSON.stringify({
          models: [
            {
              name: "nomic-embed-text:latest",
            },
            {
              name: "llama3.2:latest",
            },
          ],
        }),
      );
    }

    if (req.url === "/api/embed") {
      return res.end(
        JSON.stringify({
          embeddings: [
            [1, 0, 0, 0],
          ],
        }),
      );
    }

    if (
      req.url === "/api/generate"
    ) {
      if (body.prompt?.includes('fixture-generation-failure') && !failedOnce) {
        failedOnce = true; res.statusCode = 503; return res.end(JSON.stringify({error:'Injected generation failure'}));
      }
      return res.end(
        JSON.stringify({
          response:
            "[TEST FIXTURE] Dynamic programming stores solutions to overlapping subproblems [1]. This verifies the application flow, not real model quality.",
        }),
      );
    }

    res.statusCode = 404;

    res.end(
      JSON.stringify({
        error:
          "Fixture route not found",
      }),
    );
  },
);

server.listen(
  11435,
  "127.0.0.1",
  () =>
    console.log(
      "TEST-ONLY Ollama fixture: http://127.0.0.1:11435",
    ),
);