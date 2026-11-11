import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { apiTokens, users } from "@/db/schema";
import { AppError, NotFoundError } from "@/modules/core";

export const tokenCreateSchema = z.object({
  name: z.string().trim().min(1, "令牌名称不能为空").max(100, "名称最多 100 字"),
  expiresInDays: z.number().int().min(1, "有效期至少 1 天").max(365, "有效期最多 365 天").optional(),
});

export type TokenCreateInput = z.infer<typeof tokenCreateSchema>;

export type ApiTokenItem = {
  id: string;
  name: string;
  prefix: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
};

export type CreatedApiToken = ApiTokenItem & {
  token: string; // 明文只在创建成功时返回一次
};

export async function createPersonalApiToken(
  userId: string,
  input: TokenCreateInput,
): Promise<CreatedApiToken> {
  const parsed = tokenCreateSchema.safeParse(input);
  if (!parsed.success) {
    throw new AppError(parsed.error.issues[0]?.message || "令牌参数无效");
  }
  const { name, expiresInDays } = parsed.data;

  // 生成高熵随机令牌：agc_ + 32字符 base64url
  const raw = randomBytes(24).toString("base64url");
  const token = `agc_${raw}`;
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const prefix = token.slice(0, 10);

  const expiresAt = expiresInDays
    ? new Date(Date.now() + expiresInDays * 86_400_000)
    : null;

  const [row] = await db
    .insert(apiTokens)
    .values({
      userId,
      name,
      tokenHash,
      prefix,
      expiresAt,
    })
    .returning();

  return {
    id: row.id,
    name: row.name,
    prefix: row.prefix,
    lastUsedAt: row.lastUsedAt ? row.lastUsedAt.toISOString() : null,
    expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    token,
  };
}

export async function listPersonalApiTokens(userId: string): Promise<ApiTokenItem[]> {
  const rows = await db
    .select({
      id: apiTokens.id,
      name: apiTokens.name,
      prefix: apiTokens.prefix,
      lastUsedAt: apiTokens.lastUsedAt,
      expiresAt: apiTokens.expiresAt,
      createdAt: apiTokens.createdAt,
    })
    .from(apiTokens)
    .where(eq(apiTokens.userId, userId))
    .orderBy(desc(apiTokens.createdAt));

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    prefix: r.prefix,
    lastUsedAt: r.lastUsedAt ? r.lastUsedAt.toISOString() : null,
    expiresAt: r.expiresAt ? r.expiresAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
  }));
}

export async function revokePersonalApiToken(userId: string, tokenId: string): Promise<void> {
  const result = await db
    .delete(apiTokens)
    .where(and(eq(apiTokens.id, tokenId), eq(apiTokens.userId, userId)))
    .returning({ id: apiTokens.id });

  if (!result.length) {
    throw new NotFoundError("未找到指定令牌或无权撤销");
  }
}

export async function authenticateApiToken(
  authHeader: string | null | undefined,
): Promise<{ userId: string; user: { id: string; name: string; email: string } } | null> {
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7).trim();
  if (!token.startsWith("agc_")) return null;

  const tokenHash = createHash("sha256").update(token).digest("hex");
  const [row] = await db
    .select({
      id: apiTokens.id,
      userId: apiTokens.userId,
      expiresAt: apiTokens.expiresAt,
      userName: users.name,
      userEmail: users.email,
    })
    .from(apiTokens)
    .innerJoin(users, eq(apiTokens.userId, users.id))
    .where(eq(apiTokens.tokenHash, tokenHash))
    .limit(1);

  if (!row) return null;
  if (row.expiresAt && row.expiresAt < new Date()) return null;

  // 异步记录最后使用时间，不阻断主流程
  db.update(apiTokens)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiTokens.id, row.id))
    .catch(() => {});

  return {
    userId: row.userId,
    user: {
      id: row.userId,
      name: row.userName,
      email: row.userEmail,
    },
  };
}
