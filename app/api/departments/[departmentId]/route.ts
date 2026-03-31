import { NextResponse } from "next/server";
import { z } from "zod";
import { pool } from "@/lib/db";
import { insertAuditLog } from "@/lib/auditLog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PatchSchema = z
  .object({
    code: z.string().min(1).optional(),
    name: z.string().min(1).optional(),
    is_active: z.boolean().optional(),
  })
  .strict();

type RouteContext = { params: Promise<{ departmentId: string }> };

function jsonError(message: string, status = 400, details?: unknown) {
  return NextResponse.json({ ok: false, error: { message, details } }, { status });
}

export async function PATCH(req: Request, { params }: RouteContext) {
  const client = await pool.connect();
  try {
    const { departmentId } = await params;
    const body = PatchSchema.parse(await req.json());
    const sets: string[] = [];
    const values: Array<string | boolean> = [];
    let i = 1;

    if (body.code !== undefined) {
      sets.push(`department_code = $${i++}`);
      values.push(body.code);
    }
    if (body.name !== undefined) {
      sets.push(`department_name = $${i++}`);
      values.push(body.name);
    }
    if (body.is_active !== undefined) {
      sets.push(`is_active = $${i++}`);
      values.push(body.is_active);
    }
    if (sets.length === 0) return jsonError("No fields to update", 400);

    await client.query("BEGIN");
    const before = await client.query(
      `SELECT department_id, department_code AS code, department_name AS name, is_active, created_at
       FROM departments WHERE department_id = $1;`,
      [departmentId]
    );
    if (before.rowCount === 0) {
      await client.query("ROLLBACK");
      return jsonError("Not found", 404);
    }

    values.push(departmentId);
    const updated = await client.query(
      `UPDATE departments SET ${sets.join(", ")}
       WHERE department_id = $${i}
       RETURNING department_id, department_code AS code, department_name AS name, is_active, created_at;`,
      values
    );
    const row = updated.rows[0];

    await insertAuditLog(client, {
      actionType: "update",
      targetTable: "departments",
      targetId: departmentId,
      beforeData: before.rows[0],
      afterData: row,
    });
    await client.query("COMMIT");
    return NextResponse.json({ ok: true, row });
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
