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
      if (!isBuildPhase) {
        throw new Error(missingDbMessage);
      }
      return createNoopProxy(context);
    },
    {
      get: (_target, prop) => {
        if (prop === 'then') {
          return undefined;
        }
        if (isBuildPhase) {
          // During build, return a chainable noop proxy for any property access
          return createNoopProxy(context);
        }
        throw new Error(missingDbMessage + ` Accessed property "${String(prop)}" on ${context}.`);
      },
      apply: () => {
        if (isBuildPhase) {
          return createNoopProxy(context);
        }
        throw new Error(missingDbMessage);
      }
    }
  );

// Initialize with noop proxies by default to prevent undefined errors
let client: PostgresClient = createNoopProxy('client') as PostgresClient;
let db: DrizzleClient = createNoopProxy('db') as DrizzleClient;

if (!process.env.POSTGRES_URL) {
  if (!allowMissingDb) {
    throw new Error(missingDbMessage);
  }

  if (!isBuildPhase) {
    console.warn('[db] POSTGRES_URL not set. Using a no-op database proxy.');
  }

  // Already initialized with noop proxies above
} else {
  const connectionConfig: postgres.Options<{}> = {
    max: Number.parseInt(process.env.POSTGRES_MAX_CONNECTIONS ?? '10', 10),
    idle_timeout: Number.parseInt(process.env.POSTGRES_IDLE_TIMEOUT ?? '30', 10),
    max_lifetime: Number.parseInt(process.env.POSTGRES_MAX_LIFETIME ?? '3600', 10),
    connect_timeout: Number.parseInt(process.env.POSTGRES_CONNECT_TIMEOUT ?? '10', 10),
    ssl: 'require',
    prepare: false, // Required for PgBouncer/connection poolers
    onnotice: () => {}, // Suppress notices to reduce noise
  };
  
  client = postgres(process.env.POSTGRES_URL, connectionConfig);
  db = drizzle(client, { schema });
}

export { client, db };
