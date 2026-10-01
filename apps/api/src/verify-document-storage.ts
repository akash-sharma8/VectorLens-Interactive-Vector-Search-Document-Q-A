import { requestContext } from './request-context.ts';
import { OllamaClient } from './ollama.ts';
import { prepareChunks } from './document-chunks.ts';
import { saveDocument } from './document-repository.ts';
import { getPool, closeDatabase } from './database.ts';

async function verify() {
  const ai = new OllamaClient();

  const content =
    'Akash studies Electrical Engineering. ' +
    'A vector database retrieves related text using embeddings.';

  const chunks = prepareChunks(content);
  const embeddings: number[][] = [];

  console.log('Generating embeddings with Ollama...');

  for (const chunk of chunks) {
    embeddings.push(await ai.embed(chunk.text));
  }

  const saved = await saveDocument({
    title: 'Database persistence check',
    content,
    sourceType: 'text',
    embeddingModel: ai.embedModel,
    chunks,
    embeddings,
  });

  console.log('Saved:', saved);

  // Read the saved rows directly from PostgreSQL.
  const result = await getPool().query(
    `
      SELECT
        d.id AS document_id,
        d.title,
        d.embedding_model,
        c.chunk_index,
        c.word_count,
        c.page_start,
        c.page_end,
        vector_dims(c.embedding) AS dimensions
      FROM documents d
      JOIN document_chunks c ON c.document_id = d.id
      WHERE d.id = $1
      ORDER BY c.chunk_index
    `,
    [saved.documentId],
  );

  console.table(result.rows);

  console.log(`Verification document saved with ID ${saved.documentId}.`);
}

try {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email)
    throw new Error(
      'Pass a registered account email: npm run db:verify-storage -w @vectordb/api -- email',
    );
  const user = (
    await getPool().query('SELECT id FROM users WHERE email=$1 AND password_hash IS NOT NULL', [
      email,
    ])
  ).rows[0];
  if (!user) throw new Error('Registered user not found.');
  await requestContext.run({ userId: user.id }, verify);
} catch (error) {
  console.error(
    'Storage verification failed:',
    error instanceof Error ? error.message : 'Unknown error',
  );

  process.exitCode = 1;
} finally {
  await closeDatabase();
}
