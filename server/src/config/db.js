import mongoose from 'mongoose';

export async function connectDatabase(uri) {
  const target = uri || process.env.MONGODB_URI;
  if (!target) {
    throw new Error('MONGODB_URI is not set. Copy .env.example to .env and fill it in.');
  }

  mongoose.set('strictQuery', true);
  await mongoose.connect(target);
  console.log(`[db] connected to ${mongoose.connection.name}`);
  return mongoose.connection;
}

export async function disconnectDatabase() {
  await mongoose.disconnect();
}
