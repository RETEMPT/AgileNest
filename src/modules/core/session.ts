import { redirect } from "next/navigation";

/** 取当前登录用户；未登录跳转 /login。用于 Server Component / Action 入口。 */
export async function requireUser() {
  const { auth } = await import("@/lib/auth");
  const session = await auth();
  if (!session?.user) redirect("/login");
  return session.user;
}

/** 同上但不跳转，返回 null。用于 API Route。 */
export async function tryUser() {
  const { auth } = await import("@/lib/auth");
  const session = await auth();
  return session?.user ?? null;
}
