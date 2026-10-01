import { currentUserId } from './request-context.ts';
import { ApiError } from './ollama.ts';
import { getPool } from './database.ts';
import type { PreparedChunk } from './document-chunks.ts';
import { textToEmbedding } from '@vectordb/core/demo';

interface SaveDocumentInput {
  title: string;
  content: string;

  sourceType: 'text' | 'pdf';
  filename?: string;
  pageCount?: number;

  embeddingModel: string;
  chunks: PreparedChunk[];
  embeddings: number[][];
}

export async function saveDocument(input: SaveDocumentInput) {
  const { title, content, sourceType, embeddingModel, chunks, embeddings } = input;

  if (!chunks.length || chunks.length !== embeddings.length) {
    throw new Error('Chunk and embedding counts do not match.');
  }

  const dims = embeddings[0].length;

  if (
    dims < 1 ||
    embeddings.some(
      (embedding) =>
        embedding.length !== dims ||
        embedding.some((value) => !Number.isFinite(value)) ||
        embedding.every((value) => value === 0),
    )
  ) {
    throw new Error(
      'Embeddings must contain finite numbers, have matching dimensions, ' +
        'and must not be zero vectors.',
    );
  }

  if (sourceType === 'pdf') {
    if (
      !Number.isInteger(input.pageCount) ||
      input.pageCount! < 1 ||
      chunks.some(
        (chunk) =>
          chunk.pageStart === null ||
          chunk.pageEnd === null ||
          chunk.pageStart < 1 ||
          chunk.pageEnd < chunk.pageStart ||
          chunk.pageEnd > input.pageCount!,
      )
    ) {
      throw new Error('PDF page references are invalid.');
    }
  } else if (chunks.some((chunk) => chunk.pageStart !== null || chunk.pageEnd !== null)) {
    throw new Error('Pasted text must not have PDF page references.');
  }

  const markerEmbedding = textToEmbedding(title + ' ' + content);
  const client = await getPool().connect();

  try {
    await client.query('BEGIN');

    // 1. Save the parent document.
    const documentResult = await client.query<{ id: number }>(
      `
        INSERT INTO documents (
          title,
          source_type,
          filename,
          content,
          page_count,
          embedding_model,
          embedding_dimensions, user_id
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id
      `,
      [
        title,
        sourceType,
        sourceType === 'pdf' ? (input.filename ?? null) : null,
        content,
        sourceType === 'pdf' ? input.pageCount : null,
        embeddingModel,
        dims,
        currentUserId(),
      ],
    );

    const documentId = documentResult.rows[0].id;
    const ids: number[] = [];

    // 2. Save every chunk with its actual model embedding.
    for (let index = 0; index < chunks.length; index++) {
      const chunk = chunks[index];

      const chunkResult = await client.query<{ id: number }>(
        `
          INSERT INTO document_chunks (
            document_id,
            chunk_index,
            text,
            word_count,
            page_start,
            page_end,
            embedding_dimensions,
            embedding
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8::vector)
          RETURNING id
        `,
        [
          documentId,
          chunk.chunkIndex,
          chunk.text,
          chunk.wordCount,
          chunk.pageStart,
          chunk.pageEnd,
          dims,
          JSON.stringify(embeddings[index]),
        ],
      );

      ids.push(chunkResult.rows[0].id);
    }

    // 3. Save the synthetic 16D marker used by the demo plot.
    const markerResult = await client.query<{ id: number }>(
      `
        INSERT INTO demo_vectors (
          metadata,
          category,
          embedding,
          document_id, user_id
        )
        VALUES ($1, 'doc', $2::double precision[], $3, $4)
        RETURNING id
      `,
      [title, markerEmbedding, documentId, currentUserId()],
    );

    await client.query('COMMIT');

    return {
      documentId,
      ids,
      markerId: markerResult.rows[0].id,
      chunks: chunks.length,
      dims,

      chunkDetails: chunks.map((chunk, index) => ({
        id: ids[index],
        chunkIndex: chunk.chunkIndex,
        wordCount: chunk.wordCount,
        pageStart: chunk.pageStart,
        pageEnd: chunk.pageEnd,
      })),
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function listDocumentChunks() {
  const result = await getPool().query<{
    id: number;
    documentId: number;
    title: string;
    preview: string;
    words: number;
    pageStart: number | null;
    pageEnd: number | null;
  }>(
    `
    SELECT
      c.id,
      c.document_id AS "documentId",
      d.title,
      LEFT(c.text, 120) ||
        CASE WHEN LENGTH(c.text) > 120 THEN '…' ELSE '' END
        AS preview,
      c.word_count AS words,
      c.page_start AS "pageStart",
      c.page_end AS "pageEnd"
    FROM document_chunks c
    JOIN documents d ON d.id = c.document_id
    WHERE d.user_id = $1
    ORDER BY d.id DESC, c.chunk_index ASC
  `,
    [currentUserId()],
  );

  return result.rows;
}

export async function getDocumentStats(model: string) {
  const result = await getPool().query<{
    docCount: number;
    documentCount: number;
    modelDimensions: number[];
  }>(
    `
      SELECT
        (SELECT COUNT(*)::integer FROM document_chunks c JOIN documents d ON d.id=c.document_id WHERE d.user_id=$2)
          AS "docCount",

        (SELECT COUNT(*)::integer FROM documents WHERE user_id=$2)
          AS "documentCount",

        ARRAY(
          SELECT DISTINCT embedding_dimensions
          FROM documents
          WHERE embedding_model = $1 AND user_id=$2
          ORDER BY embedding_dimensions
        ) AS "modelDimensions"
    `,
    [model, currentUserId()],
  );

  return result.rows[0];
}

export async function searchDocumentChunks(
  embedding: number[],
  model: string,
  k: number,
  maxDistance = 0.7,
  documentIds?: number[],
) {
  if (
    !embedding.length ||
    embedding.some((value) => !Number.isFinite(value)) ||
    embedding.every((value) => value === 0)
  ) {
    throw new Error('Query embedding is invalid.');
  }

  if (!Number.isInteger(k) || k < 1 || k > 100) {
    throw new Error('K must be an integer between 1 and 100.');
  }

  if (!Number.isFinite(maxDistance) || maxDistance < 0 || maxDistance > 2) {
    throw new Error('Cosine distance threshold must be between 0 and 2.');
  }

  if (
    documentIds !== undefined &&
    (!documentIds.length ||
      documentIds.length > 100 ||
      documentIds.some((id) => !Number.isInteger(id) || id < 1))
  ) {
    throw new Error('Invalid document selection.');
  }

  const result = await getPool().query<{
    id: number;
    documentId: number;
    title: string;
    text: string;
    distance: number;
    pageStart: number | null;
    pageEnd: number | null;
  }>(
    `
      WITH compatible_chunks AS MATERIALIZED (
        SELECT
          c.id,
          c.document_id,
          d.title,
          c.text,
          c.embedding,
          c.page_start,
          c.page_end
        FROM document_chunks c
        JOIN documents d ON d.id = c.document_id
        WHERE d.user_id = $7 AND d.embedding_model = $2
        AND c.embedding_dimensions = $3
        AND (
            $6::integer[] IS NULL
            OR c.document_id = ANY($6::integer[])
        )
      ),
      ranked AS (
        SELECT
          id,
          document_id AS "documentId",
          title,
          text,
          page_start AS "pageStart",
          page_end AS "pageEnd",
          embedding <=> $1::vector AS distance
        FROM compatible_chunks
      )
      SELECT *
      FROM ranked
      WHERE distance <= $4
      ORDER BY distance ASC, id ASC
      LIMIT $5
    `,
    [
      JSON.stringify(embedding),
      model,
      embedding.length,
      maxDistance,
      k,
      documentIds ?? null,
      currentUserId(),
    ],
  );

  return result.rows;
}

export async function deleteDocumentChunk(id: number) {
  const client = await getPool().connect();

  try {
    await client.query('BEGIN');

    // Lock the parent to serialize deletions within this document.
    const parent = await client.query<{ id: number }>(
      `
        SELECT d.id
        FROM documents d
        JOIN document_chunks c ON c.document_id = d.id
        WHERE c.id = $1 AND d.user_id=$2
        FOR UPDATE OF d
      `,
      [id, currentUserId()],
    );

    if (!parent.rows.length) {
      await client.query('COMMIT');
      return null;
    }

    const documentId = parent.rows[0].id;

    const removed = await client.query('DELETE FROM document_chunks WHERE id = $1 RETURNING id', [
      id,
    ]);

    if (!removed.rows.length) {
      await client.query('COMMIT');
      return null;
    }

    const remaining = await client.query<{ exists: boolean }>(
      `
        SELECT EXISTS (
          SELECT 1
          FROM document_chunks
          WHERE document_id = $1
        ) AS exists
      `,
      [documentId],
    );

    const lastChunk = !remaining.rows[0].exists;

    if (lastChunk) {
      // The linked database marker is removed by ON DELETE CASCADE.
      await client.query('DELETE FROM documents WHERE id = $1', [documentId]);
    }

    await client.query('COMMIT');

    return { documentId, lastChunk };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function listDocumentMarkers() {
  const result = await getPool().query<{
    documentId: number;
    metadata: string;
    embedding: number[];
  }>(
    `
    SELECT
      document_id AS "documentId",
      metadata,
      embedding
    FROM demo_vectors
    WHERE document_id IS NOT NULL AND user_id=$1
    ORDER BY document_id
  `,
    [currentUserId()],
  );

  return result.rows;
}
export async function validateDocumentSelection(ids?: number[]) {
  if (!ids) return;
  const result = await getPool().query(
    'SELECT id FROM documents WHERE user_id=$1 AND id=ANY($2::integer[])',
    [currentUserId(), ids],
  );
  if (result.rows.length !== new Set(ids).size)
    throw new ApiError('Document selection not found.', 404);
}
