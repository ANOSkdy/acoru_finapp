import { z } from "zod";

const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1),

  BLOB_READ_WRITE_TOKEN: z.string().min(1),

  GEMINI_API_KEY: z.string().min(1),
  GEMINI_MODEL: z.string().min(1).default("gemini-3-flash-preview"),

  CRON_SECRET: z.string().min(16),

  MAX_FILE_BYTES: z.coerce.number().int().positive().default(10 * 1024 * 1024),
  MAX_FILES_PER_RUN: z.coerce.number().int().positive().default(50),

  DEFAULT_CREDIT_ACCOUNT: z.string().min(1).default("普通預金"),

  CRON_LOCK_TTL_SECONDS: z.coerce.number().int().positive().default(600),
});

export const env = EnvSchema.parse(process.env);
