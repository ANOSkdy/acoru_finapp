import { NextResponse } from "next/server";
import { z } from "zod";
import { pool } from "@/lib/db";
import { insertAuditLog } from "@/lib/auditLog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CreateSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  is_active: z.boolean().optional(),
});

function jsonError(message: string, status = 400, details?: unknown) {
  return NextResponse.json({ ok: false, error: { message, details } }, { status });
}

export async function GET() {
  try {
    const r = await pool.query(
      `SELECT project_id, project_code AS code, project_name AS name, is_active, created_at
       FROM projects
       ORDER BY project_code ASC;`
    );
    return NextResponse.json({ ok: true, rows: r.rows });
  } catch (e: unknown) {
    return jsonError(e instanceof Error ? e.message : String(e), 500);
  }
}

export async function POST(req: Request) {
  const client = await pool.connect();
  try {
    const body = CreateSchema.parse(await req.json());
    await client.query("BEGIN");
    const r = await client.query(
      `INSERT INTO projects (project_code, project_name, is_active)
       VALUES ($1, $2, COALESCE($3, true))
       RETURNING project_id, project_code AS code, project_name AS name, is_active, created_at;`,
      [body.code, body.name, body.is_active ?? true]
    );
    const row = r.rows[0];
    await insertAuditLog(client, {
      actionType: "create",
      targetTable: "projects",
      targetId: row.project_id,
      afterData: row,
    });
    await client.query("COMMIT");
    return NextResponse.json({ ok: true, row }, { status: 201 });
  } catch (e: unknown) {
    await client.query("ROLLBACK");
    if (e && typeof e === "object" && "name" in e && (e as { name?: string }).name === "ZodError") {
      return jsonError("Validation error", 400, e);
    }
    return jsonError(e instanceof Error ? e.message : String(e), 500);
  } finally {
    client.release();
  }
}
