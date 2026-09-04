import type { Config } from 'drizzle-kit';

export default {
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'sqlite',
  dbCredentials: { url: process.env.DATABASE_FILE ?? './data/crm.sqlite' },
  strict: true,
  verbose: true,
} satisfies Config;
