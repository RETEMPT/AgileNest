export { textOutline, findTextLines, csvPreview, formatBytes, decodeMaterialText } from "@/components/ai/materials";

export const RESOURCE_MAX_BYTES = 10 * 1024 * 1024;
export const RESOURCE_ACCEPT = ".pdf,.png,.jpg,.jpeg,.webp,.gif,.txt,.md,.markdown,.csv,.tsv,.json,.docx,.xlsx,.pptx,.zip";
export const RESOURCE_CATEGORIES = { general: "共享资料", specification: "需求与设计", research: "参考文献", delivery: "交付成果", meeting: "会议记录" } as const;
export type ResourceCategory = keyof typeof RESOURCE_CATEGORIES;
export type ResourceDTO = {
  id: string; teamId: string; projectId: string | null; kind: "file" | "document" | "link";
  title: string; body: string | null; url: string | null; fileName: string | null; mimeType: string | null;
  size: number; tags: string[]; category: ResourceCategory; version: number;
  createdById: string | null; authorName: string | null; updatedAt: string; createdAt: string; canManage: boolean; referenced: boolean;
};

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
