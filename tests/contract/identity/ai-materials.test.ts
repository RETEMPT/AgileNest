import { describe, expect, it } from "vitest";
import { createDraftStore } from "@/components/ai/draft-store";
import { decodeNotebook, draftMaterials, EMPTY_NOTEBOOK, saveDraft, searchDrafts, type AiDraft } from "@/components/ai/drafts";
import { csvPreview, decodeMaterialText, findTextLines, MAX_MATERIAL_BYTES, MAX_SESSION_BYTES, materialKind, organizeMaterial, readMaterial, textOutline, validateMaterialBatch, type MaterialRef } from "@/components/ai/materials";

const ref: MaterialRef = {id:"ce44eaa6-d4aa-4d80-b879-06ba8c8d534e",name:"课题材料.md",kind:"text",size:2048,createdAt:"2026-10-07T00:00:00.000Z"};
const draft: AiDraft = {id:"initial",title:"课题计划",customTitle:false,text:"未完成输入",updatedAt:ref.createdAt};
describe("foundation 本地资料", () => {
  it("格式边界明确，拒绝执行文件、压缩包和 Word", () => {
    expect(materialKind("调研.MD")).toBe("text");
    expect(materialKind("资料.pdf")).toBe("pdf");
    expect(materialKind("截图.PNG")).toBe("image");
    for (const name of ["run.exe","pack.zip","文档.docx","vector.svg"]) expect(() => materialKind(name)).toThrow("暂不支持");
  });
  it("校验整批文件的数量、单文件大小和总大小，不接受空文件", () => {
    expect(() => validateMaterialBatch([], [{name:"空.txt",size:0}])).toThrow("空文件");
    expect(() => validateMaterialBatch([], [{name:"大.txt",size:MAX_MATERIAL_BYTES+1}])).toThrow("10 MB");
    expect(() => validateMaterialBatch(Array.from({length:10},() => ref),[{name:"第十一份.md",size:1}])).toThrow("10 份");
    expect(() => validateMaterialBatch(Array.from({length:5},() => ({...ref,size:MAX_MATERIAL_BYTES})),[{name:"超额.txt",size:1}])).toThrow("50 MB");
    expect(() => validateMaterialBatch([], [{name:"上限.txt",size:MAX_MATERIAL_BYTES}])).not.toThrow();
    expect(MAX_SESSION_BYTES).toBe(MAX_MATERIAL_BYTES*5);
  });
  it("读取 UTF-8/BOM、UTF-16 与 Windows 换行，拒绝乱码和二进制", () => {
    const bytes = new TextEncoder().encode("\uFEFF课题\r\n目标\r步骤");
    expect(decodeMaterialText(bytes)).toBe("课题\n目标\n步骤");
    expect(decodeMaterialText(new Uint8Array([255,254,65,0,10,0,66,0]))).toBe("A\nB");
    expect(decodeMaterialText(new Uint8Array([254,255,0,65]))).toBe("A");
    expect(() => decodeMaterialText(new Uint8Array([0x80,0xff]))).toThrow("编码");
    expect(() => decodeMaterialText(new Uint8Array([65,0,66]))).toThrow("二进制");
  });
  it("真正读取超过输入框额度的文件，保留原文件和正文", async () => {
    const text = "研究资料\n".repeat(1500);
    const file = new File([text],"调研.md",{type:"text/markdown"});
    const material = await readMaterial(file);
    expect(material.text).toBe(text);
    expect(material.text!.length).toBeGreaterThan(6000);
    expect(material.ref).toMatchObject({name:file.name,size:file.size,kind:"text"});
    expect(await material.blob.text()).toBe(text);
  });
  it("图片与 PDF 只登记预览，不伪造提取文字", async () => {
    const pdf = await readMaterial(new File(["%PDF-1.7\n"],"资料.pdf"));
    expect(pdf.blob.type).toBe("application/pdf");
    expect(pdf.text).toBeUndefined();
    const image = await readMaterial(new File([new Uint8Array([137,80,78,71])],"图.png"));
    expect(image.blob.type).toBe("image/png");
    expect(image.text).toBeUndefined();
  });
  it("提取原文 Markdown、下划线与中文编号标题，保留真实行号", () => {
    expect(textOutline("# 课题目标\n正文\n## 实施步骤\n一、验收材料\n附录\n---")).toEqual([
      {line:1,title:"课题目标"},{line:3,title:"实施步骤"},{line:4,title:"一、验收材料"},{line:5,title:"附录"},
    ]);
    expect(textOutline("没有标题的正文")).toEqual([]);
    expect(textOutline("# 章节\n".repeat(250))).toHaveLength(200);
  });
  it("CSV 正确处理带逗号、引号与跨行字段，预览数量有上限", () => {
    const result = csvPreview('姓名,备注\n张老师,"研究,协作"\n同学,"第一行\n第二行"\nA,"""引号"""\n');
    expect(result.count).toBe(4);
    expect(result.columns).toBe(2);
    expect(result.rows[1]).toEqual(["张老师","研究,协作"]);
    expect(result.rows[2][1]).toBe("第一行\n第二行");
    expect(result.rows[3][1]).toBe('"引号"');
    expect(csvPreview("a,b\n".repeat(1000)).rows).toHaveLength(51);
    expect(csvPreview("名字\t分工\n同学\t分析", "\t").columns).toBe(2);
    expect(() => csvPreview('a,"b')).toThrow("未闭合引号");
  });
  it("搜索统计所有命中，仅渲染前 200 个结果，行号可定位", () => {
    const result = findTextLines("前言\n"+"AgileNest 资料\n".repeat(250),"agilenest");
    expect(result.count).toBe(250);
    expect(result.matches).toHaveLength(200);
    expect(result.matches[0].line).toBe(2);
    expect(findTextLines("研究资料", " ").matches).toEqual([]);
  });
  it("按实际标题、表格字段与 JSON 字段整理，不生成内容总结", () => {
    expect(organizeMaterial("任务.csv","姓名,分工\n同学,调研")).toContain("字段：姓名、分工");
    expect(organizeMaterial("项目.json",'{"goal":"课题","steps":[]}')).toContain("顶层字段：goal、steps");
    expect(organizeMaterial("章节.md","# 目标\n正文\n## 方法")).toContain("方法（第 3 行）");
    expect(() => organizeMaterial("错误.json","{no}")).toThrow("JSON 格式无效");
    expect(organizeMaterial("正文.txt","纯文本内容")).toContain("未发现章节标题");
  });
  it("兼容旧草稿与附件单独成条记录，刷新保留资料元数据", () => {
    expect(decodeNotebook(JSON.stringify({...EMPTY_NOTEBOOK,drafts:[draft],activeId:draft.id})).drafts[0].materials).toBeUndefined();
    const notebook = saveDraft(EMPTY_NOTEBOOK,{...draft,materials:[ref]});
    const recorded = saveDraft(notebook,{...notebook.drafts[0],materials:[],messages:[{id:ref.id,text:"",materials:[ref],createdAt:ref.createdAt}]});
    expect(draftMaterials(decodeNotebook(JSON.stringify(recorded)).drafts[0])).toEqual([ref]);
    expect(searchDrafts(recorded.drafts,"课题材料")).toHaveLength(1);
    expect(() => saveDraft(EMPTY_NOTEBOOK,{...draft,messages:[{id:ref.id,text:"",createdAt:ref.createdAt}]})).toThrow();
    expect(() => saveDraft(EMPTY_NOTEBOOK,{...draft,materials:[ref,ref]})).toThrow();
  });
  it("已记录附件与待记录附件共同计数，拒绝超额", () => {
    const refs = Array.from({length:10},(_,index) => ({...ref,id:`ce44eaa6-d4aa-4d80-b879-${String(index).padStart(12,"0")}`}));
    const message = {id:ref.id,text:"",materials:refs,createdAt:ref.createdAt};
    expect(() => saveDraft(EMPTY_NOTEBOOK,{...draft,messages:[message],materials:[ref]})).toThrow();
    expect(() => saveDraft(EMPTY_NOTEBOOK,{...draft,materials:refs.slice(0,6).map((item) => ({...item,size:MAX_MATERIAL_BYTES}))})).toThrow();
  });
  it("资料按账号隔离，编辑正文不丢失另一个编辑器的新附件", () => {
    const values = new Map<string,string>();
    const storage = {getItem:(key:string) => values.get(key) ?? null,setItem:(key:string,value:string) => {values.set(key,value);}};
    const first = createDraftStore("a",() => storage), second = createDraftStore("b",() => storage);
    first.commit((notebook) => saveDraft(notebook,draft));
    const remote = createDraftStore("a",() => storage);
    remote.commit((notebook) => saveDraft(notebook,{...draft,materials:[ref]}));
    expect(first.saveText(draft,"保留资料的新正文",draft.text)).toBe(true);
    expect(first.getSnapshot().notebook.drafts[0].materials).toEqual([ref]);
    expect(second.getSnapshot().notebook.drafts).toEqual([]);
  });
});
