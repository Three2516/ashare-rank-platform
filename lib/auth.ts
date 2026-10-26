/**
 * owner 识别（MVP）：
 * - 环境变量 OWNER_TOKEN 定义 owner 的访问令牌
 * - 请求头 x-owner-token 或查询参数 ?token= 与之一致即为 owner
 * 后续可平滑迁移到 Supabase Auth（见 data/schema.sql 中 auth 预留注释）。
 */
export function isOwnerRequest(request: Request): boolean {
  const owner = process.env.OWNER_TOKEN;
  if (!owner) return false;
  const header = request.headers.get("x-owner-token");
  if (header && header === owner) return true;
  try {
    const url = new URL(request.url);
    return url.searchParams.get("token") === owner;
  } catch {
    return false;
  }
}
