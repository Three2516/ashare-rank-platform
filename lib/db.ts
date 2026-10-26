import type { BoardFile, LeaderRow } from "./types";

/**
 * 云端数据库读取层（Vercel Postgres / Neon，PostgreSQL）
 *
 * 规则：
 *  - 环境变量 DATABASE_URL 存在时优先读库（公开=快照表，owner=实时表）
 *  - 数据库不可用 / 未配置时返回 null，由调用方降级到本地 data/*.json（保持现状兜底）
 *
 * 表结构与口径见 data/schema_cloud.sql。
 */

const COLUMNS = `code, name, industry, sector, year_ago_price, high_price,
                 current_price, change_pct, listing_duration, listing_years, market_cap`;

let pool: any = null;

function getPool(): any {
  if (pool) return pool;
  const { Pool } = require("pg");
  pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 3 });
  return pool;
}

async function queryRows(table: string): Promise<LeaderRow[] | null> {
  if (!process.env.DATABASE_URL) return null;
  try {
    const client = await getPool().connect();
    try {
      const res = await client.query(
        `select ${COLUMNS} from ${table} order by change_pct desc nulls last`
      );
      return res.rows.map((r: any) => ({
        code: r.code,
        name: r.name,
        industry: r.industry,
        sector: r.sector,
        year_ago_price: r.year_ago_price == null ? null : Number(r.year_ago_price),
        high_price: r.high_price == null ? null : Number(r.high_price),
        current_price: r.current_price == null ? null : Number(r.current_price),
        change_pct: r.change_pct == null ? null : Number(r.change_pct),
        listing_duration: r.listing_duration,
        listing_years: r.listing_years == null ? null : Number(r.listing_years),
        market_cap: r.market_cap == null ? null : Number(r.market_cap),
      }));
    } finally {
      client.release();
    }
  } catch (e) {
    console.error("[db] 读取失败，降级本地 JSON:", e instanceof Error ? e.message : e);
    return null;
  }
}

async function queryMeta(key: string): Promise<string | null> {
  if (!process.env.DATABASE_URL) return null;
  try {
    const client = await getPool().connect();
    try {
      const res = await client.query(
        "select value from meta where key = $1", [key]
      );
      return res.rows.length ? String(res.rows[0].value) : null;
    } finally {
      client.release();
    }
  } catch {
    return null;
  }
}

async function readTableAsBoard(table: string, mode: "snapshot" | "realtime"): Promise<BoardFile | null> {
  const rows = await queryRows(table);
  if (!rows) return null;
  const [lastAt, industryCount] = await Promise.all([
    queryMeta(mode === "realtime" ? "last_realtime_at" : "last_snapshot_at"),
    queryMeta("industry_count"),
  ]);
  const asOf = lastAt
    ? `${mode === "realtime" ? "盘中实时" : "日频快照"}（更新于 ${lastAt}）`
    : "云端数据库（更新时间为空）";
  return {
    meta: {
      mode,
      generated_at: lastAt ?? "",
      as_of: asOf,
      industry_count: industryCount ? Number(industryCount) : 131,
    },
    rows,
  };
}

/** owner 档：读实时表 */
export function readRealtimeFromDb(): Promise<BoardFile | null> {
  return readTableAsBoard("public.leaders_realtime", "realtime");
}

/** 公开档：读快照表 */
export function readSnapshotFromDb(): Promise<BoardFile | null> {
  return readTableAsBoard("public.leaders_snapshot", "snapshot");
}
