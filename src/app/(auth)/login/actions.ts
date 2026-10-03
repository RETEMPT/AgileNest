"use server";

import { AuthError } from "next-auth";
import { signIn } from "@/lib/auth";

export type FormState = { error: string } | null;

/** 把底层异常压成一条可判断的链路，避免 next-auth 层层包裹后丢失真因。 */
function causeChain(e: unknown): string[] {
  const out: string[] = [];
  let cur: unknown = e;
  for (let i = 0; i < 6 && cur; i += 1) {
    const err = cur as {
      message?: string;
      code?: string;
      cause?: unknown;
      errors?: { message?: string; code?: string }[];
    };
    if (err.message) out.push(err.message);
    if (err.code) out.push(err.code);
    if (Array.isArray(err.errors)) {
      for (const sub of err.errors) {
        if (sub?.message) out.push(sub.message);
        if (sub?.code) out.push(sub.code);
      }
    }
    cur = err.cause;
  }
  return out;
}

function isDbDown(chain: string[]): boolean {
  const joined = chain.join(" ").toUpperCase();
  return (
    joined.includes("ECONNREFUSED") ||
    joined.includes("ENOTFOUND") ||
    joined.includes("CONNECT_TIMEOUT") ||
    joined.includes("CONNECTION REFUSED") ||
    joined.includes("ECONNRESET") ||
    // postgres.js 连不上时的 AggregateError 包装
    (joined.includes("AGGREGATEERROR") && joined.includes("5432"))
  );
}

function isMissingSecret(chain: string[]): boolean {
  const joined = chain.join(" ").toUpperCase();
  return (
    joined.includes("MISSINGSECRET") ||
    joined.includes("AUTH_SECRET") ||
    joined.includes("NO_SECRET")
  );
}

export async function loginAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirectTo: "/home",
    });
    return null;
  } catch (e) {
    if (e instanceof AuthError) {
      // 账密本身不对 —— 走 CredentialsSignin，直接告诉用户
      if (e.type === "CredentialsSignin") return { error: "邮箱或密码不正确" };

      const chain = causeChain(e);
      console.error("[login]", e.type, chain, e);

      if (isDbDown(chain)) {
        return {
          error: "连不上数据库。请先启动 Postgres（setup.bat 或 docker compose up -d），再刷新重试。",
        };
      }
      if (isMissingSecret(chain)) {
        return {
          error: "缺少 AUTH_SECRET。请在 .env 里补上后重启 dev server（npm run dev）。",
        };
      }
      return {
        error: `登录服务异常（${e.type}），请查看服务器日志。`,
      };
    }
    throw e;
  }
}
