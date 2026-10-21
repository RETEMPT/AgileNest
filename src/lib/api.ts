import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AppError } from "@/modules/core/errors";
import { tryUser } from "@/modules/core/session";
import { headers } from "next/headers";
import { ACCOUNT_CHANGED_MESSAGE, ACCOUNT_HEADER } from "@/components/account-context";

export function jsonError(e: unknown) {
  if (e instanceof AppError) {
    return NextResponse.json({ error: e.message }, { status: e.status, headers: { "Cache-Control": "private, no-store", ...(e.status === 409 && e.message === ACCOUNT_CHANGED_MESSAGE ? { "X-AgileNest-Account-Changed": "1" } : {}) } });
  }
  if (e instanceof ZodError) {
    const msg = e.issues.map((i) => i.message).join("；") || "参数不合法";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
  console.error("[api] unexpected error", e instanceof Error ? e.name : "unknown");
  return NextResponse.json({ error: "服务器错误" }, { status: 500 });
}

export async function requireApiUser() {
  const user = await tryUser();
  if (!user) throw new AppError("未登录", 401);
  const expected = (await headers()).get(ACCOUNT_HEADER);
  if (expected !== null && expected !== user.id) throw new AppError(ACCOUNT_CHANGED_MESSAGE, 409);
  return user;
}
