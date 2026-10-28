import { z } from "zod";
import type { ResourceDTO } from "@/modules/resources/client";

const metadataInput = z.object({
  title: z.string().trim().min(1, "请填写资料名称").max(160, "名称最多 160 字"),
  tags: z.array(z.string().trim().min(1).max(24, "每个标签最多 24 字")).max(8, "最多 8 个标签"),
});

export function sharedResourceUrl(resource: ResourceDTO, historical = false) {
  const scope = resource.projectId ? `/p/${resource.projectId}` : `/t/${resource.teamId}`;
  const query = new URLSearchParams({ resource: resource.id });
  if (historical && resource.kind === "document") query.set("revision", String(resource.version));
  return `${scope}/resources?${query}`;
}

export function resourceTextPage(body: string, page: number) {
  const lines = body.replace(/\r\n?/g, "\n").split("\n");
  const pages = Math.max(1, Math.ceil(lines.length / 60));
  const current = Math.min(pages, Math.max(1, Number.isFinite(page) ? Math.trunc(page) : 1));
  const start = (current - 1) * 60;
  const text = lines.slice(start, start + 60).join("\n");
  return { page: current, pages, startLine: start + 1, endLine: Math.min(start + 60, lines.length), text };
}

export function resourceCitation(resource: ResourceDTO, page: number, withText: boolean) {
  const source = `资料：${resource.title}\n读取版本：v${resource.version}\n来源：${sharedResourceUrl(resource, true)}`;
  if (!withText || !resource.body) return source;
  const part = resourceTextPage(resource.body, page);
  const quote = part.text.slice(0, 1800);
  const endLine = part.startLine + quote.split("\n").length - 1;
  return `${source}\n原文 L${part.startLine}–L${endLine}${part.text.length > quote.length ? "（摘录截断）" : ""}：\n${quote.split("\n").map((line) => `> ${line}`).join("\n")}`;
}

export function resourceMetadataPatch(resource: ResourceDTO, title: string, tagText: string) {
  if (!(resource.canEdit ?? resource.canManage)) throw new Error("当前账号没有资料编辑权限");
  const parsed = metadataInput.safeParse({ title, tags: [...new Set(tagText.split(/[,，\n]/).map((tag) => tag.trim()).filter(Boolean))] });
  if (!parsed.success) throw new Error(parsed.error.issues[0].message);
  return {
    version: resource.version,
    title: parsed.data.title,
    tags: parsed.data.tags,
    category: resource.category,
    ...(resource.kind === "link" ? { url: resource.url } : {}),
  };
}
