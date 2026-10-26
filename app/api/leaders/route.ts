import { NextResponse } from "next/server";
import { readSnapshot, readRealtime } from "@/lib/data";
import { readSnapshotFromDb, readRealtimeFromDb } from "@/lib/db";
import { isOwnerRequest } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/leaders
 *  - 普通访客：日频快照（优先云端 leaders_snapshot 表，数据库不可用时降级本地 data/leaders_snapshot.json）
 *  - owner（x-owner-token / ?token= 与环境变量 OWNER_TOKEN 一致）：盘中实时
 *    （优先云端 leaders_realtime 表，降级本地 data/leaders_realtime.json）
 */
export async function GET(request: Request) {
  const owner = isOwnerRequest(request);

  let board: Awaited<ReturnType<typeof readSnapshot>>;
  let source: "db" | "local";
  if (owner) {
    board = (await readRealtimeFromDb()) ?? (await readRealtime());
    source = process.env.DATABASE_URL ? "db" : "local";
  } else {
    board = (await readSnapshotFromDb()) ?? (await readSnapshot());
    source = process.env.DATABASE_URL ? "db" : "local";
  }

  if (!board) {
    return NextResponse.json(
      { ok: false, error: "数据源不可用（数据库未配置且本地数据缺失）" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    mode: board.meta.mode,
    asOf: board.meta.as_of,
    generatedAt: board.meta.generated_at,
    isOwner: owner,
    source,
    industryCount: board.meta.industry_count ?? 131,
    rows: board.rows,
  });
}
