import { NextResponse } from "next/server";
import { pool } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const r = await pool.query(
      `SELECT account_code, account_name, account_type, is_active
       FROM account_master
       WHERE is_active = true
       ORDER BY sort_order ASC, account_code ASC;`
    );
    return NextResponse.json({ ok: true, rows: r.rows });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: { message: e instanceof Error ? e.message : String(e) } }, { status: 500 });
  }
}
