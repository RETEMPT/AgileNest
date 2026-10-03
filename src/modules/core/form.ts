/** Server Action 表单返回态：`null` 表示成功（配合 redirect）。 */
export type FormState = { error: string } | null;

/** 把未知错误转成可展示文案（AppError 直接透 message）。 */
export function toFormError(e: unknown, fallback = "操作失败，请稍后重试"): string {
  if (e instanceof Error && (e.name === "AppError" || "status" in e)) return e.message;
  const msg = e instanceof Error ? e.message : String(e);
  if (msg.includes("ECONNREFUSED") || msg.includes("5432")) {
    return "数据库连接异常，请检查本地数据库服务是否已正常启动。";
  }
  return fallback;
}
