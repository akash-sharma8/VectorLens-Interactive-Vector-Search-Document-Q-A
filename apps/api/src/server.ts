import 'dotenv/config';
import { createApp } from './app.ts';

const port = Number(process.env.PORT || 8080);
const host = process.env.HOST || '127.0.0.1';
const { app } = createApp();

const server = app.listen(port, host, (error?: Error) => {
  if (error) {
    console.error('Backend failed to start:', error);
    process.exit(1);
  }

  console.log(`VectorDB API: http://${host}:${port}`);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}