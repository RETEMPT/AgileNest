/** Server Action 表单返回态：`null` 表示成功（配合 redirect）。 */
export type FormState = { error: string } | null;

/** 把未知错误转成可展示文案（AppError 直接透 message）。 */
export function toFormError(e: unknown, fallback = "操作失败，请稍后重试"): string {
  if (e instanceof Error && e.name === "AppError") return e.message;
  // AppError 在跨 bundle 时 name 可能不稳，按 message 兜底
  if (e instanceof Error && "status" in e) return e.message;
  return fallback;
}
