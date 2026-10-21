import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { AppError } from "@/modules/core";
import { savedModelSchema, type SavedModel } from "./schema";

export const MODEL_COOKIE_NAME = "agilenest-ai-model";
export const MODEL_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;
function encryptionKey() {
  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret) throw new AppError("服务器尚未配置登录密钥，暂时无法安全保存模型密钥", 503);
  return createHash("sha256").update("agilenest:model-cookie:v1\0").update(secret).digest();
}
export function sealModelConfiguration(saved: SavedModel): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  cipher.setAAD(Buffer.from(`agilenest:ai:${saved.actorId}`));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(savedModelSchema.parse(saved)), "utf8"), cipher.final()]);
  const value = Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64url");
  if (value.length > 3800) throw new AppError("配置内容过长，请缩短配置名称或 API 地址");
  return value;
}
export function openModelConfiguration(value: string | undefined, actorId: string, now = Date.now()): SavedModel | null {
  if (!value || value.length > 3800 || !/^[A-Za-z0-9_-]+$/.test(value)) return null;
  const key = encryptionKey();
  try {
    const bytes = Buffer.from(value, "base64url");
    if (bytes.length < 29) return null;
    const decipher = createDecipheriv("aes-256-gcm", key, bytes.subarray(0, 12));
    decipher.setAuthTag(bytes.subarray(12, 28));
    decipher.setAAD(Buffer.from(`agilenest:ai:${actorId}`));
    const plaintext = Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]);
    const saved = savedModelSchema.parse(JSON.parse(plaintext.toString("utf8")) as unknown);
    return saved.actorId === actorId && saved.expiresAt > now ? saved : null;
  } catch { return null; }
}
