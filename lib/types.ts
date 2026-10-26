export interface LeaderRow {
  code: string;
  name: string;
  industry: string;
  sector: string;
  year_ago_price: number | null;
  high_price: number | null;
  current_price: number | null;
  change_pct: number | null;
  listing_duration: string | null;
  listing_years: number | null;
  market_cap: number | null;
}

export interface BoardFile {
  meta: {
    mode: "snapshot" | "realtime";
    generated_at: string;
    as_of: string;
    source?: string;
    note?: string;
    industry_count?: number;
  };
  rows: LeaderRow[];
}

/** /api/leaders 响应结构 */
export interface LeadersResponse {
  ok: boolean;
  mode: "snapshot" | "realtime";
  asOf: string;
  generatedAt: string;
  isOwner: boolean;
  industryCount: number;
  rows: LeaderRow[];
}
