import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError, ForbiddenError } from "@/modules/core";
import { answerWithKnowledge } from "@/modules/ai/knowledge";
import type { ResourceDTO } from "@/modules/resources";
import { builtinCatalog } from "@/modules/ai/plugins-client";
const calls = vi.hoisted(() => ({ teams: vi.fn(), projects: vi.fn(), list: vi.fn(), get: vi.fn(), read: vi.fn(), tasks: vi.fn(), detail: vi.fn(), delivery: vi.fn(), milestones: vi.fn(), plugins: vi.fn(), builtin: vi.fn(), mcp: vi.fn() }));
vi.mock("@/modules/resources", () => ({ listResources: calls.list, getResource: calls.get, readResourceContent: calls.read }));
vi.mock("@/modules/identity", () => ({ listMyTeams: calls.teams, listMyProjects: calls.projects }));
vi.mock("@/modules/tasks", () => ({ listProjectTasks: calls.tasks, getTaskDetail: calls.detail, getTaskDelivery: calls.delivery, STATUS_LABELS: { in_progress: "进行中" } }));
vi.mock("@/modules/milestone", () => ({ listMilestones: calls.milestones }));
vi.mock("@/modules/ai/plugins", () => ({ getPluginLibrary: calls.plugins, requireBuiltinPlugin: calls.builtin, callMcpTool: calls.mcp }));
const projectId = "6719707f-3763-414c-9254-3ec3531a86c9";
const resourceId = "8d50a6c3-d491-4881-a5d3-5c57755ff8e1";
const row: ResourceDTO = { id: resourceId, projectId, teamId: resourceId, title: "接口规范", fileName: "接口规范.pptx", body: null, tags: [], version: 2, kind: "file", url: null, mimeType: "application/octet-stream", size: 100, category: "general", createdById: null, authorName: null, updatedAt: "2026-10-16", createdAt: "2026-10-16", canManage: false, referenced: false };
const input = { projectId, knowledgeScope: "project" as const, messages: [{ role: "user" as const, content: "接口规范如何约定" }] };
const output = (value: unknown) => ({ text: typeof value === "string" ? value : JSON.stringify(value), model: "fixture" });
beforeEach(() => {
  vi.clearAllMocks(); calls.list.mockResolvedValue([row]); calls.get.mockResolvedValue(row);
  calls.read.mockResolvedValue({ resource: row, version: 2, format: "pptx", text: "仅允许HTTPS", sections: [{ index: 1, label: "第1页", text: "仅允许HTTPS" }], truncated: false, warnings: [] });
  calls.teams.mockResolvedValue([{ id: resourceId }]); calls.projects.mockResolvedValue([{ id: projectId }]); calls.tasks.mockResolvedValue([]); calls.milestones.mockResolvedValue([]);
  calls.plugins.mockResolvedValue({ revision: 7, builtins: builtinCatalog.map(({ id }) => ({ id, enabled: true })), mcpServers: [] }); calls.builtin.mockResolvedValue(undefined);
});
describe("有界只读资料工具", () => {
  it("由真实动作搜索/读取并返回服务端版本来源，搜索不发送整库正文", async () => {
    const generate = vi.fn().mockResolvedValueOnce(output({ action: "search", query: "接口" })).mockResolvedValueOnce(output({ action: "read", resourceIds: [resourceId] })).mockResolvedValueOnce(output({ action: "answer" })).mockResolvedValueOnce(output("必须HTTPS[来源1]"));
    const progress = vi.fn();
    const result = await answerWithKnowledge("alice", input, generate, undefined, progress);
    expect(result.sources).toEqual([{ resourceId, title: row.title, version: 2, href: `/p/${projectId}/resources?resource=${resourceId}`, excerpt: "仅允许HTTPS", location: "正文，第 1–1 行" }]);
    expect(result.retrieval).toMatchObject({ searchedScopes: 1, matchedResources: 1, readResources: 1 });
    expect(calls.list).toHaveBeenCalledWith("alice", { projectId });
    expect(calls.read).toHaveBeenCalledWith("alice", resourceId, { expectedVersion: 2, signal: undefined });
    expect(generate.mock.calls[1][0][0].content).not.toContain("仅允许HTTPS");
    expect(progress.mock.calls.map(([event]) => event.phase)).toEqual(["searching", "searching", "reading", "answering"]);
  });
  it("关闭检索或未选项目不查询数据库", async () => {
    for (const data of [{ ...input, knowledgeScope: "none" as const }, { ...input, projectId: undefined }]) {
      const generate = vi.fn().mockResolvedValue(output("对话回答"));
      expect((await answerWithKnowledge("alice", data, generate)).sources).toEqual([]);
      expect(generate).toHaveBeenCalledTimes(1);
    }
    expect(calls.list).not.toHaveBeenCalled(); expect(calls.read).not.toHaveBeenCalled();
  });
  it("全可访问范围按当前账号团队契约获取，不接受模型任意ID读取", async () => {
    const generate = vi.fn().mockResolvedValueOnce(output({ action: "search", query: "接口" })).mockResolvedValueOnce(output({ action: "read", resourceIds: [projectId] })).mockResolvedValueOnce(output({ action: "answer" })).mockResolvedValueOnce(output("未读取该文件"));
    const result = await answerWithKnowledge("alice", { ...input, knowledgeScope: "accessible" }, generate);
    expect(calls.teams).toHaveBeenCalledWith("alice"); expect(calls.list).toHaveBeenCalledWith("alice", { teamId: resourceId });
    expect(calls.read).not.toHaveBeenCalled(); expect(result.sources).toMatchObject([{ resourceId, location: "目录信息（未读正文）" }]);
  });
  it("候选资料失去权限时停止回答，不把旧正文返回浏览器", async () => {
    const generate = vi.fn().mockResolvedValueOnce(output({ action: "search", query: "接口" })).mockImplementationOnce(async () => { calls.get.mockRejectedValue(new ForbiddenError()); return output({ action: "read", resourceIds: [resourceId] }); });
    await expect(answerWithKnowledge("alice", input, generate)).rejects.toMatchObject({ status: 403 });
    expect(calls.read).not.toHaveBeenCalled(); expect(generate).toHaveBeenCalledTimes(2);
  });
  it("读取后版本变化取消回答，无法解析的格式如实传回工具错误", async () => {
    const generate = vi.fn().mockResolvedValueOnce(output({ action: "search", query: "接口" })).mockResolvedValueOnce(output({ action: "read", resourceIds: [resourceId] })).mockImplementationOnce(async () => { calls.get.mockResolvedValue({ ...row, version: 3 }); return output({ action: "answer" }); });
    await expect(answerWithKnowledge("alice", input, generate)).rejects.toMatchObject({ status: 409 });
    calls.get.mockResolvedValue(row); calls.read.mockRejectedValue(new AppError("旧PPT暂不支持，请转换为PPTX"));
    const other = vi.fn().mockResolvedValueOnce(output({ action: "search", query: "接口" })).mockResolvedValueOnce(output({ action: "read", resourceIds: [resourceId] })).mockResolvedValueOnce(output({ action: "answer" })).mockResolvedValueOnce(output("请转换格式"));
    expect((await answerWithKnowledge("alice", input, other)).sources).toMatchObject([{ resourceId, location: "目录信息（未读正文）" }]);
    expect(other.mock.calls.at(-1)?.[1]).toContain("旧PPT暂不支持");
  });
  it("工具动作有界，最多两次搜索并拒绝SQL或任意动作", async () => {
    const generate = vi.fn().mockResolvedValue(output({ action: "search", query: "接口" }));
    await answerWithKnowledge("alice", input, generate);
    expect(generate).toHaveBeenCalledTimes(4); expect(calls.list).toHaveBeenCalledTimes(1);
    const invalid = vi.fn().mockResolvedValueOnce(output({ action: "sql", query: "select * from users" })).mockResolvedValueOnce(output("不能执行SQL"));
    await answerWithKnowledge("alice", input, invalid);
    expect(invalid).toHaveBeenCalledTimes(2); expect(calls.read).not.toHaveBeenCalled();
  });
  it("停止信号阻止工具继续读取", async () => {
    const controller = new AbortController(); controller.abort();
    const generate = vi.fn(); await expect(answerWithKnowledge("alice", input, generate, controller.signal)).rejects.toMatchObject({ status: 499 });
    expect(generate).not.toHaveBeenCalled(); expect(calls.list).not.toHaveBeenCalled();
  });
  it("按真实幻灯片页序读取后页，引用标注实际页面", async () => {
    calls.read.mockResolvedValue({ resource: row, version: 2, format: "pptx", text: "首页说明\n后页结论", sections: [{ index: 1, label: "第1页", text: "首页说明" }, { index: 12, label: "第12页", text: "后页结论" }], truncated: false, warnings: [] });
    const generate = vi.fn().mockResolvedValueOnce(output({ action: "search", query: "接口" })).mockResolvedValueOnce(output({ action: "read", resourceIds: [resourceId], sectionIndex: 12 })).mockResolvedValueOnce(output({ action: "answer" })).mockResolvedValueOnce(output("结论来自第12页"));
    const result = await answerWithKnowledge("alice", input, generate);
    expect(result.sources[0]).toMatchObject({ excerpt: "后页结论", location: "第12页，第 1–1 行" });
    expect(generate.mock.calls.at(-1)?.[1]).not.toContain('"text":"首页说明');
  });
  it("仅搜索列资料名称时返回可点目录来源，不伪装已经读取正文", async () => {
    const generate = vi.fn().mockResolvedValueOnce(output({ action: "search", query: "接口" })).mockResolvedValueOnce(output({ action: "answer" })).mockResolvedValueOnce(output("相关资料为接口规范[来源1]"));
    const result = await answerWithKnowledge("alice", input, generate);
    expect(result.sources).toEqual([{ resourceId, title: "接口规范", version: 2, href: `/p/${projectId}/resources?resource=${resourceId}`, excerpt: "目录匹配，尚未读取正文", location: "目录信息（未读正文）" }]);
    expect(result.retrieval.readResources).toBe(0); expect(calls.read).not.toHaveBeenCalled();
    expect(generate.mock.calls.at(-1)?.[1]).toContain('"source":1');
  });
  it("真实追问序列中旧助手错误能力不能阻止服务端检索并读正文", async () => {
    const named = { ...row, title: "业务完善试用说明（rc.6演示）", kind: "document" as const, fileName: null };
    calls.list.mockResolvedValue([named]); calls.get.mockResolvedValue(named);
    calls.read.mockResolvedValue({ resource: named, version: 2, format: "text", text: "提交时需逐项检查验收要求。", sections: [{ index: 1, label: "正文", text: "提交时需逐项检查验收要求。" }], truncated: false, warnings: [] });
    const data = { ...input, messages: [{ role: "assistant" as const, content: "我只有只读检索，不具备读正文功能，请粘贴文字。" }, { role: "user" as const, content: "请打开并阅读业务完善试用说明（rc.6演示）概括验收说明来源" }] };
    const generate = vi.fn().mockResolvedValueOnce(output({ action: "answer" })).mockResolvedValueOnce(output({ action: "answer" })).mockResolvedValueOnce(output("提交需逐项检查验收要求[来源1]"));
    const result = await answerWithKnowledge("alice", data, generate);
    expect(calls.list).toHaveBeenCalledTimes(1); expect(calls.read).toHaveBeenCalledTimes(1);
    expect(result.retrieval.readResources).toBe(1); expect(result.sources[0]).toMatchObject({ title: named.title, excerpt: "提交时需逐项检查验收要求。" });
    expect(generate.mock.calls.at(-1)?.[1]).toContain("历史助手声称不能读正文的说法已过时");
    expect(generate.mock.calls.at(-1)?.[1]).toContain("提交时需逐项检查验收要求");
  });
  it("不支持JSON决策时仍能为明确读取请求准备证据，普通聊天不强行检索", async () => {
    const generate = vi.fn().mockResolvedValueOnce(output("我不能读取正文" )).mockResolvedValueOnce(output("请粘贴" )).mockResolvedValueOnce(output("HTTPS[来源1]"));
    const result = await answerWithKnowledge("alice", { ...input, messages: [{ role: "user", content: "请阅读接口规范文档" }] }, generate);
    expect(result.retrieval.readResources).toBe(1); expect(calls.read).toHaveBeenCalledTimes(1);
    calls.list.mockClear(); calls.read.mockClear();
    const casual = vi.fn().mockResolvedValueOnce(output({ action: "answer" })).mockResolvedValueOnce(output("你好"));
    await answerWithKnowledge("alice", { ...input, messages: [{ role: "user", content: "你好，今天状态如何" }] }, casual);
    expect(calls.list).not.toHaveBeenCalled(); expect(calls.read).not.toHaveBeenCalled();
  });
  it("来源升级到已读正文时保留原编号，删除没有服务端证据的编号", async () => {
    const secondId = "a5a01d24-16ce-40a1-98ed-09a33c5c1a4f";
    const second = { ...row, id: secondId, title: "验收说明" };
    calls.list.mockResolvedValue([row, second]); calls.get.mockImplementation(async (_actor, id) => id === secondId ? second : row);
    const generate = vi.fn().mockResolvedValueOnce(output({ action: "search", query: "" })).mockResolvedValueOnce(output({ action: "read", resourceIds: [resourceId] })).mockResolvedValueOnce(output({ action: "answer" })).mockResolvedValueOnce(output("接口要求HTTPS[来源1]，还有验收说明[来源2]。另[来源99][工作来源1]"));
    const result = await answerWithKnowledge("alice", input, generate);
    expect(result.sources[0]).toMatchObject({ resourceId, excerpt: "仅允许HTTPS", location: "正文，第 1–1 行" });
    expect(result.sources[1]).toMatchObject({ resourceId: secondId, location: "目录信息（未读正文）" });
    expect(result.text).toContain("[来源1]"); expect(result.text).toContain("[来源2]");
    expect(result.text).not.toContain("[来源99]"); expect(result.text).not.toContain("[工作来源1]");
  });
  it("允许同一文件按行继续读，去重文件计数并保留两段真实位置", async () => {
    calls.read.mockResolvedValue({ resource: row, version: 2, format: "text", text: "第一行\n第二行\n第三行", sections: [{ index: 1, label: "正文", text: "第一行\n第二行\n第三行" }], truncated: false, warnings: [] });
    const generate = vi.fn().mockResolvedValueOnce(output({ action: "search", query: "接口" })).mockResolvedValueOnce(output({ action: "read", resourceIds: [resourceId], limitLines: 1 })).mockResolvedValueOnce(output({ action: "read", resourceIds: [resourceId], startLine: 2, limitLines: 2 })).mockResolvedValueOnce(output({ action: "answer" })).mockResolvedValueOnce(output("读取三行"));
    const result = await answerWithKnowledge("alice", input, generate);
    expect(result.retrieval.readResources).toBe(1); expect(result.sources).toHaveLength(2);
    expect(result.sources[1]).toMatchObject({ excerpt: "第二行\n第三行", location: "正文，第 2–3 行" });
  });
  it("通过公开契约查询真实任务和里程碑，不授予写入工具", async () => {
    const task = { id: resourceId, projectId, title: "实现接口", description: "支持查询", status: "in_progress", assigneeName: "小林", dueDate: "2026-10-20", updatedAt: new Date(), parentTaskId: null, milestoneId: null };
    calls.tasks.mockResolvedValue([task]); calls.detail.mockResolvedValue(task); calls.delivery.mockResolvedValue({ requirements: { version: 1, criteria: [{ id: "c1", text: "通过查询演示" }] }, submissions: [] });
    const generate = vi.fn().mockResolvedValueOnce(output({ action: "query_work", query: "" })).mockResolvedValueOnce(output({ action: "answer" })).mockResolvedValueOnce(output("接口由小林负责[工作来源1]"));
    const result = await answerWithKnowledge("alice", input, generate);
    expect(calls.tasks).toHaveBeenCalledWith("alice", projectId); expect(result.workSources).toMatchObject([{ kind: "task", title: "实现接口", href: `/p/${projectId}/tasks/${resourceId}` }]);
    expect(generate.mock.calls.at(-1)?.[1]).toContain("通过查询演示"); expect(calls.list).not.toHaveBeenCalled();
  });
  it("无项目且平台资料关闭时仍可调用已授权MCP，平台查询继续禁止", async () => {
    calls.plugins.mockResolvedValue({ revision: 7, builtins: [], mcpServers: [{ id: resourceId, name: "文档服务", enabled: true, tools: [{ name: "read_text", description: "文字读取", enabled: true, readOnly: true, inputSchema: { type: "object" } }] }] });
    calls.mcp.mockResolvedValue({ serverId: resourceId, serverName: "文档服务", toolName: "read_text", text: "外部文字", truncated: false, revision: 7 });
    const generate = vi.fn().mockResolvedValueOnce(output({ action: "mcp", serverId: resourceId, toolName: "read_text", arguments: {} })).mockResolvedValueOnce(output({ action: "query_work", query: "" })).mockResolvedValueOnce(output({ action: "answer" })).mockResolvedValueOnce(output("外部文字[工具来源1]"));
    const result = await answerWithKnowledge("alice", { ...input, projectId: null, knowledgeScope: "none" }, generate);
    expect(calls.mcp).toHaveBeenCalledTimes(1); expect(calls.tasks).not.toHaveBeenCalled(); expect(calls.list).not.toHaveBeenCalled();
    expect(result.toolSources).toMatchObject([{ serverName: "文档服务", toolName: "read_text", excerpt: "外部文字" }]); expect(result.text).toContain("[工具来源1]");
  });
  it("MCP复核记录不应阻止随后第一次真实项目工作查询", async () => {
    calls.plugins.mockResolvedValue({ revision: 7, builtins: builtinCatalog.map(({ id }) => ({ id, enabled: true })), mcpServers: [{ id: resourceId, name: "文档服务", enabled: true, tools: [{ name: "read_text", description: "文字读取", enabled: true, readOnly: true, inputSchema: { type: "object" } }] }] });
    calls.mcp.mockResolvedValue({ serverId: resourceId, serverName: "文档服务", toolName: "read_text", text: "外部文字", truncated: false, revision: 7 });
    const generate = vi.fn().mockResolvedValueOnce(output({ action: "mcp", serverId: resourceId, toolName: "read_text", arguments: {} })).mockResolvedValueOnce(output({ action: "query_work", query: "" })).mockResolvedValueOnce(output({ action: "answer" })).mockResolvedValueOnce(output("已查阅"));
    await answerWithKnowledge("alice", { ...input, messages: [{ role: "user", content: "查看项目进度" }] }, generate);
    expect(calls.mcp).toHaveBeenCalledTimes(1); expect(calls.tasks).toHaveBeenCalledWith("alice", projectId);
  });
  it("关闭内置资料检索后不查询资料，开关执行前还需复核", async () => {
    calls.plugins.mockResolvedValue({ revision: 7, builtins: builtinCatalog.map(({ id }) => ({ id, enabled: id !== "resource-search" })), mcpServers: [] });
    const generate = vi.fn().mockResolvedValueOnce(output({ action: "answer" })).mockResolvedValueOnce(output("资料检索已关闭"));
    await answerWithKnowledge("alice", { ...input, messages: [{ role: "user", content: "请列出资料名称" }] }, generate);
    expect(calls.list).not.toHaveBeenCalled(); expect(calls.read).not.toHaveBeenCalled();
  });
  it("明确规划请求的合法建议卡仅作为数据返回，无工具写入动作", async () => {
    const ui = { version: 1, summary: "先确认目标", questions: ["适用哪些使用者？"], roadmap: [{ title: "确认需求", outcome: "形成验收要求", orderNote: "实施前确认" }], changeRequests: [] };
    const generate = vi.fn().mockResolvedValue(output({ text: "请先确认目标", ui }));
    const result = await answerWithKnowledge("alice", { ...input, knowledgeScope: "none", messages: [{ role: "user", content: "请帮我规划任务" }] }, generate);
    expect(result.ui).toEqual(ui); expect(result.text).toBe("请先确认目标"); expect(generate).toHaveBeenCalledTimes(1);
    expect(generate.mock.calls[0][1]).toContain("本次可使用交互式项目建议"); expect(calls.list).not.toHaveBeenCalled(); expect(calls.tasks).not.toHaveBeenCalled();
  });
});
