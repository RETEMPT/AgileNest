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
  canEdit?: boolean; canComment?: boolean; folderId?: string | null; placementVersion?: number; pinned?: boolean;
};

export type ResourceQuery = {
  q: string;
  category: "all" | ResourceCategory;
  kind: "all" | ResourceDTO["kind"];
  scope: "all" | "team" | "project";
  resource: string | null;
  folder?: string | null;
  revision?: number | null;
};
const resourceIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseResourceQuery(params: URLSearchParams): ResourceQuery {
  const category = params.get("category") ?? "all";
  const kind = params.get("kind");
  const scope = params.get("scope");
  const resource = params.get("resource");
  const folder = params.get("folder");
  const revision = params.get("revision");
  return {
    q: (params.get("q") ?? "").slice(0, 200),
    category: Object.hasOwn(RESOURCE_CATEGORIES, category) ? category as ResourceCategory : "all",
    kind: kind === "file" || kind === "document" || kind === "link" ? kind : "all",
    scope: scope === "team" || scope === "project" ? scope : "all",
    resource: resource && resourceIdPattern.test(resource) ? resource : null,
    ...(folder ? { folder: folder === "root" || resourceIdPattern.test(folder) ? folder : null } : {}),
    ...(revision ? { revision: /^[1-9]\d{0,8}$/.test(revision) ? Number(revision) : null } : {}),
  };
}

export function resourceWorkspaceUrl(pathname: string, params: URLSearchParams, changes: Partial<ResourceQuery>) {
  const next = new URLSearchParams(params);
  for (const [key, value] of Object.entries(changes)) {
    if (value === null || value === "" || value === "all") next.delete(key);
    else next.set(key, String(value));
  }
  const query = next.toString();
  return `${pathname}${query ? `?${query}` : ""}`;
}

export function selectResources(rows: readonly ResourceDTO[], query: ResourceQuery, folders: readonly ResourceFolderDTO[] = []) {
  const needle = query.q.trim().toLocaleLowerCase();
  const folderIds = query.folder && query.folder !== "root" ? folderDescendants(folders, query.folder) : null;
  return rows.filter((row) =>
    (!query.folder || (query.folder === "root" ? !row.folderId : !!row.folderId && !!folderIds?.has(row.folderId))) &&
    (query.category === "all" || row.category === query.category) &&
    (query.kind === "all" || row.kind === query.kind) &&
    (query.scope === "all" || (query.scope === "team" ? row.projectId === null : row.projectId !== null)) &&
    `${row.title} ${row.tags.join(" ")} ${row.body ?? ""}`.toLocaleLowerCase().includes(needle),
  ).sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned));
}

export type ResourceFolderDTO = { id: string; teamId: string; projectId: string | null; projectName?: string | null; parentId: string | null; name: string; version: number; canManage: boolean };
export type ResourceLinkDTO = { id: string; kind: "resource" | "task"; targetId: string; title: string; href: string; direction: "outgoing" | "incoming"; canRemove: boolean };
export type ResourceCommentDTO = { id: string; resourceId: string; parentId: string | null; body: string; resourceVersion: number; selectedQuote: string | null; line: number | null; version: number; withdrawn: boolean; resolved: boolean; authorName: string | null; createdAt: string; updatedAt: string; canEdit: boolean; canWithdraw: boolean; canResolve: boolean; mentions: { userId: string | null; name: string }[] };
export type ResourceCollaborationDTO = { version: number; commentScope: "team" | "collaborators"; collaborators: { userId: string; name: string; permission: "comment" | "edit" }[]; members: { id: string; name: string }[] };

export function folderDescendants(folders: readonly ResourceFolderDTO[], id: string) {
  const found = new Set([id]); let changed = true;
  while (changed) { changed = false; for (const row of folders) if (row.parentId && found.has(row.parentId) && !found.has(row.id)) { found.add(row.id); changed = true; } }
  return found;
}
export function folderPath(folders: readonly ResourceFolderDTO[], id: string | null | undefined) {
  const path: ResourceFolderDTO[] = []; const visited = new Set<string>(); let current = id;
  while (current && !visited.has(current)) { visited.add(current); const folder = folders.find((row) => row.id === current); if (!folder) break; path.unshift(folder); current = folder.parentId; }
  return path;
}
export function validateFolderMove(folders: readonly ResourceFolderDTO[], folder: ResourceFolderDTO, parentId: string | null): string | null {
  const parent = parentId ? folders.find((row) => row.id === parentId) : null;
  if (parentId && !parent) return "目标目录不存在";
  if (parent && (parent.teamId !== folder.teamId || parent.projectId !== folder.projectId)) return "目录只能移动到相同团队及项目范围";
  const descendants = folderDescendants(folders, folder.id);
  if (parentId && descendants.has(parentId)) return "目录不能移动到自身或子目录";
  const baseDepth = folderPath(folders, parentId).length;
  const subtreeDepth = Math.max(1, ...folders.filter((row) => descendants.has(row.id)).map((row) => folderPath(folders, row.id).length - folderPath(folders, folder.id).length + 1));
  if (baseDepth + subtreeDepth > 8) return "目录层级最多 8 层，请选择上层目录";
  return null;
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
