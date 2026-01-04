import { Pool } from "@neondatabase/serverless";
import { env } from "./env";

const globalForPool = globalThis as unknown as { __pool?: Pool };

export const pool =
  globalForPool.__pool ??
  new Pool({
    connectionString: env.DATABASE_URL,
  });

if (process.env.NODE_ENV !== "production") {
  globalForPool.__pool = pool;
}