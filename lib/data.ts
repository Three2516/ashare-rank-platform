import { promises as fs } from "fs";
import path from "path";
import type { BoardFile } from "./types";

const DATA_DIR = path.join(process.cwd(), "data");

async function readBoardFile(name: string): Promise<BoardFile | null> {
  try {
    const raw = await fs.readFile(path.join(DATA_DIR, name), "utf-8");
    return JSON.parse(raw) as BoardFile;
  } catch {
    return null;
  }
}

/** 日频快照（截至昨日收盘），普通访客可见 */
export function readSnapshot(): Promise<BoardFile | null> {
  return readBoardFile("leaders_snapshot.json");
}

/** 盘中实时缓存，仅 owner 可见 */
export function readRealtime(): Promise<BoardFile | null> {
  return readBoardFile("leaders_realtime.json");
}
