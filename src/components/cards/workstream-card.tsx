"use client";

import React, { useState, memo } from "react";
import Link from "next/link";
import type { TaskDTO } from "@/modules/tasks";
import type { TeamRole } from "@/db/schema";
import { StatusPill, PriorityPill } from "@/components/ui/badge";
import { TaskActions } from "@/modules/tasks/ui";
import { TaskDrawer } from "./task-drawer";

type WorkstreamCardProps = {
  task: TaskDTO & {
    projectName?: string;
    subtaskCount?: number;
    subtaskCompleted?: number;
    loggedMinutes?: number;
  };
  role: TeamRole;
  actorId: string;
  showProjectBadge?: boolean;
  projectName?: string;
  variant?: "default" | "minimal";
};

export const WorkstreamCard = memo(function WorkstreamCard({
  task,
  role,
  actorId,
  showProjectBadge = false,
  projectName,
  variant = "default",
}: WorkstreamCardProps) {
  const [copied, setCopied] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const shortId = task.id ? `#${task.id.slice(0, 6)}` : "";
  const effectiveProjectName = projectName || task.projectName;

  // 截止日期状态计算
  const today = new Date().toISOString().slice(0, 10);
  const isOverdue =
    task.dueDate &&
    task.dueDate < today &&
    task.status !== "accepted";
  const isDueToday = task.dueDate && task.dueDate === today;

  const handleCopyId = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (task.id) {
      navigator.clipboard.writeText(task.id);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  // 极简渐进披露卡片样式 (Minimal Progressive Disclosure)
  if (variant === "minimal") {
    return (
      <>
        <div
          onClick={() => setDrawerOpen(true)}
          className="group relative cursor-pointer rounded-xl border border-border bg-card p-3 shadow-2xs transition-all duration-200 ease-out hover:border-foreground/30 hover:shadow-xs hover:-translate-y-0.5 active:scale-[0.99] card-render-optimized"
        >
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-2">
              {shortId && (
                <span className="font-mono text-[11px] font-semibold text-muted-foreground">
                  {shortId}
                </span>
              )}
              {showProjectBadge && effectiveProjectName && (
                <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                  {effectiveProjectName}
                </span>
              )}
              <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <div className="flex h-4 w-4 items-center justify-center rounded-full bg-muted text-[9px] font-bold text-foreground">
                  {task.assigneeName ? task.assigneeName.slice(0, 1).toUpperCase() : "?"}
                </div>
                <span>{task.assigneeName ?? "未认领"}</span>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <StatusPill status={task.status} />
              <PriorityPill priority={task.priority} />
            </div>
          </div>

          <h3 className="font-medium text-sm text-foreground group-hover:text-blue-600 transition tracking-tight line-clamp-1">
            {task.title}
          </h3>

          <div className="flex items-center justify-between mt-2 pt-2 border-t border-border/40 text-[11px] text-muted-foreground">
            <div className="flex items-center gap-2">
              {task.dueDate && (
                <span className={isOverdue ? "text-rose-600 font-semibold" : ""}>
                  📅 {task.dueDate}
                </span>
              )}
              {task.status === "submitted" && (
                <span className="text-amber-600 font-medium">● 待教师验收</span>
              )}
              {task.status === "rejected" && (
                <span className="text-rose-600 font-medium">● 待修改重交</span>
              )}
            </div>
            <span className="text-[11px] text-muted-foreground group-hover:text-foreground transition">
              点击展开详情 ↗
            </span>
          </div>
        </div>

        {/* 侧滑工作流抽屉 */}
        <TaskDrawer
          task={task}
          role={role}
          actorId={actorId}
          isOpen={drawerOpen}
          onClose={() => setDrawerOpen(false)}
        />
      </>
    );
  }

  // 默认高密度完整卡片 (Linear / Harness Style)
  return (
    <>
      <div className="group relative rounded-2xl border border-border bg-card p-4 shadow-xs transition-all duration-200 ease-out hover:border-border/90 hover:shadow-sm hover:-translate-y-0.5 card-render-optimized">
        {/* 1. 顶部身份与状态元数据条 (Linear/Harness Style) */}
        <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-border/50">
          <div className="flex items-center gap-2">
            {shortId && (
              <button
                onClick={handleCopyId}
                title="点击复制完整任务 ID"
                className="font-mono text-[11px] font-medium text-muted-foreground hover:text-foreground transition"
              >
                {copied ? "已复制" : shortId}
              </button>
            )}

            {showProjectBadge && effectiveProjectName && (
              <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                {effectiveProjectName}
              </span>
            )}

            {/* 负责人头像/标签 */}
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <div className="flex h-4.5 w-4.5 items-center justify-center rounded-full bg-muted text-[10px] font-bold text-foreground">
                {task.assigneeName ? task.assigneeName.slice(0, 1).toUpperCase() : "?"}
              </div>
              <span className="text-[11px]">{task.assigneeName ?? "未认领"}</span>
            </div>
          </div>

          {/* 状态药丸与优先级 */}
          <div className="flex shrink-0 items-center gap-1.5">
            <StatusPill status={task.status} />
            <PriorityPill priority={task.priority} />
          </div>
        </div>

        {/* 2. 任务标题与语境说明 */}
        <div className="pt-3 pb-2 space-y-1.5">
          <div className="flex items-start justify-between gap-2">
            <h3
              onClick={() => setDrawerOpen(true)}
              className="cursor-pointer font-medium text-sm text-foreground hover:text-blue-600 transition tracking-tight"
            >
              {task.title}
            </h3>
            <button
              onClick={() => setDrawerOpen(true)}
              className="shrink-0 text-[11px] text-muted-foreground hover:text-foreground transition"
              title="在右侧侧边栏中展开工作流"
            >
              抽屉 ↗
            </button>
          </div>

          {task.description && (
            <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
              {task.description}
            </p>
          )}
        </div>

        {/* 3. 核心工作流情境呼应条 (Contextual Stream Callout) */}
        {task.status === "submitted" && (
          <div className="my-2.5 rounded-xl border border-amber-200/70 bg-amber-50/50 p-2.5 text-xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300">
            <span className="font-semibold block mb-0.5">📝 待验收完成说明：</span>
            <p className="text-[11px] leading-relaxed">
              {task.completionNote || "提交人未附带补充说明"}
            </p>
          </div>
        )}

        {task.status === "rejected" && (
          <div className="my-2.5 rounded-xl border border-rose-200/70 bg-rose-50/50 p-2.5 text-xs text-red-900 dark:border-rose-900/40 dark:bg-rose-950/20 dark:text-red-300">
            <span className="font-semibold block mb-0.5">⚠️ 教师打回修改意见：</span>
            <p className="text-[11px] leading-relaxed">
              {task.rejectReason || "请与指导教师沟通后修改重交"}
            </p>
          </div>
        )}

        {/* 4. 辅助遥测条（截止时间、工时、子任务） */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 text-[11px] text-muted-foreground border-t border-border/40">
          <div className="flex items-center gap-3">
            {task.dueDate && (
              <span
                className={`inline-flex items-center gap-1 ${
                  isOverdue
                    ? "font-semibold text-rose-600"
                    : isDueToday
                    ? "font-semibold text-amber-600"
                    : "text-muted-foreground"
                }`}
              >
                📅 {isOverdue ? `已逾期 (${task.dueDate})` : isDueToday ? "今日截止" : task.dueDate}
              </span>
            )}

            {typeof task.loggedMinutes === "number" && task.loggedMinutes > 0 && (
              <span>⏱️ {task.loggedMinutes} 分钟</span>
            )}
          </div>

          <button
            onClick={() => setDrawerOpen(true)}
            className="text-[11px] text-muted-foreground hover:text-foreground transition underline"
          >
            工作流溯源与详情 →
          </button>
        </div>

        {/* 5. 原位流转动作栏 (Inline Action Pipeline) */}
        <div className="mt-3 pt-2.5 border-t border-border/60">
          <TaskActions task={task} role={role} actorId={actorId} />
        </div>
      </div>

      {/* 侧滑工作流抽屉 */}
      <TaskDrawer
        task={task}
        role={role}
        actorId={actorId}
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      />
    </>
  );
});
