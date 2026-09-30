import { OllamaClient } from "./ollama.ts";
import { closeDatabase } from "./database.ts";

import {
  listDocumentChunks,
  getDocumentStats,
  searchDocumentChunks,
} from "./document-repository.ts";

try {
  const ai = new OllamaClient();

  console.log("Stored chunks:");
  console.table(await listDocumentChunks());

  console.log("Database stats:");
  console.log(await getDocumentStats(ai.embedModel));

  const question = "What does Akash study?";

  console.log("Searching:", question);

  const embedding = await ai.embed(question);

  const matches = await searchDocumentChunks(
    embedding,
    ai.embedModel,
    3,
  );

  console.table(
    matches.map(match => ({
      chunkId: match.id,
      documentId: match.documentId,
      title: match.title,
      distance: match.distance,
    })),
  );

  for (const match of matches) {
    console.log("Retrieved text:", match.text);
  }

  if (!matches.length) {
    console.log(
      "No compatible chunks met the distance threshold. " +
      "Check the saved model name and document content."
    );
  }
} catch (error) {
  console.error(
    "Database inspection failed:",
    error instanceof Error ? error.message : "Unknown error",
  );

  process.exitCode = 1;
} finally {
  await closeDatabase();
}