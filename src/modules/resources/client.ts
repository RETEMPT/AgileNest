export { textOutline, findTextLines, csvPreview, formatBytes, decodeMaterialText } from "@/components/ai/materials";

export const RESOURCE_MAX_BYTES = 10 * 1024 * 1024;
export const RESOURCE_ACCEPT = ".pdf,.png,.jpg,.jpeg,.webp,.gif,.txt,.md,.markdown,.csv,.tsv,.json,.docx,.xlsx,.pptx,.zip";
export const RESOURCE_CATEGORIES = { general: "通用资料", specification: "需求与设计", research: "参考文献", delivery: "交付成果", meeting: "会议记录" } as const;
export type ResourceCategory = keyof typeof RESOURCE_CATEGORIES;
export type ResourceDTO = {
  id: string; teamId: string; projectId: string | null; kind: "file" | "document" | "link";
  title: string; body: string | null; url: string | null; fileName: string | null; mimeType: string | null;
  size: number; tags: string[]; category: ResourceCategory; version: number;
  createdById: string | null; authorName: string | null; updatedAt: string; createdAt: string; canManage: boolean; referenced: boolean;
};

export type ResourceQuery = {
  q: string;
  category: "all" | ResourceCategory;
  kind: "all" | ResourceDTO["kind"];
  scope: "all" | "team" | "project";
  resource: string | null;
};
const resourceIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseResourceQuery(params: URLSearchParams): ResourceQuery {
  const category = params.get("category") ?? "all";
  const kind = params.get("kind");
  const scope = params.get("scope");
  const resource = params.get("resource");
  return {
    q: (params.get("q") ?? "").slice(0, 200),
    category: Object.hasOwn(RESOURCE_CATEGORIES, category) ? category as ResourceCategory : "all",
    kind: kind === "file" || kind === "document" || kind === "link" ? kind : "all",
    scope: scope === "team" || scope === "project" ? scope : "all",
    resource: resource && resourceIdPattern.test(resource) ? resource : null,
  };
}

export function resourceWorkspaceUrl(pathname: string, params: URLSearchParams, changes: Partial<ResourceQuery>) {
  const next = new URLSearchParams(params);
  for (const [key, value] of Object.entries(changes)) {
    if (value === null || value === "" || value === "all") next.delete(key);
    else next.set(key, value);
  }
  const query = next.toString();
  return `${pathname}${query ? `?${query}` : ""}`;
}

export function selectResources(rows: readonly ResourceDTO[], query: ResourceQuery) {
  const needle = query.q.trim().toLocaleLowerCase();
  return rows.filter((row) =>
    (query.category === "all" || row.category === query.category) &&
    (query.kind === "all" || row.kind === query.kind) &&
    (query.scope === "all" || (query.scope === "team" ? row.projectId === null : row.projectId !== null)) &&
    `${row.title} ${row.tags.join(" ")} ${row.body ?? ""}`.toLocaleLowerCase().includes(needle),
  );
}

export function resourceUploadError(file: { name: string; size: number }): string | null {
  if (!file.size || file.size > RESOURCE_MAX_BYTES) return "文件需大于 0 字节且不超过 10 MB";
  const extension = `.${file.name.split(".").pop()?.toLowerCase() ?? ""}`;
  if (!RESOURCE_ACCEPT.split(",").includes(extension)) return "不支持此格式，请选择 PDF、图片、文本、Office 或 ZIP";
  if (/[\u0000-\u001f/\\]/.test(file.name) || file.name.length > 200) return "文件名称无效或超过 200 字，请调整文件名";
  return null;
}

export function safeResourceUrl(value: string) {
  try { const url = new URL(value); return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password; }
  catch { return false; }
}

export function markerMarkdown(text: string): string {
  const data: unknown = JSON.parse(text);
  if (typeof data !== "object" || data === null) throw new Error("整理结果需要是 JSON 对象");
  const value = data as Record<string, unknown>;
  if (typeof value.markdown === "string") return value.markdown;
  if (typeof value.text === "string") return value.text;
  if (Array.isArray(value.children)) {
    const walk = (blocks: unknown[], depth: number): string[] => {
      if (depth > 20) throw new Error("整理结果嵌套层级过深");
      return blocks.flatMap((block) => {
        if (typeof block !== "object" || block === null) return [];
        const item = block as Record<string, unknown>;
        const parts = typeof item.html === "string" ? [item.html.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").trim()] : typeof item.text === "string" ? [item.text] : [];
        return [...parts, ...(Array.isArray(item.children) ? walk(item.children, depth + 1) : [])];
      });
    };
    const parts = walk(value.children, 0).filter(Boolean);
    if (parts.length) return parts.join("\n\n");
  }
  throw new Error("未找到 markdown、text 或 children 文本；请导入转换工具生成的 Markdown 文件");
}
