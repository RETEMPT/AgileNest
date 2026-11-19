import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const startTime = Date.now();
  try {
    // 快速 SELECT 1 测试数据库连接与响应耗时
    await db.execute(sql`SELECT 1`);
    const durationMs = Date.now() - startTime;
    return NextResponse.json({
      status: "ok",
      uptime: Math.floor(process.uptime()),
      db: {
        status: "connected",
        latencyMs: durationMs,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const err = error as { message?: string; code?: string };
    return NextResponse.json(
      {
        status: "degraded",
        uptime: Math.floor(process.uptime()),
        db: {
          status: "disconnected",
          error: err.message ?? "Database query failed",
          code: err.code,
        },
        timestamp: new Date().toISOString(),
      },
      { status: 503 },
    );
  }
}
