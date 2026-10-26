"""行情抓取公共模块（复用已验证通道）

通道优先级：
1. 腾讯日K（主通道，最稳）：
   https://proxy.finance.qq.com/ifzqgtimg/appstock/app/newfqkline/get?param=SH600519,day,,,350,
   返回 data[sym]["day"] = [[日期,开,收,高,低,量,...], ...]（不复权；收=idx2 高=idx3）
2. 腾讯实时（盘中）：
   https://qt.gtimg.cn/q=sh600519 → v_sh600519="51~名称~代码~现价~昨收~今开~..."
   现价 = 第4个字段（索引3）
3. 新浪实时兜底：
   https://hq.sinajs.cn/list=sh600519（需 Referer 头，间歇限流）

关键经验：
- 深市代码必须 zfill(6)（"538" 查询 sz538 必败）
- 前缀规则：6开头=sh，0/3开头=sz，8/4开头=bj（北交所）
"""
import time
import requests

UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
QQ_KLINE = "https://proxy.finance.qq.com/ifzqgtimg/appstock/app/newfqkline/get"
QQ_REALTIME = "https://qt.gtimg.cn/q="
SINA_REALTIME = "https://hq.sinajs.cn/list="


def with_prefix(code: str) -> str:
    """6位代码 -> 带交易所前缀的行情符号（腾讯/新浪通用前缀）"""
    code = str(code).zfill(6)
    if code.startswith("6"):
        return "sh" + code
    if code.startswith(("0", "3")):
        return "sz" + code
    if code.startswith(("4", "8", "9", "92")):
        return "bj" + code
    return "sh" + code


def qq_prefix(code: str) -> str:
    """腾讯 K 线接口的大写前缀"""
    sym = with_prefix(code)
    return sym[:2].upper() + sym[2:]


def fetch_daily_kline(code: str, count: int = 350, retries: int = 2):
    """腾讯日K（不复权）。返回 (symbol_key, day_rows) 或抛异常。"""
    param = f"{qq_prefix(code)},day,,,{count},"
    last_err = None
    for _ in range(retries + 1):
        try:
            r = requests.get(QQ_KLINE, params={"param": param}, headers=UA, timeout=10)
            data = r.json().get("data", {})
            if not data:
                raise RuntimeError("empty data")
            key = next(iter(data.keys()))
            node = data[key]
            rows = node.get("day") or node.get("qfqday")
            if not rows:
                raise RuntimeError("no day rows")
            return key, rows
        except Exception as e:
            last_err = e
            time.sleep(1.5)
    raise RuntimeError(f"qq kline failed {code}: {last_err}")


def latest_close_from_kline(code: str):
    """日K最后一根的收盘价与日期（最近交易日）"""
    _, rows = fetch_daily_kline(code)
    last = rows[-1]
    # day 行字段序：日期,开,收,高,低,量,额…
    return {"date": str(last[0]), "close": float(last[2]), "high": float(last[3])}


def fetch_realtime_quote(code: str, retries: int = 2):
    """腾讯实时行情。返回 {price, prev_close, open, name} 或抛异常。"""
    sym = with_prefix(code)
    last_err = None
    for _ in range(retries + 1):
        try:
            r = requests.get(QQ_REALTIME + sym, headers=UA, timeout=8)
            r.encoding = "gbk"
            txt = r.text
            if "=" not in txt:
                raise RuntimeError("bad payload")
            body = txt.split("=", 1)[1].strip().strip(";").strip('"')
            parts = body.split("~")
            if len(parts) < 6:
                raise RuntimeError(f"unexpected parts={len(parts)}")
            return {
                "name": parts[1],
                "code": parts[2],
                "price": float(parts[3]),
                "prev_close": float(parts[4]),
                "open": float(parts[5]),
            }
        except Exception as e:
            last_err = e
            time.sleep(1.5)
    raise RuntimeError(f"qq realtime failed {code}: {last_err}")


def fetch_realtime_fallback_sina(code: str, retries: int = 1):
    """新浪实时兜底（间歇限流，慎用）"""
    sym = with_prefix(code)
    headers = {**UA, "Referer": "https://finance.sina.com.cn"}
    for _ in range(retries + 1):
        try:
            r = requests.get(SINA_REALTIME + sym, headers=headers, timeout=8)
            r.encoding = "gbk"
            txt = r.text
            if '"' not in txt:
                raise RuntimeError("bad payload")
            body = txt.split('"')[1]
            parts = body.split(",")
            # 新浪格式：名称,今开,昨收,现价,最高,最低,...
            return {"name": parts[0], "price": float(parts[3]),
                    "prev_close": float(parts[2]), "open": float(parts[1])}
        except Exception as e:
            last_err = e
            time.sleep(1.5)
    raise RuntimeError(f"sina realtime failed {code}: {last_err}")


def get_realtime(code: str):
    """实时价：腾讯优先，新浪兜底"""
    try:
        return fetch_realtime_quote(code)
    except Exception:
        return fetch_realtime_fallback_sina(code)
