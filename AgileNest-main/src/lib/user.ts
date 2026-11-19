import { randomBytes } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { hashPassword } from "./password";
import { exchangeOAuthCode } from "./feishu";
import { AppError, isUniqueViolation } from "@/modules/core/errors";

export async function createUser(input: {
  email: string;
  password: string;
  name: string;
}) {
  const email = input.email.toLowerCase();
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email));
  if (existing) throw new AppError("该邮箱已被注册");

  const passwordHash = await hashPassword(input.password);
  try {
    const [user] = await db
      .insert(users)
      .values({ email, passwordHash, name: input.name })
      .returning({ id: users.id, email: users.email, name: users.name });
    return user;
  } catch (e) {
    if (isUniqueViolation(e)) throw new AppError("该邮箱已被注册");
    throw e;
  }
}

export async function bindFeishu(
  userId: string,
  input: { openId: string; name: string },
) {
  try {
    await db
      .update(users)
      .set({
        feishuOpenId: input.openId,
        feishuName: input.name,
        feishuBoundAt: sql`now()`,
      })
      .where(eq(users.id, userId));
  } catch (e) {
    if (isUniqueViolation(e)) throw new AppError("该飞书账号已绑定其他用户");
    throw e;
  }
}

export async function unbindFeishu(userId: string) {
  await db
    .update(users)
    .set({ feishuOpenId: null, feishuName: null, feishuBoundAt: null })
    .where(eq(users.id, userId));
}

export async function findOrCreateByFeishu(input: {
  openId: string;
  name: string;
}) {
  const [existing] = await db
    .select({ id: users.id, email: users.email, name: users.name })
    .from(users)
    .where(eq(users.feishuOpenId, input.openId));
  if (existing) return existing;

  const email = `${input.openId.toLowerCase()}@feishu.local`;
  const passwordHash = await hashPassword(randomBytes(32).toString("hex"));
  try {
    const [user] = await db
      .insert(users)
      .values({
        email,
        passwordHash,
        name: input.name,
        feishuOpenId: input.openId,
        feishuName: input.name,
        feishuBoundAt: sql`now()`,
      })
      .returning({ id: users.id, email: users.email, name: users.name });
    return user;
  } catch (e) {
    if (isUniqueViolation(e)) {
      const [u] = await db
        .select({ id: users.id, email: users.email, name: users.name })
        .from(users)
        .where(eq(users.feishuOpenId, input.openId));
      if (u) return u;
    }
    throw e;
  }
}

export async function loginWithFeishuCode(code: string) {
  const { openId, name } = await exchangeOAuthCode(code);
  return findOrCreateByFeishu({ openId, name });
}
