import { deflateRawSync } from "node:zlib";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError, ConflictError, ForbiddenError, NotFoundError } from "@/modules/core";
import { extractFileContent, readResourceContent } from "@/modules/resources/content-reader";
import { officeCrc32 } from "@/modules/resources/office-package";
import { getResource, getResourceFile } from "@/modules/resources/service";
import type { ResourceDTO } from "@/modules/resources/client";

vi.mock("@/modules/resources/service", () => ({ getResource: vi.fn(), getResourceFile: vi.fn() }));
const resource = { id: "resource", version: 3, kind: "document", body: "# 可核验来源", title: "设计方案" } as ResourceDTO;
const p = "http://schemas.openxmlformats.org/presentationml/2006/main";
const a = "http://schemas.openxmlformats.org/drawingml/2006/main";
const r = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const w = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

function zip(files: Array<[string, string]>, mutate?: (header: Buffer, index: number) => void) {
  const locals: Buffer[] = [], directory: Buffer[] = [];
  let offset = 0;
  files.forEach(([name, text], index) => {
    const raw = Buffer.from(text), packed = deflateRawSync(raw), filename = Buffer.from(name);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20, 4); local.writeUInt16LE(8, 8);
    local.writeUInt32LE(officeCrc32(raw), 14); local.writeUInt32LE(packed.length, 18); local.writeUInt32LE(raw.length, 22); local.writeUInt16LE(filename.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(8, 10);
    central.writeUInt32LE(officeCrc32(raw), 16); central.writeUInt32LE(packed.length, 20); central.writeUInt32LE(raw.length, 24); central.writeUInt16LE(filename.length, 28); central.writeUInt32LE(offset, 42);
    mutate?.(central, index);
    locals.push(local, filename, packed); directory.push(central, filename);
    offset += local.length + filename.length + packed.length;
  });
  const central = Buffer.concat(directory), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(central.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, central, end]);
}
function presentation(slides = ["slide10.xml", "slide2.xml"], slideText = "") {
  return [
    ["ppt/presentation.xml", `<p:presentation xmlns:p="${p}" xmlns:r="${r}"><p:sldIdLst>${slides.map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${i}"/>`).join("")}</p:sldIdLst></p:presentation>`],
    ["ppt/_rels/presentation.xml.rels", `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${slides.map((name, i) => `<Relationship Id="rId${i}" Type="${r}/slide" Target="slides/${name}"/>`).join("")}</Relationships>`],
    ...slides.map((name, i) => [`ppt/slides/${name}`, `<p:sld xmlns:p="${p}" xmlns:a="${a}"><a:p><a:r><a:t>${i === 0 ? "开始 &amp; 目标 &#x4e2d;" : "第二页"}</a:t></a:r><a:br/><a:r><a:t>补充</a:t></a:r></a:p>${slideText}</p:sld>`]),
  ] as Array<[string, string]>;
}
beforeEach(() => { vi.resetAllMocks(); vi.mocked(getResource).mockResolvedValue(resource); });

describe("真实文件文字读取", () => {
  it("CRC遵循标准向量", () => expect(officeCrc32(Buffer.from("123456789"))).toBe(0xcbf43926));
  it("PPTX按照presentation关系排序而非文件名字典排序，保留实体和换行", async () => {
    const result = await extractFileContent({ name: "课题.pptx", bytes: zip(presentation()) });
    expect(result.format).toBe("pptx"); expect(result.sections.map((s) => s.label)).toEqual(["第 1 页", "第 2 页"]);
    expect(result.sections[0].text).toBe("开始 & 目标 中\n补充"); expect(result.sections[1].text).toContain("第二页");
    expect(result.text).toContain("第 1 页\n开始"); expect(result.truncated).toBe(false);
  });
  it("PPTX文字表格保留单元格间隔与行序", async () => {
    const table = "<a:tbl><a:tr><a:tc><a:p><a:r><a:t>A</a:t></a:r></a:p></a:tc><a:tc><a:p><a:r><a:t>B</a:t></a:r></a:p></a:tc></a:tr><a:tr><a:tc><a:p><a:r><a:t>C</a:t></a:r></a:p></a:tc></a:tr></a:tbl>";
    const result = await extractFileContent({ name: "表.pptx", bytes: zip(presentation(["slide1.xml"], table)) });
    expect(result.sections[0].text).toContain("A\tB\nC");
  });
  it("DOCX读取正文与表格、制表符、换行，不把修订删除文本算作正文", async () => {
    const xml = `<w:document xmlns:w="${w}"><w:body><w:p><w:r><w:t>目标</w:t><w:tab/><w:t>完成</w:t><w:br/><w:t>验收</w:t></w:r><w:del><w:r><w:delText>旧目标</w:delText></w:r></w:del></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>甲</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>乙</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:body></w:document>`;
    const result = await extractFileContent({ name: "报告.docx", bytes: zip([["word/document.xml", xml]]) });
    expect(result.text).toBe("目标\t完成\n验收\n甲\t乙"); expect(result.warnings[0]).toContain("分页布局");
  });
  it("支持纯文本、行号来源保持换行；超长明确截断且总字符不超限", async () => {
    const result = await extractFileContent({ name: "README.md", bytes: Buffer.from("# 目标\n\n方案") });
    expect(result.text).toBe("# 目标\n\n方案");
    const big = await extractFileContent({ name: "long.txt", bytes: Buffer.from("文字".repeat(40000)) });
    expect(big.text).toHaveLength(60000); expect(big.truncated).toBe(true); expect(big.warnings).not.toEqual([]);
  });
  it.each(["old.ppt", "scan.pdf", "image.png", "data.xlsx"])("不伪造不支持的格式 %s", async (name) => {
    await expect(extractFileContent({ name, bytes: Buffer.from("unsupported") })).rejects.toBeInstanceOf(AppError);
  });
  it("拒绝空文件、超限与二进制文本，不运行OCR", async () => {
    for (const bytes of [Buffer.alloc(0), Buffer.alloc(10 * 1024 * 1024 + 1), Buffer.from([0, 255])]) await expect(extractFileContent({ name: "a.txt", bytes })).rejects.toBeInstanceOf(AppError);
    await expect(extractFileContent({ name: "a.docx", bytes: zip([["word/document.xml", `<w:document xmlns:w="${w}"><w:body/></w:document>`]]) })).rejects.toThrow("OCR");
  });
  it.each(["../word/document.xml", "/word/document.xml", "word\\document.xml", "word/../document.xml"])("拒绝ZIP越界路径 %s", async (name) => {
    await expect(extractFileContent({ name: "a.docx", bytes: zip([[name, "text"]]) })).rejects.toBeInstanceOf(AppError);
  });
  it("拒绝重复ZIP文件名和不完整压缩包", async () => {
    const files: Array<[string, string]> = [["word/document.xml", "a"], ["WORD/document.xml", "b"]];
    await expect(extractFileContent({ name: "a.docx", bytes: zip(files) })).rejects.toThrow("结构无效");
    await expect(extractFileContent({ name: "a.docx", bytes: zip(files).subarray(0, 100) })).rejects.toThrow("结构无效");
  });
  it.each(["encrypted", "crc", "expanded", "method", "ratio", "entries"])("拒绝压缩包安全限制 %s", async (bad) => {
    const bytes = zip([["word/document.xml", `<w:document xmlns:w="${w}"><w:t>你好</w:t></w:document>`]], (header) => {
      if (bad === "encrypted") header.writeUInt16LE(1, 8);
      if (bad === "crc") header.writeUInt32LE(1, 16);
      if (bad === "expanded") header.writeUInt32LE(9 * 1024 * 1024, 24);
      if (bad === "method") header.writeUInt16LE(99, 10);
      if (bad === "ratio") header.writeUInt32LE(1, 20);
    });
    if (bad === "entries") bytes.writeUInt16LE(2049, bytes.length - 12);
    await expect(extractFileContent({ name: "a.docx", bytes })).rejects.toBeInstanceOf(AppError);
  });
  it.each(["<!DOCTYPE doc [<!ENTITY x SYSTEM 'file:///secret'>]>", "<!ENTITY secret 'x'>"])("拒绝DTD与外部实体定义", async (prefix) => {
    await expect(extractFileContent({ name: "a.docx", bytes: zip([["word/document.xml", `${prefix}<w:document xmlns:w="${w}"><w:t>&x;</w:t></w:document>`]]) })).rejects.toBeInstanceOf(AppError);
  });
  it("拒绝外部关系、未知实体、错位XML标签和危险幻灯片路径", async () => {
    const external = presentation(); external[1][1] = external[1][1].replace('Target="slides/slide10.xml"', 'Target="https://example.test" TargetMode="External"');
    await expect(extractFileContent({ name: "a.pptx", bytes: zip(external) })).rejects.toThrow("外部幻灯片");
    for (const body of ["<w:t>&secret;</w:t>", "<w:t>正文</w:p>"]) await expect(extractFileContent({ name: "a.docx", bytes: zip([["word/document.xml", `<w:document xmlns:w="${w}">${body}</w:document>`]]) })).rejects.toThrow();
    const traversal = presentation(); traversal[1][1] = traversal[1][1].replace("slides/slide10.xml", "../../private.xml");
    await expect(extractFileContent({ name: "a.pptx", bytes: zip(traversal) })).rejects.toThrow("路径无效");
  });
  it("正常PPTX和DOCX外部超链接仅忽略并提示，仍读取本文件正文", async () => {
    const files = presentation();
    files.push(["ppt/slides/_rels/slide10.xml.rels", `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="web" Type="${r}/hyperlink" Target="https://example.test" TargetMode="External"/></Relationships>`]);
    const result = await extractFileContent({ name: "a.pptx", bytes: zip(files) });
    expect(result.text).toContain("开始 & 目标 中"); expect(result.warnings.join(" ")).toContain("未访问外部地址");
    const doc = await extractFileContent({ name: "a.docx", bytes: zip([
      ["word/document.xml", `<w:document xmlns:w="${w}"><w:p><w:hyperlink><w:r><w:t>参考资料</w:t></w:r></w:hyperlink></w:p></w:document>`],
      ["word/_rels/document.xml.rels", `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="link" Type="${r}/hyperlink" Target="file:///private" TargetMode="External"/></Relationships>`],
    ]) });
    expect(doc.text).toBe("参考资料"); expect(doc.warnings.join(" ")).toContain("未访问外部地址");
  });
  it("替换命名空间前缀仍读取正确实体和CDATA，假冒命名空间不被算作正文", async () => {
    const xml = `<doc:document xmlns:doc="${w}" xmlns:fake="urn:fake"><doc:p><doc:r><doc:t><![CDATA[Text <not a tag>]]> &#65; &quot;yes&quot;</doc:t></doc:r><fake:t>不是真实正文标签</fake:t></doc:p></doc:document>`;
    const result = await extractFileContent({ name: "a.docx", bytes: zip([["word/document.xml", xml]]) });
    expect(result.text).toBe('Text <not a tag> A "yes"');
  });
  it("真实压缩比超限的文件拒绝解压", async () => {
    await expect(extractFileContent({ name: "a.docx", bytes: zip([["word/document.xml", "A".repeat(50000)]]) })).rejects.toThrow("安全读取限制");
  });
  it("大量无效实体和过多XML属性受限拒绝", async () => {
    for (const xml of [
      `<w:document xmlns:w="${w}"><w:t>${"&".repeat(2000)}</w:t></w:document>`,
      `<w:document xmlns:w="${w}" ${Array.from({ length: 257 }, (_, index) => `attr${index}="${index}"`).join(" ")}><w:t>正文</w:t></w:document>`,
    ]) await expect(extractFileContent({ name: "a.docx", bytes: zip([["word/document.xml", xml]]) })).rejects.toThrow();
  });
  it("支持取消，取消后不返回提取内容", async () => {
    const controller = new AbortController(); controller.abort();
    await expect(extractFileContent({ name: "a.md", bytes: Buffer.from("内容") }, { signal: controller.signal })).rejects.toThrow();
  });
});

describe("资料正文授权与版本复核", () => {
  it("成功返回真实资料与版本，并在输出前再次验证授权", async () => {
    const result = await readResourceContent("actor", "resource", { expectedVersion: 3 });
    expect(result.resource).toBe(resource); expect(result.version).toBe(3); expect(result.text).toBe(resource.body);
    expect(getResource).toHaveBeenCalledTimes(2);
  });
  it("初始越权不读取文件", async () => {
    vi.mocked(getResource).mockRejectedValue(new ForbiddenError());
    await expect(readResourceContent("outside", "resource")).rejects.toBeInstanceOf(ForbiddenError);
    expect(getResourceFile).not.toHaveBeenCalled();
  });
  it("旧版本409且不读取文件，版本参数非法拒绝", async () => {
    await expect(readResourceContent("actor", "resource", { expectedVersion: 2 })).rejects.toBeInstanceOf(ConflictError);
    await expect(readResourceContent("actor", "resource", { expectedVersion: 0 })).rejects.toBeInstanceOf(AppError);
    expect(getResourceFile).not.toHaveBeenCalled();
  });
  it("读取期间版本变化拒绝旧内容", async () => {
    vi.mocked(getResource).mockResolvedValueOnce(resource).mockResolvedValue({ ...resource, version: 4 });
    await expect(readResourceContent("actor", "resource")).rejects.toBeInstanceOf(ConflictError);
  });
  it.each([new ForbiddenError(), new NotFoundError("已回收")])("读取期间权限撤销或回收，不返回内容", async (error) => {
    vi.mocked(getResource).mockResolvedValueOnce(resource).mockRejectedValue(error);
    await expect(readResourceContent("actor", "resource")).rejects.toBe(error);
  });
  it("文件读取通过原文件服务，且文件版本必须一致", async () => {
    const file = { ...resource, kind: "file" as const, fileName: "a.md", body: null };
    vi.mocked(getResource).mockResolvedValue(file); vi.mocked(getResourceFile).mockResolvedValue({ resource: file, bytes: Buffer.from("真实文件") });
    expect((await readResourceContent("actor", "resource")).text).toBe("真实文件");
    vi.mocked(getResourceFile).mockResolvedValue({ resource: { ...file, version: 4 }, bytes: Buffer.from("真实文件") });
    await expect(readResourceContent("actor", "resource")).rejects.toBeInstanceOf(ConflictError);
  });
  it("链接不冒充已读取外站正文", async () => {
    vi.mocked(getResource).mockResolvedValue({ ...resource, kind: "link", url: "https://example.test" });
    await expect(readResourceContent("actor", "resource")).rejects.toThrow("未读取外部网页");
  });
});
