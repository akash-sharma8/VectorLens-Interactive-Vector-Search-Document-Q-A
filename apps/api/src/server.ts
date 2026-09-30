import 'dotenv/config';
import { createApp } from './app.ts';
import { checkDatabase, closeDatabase } from './database.ts';
const port = Number(process.env.PORT || 8080);
const host = process.env.HOST || '127.0.0.1';


try {
  const info = await checkDatabase();

  console.log(
    `Database connected: ${info.database} · pgvector ${info.vector_version}`
  );
} catch (error) {
  console.error(
    'Database startup check failed:',
    error instanceof Error ? error.message : 'Unknown error'
  );

  await closeDatabase();
  process.exit(1);
}

const { app, initializeDocuments } = createApp();

try {
  await initializeDocuments();
  console.log("Saved vectors loaded; search indexes rebuilt.");
} catch (error) {
  console.error(
    "Document initialization failed:",
    error instanceof Error ? error.message : "Unknown error",
  );

  await closeDatabase();
  process.exit(1);
}

const server = app.listen(port, host, (error?: Error) => {
  if (error) {
    console.error('Backend failed to start:', error);
    process.exit(1);
  }

  console.log(`VectorDB API: http://${host}:${port}`);
});

let shuttingDown = false;

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    if (shuttingDown) return;
    shuttingDown = true;

    const timeout = setTimeout(() => {
      console.error('Shutdown timed out.');
      process.exit(1);
    }, 10000);

    timeout.unref();

    server.close(async error => {
      try {
        await closeDatabase();
        clearTimeout(timeout);
        process.exit(error ? 1 : 0);
      } catch (error) {
        console.error('Database shutdown failed:', error);
        process.exit(1);
      }
    });
  });
}