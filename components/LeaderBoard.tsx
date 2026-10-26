"use client";

import { useEffect, useMemo, useState } from "react";
import type { LeadersResponse, LeaderRow } from "@/lib/types";

const TOKEN_KEY = "ashare_owner_token";
const POLL_MS = 180000; // owner 盘中每 3 分钟轮询一次实时数据

const fmt2 = (v: number | null) => (v == null ? "—" : v.toFixed(2));
const fmtY = (v: number | null) => (v == null ? "—" : v.toFixed(1));
const fmtMv = (v: number | null) => (v == null ? "—" : (v / 1e8).toFixed(1));

type SortKey =
  | "code" | "name" | "industry" | "sector"
  | "year_ago_price" | "high_price" | "current_price"
  | "change_pct" | "listing_duration" | "listing_years" | "market_cap";

interface FilterState {
  sector: string;
  industry: string;
  q: string;
  key: SortKey;
  dir: 1 | -1;
}

export default function LeaderBoard() {
  const [data, setData] = useState<LeadersResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState("");
  const [f, setF] = useState<FilterState>({
    sector: "全部", industry: "全部", q: "", key: "change_pct", dir: -1,
  });

  const load = async (withToken: string | null) => {
    const url = "/api/leaders";
    const headers: Record<string, string> = {};
    if (withToken) headers["x-owner-token"] = withToken;
    try {
      const res = await fetch(url, { headers, cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body: LeadersResponse = await res.json();
      setData(body);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    }
  };

  useEffect(() => {
    const saved = localStorage.getItem(TOKEN_KEY);
    if (saved) setToken(saved);
    load(saved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // owner 模式：盘中每 3 分钟轮询实时数据
  useEffect(() => {
    if (!token) return;
    const t = setInterval(() => load(token), POLL_MS);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const saveToken = () => {
    const t = token.trim();
    if (t) {
      localStorage.setItem(TOKEN_KEY, t);
      load(t);
    }
  };
  const logout = () => {
    localStorage.removeItem(TOKEN_KEY);
    setToken("");
    load(null);
  };

  const rows = data?.rows ?? [];
  const sectors = useMemo(() => [...new Set(rows.map((r) => r.sector))].sort(), [rows]);
  const industries = useMemo(() => {
    const base = f.sector === "全部"
      ? rows
      : rows.filter((r) => r.sector === f.sector);
    return [...new Set(base.map((r) => r.industry))].sort();
  }, [rows, f.sector]);

  const filtered = useMemo(() => {
    let a = rows;
    if (f.sector !== "全部") a = a.filter((r) => r.sector === f.sector);
    if (f.industry !== "全部") a = a.filter((r) => r.industry === f.industry);
    const q = f.q.trim().toLowerCase();
    if (q) a = a.filter((r) => r.name.toLowerCase().includes(q) || r.code.includes(q));
    const numKeys: SortKey[] = [
      "year_ago_price", "high_price", "current_price",
      "change_pct", "listing_years", "market_cap",
    ];
    const numeric = numKeys.includes(f.key);
    return [...a].sort((x, y) => {
      if (numeric) {
        const xv = x[f.key as keyof LeaderRow] as number | null;
        const yv = y[f.key as keyof LeaderRow] as number | null;
        if (xv == null && yv == null) return 0;
        if (xv == null) return 1;
        if (yv == null) return -1;
        return (xv - yv) * f.dir;
      }
      return String(x[f.key as keyof LeaderRow]).localeCompare(
        String(y[f.key as keyof LeaderRow]), "zh-Hans-CN"
      ) * f.dir;
    });
  }, [rows, f]);

  const top20 = useMemo(
    () => filtered.filter((r) => r.change_pct != null).slice(0, 20),
    [filtered]
  );
  const maxChg = top20.length ? Math.max(...top20.map((r) => r.change_pct!)) : 1;

  const top10mv = useMemo(
    () => filtered.filter((r) => r.market_cap != null)
      .sort((a, b) => (b.market_cap! - a.market_cap!))
      .slice(0, 10),
    [filtered]
  );
  const maxMv = top10mv.length ? Math.max(...top10mv.map((r) => r.market_cap!)) : 1;

  const top = useMemo(
    () => rows.filter((r) => r.change_pct != null)
      .sort((a, b) => b.change_pct! - a.change_pct!)[0] ?? null,
    [rows]
  );
  const newListed = useMemo(
    () => rows.filter((r) => r.change_pct == null).length, [rows]
  );

  const setSort = (key: SortKey) => {
    setF((prev) => ({
      ...prev,
      key,
      dir: prev.key === key ? (prev.dir * -1 as 1 | -1) : (key === "name" || key === "industry" || key === "sector" ? 1 : -1),
    }));
  };

  if (error) {
    return (
      <div className="card">
        <h2>加载失败</h2>
        <p className="note">{error}。请确认服务已启动且 data/ 目录下数据文件存在。</p>
      </div>
    );
  }

  const isOwner = !!data?.isOwner;

  return (
    <>
      <div className="owner-box">
        {isOwner ? (
          <>
            <span className="mode-pill mode-live"><span className="dot" />实时模式（owner）</span>
            <span className="owner-tip">盘中数据每 3 分钟刷新 · 仅你的账号可见</span>
            <button className="btn" onClick={logout}>退出 owner</button>
          </>
        ) : (
          <>
            <input
              type="password"
              placeholder="Owner 令牌（可选，输入后进入实时模式）"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") saveToken(); }}
            />
            <button className="btn" onClick={saveToken}>登录 owner</button>
            <span className="owner-tip">普通访客仅见日频快照；token 仅存于本地浏览器</span>
          </>
        )}
      </div>

      <div className="badges">
        <div className="badge"><div className="v">{data?.industryCount ?? "—"} 家</div><div className="l">行业龙头总数</div></div>
        <div className="badge"><div className="v">{top ? `${top.name} ${top.change_pct!.toFixed(1)}%` : "—"}</div><div className="l">涨幅最高龙头</div></div>
        <div className="badge"><div className="v">{newListed} 家</div><div className="l">上市不足一年</div></div>
      </div>

      <section className="card">
        <h2>涨跌幅排行 Top 20（一年前 → 区间最高 → 当前）</h2>
        <div className="note">按当前筛选结果展示 · 红涨绿跌</div>
        <div className="chart-box">
          {top20.map((r) => (
            <div className="chart-row" key={r.code}>
              <div className="chart-name" title={r.name}>{r.name}</div>
              <div className="chart-track">
                <div
                  className="chart-fill"
                  style={{
                    width: `${Math.max(2, (r.change_pct! / maxChg) * 100)}%`,
                    background: r.change_pct! >= 0 ? "var(--up)" : "var(--down)",
                  }}
                />
              </div>
              <div className="chart-val">{r.change_pct!.toFixed(1)}%</div>
            </div>
          ))}
        </div>
      </section>

      <section className="card">
        <h2>总市值 Top 10（亿元）</h2>
        <div className="note">市值取自东方财富全A快照 · 随筛选联动</div>
        <div className="chart-box">
          {top10mv.map((r) => (
            <div className="chart-row" key={r.code}>
              <div className="chart-name" title={r.name}>{r.name}</div>
              <div className="chart-track">
                <div className="chart-fill" style={{ width: `${Math.max(2, (r.market_cap! / maxMv) * 100)}%`, background: "var(--accent)" }} />
              </div>
              <div className="chart-val">{(r.market_cap! / 1e8).toFixed(0)} 亿</div>
            </div>
          ))}
        </div>
      </section>

      <section className="card">
        <h2>龙头明细</h2>
        <div className="note">
          数据模式：{isOwner ? "实时" : "日频快照"} · {data?.asOf ?? ""}
        </div>
        <div className="filters">
          <div className="row">
            <select
              value={f.sector}
              onChange={(e) => setF({ ...f, sector: e.target.value, industry: "全部" })}
            >
              <option value="全部">一级行业：全部</option>
              {sectors.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={f.industry} onChange={(e) => setF({ ...f, industry: e.target.value })}>
              <option value="全部">二级行业：全部</option>
              {industries.map((i) => <option key={i} value={i}>{i}</option>)}
            </select>
          </div>
          <div className="row2">
            <input type="search" placeholder="搜索名称 / 代码" value={f.q}
              onChange={(e) => setF({ ...f, q: e.target.value })} />
            <button className="btn" onClick={() => setF({ sector: "全部", industry: "全部", q: "", key: "change_pct", dir: -1 })}>重置</button>
          </div>
        </div>
        <div className="tbl-wrap">
          <table>
            <colgroup>
              <col style={{ width: "8%" }} /><col style={{ width: "11%" }} /><col style={{ width: "14%" }} />
              <col style={{ width: "9%" }} /><col style={{ width: "9%" }} /><col style={{ width: "9%" }} />
              <col style={{ width: "9%" }} /><col style={{ width: "10%" }} /><col style={{ width: "9%" }} />
              <col style={{ width: "7%" }} /><col style={{ width: "9%" }} />
            </colgroup>
            <thead>
              <tr>
                <th className="l" onClick={() => setSort("code")}>代码<span className="arr">{f.key === "code" ? (f.dir < 0 ? "▼" : "▲") : ""}</span></th>
                <th className="l" onClick={() => setSort("name")}>名称<span className="arr">{f.key === "name" ? (f.dir < 0 ? "▼" : "▲") : ""}</span></th>
                <th className="l" onClick={() => setSort("industry")}>二级行业<span className="arr">{f.key === "industry" ? (f.dir < 0 ? "▼" : "▲") : ""}</span></th>
                <th className="l" onClick={() => setSort("sector")}>一级行业<span className="arr">{f.key === "sector" ? (f.dir < 0 ? "▼" : "▲") : ""}</span></th>
                <th onClick={() => setSort("year_ago_price")}>一年前股价<span className="arr">{f.key === "year_ago_price" ? (f.dir < 0 ? "▼" : "▲") : ""}</span></th>
                <th onClick={() => setSort("high_price")}>年内最高<span className="arr">{f.key === "high_price" ? (f.dir < 0 ? "▼" : "▲") : ""}</span></th>
                <th onClick={() => setSort("current_price")}>当前价<span className="arr">{f.key === "current_price" ? (f.dir < 0 ? "▼" : "▲") : ""}</span></th>
                <th onClick={() => setSort("change_pct")}>涨跌幅%<span className="arr">{f.key === "change_pct" ? (f.dir < 0 ? "▼" : "▲") : ""}</span></th>
                <th onClick={() => setSort("listing_duration")}>上市时长<span className="arr">{f.key === "listing_duration" ? (f.dir < 0 ? "▼" : "▲") : ""}</span></th>
                <th onClick={() => setSort("listing_years")}>上市年数<span className="arr">{f.key === "listing_years" ? (f.dir < 0 ? "▼" : "▲") : ""}</span></th>
                <th onClick={() => setSort("market_cap")}>总市值(亿)<span className="arr">{f.key === "market_cap" ? (f.dir < 0 ? "▼" : "▲") : ""}</span></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.code}>
                  <td className="l">{r.code}</td>
                  <td className="l">{r.name}</td>
                  <td className="l">{r.industry}</td>
                  <td className="l">{r.sector}</td>
                  <td>{fmt2(r.year_ago_price)}</td>
                  <td>{fmt2(r.high_price)}</td>
                  <td>{fmt2(r.current_price)}</td>
                  <td className={r.change_pct == null ? "mut" : r.change_pct! >= 0 ? "chg-up" : "chg-dn"}>
                    {r.change_pct == null ? "—" : `${r.change_pct.toFixed(2)}%`}
                  </td>
                  <td>{r.listing_duration ?? "—"}</td>
                  <td>{fmtY(r.listing_years)}</td>
                  <td>{fmtMv(r.market_cap)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="empty">没有符合条件的龙头，试试放宽筛选条件</div>
          )}
        </div>
        <div className="note" style={{ marginTop: 8 }}>
          共 {filtered.length} 行（筛选后） · 排序键：{f.key} {f.dir < 0 ? "降序" : "升序"}
        </div>
      </section>
    </>
  );
}
