import { accountFetch } from "@/components/account-request";
import { z } from "zod";

export const MAX_MATERIAL_BYTES = 10 * 1024 * 1024;
export const MAX_SESSION_BYTES = 50 * 1024 * 1024;
export const MAX_MATERIALS = 10;
export const MATERIAL_ACCEPT = ".txt,.md,.markdown,.csv,.tsv,.json,.log,.yaml,.yml,.xml,.html,.css,.js,.ts,.tsx,.jsx,.py,.sql,.pptx,.docx,.pdf,.png,.jpg,.jpeg,.webp,.gif";
export const materialRefSchema = z.object({
  id: z.uuid(), name: z.string().min(1).max(200),
  kind: z.enum(["text", "image", "pdf"]),
  size: z.number().int().min(1).max(MAX_MATERIAL_BYTES),
  createdAt: z.iso.datetime(),
  extraction: z.object({ format: z.enum(["pptx", "docx"]), truncated: z.boolean(), warnings: z.array(z.string().max(1000)).max(20) }).optional(),
});
export type MaterialRef = z.infer<typeof materialRefSchema>;
export type LocalMaterial = { ref: MaterialRef; blob: Blob; text?: string };
export function needsServerExtraction(name: string) { return /\.(pptx|docx)$/i.test(name); }

export function materialKind(name: string): MaterialRef["kind"] {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (["png", "jpg", "jpeg", "webp", "gif"].includes(ext)) return "image";
  if (ext === "pdf") return "pdf";
  if (MATERIAL_ACCEPT.split(",").includes(`.${ext}`)) return "text";
  if (ext === "ppt" || ext === "doc") throw new Error("旧版 PPT / DOC 无法提取正文，请另存为 PPTX / DOCX 后添加");
  throw new Error("暂不支持此格式。可导入文本、Markdown、CSV、JSON、PPTX、DOCX、PDF 或图片。");
}
export function validateMaterialBatch(existing: MaterialRef[], files: Pick<File, "name" | "size">[]) {
  if (existing.length + files.length > MAX_MATERIALS) throw new Error("每份会话最多添加 10 份资料（含已记录的附件）");
  for (const file of files) {
    materialKind(file.name);
    if (!file.size) throw new Error(`“${file.name}”为空文件`);
    if (file.size > MAX_MATERIAL_BYTES) throw new Error(`“${file.name}”超过单文件 10 MB 限制`);
    if (file.name.length > 200) throw new Error("文件名过长，请缩短后添加");
  }
  if (existing.reduce((total, item) => total + item.size, 0) + files.reduce((total, item) => total + item.size, 0) > MAX_SESSION_BYTES)
    throw new Error("每份会话的资料总大小不能超过 50 MB");
}
export function decodeMaterialText(bytes: Uint8Array) {
  let encoding = "utf-8";
  if (bytes[0] === 0xff && bytes[1] === 0xfe) encoding = "utf-16le";
  if (bytes[0] === 0xfe && bytes[1] === 0xff) encoding = "utf-16be";
  let text: string;
  try { text = new TextDecoder(encoding, { fatal: true }).decode(bytes); }
  catch { throw new Error("文本编码无法识别，请另存为 UTF-8 后添加"); }
  if (/\u0000/.test(text)) throw new Error("文件包含二进制内容，无法作为文本读取");
  return text.replace(/\r\n?/g, "\n");
}
export async function readMaterial(file: File, signal?: AbortSignal): Promise<LocalMaterial> {
  validateMaterialBatch([], [file]);
  const kind = materialKind(file.name);
  let extraction: MaterialRef["extraction"];
  let extractedText: string | undefined;
  if (needsServerExtraction(file.name)) {
    const form = new FormData(); form.append("file", file);
    const response = await accountFetch("/api/v1/ai/extract-file", { method: "POST", body: form, signal, cache: "no-store" });
    const value: unknown = await response.json().catch(() => null);
    if (!response.ok) throw new Error(value && typeof value === "object" && "error" in value && typeof value.error === "string" ? value.error : "文件文字提取失败，请重试");
    const parsed = z.object({ format: z.enum(["pptx", "docx"]), text: z.string().min(1).max(200000), truncated: z.boolean(), warnings: z.array(z.string().max(1000)).max(20) }).parse(value);
    extractedText = parsed.text; extraction = { format: parsed.format, truncated: parsed.truncated, warnings: parsed.warnings };
  }
  signal?.throwIfAborted();
  const bytes = new Uint8Array(await file.arrayBuffer());
  const text = extractedText ?? (kind === "text" ? decodeMaterialText(bytes) : undefined);
  const mime = extraction ? extraction.format === "pptx" ? "application/vnd.openxmlformats-officedocument.presentationml.presentation" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document" : kind === "pdf" ? "application/pdf" : kind === "image" ? ({jpg:"image/jpeg",jpeg:"image/jpeg",png:"image/png",webp:"image/webp",gif:"image/gif"}[file.name.split(".").pop()!.toLowerCase()]!) : "text/plain";
  return {ref:{id:crypto.randomUUID(),name:file.name,kind,size:file.size,createdAt:new Date().toISOString(),...(extraction ? { extraction } : {})}, blob:new Blob([bytes],{type:mime}), text};
}
export function formatBytes(bytes: number) {
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : bytes >= 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${bytes} B`;
}

export function textOutline(text: string) {
  const outline: {line:number;title:string}[] = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length && outline.length < 200; i++) {
    const line = lines[i].trim();
    const heading = line.match(/^#{1,6}\s+(.+?)\s*#*$/)?.[1];
    const numbered = /^(?:第[一二三四五六七八九十百\d]+[章节部分]|[一二三四五六七八九十]+[、.．]|\d+(?:\.\d+)*[、.．)]\s)/.test(line);
    const underlined = line && i + 1 < lines.length && /^(?:={3,}|-{3,})$/.test(lines[i+1].trim());
    if (heading || ((numbered || underlined) && line.length <= 120)) outline.push({line:i+1,title:(heading || line).slice(0,120)});
  }
  return outline;
}
export function findTextLines(text: string, query: string) {
  const term = query.trim().toLocaleLowerCase();
  const lines = text.split("\n");
  const matches: {line:number;text:string}[] = [];
  if (!term) return {count:0,matches};
  let count = 0;
  for (let i = 0; i < lines.length; i++) if (lines[i].toLocaleLowerCase().includes(term)) {
    count++;
    if (matches.length < 200) matches.push({line:i+1,text:lines[i].slice(0,1000)});
  }
  return {count,matches};
}

export function csvPreview(text: string, delimiter = ",") {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false, count = 0, columns = 0;
  const pushCell = () => { row.push(cell); cell = ""; };
  const pushRow = () => { pushCell(); columns = Math.max(columns,row.length); count++; if (rows.length < 51) rows.push(row); row = []; };
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i+1] === '"') { cell += '"'; i++; }
      else if (quoted || !cell) quoted = !quoted;
      else cell += char;
    } else if (char === delimiter && !quoted) pushCell();
    else if (char === "\n" && !quoted) pushRow();
    else cell += char;
  }
  if (quoted) throw new Error("表格包含未闭合引号，请检查 CSV 内容");
  if (cell || row.length) pushRow();
  return {rows,count,columns};
}

export function organizeMaterial(name: string, text: string) {
  const lines = text.split("\n");
  const outline = textOutline(text);
  const ext = name.split(".").pop()?.toLowerCase();
  const parts = [`# ${name}`, `字符：${text.length} · 行数：${lines.length}`];
  if (ext === "csv" || ext === "tsv") {
    const table = csvPreview(text, ext === "tsv" ? "\t" : ",");
    parts.push(`表格：${table.count} 行（含表头） · 最多 ${table.columns} 列`, `字段：${table.rows[0]?.map((cell) => cell.slice(0,120)).join("、") || "无"}`);
  }
  if (ext === "json") {
    try {
      const value: unknown = JSON.parse(text);
      const type = Array.isArray(value) ? `数组（${value.length} 项）` : value === null ? "null" : typeof value;
      parts.push(`JSON：${type}`);
      if (typeof value === "object" && value !== null && !Array.isArray(value)) parts.push(`顶层字段：${Object.keys(value).slice(0,100).join("、")}`);
    } catch { throw new Error("JSON 格式无效，请检查原文后重试"); }
  }
  if (outline.length) parts.push("\n## 目录", ...outline.map((item) => `- ${item.title}（第 ${item.line} 行）`));
  else parts.push("\n未发现章节标题，可在原文中搜索关键词。");
  return parts.join("\n");
}
