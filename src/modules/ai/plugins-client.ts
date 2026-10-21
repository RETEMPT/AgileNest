import { z } from "zod";

export const builtinCatalog = [
  { id: "resource-search", name: "资料检索", description: "搜索本人有权限的项目与团队资料目录", kind: "tool" },
  { id: "resource-read", name: "资料正文阅读", description: "读取已授权资料并提供版本与位置引用", kind: "tool" },
  { id: "project-work", name: "项目工作查询", description: "查询任务状态、负责人、验收要求与里程碑", kind: "tool" },
  { id: "office-reader", name: "Office文字读取", description: "提取PPTX幻灯片、DOCX正文与表格文字；不含图片识别", kind: "tool" },
  { id: "task-planner", name: "任务规划", description: "生成和检查规划，经本人确认后创建任务", kind: "tool" },
  { id: "project-plan", name: "项目规划提问", description: "快捷提问，辅助梳理项目目标与工作安排", kind: "prompt" },
  { id: "task-breakdown", name: "任务拆分提问", description: "快捷提问，整理可交付的任务与验收要求", kind: "prompt" },
  { id: "review-notes", name: "验收意见提问", description: "快捷提问，整理验收意见；不会自动验收", kind: "prompt" },
  { id: "research", name: "资料研究提问", description: "快捷提问，梳理资料重点与待确认问题", kind: "prompt" },
] as const;
export const builtinIdSchema = z.enum(["resource-search", "resource-read", "project-work", "office-reader", "task-planner", "project-plan", "task-breakdown", "review-notes", "research"]);
export type BuiltinId = z.infer<typeof builtinIdSchema>;
const builtinSetting = z.object({ id: builtinIdSchema, enabled: z.boolean() }).strict();
export const mcpToolSchema = z.object({ name: z.string().min(1).max(128), description: z.string().max(2000), inputSchema: z.record(z.string(), z.unknown()), enabled: z.boolean(), readOnly: z.boolean() }).strict();
export const pluginLibrarySchema = z.object({ revision: z.number().int().nonnegative(), builtins: z.array(builtinSetting).max(9), mcpServers: z.array(z.object({ id: z.uuid(), name: z.string().min(1).max(60), url: z.string().max(1000), hasToken: z.boolean(), enabled: z.boolean(), tools: z.array(mcpToolSchema).max(100) }).strict()).max(8) }).strict();
export type PluginLibrary = z.infer<typeof pluginLibrarySchema>;
export const pluginSaveSchema = z.object({ expectedRevision: z.number().int().nonnegative(), builtins: z.array(builtinSetting).max(9).optional(), server: z.object({ id: z.uuid().optional(), name: z.string().trim().min(1).max(60), url: z.string().trim().min(1).max(1000), token: z.string().trim().max(2048).regex(/^[^\u0000-\u001f\u007f]*$/).optional(), enabled: z.boolean().optional() }).strict().optional() }).strict().refine((input) => !!input.builtins || !!input.server, "请选择要保存的插件配置");
export const pluginActionSchema = z.object({ expectedRevision: z.number().int().nonnegative(), op: z.enum(["delete-server", "toggle-server", "toggle-tool"]), serverId: z.uuid(), toolName: z.string().min(1).max(128).optional(), enabled: z.boolean().optional() }).strict();
