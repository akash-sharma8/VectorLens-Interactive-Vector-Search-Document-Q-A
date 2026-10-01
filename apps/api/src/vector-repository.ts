import { currentUserId } from './request-context.ts';
import { getPool } from './database.ts';
import { DEMO_ITEMS } from '@vectordb/core/demo';
import type { Category } from '@vectordb/core/types';

export interface StoredVector {
  id: number;
  metadata: string;
  category: Category;
  embedding: number[];
  documentId: number | null;
}

export async function seedDemoVectors() {
  const client = await getPool().connect();

  try {
    await client.query('BEGIN');

    const marker = await client.query(
      `
        INSERT INTO app_metadata (key, value)
        VALUES ($1, 'complete')
        ON CONFLICT (key) DO NOTHING
        RETURNING key
      `,
      ['demo_seed_v1:' + currentUserId()],
    );

    // Already seeded: preserve existing insertions and deletions.
    if (!marker.rows.length) {
      await client.query('COMMIT');
      return;
    }

    for (const item of DEMO_ITEMS) {
      await client.query(
        `
          INSERT INTO demo_vectors (
            metadata,
            category,
            embedding, user_id
          )
          VALUES ($1, $2, $3::double precision[], $4)
        `,
        [item.metadata, item.category, item.embedding, currentUserId()],
      );
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function listStoredVectors(): Promise<StoredVector[]> {
  const result = await getPool().query<StoredVector>(
    `
    SELECT
      id,
      metadata,
      category,
      embedding,
      document_id AS "documentId"
    FROM demo_vectors
    WHERE user_id=$1
    ORDER BY id
  `,
    [currentUserId()],
  );

  return result.rows;
}

export async function saveDemoVector(metadata: string, category: Category, embedding: number[]) {
  const result = await getPool().query<{ id: number }>(
    `
      INSERT INTO demo_vectors (
        metadata,
        category,
        embedding, user_id
      )
      VALUES ($1, $2, $3::double precision[], $4)
      RETURNING id
    `,
    [metadata, category, embedding, currentUserId()],
  );

  return result.rows[0].id;
}

export async function deleteStoredVector(id: number) {
  const result = await getPool().query(
    'DELETE FROM demo_vectors WHERE id = $1 AND user_id=$2 RETURNING id',
    [id, currentUserId()],
  );

  return result.rows.length > 0;
}
