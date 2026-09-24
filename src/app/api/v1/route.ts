import { NextResponse } from "next/server";
import { tryUser } from "@/modules/core/session";

/**
 * 模块 REST 契约入口（统一前缀 /api/v1）。
 * Phase 0 只注册骨架；各 owner 在 feature/* 分支补实现路由。
 * 约定：session 认证（浏览器）或后续 Agent Token（见 modules/agent-api/ROADMAP.md）。
 */
export async function GET() {
  const user = await tryUser();
  return NextResponse.json({
    ok: true,
    authed: !!user,
    modules: ["tasks", "board", "review", "worklog", "stats", "calendar", "milestone", "notify"],
    docs: "/docs/CONTRACTS.md",
  });
}
