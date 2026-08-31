/**
 * Verifies that MONGODB_URI in .env actually connects.
 *
 *   npm run check:db
 *
 * Run this once after pasting your Atlas connection string — it gives a clear
 * diagnosis instead of the raw driver error you would get from the server.
 */
import 'dotenv/config';
import mongoose from 'mongoose';

const uri = process.env.MONGODB_URI;

function fail(message, hint) {
  console.error(`\n  FAILED: ${message}`);
  if (hint) console.error(`  Fix:    ${hint}\n`);
  process.exit(1);
}

if (!uri || uri.includes('PASTE_YOUR_ATLAS_CONNECTION_STRING_HERE')) {
  fail(
    'MONGODB_URI has not been set in server/.env',
    'Open server/.env and replace the placeholder with your Atlas connection string.'
  );
}

if (uri.includes('<db_password>') || uri.includes('<password>')) {
  fail(
    'The connection string still contains the placeholder <db_password>',
    'Replace it with the real password you set for your Atlas database user.'
  );
}

// Warn (but do not fail) when no database name is present: the driver then
// falls back to "test", which works but puts the data somewhere unexpected.
// Strip the scheme and any query string, then look for a path segment.
const withoutScheme = uri.replace(/^mongodb(\+srv)?:\/\//, '');
const pathPart = withoutScheme.split('?')[0];
const hasDbName = /\/[A-Za-z0-9_-]+$/.test(pathPart);

if (!hasDbName) {
  console.warn(
    '\n  WARNING: no database name in the connection string.\n' +
    '           Append /agile_task_manager to the host so the data has a clear home.\n'
  );
}

console.log('\n  Connecting to MongoDB…');

try {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });

  const { name, host } = mongoose.connection;
  console.log(`  Connected.`);
  console.log(`  Database: ${name}`);
  console.log(`  Host:     ${host}`);

  const collections = await mongoose.connection.db.listCollections().toArray();
  console.log(
    collections.length
      ? `  Collections: ${collections.map((c) => c.name).join(', ')}`
      : '  Collections: none yet (expected before seeding)'
  );

  console.log('\n  All good. Next:  npm run seed\n');
  await mongoose.disconnect();
} catch (err) {
  const msg = err.message || '';

  if (msg.includes('bad auth') || msg.includes('Authentication failed')) {
    fail(
      'Atlas rejected the username or password',
      'Check the database user credentials under Atlas > Database Access. ' +
      'If the password contains @ : / or ?, it must be percent-encoded in the URI.'
    );
  }
  if (msg.includes('ENOTFOUND') || msg.includes('querySrv')) {
    fail(
      'The cluster hostname could not be resolved',
      'Check the hostname is copied correctly, and that you have internet access.'
    );
  }
  if (msg.includes('timed out') || msg.includes('ServerSelection')) {
    fail(
      'Connected to the internet but Atlas did not accept the connection',
      'In Atlas > Network Access, add your current IP address (or 0.0.0.0/0 to allow any).'
    );
  }

  fail(msg);
}
