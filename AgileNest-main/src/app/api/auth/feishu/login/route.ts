import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";

const BASE = process.env.FEISHU_BASE_URL ?? "https://open.feishu.cn";

export async function GET(req: Request) {
  const appId = process.env.FEISHU_APP_ID?.trim();
  // 检查 FEISHU_APP_ID 是否有效配置，防止重定向到飞书时触发 20028 client_id 不合法错误
  if (!appId) {
    const referer = req.headers.get("referer") || "";
    const redirectPath = referer.includes("/settings")
      ? "/settings?notice=feishu_not_configured"
      : "/login?error=feishu_not_configured";
    return NextResponse.redirect(new URL(redirectPath, req.url));
  }

  const state = randomBytes(16).toString("hex");
  const store = await cookies();
  store.set("feishu_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 600,
    path: "/",
  });

  const authorize = new URL(`${BASE}/open-apis/authen/v1/authorize`);
  authorize.searchParams.set("app_id", appId);
  authorize.searchParams.set("redirect_uri", process.env.FEISHU_REDIRECT_URI ?? "");
  authorize.searchParams.set("state", state);
  return NextResponse.redirect(authorize);
}
