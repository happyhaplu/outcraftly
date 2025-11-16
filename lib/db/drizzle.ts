import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import dotenv from 'dotenv';

import * as schema from './schema';

dotenv.config();

const isBuildPhase = process.env.NEXT_PHASE === 'phase-production-build';
const isTest = process.env.NODE_ENV === 'test';
const skipCheck = process.env.SKIP_DB_VALIDATION === 'true';
const allowMissingDb = isBuildPhase || isTest || skipCheck;

const missingDbMessage =
  'POSTGRES_URL environment variable is not set. Provide a database URL or set SKIP_DB_VALIDATION=true to bypass this check for local builds.';

type PostgresClient = ReturnType<typeof postgres>;
type DrizzleClient = PostgresJsDatabase<typeof schema>;

const createNoopProxy = (context: 'db' | 'client'): any =>
  new Proxy(
    () => {
      throw new Error(missingDbMessage);
    },
    {
      get: (_target, prop) => {
        if (prop === 'then') {
          return undefined;
        }
        throw new Error(missingDbMessage + ` Accessed property "${String(prop)}" on ${context}.`);
      },
      apply: () => {
        throw new Error(missingDbMessage);
      }
    }
  );

let client: PostgresClient;
let db: DrizzleClient;

if (!process.env.POSTGRES_URL) {
  if (!allowMissingDb) {
    throw new Error(missingDbMessage);
  }

  if (!isBuildPhase) {
    console.warn('[db] POSTGRES_URL not set. Using a no-op database proxy.');
  }

  client = createNoopProxy('client') as PostgresClient;
  db = createNoopProxy('db') as DrizzleClient;
} else {
  client = postgres(process.env.POSTGRES_URL, {
    max: Number.parseInt(process.env.POSTGRES_MAX_CONNECTIONS ?? '10', 10),
    idle_timeout: Number.parseInt(process.env.POSTGRES_IDLE_TIMEOUT ?? '5', 10),
    connect_timeout: Number.parseInt(process.env.POSTGRES_CONNECT_TIMEOUT ?? '10', 10)
  });
  db = drizzle(client, { schema });
}

export { client, db };
