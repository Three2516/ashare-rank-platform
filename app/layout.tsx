import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "A股细分行业龙头一年期股价统计",
  description:
    "申万2021版二级行业（131个）总市值第1龙头榜单：一年前股价 / 年内最高 / 当前价 / 涨跌幅 / 上市时长。日频快照公开，盘中实时仅 owner 可见。",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <head>
        <link rel="icon" href="/icon.svg" type="image/svg+xml" />
      </head>
      <body>{children}</body>
    </html>
  );
}
