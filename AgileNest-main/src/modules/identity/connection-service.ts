import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { AppError, ConflictError, NotFoundError } from "@/modules/core";
import type { FeishuConnection } from "./client";

const connectionFields = {
  email: users.email,
  openId: users.feishuOpenId,
  name: users.feishuName,
  boundAt: users.feishuBoundAt,
};
type ConnectionRow = {
  email: string;
  openId: string | null;
  name: string | null;
  boundAt: Date | null;
};

function connectionFor(row: ConnectionRow): FeishuConnection {
  const connected = row.openId !== null;
  const bindingVersion = connected
    ? createHash("sha256")
        .update(`${row.openId}\0${row.boundAt?.toISOString() ?? ""}`)
        .digest("hex")
    : null;
  return {
    connected,
    configured: Boolean(
      process.env.FEISHU_APP_ID?.trim() &&
        process.env.FEISHU_APP_SECRET?.trim() &&
        process.env.FEISHU_REDIRECT_URI?.trim(),
    ),
    name: connected ? row.name : null,
    boundAt: connected ? row.boundAt?.toISOString() ?? null : null,
    bindingVersion,
    // 飞书创建的占位邮箱没有用户可用的本地密码，解绑会丢失唯一登录方式。
    canDisconnect: connected && !row.email.endsWith("@feishu.local"),
  };
}

export async function getFeishuConnection(
  actorId: string,
): Promise<FeishuConnection> {
  const [row] = await db
    .select(connectionFields)
    .from(users)
    .where(eq(users.id, actorId));
  if (!row) throw new NotFoundError("账号不存在");
  return connectionFor(row);
}

export async function disconnectFeishu(
  actorId: string,
  input: { bindingVersion: string },
): Promise<void> {
  const parsed = z
    .object({ bindingVersion: z.string().regex(/^[a-f0-9]{64}$/) })
    .safeParse(input);
  if (!parsed.success) throw new AppError("绑定信息无效，请刷新页面重试");
  await db.transaction(async (tx) => {
    const [row] = await tx
      .select(connectionFields)
      .from(users)
      .where(eq(users.id, actorId))
      .for("update");
    if (!row) throw new NotFoundError("账号不存在");
    const connection = connectionFor(row);
    if (!connection.connected) return;
    if (connection.bindingVersion !== parsed.data.bindingVersion)
      throw new ConflictError("飞书绑定已变更，请刷新后重新操作");
    if (!connection.canDisconnect)
      throw new ConflictError("此账号使用飞书生成的登录地址，请保留绑定以免失去登录方式");
    await tx
      .update(users)
      .set({ feishuOpenId: null, feishuName: null, feishuBoundAt: null })
      .where(eq(users.id, actorId));
  });
}
