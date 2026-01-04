import { Pool } from "@neondatabase/serverless";
import { env } from "./env";

declare global {
  // eslint-disable-next-line no-var
  var __pool: Pool | undefined;
}

export const pool =
  global.__pool ??
  new Pool({
    connectionString: env.DATABASE_URL,
  });

if (process.env.NODE_ENV !== "production") global.__pool = pool;
