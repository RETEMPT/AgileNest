import { describe, expect, it } from "vitest";
import { chatOutputUiSchema, interactiveOutputInstruction, parseChatOutput } from "@/modules/ai/output-client";

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
});
