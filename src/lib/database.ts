import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../../drizzle/schema";

export type Database = PostgresJsDatabase<typeof schema>;

type DatabaseCache = typeof globalThis & {
  __royalGoodDb?: Database;
  __royalGoodSql?: ReturnType<typeof postgres>;
  __royalGoodDatabaseUrl?: string;
};

/** Lazily create the Railway PostgreSQL connection only when a server function needs it. */
export function getDb(): Database {
  const connectionString = process.env["DATABASE_URL"]?.trim();
  if (!connectionString) {
    throw new Error("DATABASE_URL is missing. Set it to Railway's PostgreSQL connection URL.");
  }

  const cache = globalThis as DatabaseCache;
  if (cache.__royalGoodDb && cache.__royalGoodDatabaseUrl === connectionString) {
    return cache.__royalGoodDb;
  }

  // Railway supplies DATABASE_URL automatically when the app service is linked to
  // its PostgreSQL service. Keep the pool small because serverless replicas each
  // open their own connections.
  const maxConnections = Math.min(
    20,
    Math.max(1, Number.parseInt(process.env["DATABASE_POOL_SIZE"] ?? "5", 10) || 5),
  );
  const client = postgres(connectionString, {
    max: maxConnections,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false,
    onnotice: () => {},
  });

  const database = drizzle(client, { schema });
  cache.__royalGoodSql = client;
  cache.__royalGoodDb = database;
  cache.__royalGoodDatabaseUrl = connectionString;
  return database;
}
