"""盘中循环更新实时缓存 data/leaders_realtime.json（仅 owner 可见，不对外）

用法：
  python3 scripts/update_realtime.py --once --codes 600519,000001   # 演示：更新指定股票实时价
  python3 scripts/update_realtime.py --once                          # 全量一轮（131 只，串行限速）
  python3 scripts/update_realtime.py --loop 180                      # 盘中常驻：每 180 秒循环刷新
  python3 scripts/update_realtime.py --once --db                     # 双通道：本地 JSON + 云端数据库
  python3 scripts/update_realtime.py --once --force                  # 跳过交易时段检查（调试）

失败个股保持原值并在报告中列出，绝不编造价格。
"""
import argparse
import json
import sys
import time
from datetime import datetime, timezone, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from fetch_quotes import get_realtime  # noqa: E402
import cloud_update  # noqa: E402  # 复用云端写库函数（psycopg 缺失时仅 --db 受影响）

ROOT = Path(__file__).resolve().parent.parent
RT = ROOT / "data" / "leaders_realtime.json"


def is_trading_time():
    """A股交易时段判断：周一至周五 9:30-11:30 / 13:00-15:00，节假日不特殊处理"""
    now = datetime.now()
    if now.weekday() >= 5:
        return False
    hm = now.hour * 60 + now.minute
    return (9 * 60 + 30 <= hm <= 11 * 60 + 30) or (13 * 60 <= hm <= 15 * 60)


def update_round(board, codes, sleep_s):
    rows = board["rows"]
    target = [r for r in rows if r["code"] in codes]
    ok_rows, fail = [], []
    for i, r in enumerate(target, 1):
        try:
            q = get_realtime(r["code"])
            if r["high_price"] is None or q["price"] > r["high_price"]:
                r["high_price"] = round(q["price"], 2)
            r["current_price"] = round(q["price"], 2)
            if r["year_ago_price"]:
                r["change_pct"] = round(
                    (r["high_price"] - r["year_ago_price"]) / r["year_ago_price"] * 100, 2
                )
            ok_rows.append(r)
            print(f"[{i}/{len(target)}] {r['code']} {r['name']} 实时={q['price']} "
                  f"prev={q['prev_close']} 涨跌幅(区间高口径)={r['change_pct']}%")
        except Exception as e:
            fail.append(r["code"])
            print(f"[{i}/{len(target)}] {r['code']} FAILED: {e}")
        time.sleep(sleep_s)
    return ok_rows, fail


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--once", action="store_true", help="只跑一轮")
    ap.add_argument("--loop", type=int, default=0, help="盘中循环间隔秒数（如 180 = 每 3 分钟）")
    ap.add_argument("--codes", type=str, default="", help="逗号分隔的指定代码（默认全部 131 只）")
    ap.add_argument("--sleep", type=float, default=0.8, help="每只之间的间隔秒数")
    ap.add_argument("--db", action="store_true", help="双通道：同时写入云端数据库（需要 DATABASE_URL）")
    ap.add_argument("--force", action="store_true", help="跳过交易时段检查（调试用）")
    args = ap.parse_args()

    board = json.loads(RT.read_text(encoding="utf-8"))
    all_codes = [r["code"] for r in board["rows"]]
    codes = [c.strip().zfill(6) for c in args.codes.split(",") if c.strip()] if args.codes else all_codes

    rounds = 1 if args.once else (0 if args.loop <= 0 else 10**9)
    rnd = 0
    while rnd < rounds:
        rnd += 1
        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        if not args.once and not is_trading_time() and not args.force:
            print(f"非交易时段（{now}），等待 60s 后重新检查...")
            time.sleep(60)
            continue
        print(f"== 第 {rnd} 轮 更新 {len(codes)} 只  @ {now} ==")
        ok_rows, fail = update_round(board, codes, args.sleep)
        board["meta"]["mode"] = "realtime"
        board["meta"]["generated_at"] = now
        board["meta"]["as_of"] = f"盘中实时（更新于 {now}）"
        RT.write_text(json.dumps(board, ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"本轮：成功 {len(ok_rows)} / 失败 {len(fail)}")
        if fail:
            print("失败代码：", fail)
        if args.db and ok_rows:
            try:
                conn = cloud_update.connect()
                try:
                    cloud_update.upsert_realtime(conn, ok_rows, now)
                    print(f"已同步云端 leaders_realtime：{len(ok_rows)} 行")
                finally:
                    conn.close()
            except Exception as e:
                print(f"[db] 云端写入失败（本地文件已更新，不受影响）：{e}")
        if not args.once and args.loop > 0:
            print(f"休眠 {args.loop}s 进入下一轮...")
            time.sleep(args.loop)

    if len(ok_rows) == 0:
        sys.exit(1)


if __name__ == "__main__":
    main()
