import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth, signIn } from "@/lib/auth";
import { exchangeOAuthCode } from "@/lib/feishu";
import { bindFeishu } from "@/lib/user";
import { AppError } from "@/modules/core/errors";

const SITE = process.env.AGILECAMPUS_URL ?? "http://localhost:3000";

function isRedirect(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    "digest" in e &&
    typeof (e as { digest?: unknown }).digest === "string" &&
    (e as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  );
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  const store = await cookies();
  const expected = store.get("feishu_oauth_state")?.value;
  store.delete("feishu_oauth_state");

  const settings = new URL("/settings", SITE);
  if (!code || !state || !expected || state !== expected) {
    settings.searchParams.set("feishu", "state_error");
    return NextResponse.redirect(settings);
  }

  const session = await auth();

  if (session?.user) {
    try {
      const { openId, name } = await exchangeOAuthCode(code);
      await bindFeishu(session.user.id, { openId, name });
      settings.searchParams.set("feishu", "bound");
    } catch (e) {
      settings.searchParams.set("feishu", e instanceof AppError ? "conflict" : "error");
      if (!(e instanceof AppError)) console.error("[feishu callback bind]", e);
    }
    return NextResponse.redirect(settings);
  }

  try {
    await signIn("feishu", { code, redirectTo: "/home" });
  } catch (e) {
    if (isRedirect(e)) throw e;
    const login = new URL("/login", SITE);
    login.searchParams.set("feishu", "login_error");
    return NextResponse.redirect(login);
  }
}
