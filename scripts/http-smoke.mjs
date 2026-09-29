// Production HTTP smoke test with a TEST-ONLY local Ollama fixture.
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  resolve,
  dirname,
} from "node:path";
import assert from "node:assert/strict";

const root = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
);

const children = [];

function start(
  args,
  cwd = root,
  extra = {},
) {
  const child = spawn(
    process.execPath,
    args,
    {
      cwd,
      env: {
        ...process.env,
        ...extra,
      },
      stdio: [
        "ignore",
        "pipe",
        "pipe",
      ],
    },
  );

  let output = "";

  child.stdout.on(
    "data",
    (data) =>
      (output += data),
  );

  child.stderr.on(
    "data",
    (data) =>
      (output += data),
  );

  children.push(child);

  return () => output;
}

async function ready(url) {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {}

    await new Promise((r) =>
      setTimeout(r, 100),
    );
  }

  throw new Error(
    `Server did not become ready: ${url}`,
  );
}

async function api(
  path,
  body,
  method,
) {
  const response = await fetch(
    "http://127.0.0.1:3000/api" + path,
    {
      method:
        method ||
        (body ? "POST" : "GET"),
      headers: {
        "Content-Type":
          "application/json",
      },
      ...(body
        ? {
            body: JSON.stringify(body),
          }
        : {}),
    },
  );

  return {
    status: response.status,
    data: await response.json(),
  };
}

try {
  start([
    "scripts/ollama-fixture.mjs",
  ]);

  await ready(
    "http://127.0.0.1:11435/api/tags",
  );

  start(
    [
      "--import",
      "tsx",
      "src/server.ts",
    ],
    resolve(root, "apps/api"),
    {
      OLLAMA_BASE_URL:
        "http://127.0.0.1:11435",
    },
  );

  await ready(
    "http://127.0.0.1:8080/stats",
  );

  start(
    [
      resolve(
        root,
        "node_modules/next/dist/bin/next",
      ),
      "start",
      "--hostname",
      "127.0.0.1",
    ],
    resolve(root, "apps/web"),
  );

  await ready(
    "http://127.0.0.1:3000",
  );

  const html = await (
    await fetch(
      "http://127.0.0.1:3000",
    )
  ).text();

  assert.ok(
    html.includes(
      "padhowithPratyush",
    ),
  );

  assert.ok(
    html.includes("DOCUMENTS"),
  );

  const items = await api("/items");

  assert.equal(
    items.data.length,
    20,
  );

  for (const algo of [
    "hnsw",
    "kdtree",
    "bruteforce",
  ]) {
    const result = await api(
      `/search?v=${items.data[0].embedding.join(",")}&algo=${algo}&k=5`,
    );

    assert.equal(
      result.status,
      200,
    );

    assert.equal(
      result.data.results[0].id,
      1,
    );
  }

  assert.equal(
    (
      await api(
        "/search?v=1,2&k=0",
      )
    ).status,
    400,
  );

  assert.equal(
    (
      await api("/status")
    ).data.modelsReady,
    true,
  );

  const inserted = await api(
    "/doc/insert",
    {
      title:
        "HTTP smoke document",
      text: "Dynamic programming uses memoization.",
    },
  );

  assert.equal(
    inserted.status,
    201,
  );

  assert.equal(
    inserted.data.chunks,
    1,
  );

  assert.equal(
    (
      await api("/items")
    ).data.length,
    21,
  );

  const result = await api(
    "/doc/ask",
    {
      question:
        "What is dynamic programming?",
      k: 3,
    },
  );

  assert.equal(
    result.status,
    200,
  );

  assert.equal(
    result.data.contexts.length,
    1,
  );

  assert.ok(
    result.data.answer.startsWith(
      "[TEST FIXTURE]",
    ),
  );

  assert.equal(
    (
      await api(
        "/doc/delete/" +
          inserted.data.ids[0],
        undefined,
        "DELETE",
      )
    ).data.ok,
    true,
  );

  assert.equal(
    (
      await api("/items")
    ).data.length,
    20,
  );

  console.log(
    "PASS: production HTML, proxy, all algorithms, validation, model status, embedding, RAG and linked deletion.",
  );
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  for (
    const child of children.reverse()
  ) {
    child.kill("SIGTERM");
  }
}