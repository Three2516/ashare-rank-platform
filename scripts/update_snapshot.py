"""每日收盘后更新日频快照 data/leaders_snapshot.json

口径（与榜单页面一致）：
- 一年前股价 = 2025-10-17 收盘（固定，不随每日更新改变）
- 年内最高 = max(2025-10-17 后区间最高, 最新收盘价)  —— 用日K区间最高滚动更新
- 当前股价 = 最近交易日收盘（日K最后一根）
- 涨跌幅 = (年内最高 − 一年前) ÷ 一年前 × 100%
- 上市时长等静态字段不变

用法：
  python3 scripts/update_snapshot.py                # 全量 131 只（串行限速，约 2-3 分钟）
  python3 scripts/update_snapshot.py --limit 5      # 只更新前 5 只（演示/冒烟）
  python3 scripts/update_snapshot.py --codes 600519,000001
  python3 scripts/update_snapshot.py --db           # 双通道：本地 JSON + 云端数据库
"""
import argparse
import json
import sys
import time
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from fetch_quotes import latest_close_from_kline  # noqa: E402
import cloud_update  # noqa: E402  # 复用云端写库函数（psycopg 缺失时仅 --db 受影响）

ROOT = Path(__file__).resolve().parent.parent
SNAP = ROOT / "data" / "leaders_snapshot.json"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0, help="只处理前 N 只（0=全部）")
    ap.add_argument("--codes", type=str, default="", help="逗号分隔的指定代码，优先于 --limit")
    ap.add_argument("--sleep", type=float, default=1.0, help="每只之间的间隔秒数（限速）")
    ap.add_argument("--db", action="store_true", help="双通道：同时写入云端数据库（需要 DATABASE_URL）")
    args = ap.parse_args()

    board = json.loads(SNAP.read_text(encoding="utf-8"))
    rows = board["rows"]
    target = rows
    if args.codes:
        codes = [c.strip().zfill(6) for c in args.codes.split(",") if c.strip()]
        target = [r for r in rows if r["code"] in codes]
    elif args.limit:
        target = rows[: args.limit]

    ok, fail = 0, []
    ok_rows = []
    for i, r in enumerate(target, 1):
        try:
            k = latest_close_from_kline(r["code"])
            if r["high_price"] is None or k["high"] > r["high_price"]:
                r["high_price"] = round(k["high"], 2)
            r["current_price"] = round(k["close"], 2)
            if r["year_ago_price"]:
                r["change_pct"] = round(
                    (r["high_price"] - r["year_ago_price"]) / r["year_ago_price"] * 100, 2
                )
            ok += 1
            ok_rows.append(r)
            print(f"[{i}/{len(target)}] {r['code']} {r['name']} 昨收={k['close']} "
                  f"区间高={r['high_price']} 涨跌幅={r['change_pct']}% as_of={k['date']}")
        except Exception as e:
            fail.append((r["code"], str(e)))
            print(f"[{i}/{len(target)}] {r['code']} FAILED: {e}")
        time.sleep(args.sleep)

    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    board["meta"]["mode"] = "snapshot"
    board["meta"]["generated_at"] = now
    # as_of 取最后一只成功抓到的交易日
    board["meta"]["as_of"] = f"最近交易日收盘（更新于 {now}）"
    SNAP.write_text(json.dumps(board, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"\n完成：成功 {ok} / 失败 {len(fail)}")
    if fail:
        print("失败代码：", [c for c, _ in fail])
    if args.db and ok_rows:
        try:
            conn = cloud_update.connect()
            try:
                cloud_update.upsert_snapshot(
                    conn, ok_rows, now, datetime.now().date().isoformat()
                )
                print(f"已同步云端 leaders_snapshot：{len(ok_rows)} 行")
            finally:
                conn.close()
        except Exception as e:
            print(f"[db] 云端写入失败（本地文件已更新，不受影响）：{e}")
    if ok == 0:
        sys.exit(1)


if __name__ == "__main__":
    main()
