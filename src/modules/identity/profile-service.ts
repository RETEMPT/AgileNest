import { createHash } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  academicProfiles,
  personalProfiles,
  teamMembers,
  users,
} from "@/db/schema";
import { AppError, ForbiddenError, NotFoundError } from "@/modules/core";

const profileInput = z.object({
  name: z.string().trim().min(1, "请填写姓名").max(50, "姓名最多 50 字"),
  bio: z.string().trim().max(300, "个人简介最多 300 字").default(""),
  avatar: z.string().max(480000, "头像过大，请重新选择").optional(),
});

export function avatarUrl(userId: string, hash: string | null) {
  return hash ? `/api/avatars/${userId}?v=${hash}` : null;
}

function decodeAvatar(value: string) {
  const match = /^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match) throw new AppError("头像格式无效，请重新选择图片");
  const bytes = Buffer.from(match[1], "base64");
  if (
    bytes.length > 350000 ||
    bytes.length < 45 ||
    bytes.toString("base64") !== match[1] ||
    bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a" ||
    bytes.toString("ascii", 12, 16) !== "IHDR" ||
    bytes.readUInt32BE(16) !== 256 ||
    bytes.readUInt32BE(20) !== 256 ||
    bytes.subarray(-12).toString("hex") !== "0000000049454e44ae426082"
  ) {
    throw new AppError("头像需为处理后的 256 像素图片，请重新选择");
  }
  return {
    data: match[1],
    hash: createHash("sha256").update(bytes).digest("hex").slice(0, 24),
  };
}

export async function getAccountProfile(actorId: string) {
  const [row] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      createdAt: users.createdAt,
      bio: personalProfiles.bio,
      avatarHash: personalProfiles.avatarHash,
    })
    .from(users)
    .leftJoin(personalProfiles, eq(personalProfiles.userId, users.id))
    .where(eq(users.id, actorId));
  if (!row) throw new NotFoundError("账号不存在");
  return {
    ...row,
    bio: row.bio ?? "",
    avatarUrl: avatarUrl(row.id, row.avatarHash),
  };
}

export async function saveAccountProfile(
  actorId: string,
  input: z.input<typeof profileInput>,
) {
  const account = await getAccountProfile(actorId);
  const parsed = profileInput.safeParse(input);
  if (!parsed.success) throw new AppError(parsed.error.issues[0].message);
  const { name, bio, avatar } = parsed.data;
  const image = avatar && avatar !== "remove" ? decodeAvatar(avatar) : null;
  await db.transaction(async (tx) => {
    // 同一账号的更新串行，姓名变化与学术资料确认失效一起提交。
    const [current] = await tx
      .select({ name: users.name })
      .from(users)
      .where(eq(users.id, account.id))
      .for("update");
    await tx.update(users).set({ name }).where(eq(users.id, account.id));
    if (current.name !== name) {
      await tx
        .update(academicProfiles)
        .set({
          version: sql`${academicProfiles.version} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(academicProfiles.userId, account.id));
    }
    const imagePatch = avatar
      ? { avatarData: image?.data ?? null, avatarHash: image?.hash ?? null }
      : {};
    await tx
      .insert(personalProfiles)
      .values({ userId: account.id, bio, ...imagePatch })
      .onConflictDoUpdate({
        target: personalProfiles.userId,
        set: { bio, ...imagePatch, updatedAt: new Date() },
      });
  });
  return getAccountProfile(actorId);
}

export async function getAvatar(actorId: string, targetId: string) {
  if (!z.uuid().safeParse(targetId).success)
    throw new NotFoundError("头像不存在");
  if (actorId !== targetId) {
    const shared = await db
      .select({ id: teamMembers.id })
      .from(teamMembers)
      .where(
        and(
          eq(teamMembers.userId, targetId),
          inArray(
            teamMembers.teamId,
            db
              .select({ teamId: teamMembers.teamId })
              .from(teamMembers)
              .where(eq(teamMembers.userId, actorId)),
          ),
        ),
      )
      .limit(1);
    if (!shared.length) throw new ForbiddenError();
  }
  const [profile] = await db
    .select({
      data: personalProfiles.avatarData,
      hash: personalProfiles.avatarHash,
    })
    .from(personalProfiles)
    .where(eq(personalProfiles.userId, targetId));
  if (!profile?.data || !profile.hash) throw new NotFoundError("尚未设置头像");
  return { bytes: Buffer.from(profile.data, "base64"), hash: profile.hash };
}
