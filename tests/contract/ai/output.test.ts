import { describe, expect, it } from "vitest";
import { chatOutputUiSchema, interactiveOutputInstruction, parseChatOutput } from "@/modules/ai/output-client";
import { chatProgressSchema, chatResultSchema } from "@/modules/ai/client";

const ui = { version: 1, summary: "先核对目标，再分阶段交付", questions: ["是否需要导出？"], roadmap: [{ title: "确认需求", outcome: "可核验的目标", orderNote: "先于实现" }], changeRequests: [{ title: "补充导出要求", problem: "导出范围尚不明确", proposal: "确认导出字段和样例", acceptanceCriteria: ["明确字段并提供样例"], impact: "资料整理任务", risks: ["格式待本人确认"] }] };

describe("受限交互式项目建议", () => {
  it("合法数据映射为有限卡片结构，不含执行权限", () => {
    const parsed = parseChatOutput(JSON.stringify({ text: "建议先确认范围。", ui }));
    expect(parsed.ui?.changeRequests).toHaveLength(1);
    expect(parsed).not.toHaveProperty("confirmed");
    expect(parsed).not.toHaveProperty("action");
  });
  it("旧Markdown回复保持原文，不猜测行动卡片", () => {
    const text = "# 规划建议\n先确认范围，再开始实现。";
    expect(parseChatOutput(text)).toEqual({ text });
  });
  it("支持完整JSON代码围栏，拒绝附加脚本或动作字段", () => {
    expect(parseChatOutput(`\`\`\`json\n${JSON.stringify({ text: "建议", ui })}\n\`\`\``).ui).toBeDefined();
    expect(parseChatOutput(JSON.stringify({ text: "实际答复", ui: { ...ui, action: "run" } }))).toEqual({ text: "实际答复" });
    expect(parseChatOutput(JSON.stringify({ text: "实际答复", ui, execute: true }))).toEqual({ text: "实际答复" });
  });
  it("超限或无法执行的提案只保留实际文本，不合成通过结果", () => {
    expect(chatOutputUiSchema.safeParse({ ...ui, questions: Array(5).fill("问题") }).success).toBe(false);
    expect(parseChatOutput(JSON.stringify({ text: "尚待确认", ui: { ...ui, changeRequests: [{ ...ui.changeRequests[0], acceptanceCriteria: [] }] } }))).toEqual({ text: "尚待确认" });
  });
  it("没有可用文字字段的非契约JSON仍保留原始响应", () => {
    const text = JSON.stringify({ type: "button", onClick: "execute" });
    expect(parseChatOutput(text)).toEqual({ text });
  });
  it("普通问答不强加结构输出，项目规划才要求待审卡片", () => {
    expect(interactiveOutputInstruction("你好，请解释验收是什么意思")).toBe("");
    expect(interactiveOutputInstruction("请给出需求扩展建议和规划路线")).toContain("待本人审阅");
    expect(interactiveOutputInstruction("请规划任务")).toContain("不能请求自动改平台源码");
  });
  it("任务概况与认领卡片结构合法解析，提供统计与操作卡片", () => {
    const taskId = "b0cce1bc-ce6b-46b6-bc6b-520a7b67f344";
    const projectId = "6719707f-3763-414c-9254-3ec3531a86c9";
    const taskUi = {
      version: 1,
      summary: "任务完成率 50%",
      questions: [],
      roadmap: [],
      changeRequests: [],
      taskStats: { total: 2, completed: 1, inProgress: 1, submitted: 0, unclaimed: 1, completionRate: "50%" },
      taskActions: [
        { taskId, projectId, title: "开发接口", status: "unclaimed" as const, statusLabel: "待认领", canClaim: true, jumpHref: `/p/${projectId}/tasks/${taskId}` },
      ],
    };
    const parsed = parseChatOutput(JSON.stringify({ text: "你的任务情况如下", ui: taskUi }));
    expect(parsed.ui?.taskStats?.completionRate).toBe("50%");
    expect(parsed.ui?.taskActions).toHaveLength(1);
    expect(parsed.ui?.taskActions?.[0].canClaim).toBe(true);
    expect(interactiveOutputInstruction("看看我的任务完成情况")).toContain("taskStats");
  });
  it("任务提示词要求平台按真实数据生成卡片，禁止模型编造 ID、状态与链接", () => {
    const instruction = interactiveOutputInstruction("看看我的待办任务");
    expect(instruction).toContain("不得编造");
    expect(instruction).toContain("由平台依据当前账号真实任务与权限数据生成");
    expect(instruction).not.toContain("\"canClaim\":true");
    expect(instruction).not.toContain("jumpHref");
  });
  it("站外链接与自相矛盾统计被剔除，坏卡片不拖垮整段结构化答复", () => {
    const taskId = "b0cce1bc-ce6b-46b6-bc6b-520a7b67f344";
    const projectId = "6719707f-3763-414c-9254-3ec3531a86c9";
    const forged = {
      taskActions: [{ taskId, projectId, title: "伪造任务", status: "unclaimed" as const, canClaim: true, jumpHref: "https://evil.test/steal", boardHref: "//evil.test" }],
      taskStats: { total: 1, completed: 9, inProgress: 0, submitted: 0, unclaimed: 9, completionRate: "900%" },
    };
    const parsed = parseChatOutput(JSON.stringify({ text: "任务概况", ui: { ...ui, ...forged } }));
    expect(parsed.ui).toBeDefined();
    expect(parsed.ui?.summary).toBe(ui.summary);
    expect(parsed.ui?.taskActions).toBeUndefined();
    expect(parsed.ui?.taskStats).toBeUndefined();
    const legal = chatOutputUiSchema.parse({ ...ui, taskActions: [{ ...forged.taskActions[0], jumpHref: `/p/${projectId}/tasks/${taskId}`, boardHref: `/p/${projectId}/board?task=${taskId}` }] });
    expect(legal.taskActions?.[0].boardHref).toContain("board?task=");
  });
  it("流式结果与本地草稿对进度步骤有长度和字数上限", () => {
    expect(chatProgressSchema.safeParse({ type: "progress", phase: "tasks", message: "x".repeat(301) }).success).toBe(false);
    const progress = Array.from({ length: 25 }, (_, index) => ({ type: "progress" as const, phase: "tasks" as const, message: `第${index + 1}步` }));
    const base = { text: "答复", model: "fixture", sources: [], workSources: [], toolSources: [], retrieval: { scope: "project" as const, searchedScopes: 0, matchedResources: 0, readResources: 0, truncated: false } };
    expect(chatResultSchema.safeParse({ ...base, progress: progress.slice(0, 24) }).success).toBe(true);
    expect(chatResultSchema.safeParse({ ...base, progress }).success).toBe(false);
  });
});
