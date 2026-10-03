import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AppError } from "@/modules/core/errors";
import { tryUser } from "@/modules/core/session";

export function jsonError(e: unknown) {
  if (e instanceof AppError) {
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
  if (e instanceof ZodError) {
    const msg = e.issues.map((i) => i.message).join("；") || "参数不合法";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
  console.error("[api]", e);
  return NextResponse.json({ error: "服务器错误" }, { status: 500 });
}

export async function requireApiUser() {
  const user = await tryUser();
  if (!user) throw new AppError("未登录", 401);
  return user;
}
