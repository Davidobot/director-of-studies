import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL ?? "postgresql://director:director@localhost:5432/director";

const pool = new Pool({ connectionString });

export const db = drizzle(pool);
