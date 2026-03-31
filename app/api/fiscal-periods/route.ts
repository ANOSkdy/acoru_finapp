import { NextResponse } from "next/server";
import { pool } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const r = await pool.query(
      `SELECT period_id, fiscal_year, period_name, start_date, end_date, status
       FROM fiscal_periods
       ORDER BY fiscal_year DESC, start_date DESC;`
    );
    return NextResponse.json({ ok: true, rows: r.rows });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: { message: e instanceof Error ? e.message : String(e) } }, { status: 500 });
  }
}
