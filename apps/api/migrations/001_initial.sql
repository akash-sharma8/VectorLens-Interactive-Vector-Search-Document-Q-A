CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE documents (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

  title TEXT NOT NULL
    CHECK (char_length(trim(title)) BETWEEN 1 AND 500),

  source_type TEXT NOT NULL
    CHECK (source_type IN ('text', 'pdf')),

  filename TEXT,

  content TEXT NOT NULL
    CHECK (char_length(trim(content)) > 0),

  page_count INTEGER
    CHECK (page_count > 0),

  embedding_model TEXT NOT NULL
    CHECK (char_length(trim(embedding_model)) > 0),

  embedding_dimensions INTEGER NOT NULL
    CHECK (embedding_dimensions > 0),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (id, embedding_dimensions)
);

CREATE TABLE document_chunks (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

  document_id INTEGER NOT NULL,

  chunk_index INTEGER NOT NULL
    CHECK (chunk_index >= 0),

  text TEXT NOT NULL
    CHECK (char_length(trim(text)) > 0),

  word_count INTEGER NOT NULL
    CHECK (word_count > 0),

  page_start INTEGER,
  page_end INTEGER,

  embedding_dimensions INTEGER NOT NULL
    CHECK (embedding_dimensions > 0),

  embedding VECTOR NOT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (document_id, chunk_index),

  FOREIGN KEY (document_id, embedding_dimensions)
    REFERENCES documents (id, embedding_dimensions)
    ON DELETE CASCADE,

  CHECK (
    vector_dims(embedding) = embedding_dimensions
  ),

  CHECK (
    (page_start IS NULL AND page_end IS NULL)
    OR
    (
      page_start IS NOT NULL
      AND page_end IS NOT NULL
      AND page_start >= 1
      AND page_end >= page_start
    )
  )
);

CREATE TABLE demo_vectors (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

  metadata TEXT NOT NULL
    CHECK (char_length(trim(metadata)) BETWEEN 1 AND 1000),

  category TEXT NOT NULL
    CHECK (category IN ('cs', 'math', 'food', 'sports', 'doc')),

  embedding DOUBLE PRECISION[] NOT NULL,

  document_id INTEGER UNIQUE
    REFERENCES documents (id)
    ON DELETE CASCADE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CHECK (
    cardinality(embedding) = 16
    AND array_ndims(embedding) = 1
    AND array_position(embedding, NULL) IS NULL
  ),

  CHECK (
    document_id IS NULL OR category = 'doc'
  )
);