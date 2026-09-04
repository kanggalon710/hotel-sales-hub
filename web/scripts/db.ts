/** Standalone DB handle for CLI scripts (the app's src/db is server-only). */
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '../src/db/schema.ts';

const file = process.env.DATABASE_FILE ?? './data/crm.sqlite';
const sqlite = new Database(file);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

export const db = drizzle(sqlite, { schema });
export const raw = sqlite;
export * from '../src/db/schema.ts';
