/**
 * Seeds demo data into the configured MongoDB instance.
 *
 *   npm run seed
 *
 * Every run wipes the previous demo data and rebuilds it from scratch.
 */
import 'dotenv/config';
import { connectDatabase, disconnectDatabase } from './config/db.js';
import { seedDemoData } from './seedData.js';

async function main() {
  await connectDatabase();
  await seedDemoData();
  await disconnectDatabase();
}

main().catch((err) => {
  console.error('[seed] failed:', err);
  process.exit(1);
});
