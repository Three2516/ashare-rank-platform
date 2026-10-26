-- ============================================================
-- A股数据榜单平台 · 云端数据库 Schema（Vercel Postgres / Neon 兼容，PostgreSQL 13+）
-- 用途：GitHub Actions 定时抓取写入（scripts/cloud_update.py）→ 线上 /api/leaders 从库读取
-- 执行方式：在 Vercel Storage 控制台 / Neon SQL 编辑器 / psql 中执行本文件（可重复执行）
-- 连接串：DATABASE_URL 环境变量（Postgres 标准连接串），Vercel/Neon 均适配
-- ============================================================

-- ---------- 实时行情表（131 行，仅 owner 可见；盘中每 5 分钟 UPSERT） ----------
create table if not exists public.leaders_realtime (
  code           text primary key,          -- 6 位股票代码
  name           text not null,
  industry       text not null,             -- 申万2021版二级行业
  sector         text not null,             -- 一级行业
  year_ago_price numeric,                   -- 2025-10-17 收盘（口径固定）
  high_price     numeric,                   -- 年内最高（滚动更新）
  current_price  numeric,                   -- 当前价（实时）
  change_pct     numeric,                   -- 涨跌幅（区间高口径）
  listing_duration text,                    -- 上市时长（人类可读）
  listing_years numeric,                    -- 上市年数（约）
  market_cap     numeric,                   -- 总市值（元）
  updated_at     timestamptz default now()  -- 本行最后写入时间
);
create index if not exists idx_realtime_change on public.leaders_realtime (change_pct desc nulls last);
create index if not exists idx_realtime_sector on public.leaders_realtime (sector);

-- ---------- 日频快照表（131 行，公开；每日收盘后全量 UPSERT 覆盖） ----------
create table if not exists public.leaders_snapshot (
  code           text primary key,
  name           text not null,
  industry       text not null,
  sector         text not null,
  year_ago_price numeric,
  high_price     numeric,
  current_price  numeric,
  change_pct     numeric,
  listing_duration text,
  listing_years numeric,
  market_cap     numeric,
  snapshot_date  date,                      -- 快照对应交易日
  updated_at     timestamptz default now()
);
create index if not exists idx_snapshot_change on public.leaders_snapshot (change_pct desc nulls last);

-- ---------- 元信息表（最近更新时间、口径等） ----------
create table if not exists public.meta (
  key        text primary key,
  value      text,
  updated_at timestamptz default now()
);
-- 预置口径说明（供 API 读取展示）
insert into public.meta (key, value) values
  ('industry_count', '131'),
  ('caliber', '申万2021版二级行业；龙头=每行业总市值第1；一年前=2025-10-17收盘；涨跌幅=(年内最高-一年前)/一年前*100%'),
  ('last_snapshot_at', null),
  ('last_realtime_at', null)
on conflict (key) do nothing;

-- ---------- 快照历史（可选：如需回溯往期快照，取消注释） ----------
-- create table if not exists public.leaders_snapshot_history (
--   id bigint generated always as identity primary key,
--   snapshot_date date not null,
--   payload jsonb not null,
--   created_at timestamptz default now()
-- );
-- create index if not exists idx_snapshot_history_date on public.leaders_snapshot_history (snapshot_date desc);
