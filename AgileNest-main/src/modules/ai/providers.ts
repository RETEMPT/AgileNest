import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { z } from "zod";
import { AppError, ConflictError, NotFoundError } from "@/modules/core";
import { modelConfigurationSchema, modelProviderActionSchema, modelProviderSaveSchema, type ModelConfigurationInput, type ModelProviderList } from "./client";
import { openModelConfiguration } from "./credentials";
import type { SavedModel } from "./schema";
import { normalizeModelBaseUrl } from "./transport";

const storedSchema = z.object({ version: z.literal(1), actorId: z.string().min(1), revision: z.number().int().nonnegative(), activeId: z.uuid().nullable(), providers: z.array(z.object({ id: z.uuid(), configuration: modelConfigurationSchema, apiKey: z.string().min(1).max(1024), updatedAt: z.string() }).strict()).max(12) }).strict().superRefine((value, ctx) => {
  if (new Set(value.providers.map((provider) => provider.id)).size !== value.providers.length || value.activeId !== null && !value.providers.some((provider) => provider.id === value.activeId)) ctx.addIssue({ code: "custom", message: "模型配置文件不一致" });
});
type Store = z.infer<typeof storedSchema>;
type StoredProvider = Store["providers"][number];
function storageKey() {
  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret) throw new AppError("服务器尚未配置登录密钥，无法保存模型配置", 503);
  return createHash("sha256").update("agilenest:providers:v1\0").update(secret).digest();
}
function fileFor(actorId: string) {
  const directory = path.resolve(process.env.AI_PROVIDER_STORE_DIR || path.join(process.cwd(), ".data", "ai-providers"));
  return path.join(directory, `${createHash("sha256").update(actorId).digest("hex")}.enc`);
}
function empty(actorId: string): Store { return { version: 1, actorId, revision: 0, activeId: null, providers: [] }; }
function summary(store: Store): ModelProviderList { return { revision: store.revision, activeId: store.activeId, providers: store.providers.map(({ id, configuration, updatedAt }) => ({ id, configuration, updatedAt })) }; }
function encrypt(store: Store) {
  const iv = randomBytes(12); const cipher = createCipheriv("aes-256-gcm", storageKey(), iv);
  cipher.setAAD(Buffer.from(`agilenest:providers:${store.actorId}`));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(storedSchema.parse(store)), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]);
}
async function readStore(actorId: string): Promise<Store | null> {
  const target = fileFor(actorId);
  let bytes: Buffer;
  // Account configuration is runtime state and must never be traced into a build.
  try { bytes = await readFile(/* turbopackIgnore: true */ target); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw new AppError("无法读取模型配置，请检查服务器存储权限", 503); }
  try {
    if (bytes.length < 29 || bytes.length > 128000) throw new Error("invalid length");
    const decipher = createDecipheriv("aes-256-gcm", storageKey(), bytes.subarray(0, 12));
    decipher.setAAD(Buffer.from(`agilenest:providers:${actorId}`)); decipher.setAuthTag(bytes.subarray(12, 28));
    const value = storedSchema.parse(JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString("utf8")) as unknown);
    if (value.actorId !== actorId) throw new Error("wrong owner");
    return value;
  } catch { throw new AppError("模型配置无法解密或已损坏，请恢复备份并确认服务器登录密钥未变更", 503); }
}
async function writeStore(store: Store) {
  const filename = fileFor(store.actorId); const temporary = `${filename}.${randomUUID()}.tmp`;
  try { const handle = await open(temporary, "wx", 0o600); try { await handle.writeFile(encrypt(store)); await handle.sync(); } finally { await handle.close(); } }
  catch { await unlink(temporary).catch(() => {}); throw new AppError("无法写入模型配置，请检查服务器存储权限", 503); }
  try { await rename(temporary, filename); }
  catch { await unlink(temporary).catch(() => {}); throw new AppError("无法替换模型配置，请稍后重试", 503); }
}
async function locked<T>(actorId: string, work: () => Promise<T>): Promise<T> {
  const filename = fileFor(actorId); await mkdir(path.dirname(filename), { recursive: true, mode: 0o700 });
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  for (let attempt = 0; attempt < 40; attempt++) {
    try { handle = await open(`${filename}.lock`, "wx", 0o600); break; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw new AppError("模型配置存储不可写", 503); await delay(50); }
  }
  if (!handle) throw new ConflictError("模型配置正在保存，请稍后刷新重试；若服务器异常退出，请由管理员检查配置锁文件");
  try { return await work(); }
  finally { await handle.close(); await unlink(`${filename}.lock`).catch(() => {}); }
}
async function migratedStore(actorId: string, cookie?: string): Promise<Store> {
  const existing = await readStore(actorId); if (existing) return existing;
  const legacy = openModelConfiguration(cookie, actorId); if (!legacy) return empty(actorId);
  return locked(actorId, async () => {
    const current = await readStore(actorId); if (current) return current;
    const id = randomUUID(); const value: Store = { version: 1, actorId, revision: 1, activeId: id, providers: [{ id, configuration: legacy.configuration, apiKey: legacy.apiKey, updatedAt: new Date().toISOString() }] };
    await writeStore(value); return value;
  });
}
export async function listModelProviders(actorId: string, cookie?: string) { return summary(await migratedStore(actorId, cookie)); }
function mergeProvider(input: ModelConfigurationInput, existing?: StoredProvider) {
  const { apiKey: supplied, ...fields } = input;
  const configuration = modelConfigurationSchema.parse(fields); configuration.baseUrl = normalizeModelBaseUrl(configuration.baseUrl);
  const apiKey = supplied || (existing?.configuration.baseUrl === configuration.baseUrl && existing.configuration.protocol === configuration.protocol ? existing.apiKey : "");
  if (!apiKey) throw new AppError("请填写真实 API 密钥；更换 API 地址或接口类型后需重新填写密钥");
  return { configuration, apiKey };
}
export async function saveModelProvider(actorId: string, raw: unknown, cookie?: string) {
  const input = modelProviderSaveSchema.parse(raw); await migratedStore(actorId, cookie);
  return locked(actorId, async () => {
    const store = await readStore(actorId) ?? empty(actorId);
    if (store.revision !== input.expectedRevision) throw new ConflictError("模型配置已在其他页面修改，请刷新后重试");
    const existing = input.id ? store.providers.find((provider) => provider.id === input.id) : undefined;
    if (input.id && !existing) throw new NotFoundError("模型服务不存在，请刷新后重试");
    if (!existing && store.providers.length >= 12) throw new AppError("最多保存 12 个模型服务，请先删除不再使用的配置");
    const provider = { id: existing?.id ?? randomUUID(), ...mergeProvider(input.configuration, existing), updatedAt: new Date().toISOString() };
    store.providers = existing ? store.providers.map((item) => item.id === provider.id ? provider : item) : [...store.providers, provider];
    store.revision++; await writeStore(store); return summary(store);
  });
}
export async function changeModelProvider(actorId: string, raw: unknown, cookie?: string) {
  const input = modelProviderActionSchema.parse(raw); await migratedStore(actorId, cookie);
  return locked(actorId, async () => {
    const store = await readStore(actorId) ?? empty(actorId);
    if (store.revision !== input.expectedRevision) throw new ConflictError("模型配置已在其他页面修改，请刷新后重试");
    if (!store.providers.some((item) => item.id === input.id)) throw new NotFoundError("模型服务不存在，请刷新后重试");
    if (input.op === "activate") store.activeId = input.id;
    else { store.providers = store.providers.filter((item) => item.id !== input.id); if (store.activeId === input.id) store.activeId = null; }
    store.revision++; await writeStore(store); return summary(store);
  });
}
export async function resolveModelProvider(actorId: string, cookie?: string, providerId?: string, temporary?: ModelConfigurationInput): Promise<SavedModel> {
  const store = await readStore(actorId);
  const existing = store?.providers.find((provider) => provider.id === (providerId ?? store.activeId));
  if (providerId && !existing) throw new NotFoundError("模型服务不存在，请刷新后重试");
  if (temporary) return { actorId, ...mergeProvider(temporary, providerId ? existing : undefined), expiresAt: Number.MAX_SAFE_INTEGER };
  if (existing) return { actorId, configuration: existing.configuration, apiKey: existing.apiKey, expiresAt: Number.MAX_SAFE_INTEGER };
  // A persisted empty store is a deliberate deactivation and must never revive the legacy cookie.
  const legacy = store ? null : openModelConfiguration(cookie, actorId);
  if (legacy) return legacy;
  throw new ConflictError("请先在模型配置页面保存并启用一个模型服务");
}
export async function activeModelSummary(actorId: string, cookie?: string) {
  const store = await readStore(actorId);
  if (!store) { const legacy = openModelConfiguration(cookie, actorId); return legacy ? { configured: true, configuration: legacy.configuration } : { configured: false }; }
  const provider = store.providers.find((item) => item.id === store.activeId);
  return provider ? { configured: true, configuration: provider.configuration } : { configured: false };
}
