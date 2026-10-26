/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // data/*.json 由 Python 脚本（scripts/）在本地/CI 更新后随仓库提交；
  // Vercel 部署时无需读写文件系统。若后续在 Serverless 上需要动态写入，
  // 建议迁移到 Supabase（data/schema.sql 已预留迁移结构）。
  output: "standalone",
};

export default nextConfig;
