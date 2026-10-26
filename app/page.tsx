import LeaderBoard from "@/components/LeaderBoard";

export default function Home() {
  return (
    <div className="wrap">
      <header className="top">
        <div>
          <h1>A股细分行业龙头一年期股价统计</h1>
          <div className="sub">
            申万2021版二级行业 · 每行业总市值第1龙头 · 行情基准 2026-10-16
          </div>
        </div>
      </header>
      <LeaderBoard />
      <footer>
        <p>
          <b>口径与数据源：</b>行业分类 = 申万2021版二级行业（官方口径131个，swsresearch.com 分类表 + akshare 申万指数接口）；龙头 = 每行业总市值第1（东财全A股快照，2026-10-16）。
        </p>
        <p>
          行情 = 腾讯证券日K（不复权）主通道，新浪 / 东财交叉验证；一年前股价 = 2025-10-17 收盘；年内最高 = 2025-10-17 至 2026-10-16 区间最高；当前股价 = 2026-10-16 收盘；涨跌幅 = (年内最高 − 一年前) ÷ 一年前 × 100%。上市时长 = 2026-10-16 − 首发上市日（东财数据，如贵州茅台 2001-08-27 上市 = 25 年 1 个月）。
        </p>
        <p>
          上市不足一年的龙头（2025-10-17 前无交易）涨跌幅与相关指标显示“—”并排在最后。普通访客展示日频快照；owner 登录后展示盘中实时数据（仅本人可见）。数据仅供研究参考，不构成投资建议。
        </p>
      </footer>
    </div>
  );
}
