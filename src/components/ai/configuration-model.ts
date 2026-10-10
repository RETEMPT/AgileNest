import { z } from "zod";

export const BUILTIN_PLUGINS = [
  { id: "project-plan", name: "项目规划", description: "梳理目标、范围与交付安排", prompt: "请帮我梳理项目计划。\n项目目标：\n参与成员：\n预期交付：\n截止时间：", category: "规划" },
  { id: "task-breakdown", name: "任务拆解", description: "明确分工、交付物与验收标准", prompt: "请将以下需求拆成可执行的任务，并列出每项任务的交付物和验收标准。\n需求说明：", category: "协作" },
  { id: "review-notes", name: "验收整理", description: "整理完成说明与验证材料", prompt: "请帮我整理验收材料。\n本次完成：\n成果链接或说明：\n验证结果：\n待确认事项：", category: "协作" },
  { id: "research", name: "课题讨论", description: "整理研究问题与下一步计划", prompt: "请帮我梳理课题的研究思路。\n研究问题：\n已有进展：\n当前困难：\n下一步计划：", category: "研究" },
] as const;
const pluginId = z.enum(["project-plan", "task-breakdown", "review-notes", "research"]);
export const MODEL_PRESETS = {
  deepseek: { label: "DeepSeek", baseUrl: "https://api.deepseek.com", model: "", apiKeyEnv: "DEEPSEEK_API_KEY" },
  openai: { label: "OpenAI", baseUrl: "https://api.openai.com/v1", model: "", apiKeyEnv: "OPENAI_API_KEY" },
  compatible: { label: "自定义兼容服务", baseUrl: "", model: "", apiKeyEnv: "AI_API_KEY" },
} as const;
export const modelConfigurationSchema = z.object({
  provider: z.enum(["deepseek", "openai", "compatible"]),
  baseUrl: z.string().trim().max(300).refine((value) => {
    if (!value) return true;
    try { const url = new URL(value); return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password && !url.search && !url.hash; } catch { return false; }
  }, "服务地址需为 HTTP / HTTPS 地址，不包含密钥、参数或用户名"),
  model: z.string().trim().max(100, "模型标识最多 100 字"),
  apiKeyEnv: z.string().trim().regex(/^[A-Z][A-Z\d_]{0,63}$/, "填写环境变量名，例如 AI_API_KEY；请勿填写密钥"),
  showReasoning: z.boolean(),
});
export type ModelConfiguration = z.infer<typeof modelConfigurationSchema>;
export const DEFAULT_MODEL: ModelConfiguration = { provider: "deepseek", baseUrl:MODEL_PRESETS.deepseek.baseUrl, model:"", apiKeyEnv:MODEL_PRESETS.deepseek.apiKeyEnv, showReasoning: true };
export const aiConfigurationSchema = z.object({
  model: modelConfigurationSchema.default(DEFAULT_MODEL),
  plugins: z.array(pluginId).max(4).refine((items) => new Set(items).size === items.length).default(BUILTIN_PLUGINS.map((item) => item.id)),
});
export const DEFAULT_AI = aiConfigurationSchema.parse({});
