-- ============================================================
-- A股数据榜单平台 · Supabase 迁移预留
-- MVP 阶段数据层 = 本地 JSON（data/leaders_snapshot.json / leaders_realtime.json）
-- 本文件为平滑迁移 Supabase 的 Schema 蓝图，当前不用于运行。
--
-- 迁移思路：
--  1. 建表后由 scripts/ 的导出任务把 data/*.json 灌入对应表
--  2. /api/leaders 改为查询 Supabase（PostgREST），其余代码结构不变
--  3. owner 识别从环境变量 OWNER_TOKEN 换成 Supabase Auth（见 auth 预留）
-- ============================================================

-- ---------- 用户 / owner ----------
create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  is_owner boolean default false,          -- owner 账号标记（访问实时数据的依据）
  created_at timestamptz default now()
);
-- auth 预留：后续 owner 登录走 Supabase Auth，/api/leaders 从
-- request.auth.uid 判断角色，替换 lib/auth.ts 中的环境变量 token 方案。

-- ---------- 行业龙头榜单（当前 JSON 的主表） ----------
create table if not exists public.leaders (
  code text primary key,                   -- 6 位股票代码
  name text not null,
  industry text not null,                  -- 申万2021版二级行业
  sector text not null,                    -- 一级行业
  year_ago_price numeric,                  -- 2025-10-17 收盘（口径固定）
  high_price numeric,                      -- 年内最高
  current_price numeric,                   -- 当前价
  change_pct numeric,                      -- 涨跌幅（区间高口径）
  listing_duration text,                   -- 上市时长（人类可读）
  listing_years numeric,                   -- 上市年数（约）
  market_cap numeric,                      -- 总市值（元）
  updated_at timestamptz default now()
);
create index if not exists idx_leaders_sector on public.leaders (sector);
create index if not exists idx_leaders_change on public.leaders (change_pct desc);

-- ---------- 日频快照历史（审计 / 回溯） ----------
create table if not exists public.leaders_snapshot_history (
  id bigint generated always as identity primary key,
  snapshot_date date not null,
  payload jsonb not null,                  -- 当日完整榜单快照
  created_at timestamptz default now()
);
create index if not exists idx_snapshot_date on public.leaders_snapshot_history (snapshot_date desc);

-- ---------- 盘中实时缓存（仅 owner 可见） ----------
create table if not exists public.realtime_cache (
  code text primary key references public.leaders (code),
  price numeric not null,
  prev_close numeric,
  fetched_at timestamptz default now()
);

-- ---------- 内容表（AI 文案等后续迭代的模块占位） ----------
create table if not exists public.contents (
  id uuid primary key default gen_random_uuid(),
  slug text unique,                        -- 内容路由标识
  title text,
  body text,
  kind text default 'ai_copy',             -- 预留：ai_copy / report / page
  owner_only boolean default false,        -- 预留：是否仅 owner 可见
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ---------- 额度 / 用量（预留：公开引流限流） ----------
create table if not exists public.usage_quota (
  key text primary key,                    -- 如 api:leaders:daily
  used integer default 0,
  limit integer default 0,                 -- 0 = 不限制
  reset_at timestamptz
);

-- 行级安全：MVP 阶段全公开读；实时缓存仅 owner（迁移到 Auth 后启用）
alter table public.realtime_cache enable row level security;
-- 预留策略（Auth 就绪后取消注释）：
-- create policy "realtime owner only" on public.realtime_cache
--   for select using (auth.uid() in (select id from public.users where is_owner));
