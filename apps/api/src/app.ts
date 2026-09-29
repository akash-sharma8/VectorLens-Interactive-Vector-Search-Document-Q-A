import express from "express";
import { z, ZodError } from "zod";
import { VectorDB, DocumentDB, chunkText } from "@vectordb/core";
import { DEMO_ITEMS, textToEmbedding } from "@vectordb/core/demo";
import { extractPdf } from './pdf.ts';
import type { Context } from "@vectordb/core/types";

import { ApiError, OllamaClient, type AIProvider } from "./ollama.ts";

const metric = z
  .enum(["cosine", "euclidean", "manhattan"])
  .default("cosine");

const kSchema = z.coerce
  .number()
  .int()
  .min(1)
  .max(100);

const vector = z
  .array(
    z
      .number()
      .finite()
      .min(-1e6)
      .max(1e6),
  )
  .length(16);

const querySchema = z.object({
  v: z
    .string()
    .transform((v) =>
      v
        .split(",")
        .map((s) => (s.trim() ? Number(s) : NaN)),
    )
    .pipe(vector),
  k: kSchema.default(5),
  metric,
  algo: z
    .enum(["hnsw", "kdtree", "bruteforce"])
    .default("hnsw"),
});

const questionSchema = z.object({
  question: z
    .string()
    .trim()
    .min(1)
    .max(10000),
  k: kSchema.default(3),
});

export function buildPrompt(
  question: string,
  hits: Context[],
) {
  const context = hits
    .map(
      (hit, i) =>
        `[${i + 1}] ${hit.title}:\n${hit.text}\n\n`,
    )
    .join("");

  return (
    "You are a helpful assistant. Answer the user's question directly. Use the provided context if it contains relevant information. If it doesn't, just use your own general knowledge. IMPORTANT: Do NOT mention the 'context', 'provided text', or say things like 'the context doesn't mention'. Just answer the question naturally.\n\nContext:\n" +
    context +
    "Question: " +
    question +
    "\n\nAnswer:"
  );
}

export function createApp(
  ai: AIProvider = new OllamaClient(),
) {
  const app = express();
  const db = new VectorDB();
  const docs = new DocumentDB();

  for (const item of DEMO_ITEMS) {
    db.insert(
      item.metadata,
      item.category,
      item.embedding,
    );
  }

  app.disable("x-powered-by");

  app.use((req, res, next) => {
    const origin =
      process.env.WEB_ORIGIN ||
      "http://localhost:3000";

    if (req.headers.origin === origin) {
      res.setHeader(
        "Access-Control-Allow-Origin",
        origin,
      );
      res.setHeader("Vary", "Origin");
    }

    res.setHeader(
      "Access-Control-Allow-Methods",
      "GET, POST, DELETE, OPTIONS",
    );

    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type",
    );

    res.setHeader("Cache-Control", "no-store");

    if (req.method === "OPTIONS") {
      res.sendStatus(204);
      return;
    }

    next();
  });

  app.use(express.json({ limit: "1mb" }));

  app.get("/items", (_req, res) =>
    res.json(db.all()),
  );

  app.post("/insert", (req, res) => {
    const data = z
      .object({
        metadata: z
          .string()
          .trim()
          .min(1)
          .max(1000),
        category: z.enum([
          "cs",
          "math",
          "food",
          "sports",
          "doc",
        ]),
        embedding: vector,
      })
      .parse(req.body);

    res.status(201).json({
      id: db.insert(
        data.metadata,
        data.category,
        data.embedding,
      ),
    });
  });

  app.delete("/delete/:id", (req, res) =>
    res.json({
      ok: db.remove(
        z.coerce
          .number()
          .int()
          .positive()
          .parse(req.params.id),
      ),
    }),
  );

  app.get("/search", (req, res) => {
    const q = querySchema.parse(req.query);

    res.json(
      db.search(
        q.v,
        q.k,
        q.metric,
        q.algo,
      ),
    );
  });

  app.get("/benchmark", (req, res) => {
    const q = querySchema.parse(req.query);

    res.json(
      db.benchmark(
        q.v,
        q.k,
        q.metric,
      ),
    );
  });

  app.get("/hnsw-info", (req, res) =>
    res.json(
      db.info(
        metric.parse(req.query.metric),
      ),
    ),
  );

  app.get("/stats", (_req, res) =>
    res.json({
      count: db.size,
      dims: db.dims,
      algorithms: [
        "bruteforce",
        "kdtree",
        "hnsw",
      ],
      metrics: [
        "euclidean",
        "cosine",
        "manhattan",
      ],
    }),
  );

  app.post(
    "/doc/insert",
    async (req, res) => {
      const data = z
        .object({
          title: z
            .string()
            .trim()
            .min(1)
            .max(500),
          text: z
            .string()
            .trim()
            .min(1)
            .max(200000),
        })
        .parse(req.body);

      const chunks = chunkText(data.text);

      if (chunks.length > 100) {
        throw new ApiError(
          "Please insert at most 100 chunks at a time.",
        );
      }

      const embeddings: number[][] = [];

      for (const chunk of chunks) {
        embeddings.push(await ai.embed(chunk));
      }

      let result;

      try {
        result = docs.insertBatch(
          data.title,
          chunks,
          embeddings,
        );
      } catch (error) {
        throw new ApiError(
          error instanceof Error
            ? error.message
            : "Invalid embeddings",
          422,
        );
      }

      const markerId = db.insert(
        data.title,
        "doc",
        textToEmbedding(
          data.title + " " + data.text,
        ),
        result.documentId,
      );

      res.status(201).json({
        ...result,
        markerId,
      });
    },
  );

  // PDF aur pasted text, dono same embedding pipeline use karte hain.
  const insertDocument = async (title: string, text: string) => {
    const chunks = chunkText(text);

    if (chunks.length > 100) {
      throw new ApiError(
        'Document is too long. Please split it into smaller parts.',
        413
      );
    }

    const embeddings: number[][] = [];

    for (const chunk of chunks) {
      embeddings.push(await ai.embed(chunk));
    }

    let result;

    try {
      result = docs.insertBatch(title, chunks, embeddings);
    } catch (error) {
      throw new ApiError(
        error instanceof Error ? error.message : 'Invalid embeddings',
        422
      );
    }

    const markerId = db.insert(
      title,
      'doc',
      textToEmbedding(title + ' ' + text),
      result.documentId
    );

    return { ...result, markerId };
  };

  // Existing paste-text workflow.
  app.post('/doc/insert', async (req, res) => {
    const data = z.object({
      title: z.string().trim().min(1).max(500),
      text: z.string().trim().min(1).max(200000),
    }).parse(req.body);

    res.status(201).json(
      await insertDocument(data.title, data.text)
    );
  });

  // New PDF upload workflow.
  app.post(
    '/doc/upload',
    express.raw({ type: 'application/pdf', limit: '10mb' }),
    async (req, res) => {
      if (!req.is('application/pdf')) {
        throw new ApiError('Only PDF uploads are supported.', 415);
      }

      const title = z.string()
        .trim()
        .min(1)
        .max(500)
        .parse(req.query.title);

      const pdf = await extractPdf(req.body);
      const result = await insertDocument(title, pdf.text);

      res.status(201).json({
        ...result,
        pages: pdf.pages,
        characters: pdf.text.length,
      });
    }
  );

  app.get("/doc/list", (_req, res) =>
    res.json(docs.summaries()),
  );

  app.delete(
    "/doc/delete/:id",
    (req, res) => {
      const removed = docs.remove(
        z.coerce
          .number()
          .int()
          .positive()
          .parse(req.params.id),
      );

      if (removed?.lastChunk) {
        for (const marker of db
          .all()
          .filter(
            (v) =>
              v.documentId ===
              removed.documentId,
          )) {
          db.remove(marker.id);
        }
      }

      res.json({ ok: !!removed });
    },
  );

  const retrieve = async (
    question: string,
    k: number,
  ) => {
    const embedding = await ai.embed(question);

    try {
      return docs.search(embedding, k);
    } catch {
      throw new ApiError(
        "Embedding dimensions changed. Restore the original model or delete and reinsert documents.",
        422,
      );
    }
  };

  app.post(
    "/doc/search",
    async (req, res) => {
      const q = questionSchema.parse(
        req.body,
      );

      res.json({
        contexts: await retrieve(
          q.question,
          q.k,
        ),
      });
    },
  );

  app.post(
    "/doc/ask",
    async (req, res) => {
      const q = questionSchema.parse(
        req.body,
      );

      const contexts = await retrieve(
        q.question,
        q.k,
      );

      const answer = await ai.generate(
        buildPrompt(
          q.question,
          contexts,
        ),
      );

      res.json({
        answer,
        model: ai.genModel,
        contexts,
        docCount: docs.size,
      });
    },
  );

  app.get(
    "/status",
    async (_req, res) => {
      const status = await ai.status();

      res.json({
        ollamaAvailable: status.available,
        modelsReady:
          status.available &&
          !status.missingModels.length,
        missingModels:
          status.missingModels,
        embedModel: ai.embedModel,
        genModel: ai.genModel,
        docCount: docs.size,
        docDims: docs.dims,
        demoDims: db.dims,
        demoCount: db.size,
      });
    },
  );

  app.use((_req, res) =>
    res
      .status(404)
      .json({ error: "Route not found" }),
  );

  app.use(
    (
      error: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      if (error instanceof ZodError) {
        res.status(400).json({
          error: error.issues
            .map(
              (i) =>
                `${i.path.join(".") ||
                "request"
                }: ${i.message}`,
            )
            .join("; "),
        });

        return;
      }

      if (error instanceof ApiError) {
        res
          .status(error.status)
          .json({ error: error.message });

        return;
      }

      if (error instanceof SyntaxError) {
        res
          .status(400)
          .json({
            error: "Invalid JSON request",
          });

        return;
      }

      if (
        typeof error === 'object' &&
        error !== null &&
        'type' in error &&
        error.type === 'entity.too.large'
      ) {
        res.status(413).json({
          error: _req.path === '/doc/upload'
            ? 'PDF exceeds the 10 MB upload limit.'
            : 'Request body exceeds 1 MB.',
        });
        return;
      }

      console.error(error);

      res
        .status(500)
        .json({
          error: "Unexpected server error",
        });
    },
  );

  return { app, db, docs };
}