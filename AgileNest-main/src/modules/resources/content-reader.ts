import { posix } from "node:path";
import { AppError, ConflictError } from "@/modules/core";
import { RESOURCE_MAX_BYTES, decodeMaterialText, type ResourceDTO } from "./client";
import { getResource, getResourceFile } from "./service";
import { officePackage, officeXml, type OfficeXmlEvent } from "./office-package";

export type ExtractedFileContent = {
  format: "text" | "pptx" | "docx";
  text: string;
  sections: Array<{ index: number; label: string; text: string }>;
  truncated: boolean;
  warnings: string[];
};
export type ResourceContent = ExtractedFileContent & { resource: ResourceDTO; version: number };
const MAX_TEXT = 60000;
const namespaces = {
  presentation: ["http://schemas.openxmlformats.org/presentationml/2006/main", "http://purl.oclc.org/ooxml/presentationml/main"],
  drawing: ["http://schemas.openxmlformats.org/drawingml/2006/main", "http://purl.oclc.org/ooxml/drawingml/main"],
  word: ["http://schemas.openxmlformats.org/wordprocessingml/2006/main", "http://purl.oclc.org/ooxml/wordprocessingml/main"],
  relationship: ["http://schemas.openxmlformats.org/officeDocument/2006/relationships", "http://purl.oclc.org/ooxml/officeDocument/relationships"],
};
const packageRelationship = "http://schemas.openxmlformats.org/package/2006/relationships";

function finish(format: ExtractedFileContent["format"], input: ExtractedFileContent["sections"], warnings: string[] = []): ExtractedFileContent {
  const sections: ExtractedFileContent["sections"] = [];
  let length = 0, truncated = false;
  for (const section of input) {
    const header = format === "pptx" ? `${section.label}\n` : "";
    const separator = sections.length ? "\n\n" : "";
    const remaining = MAX_TEXT - length - header.length - separator.length;
    if (remaining <= 0) { truncated = true; break; }
    const text = section.text.slice(0, remaining);
    sections.push({ ...section, text });
    length += header.length + separator.length + text.length;
    if (text.length < section.text.length) { truncated = true; break; }
  }
  if (!sections.some((section) => section.text.trim())) throw new AppError("文件没有可提取的文字；图片、扫描件和图表内容需要文字版资料，本功能不运行 OCR");
  return { format, sections, text: sections.map((section) => `${format === "pptx" ? `${section.label}\n` : ""}${section.text}`).join("\n\n"), truncated, warnings: [...warnings, ...(truncated ? ["正文超过 60000 字符，仅提取前部内容，未读取部分不能作为回答依据"] : [])] };
}

function drawingText(xml: string, kind: "pptx" | "docx") {
  const allowed = kind === "pptx" ? namespaces.drawing : namespaces.word;
  const output: string[] = [];
  let deleted = 0;
  officeXml(xml, (event) => {
    if (!allowed.includes(event.namespace)) return;
    if (kind === "docx" && ["del", "moveFrom"].includes(event.name) && event.text === undefined) {
      deleted += event.closing ? -1 : 1;
      return;
    }
    if (deleted) return;
    if (event.text !== undefined) { if (event.name === "t") output.push(event.text); return; }
    if (!event.closing && ["tab", "br", "cr"].includes(event.name)) output.push(event.name === "tab" ? "\t" : "\n");
    if (event.closing && event.name === "p") output.push("\n");
    if (event.closing && event.name === "tc") output.push("\t");
    if (event.closing && event.name === "tr") output.push("\n");
  });
  return output.join("").replace(/\n(?=\t)/g, "").replace(/\t\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

export async function extractFileContent(file: { name: string; bytes: Uint8Array }, options: { signal?: AbortSignal } = {}): Promise<ExtractedFileContent> {
  options.signal?.throwIfAborted();
  if (!file.name || file.name.length > 200 || /[\x00-\x1f/\\]/.test(file.name) || !file.bytes.length || file.bytes.length > RESOURCE_MAX_BYTES) throw new AppError("请选择不超过 10 MB 的有效文件");
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (["txt", "md", "markdown", "csv", "tsv", "json"].includes(extension ?? "")) {
    let text: string;
    try { text = decodeMaterialText(file.bytes); } catch { throw new AppError("文本编码无法读取，请使用 UTF-8 文字文件"); }
    return finish("text", [{ index: 1, label: "正文", text }]);
  }
  if (extension === "ppt") throw new AppError("暂不读取旧版 .ppt，请在 PowerPoint 中另存为 .pptx 后重试");
  if (extension !== "pptx" && extension !== "docx") throw new AppError("目前可读取 PPTX、DOCX、Markdown、TXT、CSV、TSV、JSON 的文字内容；PDF、图片、XLSX 和旧版 Office 文件请提供文字版");
  const archive = officePackage(file.bytes, options.signal);
  const relationships = new Map<string, { target: string; type: string }>();
  let skippedExternal = false;
  for (const name of archive.names.filter((name) => name.endsWith(".rels"))) {
    officeXml(archive.xml(name), (event) => {
      if (event.namespace !== packageRelationship || event.name !== "Relationship" || event.closing || event.text !== undefined) return;
      const mode = event.attributes.TargetMode;
      if (mode && mode !== "Internal" && mode !== "External") throw new AppError("Office 文件关系类型无效");
      if (mode === "External") {
        if (name === "ppt/_rels/presentation.xml.rels" && namespaces.relationship.some((namespace) => event.attributes.Type === `${namespace}/slide`)) throw new AppError("PPTX 正文指向外部幻灯片，无法安全读取；不会访问其中的网络或本地地址");
        skippedExternal = true;
        return;
      }
      if (name === "ppt/_rels/presentation.xml.rels") {
        const { Id, Target, Type } = event.attributes;
        if (!Id || !Target || !Type || relationships.has(Id)) throw new AppError("PPTX 幻灯片关系无效");
        relationships.set(Id, { target: Target, type: Type });
      }
    });
  }
  const externalWarnings = skippedExternal ? ["文档包含外部超链接或图片引用，已忽略这些引用，未访问外部地址"] : [];
  if (extension === "docx") {
    const xml = archive.xml("word/document.xml");
    let document = false;
    officeXml(xml, (event) => { if (event.name === "document" && namespaces.word.includes(event.namespace)) document = true; });
    if (!document) throw new AppError("DOCX 缺少有效正文");
    return finish("docx", [{ index: 1, label: "正文", text: drawingText(xml, "docx") }], ["只读取正文和表格文字，不读取图片、页眉页脚、批注或分页布局", ...externalWarnings]);
  }
  const slideIds: string[] = [];
  let insideList = false;
  officeXml(archive.xml("ppt/presentation.xml"), (event: OfficeXmlEvent) => {
    if (!namespaces.presentation.includes(event.namespace) || event.text !== undefined) return;
    if (event.name === "sldIdLst") insideList = !event.closing;
    if (insideList && !event.closing && event.name === "sldId") {
      const id = namespaces.relationship.map((namespace) => event.attributes[`{${namespace}}id`]).find(Boolean);
      if (!id || slideIds.includes(id) || slideIds.length >= 500) throw new AppError("PPTX 页序无效或超过 500 页，请拆分文件");
      slideIds.push(id);
    }
  });
  if (!slideIds.length) throw new AppError("PPTX 没有有效幻灯片");
  const sections = slideIds.map((id, index) => {
    options.signal?.throwIfAborted();
    const relation = relationships.get(id);
    if (!relation || !namespaces.relationship.some((namespace) => relation.type === `${namespace}/slide`) || /[\\:%?#\x00-\x20]/.test(relation.target)) throw new AppError("PPTX 幻灯片关系无效");
    const path = relation.target.startsWith("/") ? relation.target.slice(1) : posix.normalize(posix.join("ppt", relation.target));
    if (!/^ppt\/slides\/[^/]+\.xml$/i.test(path)) throw new AppError("PPTX 幻灯片路径无效");
    return { index: index + 1, label: `第 ${index + 1} 页`, text: drawingText(archive.xml(path), "pptx") };
  });
  return finish("pptx", sections, ["按幻灯片顺序读取文字和表格，不读取图片文字、图表数据、动画或演讲者备注", ...externalWarnings]);
}

export async function readResourceContent(actorId: string, id: string, options: { expectedVersion?: number; signal?: AbortSignal } = {}): Promise<ResourceContent> {
  const resource = await getResource(actorId, id);
  options.signal?.throwIfAborted();
  if (options.expectedVersion !== undefined && (!Number.isSafeInteger(options.expectedVersion) || options.expectedVersion < 1)) throw new AppError("资料版本无效");
  if (options.expectedVersion !== undefined && resource.version !== options.expectedVersion) throw new ConflictError("资料已更新，请重新检索最新版本");
  let content: ExtractedFileContent;
  if (resource.kind === "link") throw new AppError("链接资料仅保存网址，未读取外部网页；请选择平台内的文档或文件");
  if (resource.kind === "document") content = finish("text", [{ index: 1, label: "正文", text: resource.body ?? "" }]);
  else {
    const file = await getResourceFile(actorId, id);
    if (file.resource.version !== resource.version) throw new ConflictError("资料已更新，请重新检索最新版本");
    content = await extractFileContent({ name: file.resource.fileName ?? "", bytes: file.bytes }, options);
  }
  options.signal?.throwIfAborted();
  const latest = await getResource(actorId, id);
  options.signal?.throwIfAborted();
  if (latest.version !== resource.version) throw new ConflictError("读取期间资料已更新，请重新检索最新版本");
  return { ...content, resource: latest, version: latest.version };
}
