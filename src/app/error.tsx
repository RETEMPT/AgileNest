"use client";

import { useEffect, useState } from "react";

type ErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

type Diagnosis = {
  category: string;
  badgeColor: string;
  title: string;
  suggestion: string;
  isDbDown: boolean;
};

function analyzeError(error: Error & { digest?: string }): Diagnosis {
  const text = `${error.name} ${error.message} ${error.digest ?? ""}`.toLowerCase();

  if (
    text.includes("econnrefused") ||
    text.includes("5432") ||
    text.includes("connect") ||
    text.includes("failed query") ||
    text.includes("connection terminated")
  ) {
    return {
      category: "数据库离线",
      badgeColor: "bg-red-500/10 text-red-600 border-red-200 dark:border-red-900/50",
      title: "无法连接到 PostgreSQL 数据库",
      suggestion:
        "PostgreSQL 服务未启动或端口 5432 连接被拒。Windows 环境请运行根目录下 start.bat 或检查后台数据库服务。",
      isDbDown: true,
    };
  }

  if (text.includes("auth_secret") || text.includes("missingsecret")) {
    return {
      category: "环境配置缺失",
      badgeColor: "bg-amber-500/10 text-amber-600 border-amber-200 dark:border-amber-900/50",
      title: "缺少 AUTH_SECRET 环境变量",
      suggestion: "请检查项目根目录 .env 文件并配置 AUTH_SECRET（可运行 setup.bat 自动生成）。",
      isDbDown: false,
    };
  }

  if (text.includes("forbidden") || text.includes("403") || text.includes("没有权限")) {
    return {
      category: "权限受限",
      badgeColor: "bg-blue-500/10 text-blue-600 border-blue-200 dark:border-blue-900/50",
      title: "您无权访问此页面或资源",
      suggestion: "当前登录角色的访问权限不足。如需此权限，请联系管理员或团队负责人调整角色。",
      isDbDown: false,
    };
  }

  if (text.includes("notfound") || text.includes("404") || text.includes("不存在")) {
    return {
      category: "资源未找到",
      badgeColor: "bg-zinc-500/10 text-zinc-600 border-zinc-200 dark:border-zinc-800",
      title: "请求的资源不存在",
      suggestion: "该任务、项目或团队可能已被删除或转移，请返回工作台重试。",
      isDbDown: false,
    };
  }

  return {
    category: "系统运行异常",
    badgeColor: "bg-orange-500/10 text-orange-600 border-orange-200 dark:border-orange-900/50",
    title: "页面加载或处理过程中发生错误",
    suggestion: "操作未能正常完成。你可以点击下方「重试」或返回工作台，若持续出现请复制错误报告反馈。",
    isDbDown: false,
  };
}

export default function ErrorPage({ error, reset }: ErrorProps) {
  const [copied, setCopied] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [healthStatus, setHealthStatus] = useState<string | null>(null);
  const [checkingHealth, setCheckingHealth] = useState(false);

  // 单次记录日志，防止客户端控制台因重复渲染被同类错误刷屏
  useEffect(() => {
    console.error("[AgileNest ErrorBoundary]", {
      message: error.message,
      digest: error.digest,
      stack: error.stack,
    });
  }, [error]);

  const diagnosis = analyzeError(error);

  const handleCopyReport = async () => {
    const report = [
      "### 🐛 AgileNest 错误反馈报告",
      `- **发生时间**: ${new Date().toLocaleString()}`,
      `- **当前页面**: ${typeof window !== "undefined" ? window.location.href : "未知"}`,
      `- **错误分类**: ${diagnosis.category}`,
      `- **错误摘要(Digest)**: \`${error.digest || "无"}\``,
      `- **错误信息**: ${error.message || "未知错误"}`,
      `- **用户代理**: ${typeof navigator !== "undefined" ? navigator.userAgent : "未知"}`,
      "",
      "#### 错误堆栈",
      "```",
      error.stack || "无堆栈信息",
      "```",
    ].join("\n");

    try {
      await navigator.clipboard.writeText(report);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // 剪贴板降级处理
      prompt("请复制以下错误报告内容：", report);
    }
  };

  const checkDbHealth = async () => {
    setCheckingHealth(true);
    setHealthStatus(null);
    try {
      const res = await fetch("/api/health");
      const data = await res.json();
      if (res.ok && data.db?.status === "connected") {
        setHealthStatus(`✅ 数据库在线 (延迟 ${data.db.latencyMs ?? 0}ms)`);
      } else {
        setHealthStatus(`❌ 数据库未就绪 (${data.db?.error ?? "连接超时"})`);
      }
    } catch {
      setHealthStatus("❌ 无法连通后端服务 (服务器可能未启动)");
    } finally {
      setCheckingHealth(false);
    }
  };

  return (
    <main className="mx-auto my-12 w-full max-w-xl px-4">
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        {/* 顶部指示条 */}
        <div className="flex items-center justify-between border-b border-border bg-muted/40 px-6 py-4">
          <div className="flex items-center gap-2">
            <span
              className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${diagnosis.badgeColor}`}
            >
              {diagnosis.category}
            </span>
            {error.digest && (
              <span className="font-mono text-xs text-muted-foreground">
                ID: {error.digest.slice(0, 10)}
              </span>
            )}
          </div>
          <span className="text-xs text-muted-foreground">AgileNest 故障自检</span>
        </div>

        {/* 内容主体 */}
        <div className="space-y-4 p-6">
          <div>
            <h1 className="font-display text-xl font-bold tracking-tight text-foreground">
              {diagnosis.title}
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {diagnosis.suggestion}
            </p>
          </div>

          {/* 实时健康检测结果卡片 */}
          {healthStatus && (
            <div className="rounded-lg border border-border bg-background p-3 text-xs font-medium">
              系统自检状态：{healthStatus}
            </div>
          )}

          {/* 操作按钮区 */}
          <div className="flex flex-wrap items-center gap-2.5 pt-2">
            <button
              onClick={() => reset()}
              className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow transition hover:opacity-90 active:scale-95"
            >
              🔄 重新加载
            </button>
            <button
              onClick={() => {
                window.location.href = "/home";
              }}
              className="inline-flex items-center justify-center rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-accent transition active:scale-95"
            >
              🏠 返回工作台
            </button>
            <button
              onClick={checkDbHealth}
              disabled={checkingHealth}
              className="inline-flex items-center justify-center rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-accent transition disabled:opacity-50"
            >
              {checkingHealth ? "检测中…" : "🩺 检查数据库连接"}
            </button>
            <button
              onClick={handleCopyReport}
              className="inline-flex items-center justify-center rounded-lg border border-dashed border-border bg-muted/30 px-4 py-2 text-sm font-medium hover:bg-muted transition"
            >
              {copied ? "✅ 报告已复制" : "📋 复制诊断报告"}
            </button>
          </div>

          {/* 可折叠的技术详情 */}
          <div className="border-t border-border pt-4">
            <button
              type="button"
              onClick={() => setShowDetail(!showDetail)}
              className="flex w-full items-center justify-between text-xs text-muted-foreground hover:text-foreground"
            >
              <span>技术详情与排错信息</span>
              <span>{showDetail ? "收起 ▲" : "展开 ▼"}</span>
            </button>

            {showDetail && (
              <div className="mt-3 space-y-2 rounded-lg bg-muted/50 p-3 font-mono text-xs text-foreground/90">
                {error.digest && (
                  <div>
                    <span className="text-muted-foreground">Error Digest: </span>
                    {error.digest}
                  </div>
                )}
                {error.message && (
                  <div>
                    <span className="text-muted-foreground">Message: </span>
                    <span className="break-all">{error.message}</span>
                  </div>
                )}
                {error.stack && (
                  <div className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap text-[11px] text-muted-foreground">
                    {error.stack}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
