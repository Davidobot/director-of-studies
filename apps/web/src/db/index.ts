import { drizzle } from "drizzle-orm/node-postgres";
import { Pool, type PoolConfig } from "pg";

// For production, prefer the Supavisor transaction-mode pooler
// (DATABASE_URL_POOLER, port 6543) for higher SSR concurrency.
// Falls back to DATABASE_URL (direct connection, port 5432).
const connectionString =
  process.env.DATABASE_URL_POOLER ??
  process.env.DATABASE_URL ??
  "postgresql://director:director@localhost:5432/director";

// Detect SSL requirement from the connection string or explicit env var.
// Supabase requires sslmode=require; node-postgres needs ssl config set
// separately because it does not parse sslmode from the URL.
const needsSsl =
  connectionString.includes("sslmode=require") ||
  connectionString.includes("sslmode=verify") ||
  process.env.DB_SSL === "true" ||
  process.env.DB_SSL === "1";

const poolConfig: PoolConfig = {
  connectionString: connectionString.replace(/[?&]sslmode=[^&]+/, ""),
  ...(needsSsl ? { ssl: { rejectUnauthorized: false } } : {}),
};

const pool = new Pool(poolConfig);

export const db = drizzle(pool);
