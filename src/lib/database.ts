import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

const connectionString = process.env.DATABASE_URL || process.env.LOVABLE_DB_MIGRATION_URL || '';

if (!connectionString) {
  throw new Error('DATABASE_URL is not set');
}

// For Railway deployment, use postgres connection
const client = postgres(connectionString, {
  prepare: false,
  max: 10,
});

export const db = drizzle(client);