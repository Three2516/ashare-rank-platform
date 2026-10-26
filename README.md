# A股数据榜单平台（ashare-rank-platform）· MVP

A 股细分行业龙头榜单平台（公开引流向）。MVP 核心 = 行业龙头 / 股票数据榜单：

- **131 个申万 2021 版二级行业**，每行业总市值第 1 龙头，一行一条
- 指标：一年前股价（2025-10-17 收盘）· 年内最高 · 当前价 · 涨跌幅 · 上市时长 · 上市年数 · 总市值
- **普通访客**：日频快照（截至最近交易日收盘）
- **owner（用户本人）**：盘中实时数据（每 3 分钟前端轮询刷新），仅 owner 可见，不对外
- AI 文案等工具为后续迭代，已在数据层（`data/schema.sql` 的 `contents` 表）预留模块位置

## 目录结构

```
ashare-rank-platform/
├── app/
│   ├── page.tsx                  # 首页（榜单页，服务端壳）
│   ├── layout.tsx / globals.css
│   └── api/leaders/route.ts      # 榜单 API：访客=快照，owner token=实时
├── components/LeaderBoard.tsx    # 榜单组件：筛选/排序/图表/owner 登录与轮询
├── lib/
│   ├── data.ts                   # 读 data/*.json（Node 侧）
│   ├── auth.ts                   # owner token 识别（预留 Supabase Auth 接入点）
│   └── types.ts
├── data/
│   ├── leaders_snapshot.json     # 日频快照（131 行业龙头种子数据）
│   ├── leaders_realtime.json     # 盘中实时缓存（初始=快照副本，仅 owner 可见）
│   └── schema.sql                # Supabase 迁移预留（users/leaders/realtime_cache/contents/usage）
├── scripts/
│   ├── fetch_quotes.py           # 行情抓取公共模块（腾讯日K主通道 + 腾讯/新浪实时兜底）
│   ├── update_snapshot.py        # 每日收盘后更新日频快照
│   └── update_realtime.py        # 盘中循环更新实时缓存
├── next.config.mjs / tsconfig.json / vercel.json / .env.example
└── README.md
```

## 本地启动

```bash
cd ashare-rank-platform
npm install          # 已装则跳过
cp .env.example .env.local      # 设置 OWNER_TOKEN（owner 令牌）
npm run dev          # 默认 http://localhost:3000
```

1. 打开 `http://localhost:3000` 即见 131 行业龙头榜单，支持按一级/二级行业筛选、搜索、点表头排序、涨跌幅 Top20 与市值 Top10 图表。
2. 页面右上「Owner 令牌」输入 `.env.local` 里的 `OWNER_TOKEN` 并登录：页面切换为**实时模式**（红点呼吸动画徽章），前端每 3 分钟轮询 `/api/leaders`（带 `x-owner-token` 头）。令牌仅存于本地浏览器 localStorage，普通访客看不到实时数据。

## API

`GET /api/leaders`

| 请求 | 返回 |
|---|---|
| 无 token | `mode: "snapshot"` — 日频快照 `data/leaders_snapshot.json` |
| `?token=<OWNER_TOKEN>` 或头 `x-owner-token: <OWNER_TOKEN>` | `mode: "realtime"` — 盘中实时 `data/leaders_realtime.json`，`isOwner: true` |

响应结构：`{ ok, mode, asOf, generatedAt, isOwner, industryCount, rows[] }`，
`rows[]` 字段：`code / name / industry(二级) / sector(一级) / year_ago_price / high_price / current_price / change_pct / listing_duration / listing_years / market_cap`。

验证两档差异的示例（`OWNER_TOKEN=dev-token` 时）：

```bash
curl -s http://localhost:3000/api/leaders | head -c 200
curl -s "http://localhost:3000/api/leaders?token=dev-token" | head -c 200
```

先运行 `scripts/update_realtime.py --once --codes 600519,000001` 写入实时价，再分别 curl 即可看到快照与实时两档 `current_price` 不同。

## 数据更新（定时脚本）

依赖：`python3` + `requests`（`pip3 install requests`）。

```bash
# 每日收盘后更新日频快照（全量 131 只，串行限速）
python3 scripts/update_snapshot.py

# 演示 / 冒烟：只更新指定股票
python3 scripts/update_snapshot.py --codes 600519,000001
python3 scripts/update_realtime.py --once --codes 600519,000001

# 盘中常驻：每 3 分钟循环刷新实时缓存（仅写 leaders_realtime.json）
python3 scripts/update_realtime.py --loop 180
```

行情通道（复用已验证链路）：腾讯日K（不复权）主通道 → 新浪兜底；深市代码自动 `zfill(6)`，北交所 `bj` 前缀。失败个股保持原值并在报告列出，**不编造价格**。

### 定时任务建议（生产）

- 服务器 cron（每交易日 15:05 收盘后）：`python3 scripts/update_snapshot.py`，然后把 `data/leaders_snapshot.json` 提交/同步到仓库。
- 盘中（9:30–15:00）：`python3 scripts/update_realtime.py --loop 180`，实时文件只存在于你的服务器，**永不对外发布**。
- Vercel 部署读取仓库中的 `data/*.json`，`vercel.json` 里的 cron 为占位（Serverless 不适合跑 Python 抓取）。

## 部署（Vercel）

```bash
vercel login
vercel link
vercel --prod
```

- 环境变量在 Vercel 项目 Settings → Environment Variables 配置 `OWNER_TOKEN`。
- `data/*.json` 随仓库提交即完成数据发布；`next.config.mjs` 已设 `output: "standalone"` 便于自托管/容器部署。
- **说明**：当前环境无法真正执行 Vercel 部署（无账号/网络授权），已交付的是本地可运行的完整骨架；部署步骤按上述标准流程执行即可。

## 迁移 Supabase（预留）

1. 在 Supabase SQL Editor 执行 `data/schema.sql`（users / leaders / leaders_snapshot_history / realtime_cache / contents / usage_quota）。
2. 写一个导入脚本把 `data/leaders_snapshot.json` 灌入 `leaders` 表；`/api/leaders` 改为查询 Supabase（PostgREST），`lib/data.ts` 换成 Supabase client。
3. owner 识别从环境变量 token 换成 Supabase Auth：`request.auth.uid` 查 `users.is_owner`（`lib/auth.ts` 已预留替换点）。

## 口径说明

- 行业分类：申万 2021 版二级行业（官方口径 131 个；swsresearch.com 分类表 + akshare 申万指数接口）
- 龙头：每行业总市值第 1（东财全 A 股快照，2026-10-16）
- 行情：腾讯证券日K（不复权）主通道，新浪 / 东财交叉验证
- 一年前股价 = 2025-10-17 收盘；年内最高 = 2025-10-17 至 2026-10-16 区间最高；涨跌幅 = (年内最高 − 一年前) ÷ 一年前 × 100%
- 上市时长 = 2026-10-16 − 首发上市日（东财数据）
- 上市不足一年的龙头（3 家：宇树科技-W / 长鑫科技 / 联讯仪器）涨跌幅显示「—」并排末

数据仅供研究参考，不构成投资建议。
