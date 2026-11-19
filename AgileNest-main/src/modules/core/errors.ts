// 可预期业务错误：message 可直接展示给用户
export class AppError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "没有权限执行此操作") {
    super(message, 403);
  }
}

export class NotFoundError extends AppError {
  constructor(message = "资源不存在") {
    super(message, 404);
  }
}

/** 状态机拒绝的非法转移 → 409 */
export class ConflictError extends AppError {
  constructor(message = "当前状态不允许该操作") {
    super(message, 409);
  }
}

/** 模块尚未实现（Phase 1 各 owner 填实后删除对应 stub） */
export class NotImplementedError extends AppError {
  constructor(fn = "该功能") {
    super(`${fn}尚未实现`, 501);
  }
}

/** postgres 唯一键冲突（drizzle 会包一层 DrizzleQueryError，code 在 cause 上） */
export function isUniqueViolation(e: unknown): boolean {
  const code =
    (e as { code?: string }).code ?? (e as { cause?: { code?: string } }).cause?.code;
  return code === "23505";
}
