import 'dotenv/config';
import http from 'node:http';
import { createApp } from './app.js';
import { connectDatabase } from './config/db.js';
import { initSockets } from './sockets/index.js';

const PORT = process.env.PORT || 4000;

async function start() {
  await connectDatabase();

  const app = createApp();
  const server = http.createServer(app);
  initSockets(server, process.env.CLIENT_ORIGIN || '*');

  server.listen(PORT, () => {
    console.log(`[api] listening on http://localhost:${PORT}`);
  });
}

start().catch((err) => {
  console.error('[fatal] failed to start server:', err.message);
  process.exit(1);
});
