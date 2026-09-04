import 'server-only';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';

const DB_FILE = process.env.DATABASE_FILE ?? './data/crm.sqlite';

function createClient() {
  const sqlite = new Database(DB_FILE);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('busy_timeout = 5000');
  return drizzle(sqlite, { schema });
}

// Next.js keeps modules alive across hot reloads; reuse one handle per process.
const globalForDb = globalThis as unknown as { __crmDb?: ReturnType<typeof createClient> };
export const db = globalForDb.__crmDb ?? createClient();
if (process.env.NODE_ENV !== 'production') globalForDb.__crmDb = db;

export { schema };
export * from './schema';
