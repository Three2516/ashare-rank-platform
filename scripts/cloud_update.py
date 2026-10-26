"""云端行情更新脚本（GitHub Actions 专用，独立运行）

由 .github/workflows/realtime.yml 按 cron 触发，在云端 runner 上执行：
  - 实时模式（盘中每 5 分钟）：抓 131 只实时价 -> UPSERT leaders_realtime
  - 快照模式（每日收盘后）：抓最近交易日收盘 -> 全量 UPSERT leaders_snapshot + meta

要点：
  - 交易时段精确判断（北京时间 周一至五 9:30-11:30 / 13:00-15:00；--force 可跳过）
  - 失败个股保留库中原值（跳过该行 UPSERT），绝不编造价格
  - 数据库连接串走环境变量 DATABASE_URL（GitHub Secrets -> Vercel Postgres/Neon）

用法：
  python3 scripts/cloud_update.py --mode realtime
  python3 scripts/cloud_update.py --mode snapshot
  python3 scripts/cloud_update.py --mode realtime --force --codes 600519   # 调试
"""
import argparse
import json
import sys
import time
from datetime import datetime, timezone, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from fetch_quotes import get_realtime, latest_close_from_kline  # noqa: E402

try:
    import psycopg
except ImportError:  # 本地无依赖时仅提示，不影响抓取部分
    psycopg = None

ROOT = Path(__file__).resolve().parent.parent
BASELINE = ROOT / "data" / "leaders_snapshot.json"  # 仓库内种子基线（静态字段）
CST = timezone(timedelta(hours=8))


def is_trading_time(now=None):
    """北京时间周一至五 9:30-11:30 / 13:00-15:00（节假日不特殊处理）"""
    now = now or datetime.now(CST)
    if now.weekday() >= 5:
        return False
    hm = now.hour * 60 + now.minute
    return (9 * 60 + 30 <= hm <= 11 * 60 + 30) or (13 * 60 <= hm <= 15 * 60)


def fetch_rows(baseline_rows, codes, mode, sleep_s):
    """抓取并计算动态字段；失败行返回 None 的 code 列表。返回 (ok_rows, fail_codes)。"""
    target = [r for r in baseline_rows if r["code"] in codes]
    ok_rows, fail = [], []
    for i, r in enumerate(target, 1):
        try:
            if mode == "realtime":
                q = get_realtime(r["code"])
                price, high = q["price"], r.get("high_price")
            else:
                k = latest_close_from_kline(r["code"])
                price, high = k["close"], r.get("high_price")
            if high is None or price > high:
                high = round(price, 2)
            row = dict(r)
            row["current_price"] = round(price, 2)
            row["high_price"] = high
            row["change_pct"] = round(
                (high - row["year_ago_price"]) / row["year_ago_price"] * 100, 2
            ) if row.get("year_ago_price") else None
            ok_rows.append(row)
            print(f"[{i}/{len(target)}] {row['code']} {row['name']} 价={price} 高={high} chg={row['change_pct']}%")
        except Exception as e:
            fail.append(r["code"])
            print(f"[{i}/{len(target)}] {r['code']} FAILED: {e}")
        time.sleep(sleep_s)
    return ok_rows, fail


def connect():
    url = __import__("os").environ.get("DATABASE_URL")
    if not url:
        raise RuntimeError("DATABASE_URL 环境变量未设置（GitHub Actions 中通过 Secrets 注入）")
    if psycopg is None:
        raise RuntimeError("缺少 psycopg，请先 pip install 'psycopg[binary]'")
    return psycopg.connect(url, connect_timeout=15)


def upsert_realtime(conn, rows, now_str):
    with conn.cursor() as cur:
        cur.executemany(
            """insert into public.leaders_realtime
               (code,name,industry,sector,year_ago_price,high_price,current_price,
                change_pct,listing_duration,listing_years,market_cap,updated_at)
               values (%(code)s,%(name)s,%(industry)s,%(sector)s,%(year_ago_price)s,
                %(high_price)s,%(current_price)s,%(change_pct)s,%(listing_duration)s,
                %(listing_years)s,%(market_cap)s, now())
               on conflict (code) do update set
                name=excluded.name, industry=excluded.industry, sector=excluded.sector,
                year_ago_price=excluded.year_ago_price, high_price=excluded.high_price,
                current_price=excluded.current_price, change_pct=excluded.change_pct,
                listing_duration=excluded.listing_duration, listing_years=excluded.listing_years,
                market_cap=excluded.market_cap, updated_at=now()""",
            [dict(r, **{"listing_duration": r.get("listing_duration") or None}) for r in rows],
        )
        cur.execute(
            """insert into public.meta (key,value,updated_at) values ('last_realtime_at',%s,now())
               on conflict (key) do update set value=excluded.value, updated_at=now()""",
            (now_str,),
        )
    conn.commit()


def upsert_snapshot(conn, rows, now_str, trade_date):
    with conn.cursor() as cur:
        cur.executemany(
            """insert into public.leaders_snapshot
               (code,name,industry,sector,year_ago_price,high_price,current_price,
                change_pct,listing_duration,listing_years,market_cap,snapshot_date,updated_at)
               values (%(code)s,%(name)s,%(industry)s,%(sector)s,%(year_ago_price)s,
                %(high_price)s,%(current_price)s,%(change_pct)s,%(listing_duration)s,
                %(listing_years)s,%(market_cap)s,%(snapshot_date)s, now())
               on conflict (code) do update set
                name=excluded.name, industry=excluded.industry, sector=excluded.sector,
                year_ago_price=excluded.year_ago_price, high_price=excluded.high_price,
                current_price=excluded.current_price, change_pct=excluded.change_pct,
                listing_duration=excluded.listing_duration, listing_years=excluded.listing_years,
                market_cap=excluded.market_cap, snapshot_date=excluded.snapshot_date, updated_at=now()""",
            [dict(r, listing_duration=r.get("listing_duration") or None, snapshot_date=trade_date) for r in rows],
        )
        cur.execute(
            """insert into public.meta (key,value,updated_at) values ('last_snapshot_at',%s,now())
               on conflict (key) do update set value=excluded.value, updated_at=now()""",
            (now_str,),
        )
    conn.commit()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--mode", choices=["realtime", "snapshot"], default="realtime")
    ap.add_argument("--force", action="store_true", help="跳过交易时段检查（调试用）")
    ap.add_argument("--codes", type=str, default="", help="逗号分隔指定代码（默认全部 131 只）")
    ap.add_argument("--sleep", type=float, default=0.6, help="每只之间间隔秒数")
    args = ap.parse_args()

    now = datetime.now(CST)
    if args.mode == "realtime" and not is_trading_time(now) and not args.force:
        print(f"非交易时段（北京时间 {now:%Y-%m-%d %H:%M:%S}），实时更新跳过；快照模式不受限。")
        return

    board = json.loads(BASELINE.read_text(encoding="utf-8"))
    codes = [c.strip().zfill(6) for c in args.codes.split(",") if c.strip()] if args.codes \
        else [r["code"] for r in board["rows"]]

    print(f"== 云端更新 [{args.mode}] {len(codes)} 只 @ 北京时间 {now:%Y-%m-%d %H:%M:%S} ==")
    ok_rows, fail = fetch_rows(board["rows"], codes, args.mode, args.sleep)
    if not ok_rows:
        print("没有任何一只抓取成功，退出码 1（便于 Actions 报警）。")
        sys.exit(1)

    conn = connect()  # 先抓取后连接，抓取失败时不浪费数据库连接
    try:
        now_str = now.strftime("%Y-%m-%d %H:%M:%S")
        if args.mode == "realtime":
            upsert_realtime(conn, ok_rows, now_str)
        else:
            upsert_snapshot(conn, ok_rows, now_str, now.date().isoformat())
        print(f"已写入数据库：{len(ok_rows)} 行（{args.mode}）")
    finally:
        conn.close()

    if fail:
        print("失败代码（库中保留原值，未覆盖）：", fail)


if __name__ == "__main__":
    main()
