/**
 * Zero-setup development server.
 *
 *   npm run dev:memory
 *
 * Boots an in-memory MongoDB, seeds the demo data, and starts the API — so the
 * whole app can be demonstrated on a machine with neither MongoDB nor Docker
 * installed. Data lives only for the lifetime of the process.
 *
 * For real persistence use `npm run dev` against a proper MongoDB instance.
 */
import 'dotenv/config';
import http from 'node:http';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

import { createApp } from './app.js';
import { initSockets } from './sockets/index.js';
import { seedDemoData } from './seedData.js';

const PORT = process.env.PORT || 4000;

// The in-memory server needs a secret even though nothing here is persistent.
process.env.JWT_SECRET ||= 'in-memory-development-secret';

async function start() {
  console.log('[dev] starting in-memory MongoDB (first run downloads a binary)…');
  const mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  console.log('[dev] database ready');

  await seedDemoData();

  const app = createApp();
  const server = http.createServer(app);
  initSockets(server, process.env.CLIENT_ORIGIN || '*');

  server.listen(PORT, () => {
    console.log(`\n[dev] API listening on http://localhost:${PORT}`);
    console.log('[dev] start the client with:  cd client && npm run dev\n');
  });

  const shutdown = async () => {
    console.log('\n[dev] shutting down…');
    await mongoose.disconnect();
    await mongo.stop();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

start().catch((err) => {
  console.error('[dev] failed to start:', err);
  process.exit(1);
});
