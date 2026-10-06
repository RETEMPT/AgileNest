"use client";

import { useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import Link from "next/link";
import type { TaskDTO } from "@/modules/tasks";
import type { TeamRole } from "@/db/schema";
import { StatusPill, PriorityPill } from "@/components/ui/badge";
import { TaskActions, TaskWorkflow } from "@/modules/tasks/ui";
import { TaskAuditStream, type AuditEvent } from "./task-audit-stream";
import { FormFeedback, useFeedback } from "@/components/ui/feedback";
import { Button } from "@/components/ui/button";
import { todayISO } from "@/modules/core/dates";

type TaskDrawerProps = {
  task: (TaskDTO & { projectName?: string; loggedMinutes?: number }) | null;
  role: TeamRole;
  actorId: string;
  isOpen: boolean;
  onClose: () => void;
};

export function TaskDrawer({ task, role, actorId, isOpen, onClose }: TaskDrawerProps) {
  const notify = useFeedback();
  const [snapshot, setSnapshot] = useState<{ key: string; events: AuditEvent[]; error?: string } | null>(null);
  const [copyError, setCopyError] = useState("");
  const [retry, setRetry] = useState(0);
  const returnFocus = useRef<HTMLElement | null>(null);
  const requestKey = `${task?.id}:${task?.updatedAt}:${retry}`;
  const events = snapshot?.key === requestKey ? snapshot.events : [];
  const loadingEvents = isOpen && snapshot?.key !== requestKey;
  useEffect(() => {
    if (!isOpen || !task?.id) return;
    const controller = new AbortController();
    fetch(`/api/v1/tasks/${task.id}/events`, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error("无法加载活动流");
        return res.json();
      })
      .then((data: unknown) => {
        if (!data || typeof data !== "object" || !("events" in data) || !Array.isArray(data.events)) throw new Error("无法加载活动流");
        if (!controller.signal.aborted) setSnapshot({ key: requestKey, events: data.events as AuditEvent[] });
      })
      .catch(() => {
        if (!controller.signal.aborted) setSnapshot({ key: requestKey, events: [], error: "活动暂时无法加载，请重试。" });
      });
    return () => controller.abort();
  }, [isOpen, task?.id, requestKey]);

  if (!task) return null;

  const shortId = task.id ? `#${task.id.slice(0, 6)}` : "";
  const today = todayISO();
  const isOverdue = task.dueDate && task.dueDate < today && task.status !== "accepted";

  const handleCopyId = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (task.id) {
      try { await navigator.clipboard.writeText(task.id); setCopyError(""); notify("任务编号已复制"); }
      catch { setCopyError("复制失败，请在独立详情页查看任务编号。"); }
    }
  };

  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay fixed inset-0 z-50 bg-black/40 backdrop-blur-2xs" />
        <Dialog.Content onOpenAutoFocus={() => { returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; }} onCloseAutoFocus={(event) => { event.preventDefault(); returnFocus.current?.focus(); }} aria-describedby={undefined} className="drawer-surface fixed inset-y-0 right-0 z-50 flex h-full w-full max-w-[880px] flex-col border-l border-border bg-card shadow-2xl">
          <Dialog.Title className="sr-only">{task.title} · 任务详情</Dialog.Title>
          {/* 1. 顶栏：身份短码 · 项目标识 · 状态胶囊 · 动作直达 */}
          <header className="flex h-14 shrink-0 items-center justify-between border-b border-border/60 px-6 bg-card">
            <div className="flex items-center gap-3">
              {shortId && (
                <button
                  onClick={handleCopyId}
                  title="点击复制任务完整 ID"
                  className="font-mono text-xs font-semibold text-muted-foreground hover:text-foreground transition flex items-center gap-1"
                >
                  <span>{shortId}</span>
                  <span className="text-[10px] text-muted-foreground/70">⎘</span>
                </button>
              )}

              {task.projectName && (
                <span className="rounded-md border border-border/70 bg-muted/60 px-2 py-0.5 text-[11px] font-medium text-foreground">
                  {task.projectName}
                </span>
              )}

              <div className="flex items-center gap-1.5 shrink-0">
                <StatusPill status={task.status} />
                <PriorityPill priority={task.priority} />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Link
                href={`/p/${task.projectId}/tasks/${task.id}`}
                className="rounded-lg border border-border px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition flex items-center gap-1"
                title="进入独立详情页进行完整编辑"
              >
                <span>独立页</span>
                <span className="font-sans text-[11px]">↗</span>
              </Link>
              <Dialog.Close asChild><Button variant="ghost" size="icon" aria-label="关闭任务详情" className="h-8 w-8">✕</Button></Dialog.Close>
            </div>
          </header>

          {/* 2. 双栏核心内容区：Interfere 风格 (左栏属性矩阵 + 右栏活动代码交付流) */}
          <div className="min-h-0 flex-1 overflow-y-auto lg:overflow-hidden lg:grid lg:grid-cols-[330px_1fr] divide-y lg:divide-y-0 lg:divide-x divide-border/60">
            {/* ====== 左栏：结构化属性矩阵 (Properties Inspector) ====== */}
            <aside className="p-6 lg:overflow-y-auto custom-scrollbar space-y-6 bg-muted/10">
              <FormFeedback message={copyError} />
              {/* 标题与语境简述 */}
              <div className="space-y-2">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  任务基本信息
                </span>
                <h2 className="font-display text-lg font-bold text-foreground leading-snug tracking-tight">
                  {task.title}
                </h2>
                {task.description ? (
                  <p className="whitespace-pre-wrap rounded-xl border border-border/50 bg-background/80 p-3 text-xs leading-relaxed text-muted-foreground">
                    {task.description}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground/80 italic">无补充描述</p>
                )}
              </div>

              {/* 键值属性矩阵 (仿 Interfere 侧边栏属性表格) */}
              <div className="space-y-2 pt-2 border-t border-border/60">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  属性规格
                </span>
                <div className="rounded-xl border border-border/70 bg-card divide-y divide-border/40 text-xs">
                  {/* 负责人 */}
                  <div className="flex items-center justify-between p-2.5">
                    <span className="text-muted-foreground">负责人</span>
                    <div className="flex items-center gap-1.5 font-medium">
                      <div className="flex h-4.5 w-4.5 items-center justify-center rounded-full bg-muted text-[10px] font-bold text-foreground">
                        {task.assigneeName ? task.assigneeName.slice(0, 1).toUpperCase() : "?"}
                      </div>
                      <span className="text-foreground">{task.assigneeName ?? "未认领"}</span>
                    </div>
                  </div>

                  {/* 状态 */}
                  <div className="flex items-center justify-between p-2.5">
                    <span className="text-muted-foreground">当前状态</span>
                    <StatusPill status={task.status} />
                  </div>

                  {/* 优先级 */}
                  <div className="flex items-center justify-between p-2.5">
                    <span className="text-muted-foreground">优先级</span>
                    <PriorityPill priority={task.priority} />
                  </div>

                  {/* 开始日期 */}
                  <div className="flex items-center justify-between p-2.5">
                    <span className="text-muted-foreground">开始日期</span>
                    <span className="font-mono text-foreground">{task.startDate ?? "-"}</span>
                  </div>

                  {/* 截止日期 */}
                  <div className="flex items-center justify-between p-2.5">
                    <span className="text-muted-foreground">截止日期</span>
                    <span
                      className={`font-mono ${
                        isOverdue
                          ? "text-rose-600 font-semibold"
                          : "text-foreground"
                      }`}
                    >
                      {task.dueDate ? `📅 ${task.dueDate}` : "未设置"}
                      {isOverdue && " (逾期)"}
                    </span>
                  </div>

                  {/* 预估工时 */}
                  <div className="flex items-center justify-between p-2.5">
                    <span className="text-muted-foreground">预估工时</span>
                    <span className="font-mono text-foreground">
                      {task.estimatedMinutes ? `${task.estimatedMinutes} 分钟` : "未估算"}
                    </span>
                  </div>

                  {/* 已耗工时 */}
                  <div className="flex items-center justify-between p-2.5">
                    <span className="text-muted-foreground">已耗工时</span>
                    <span className="font-mono text-foreground">
                      {typeof task.loggedMinutes === "number" && task.loggedMinutes > 0
                        ? `${task.loggedMinutes} 分钟`
                        : "0 分钟"}
                    </span>
                  </div>
                </div>
              </div>

              {/* 原位流转操作面板 (Action Pipeline) */}
              <div className="space-y-2 pt-2 border-t border-border/60">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    状态推进操作
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    按当前团队职务显示
                  </span>
                </div>
                <div className="rounded-xl border border-border/80 bg-background/80 p-3 shadow-2xs">
                  <TaskActions task={task} role={role} actorId={actorId} />
                </div>
              </div>
            </aside>

            {/* ====== 右栏：活动审计流与交付物/代码流 (Activity & Deliverables Feed) ====== */}
            <main className="p-6 lg:overflow-y-auto custom-scrollbar space-y-6 bg-card flex flex-col">
              <TaskWorkflow status={task.status} />
              {/* 顶栏标题与同步指示 */}
              <div className="flex items-center justify-between pb-3 border-b border-border/60">
                <div className="flex items-center gap-2">
                  <h3 className="font-display text-sm font-semibold text-foreground">
                    任务活动与成果
                  </h3>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                    {events.length} 次流转
                  </span>
                </div>
                {loadingEvents ? (
                  <span className="text-[11px] text-muted-foreground animate-pulse">
                    同步日志中…
                  </span>
                ) : (
                  <span className="text-[11px] text-muted-foreground">
                    操作人与流转说明
                  </span>
                )}
              </div>

              {/* 核心工作流交付物情境卡片 (现代极简结构化卡片风格) */}
              {task.status === "submitted" && (
                <div className="rounded-xl border border-border bg-card p-4 shadow-2xs space-y-2">
                  <div className="flex items-center justify-between text-xs border-b border-border/50 pb-2">
                    <span className="font-semibold text-foreground flex items-center gap-1.5">
                      <span className="text-amber-600 font-bold">●</span>
                    <span>待验收成果</span>
                    </span>
                    <span className="font-mono text-[10px] text-muted-foreground">
                      等待教师评审
                    </span>
                  </div>
                  <div className="rounded-lg bg-muted/40 p-3 font-mono text-xs leading-relaxed text-foreground whitespace-pre-wrap">
                    {task.completionNote || "提交人未附带补充交付物说明"}
                  </div>
                </div>
              )}

              {task.status === "rejected" && (
                <div className="rounded-xl border border-rose-200/80 bg-rose-50/40 p-4 shadow-2xs space-y-2 dark:border-rose-900/40 dark:bg-rose-950/10">
                  <div className="flex items-center justify-between text-xs border-b border-rose-200/60 pb-2 dark:border-rose-900/30">
                    <span className="font-semibold text-rose-700 dark:text-rose-400 flex items-center gap-1.5">
                      <span>⚠️</span>
                      <span>修改意见</span>
                    </span>
                    <span className="text-[10px] text-rose-600 font-medium">
                      需修改后重交
                    </span>
                  </div>
                  <div className="rounded-lg bg-card border border-rose-200/60 p-3 text-xs leading-relaxed text-foreground whitespace-pre-wrap dark:border-rose-900/30">
                    {task.rejectReason || "请与指导教师沟通后修改重交"}
                  </div>
                </div>
              )}

              {/* 全生命周期事件时序轴 */}
              <div className="flex-1 pt-1">
                {snapshot?.key === requestKey && snapshot.error ? <div className="space-y-2"><FormFeedback message={snapshot.error} /><Button variant="outline" size="sm" onClick={() => setRetry((value) => value + 1)}>重新加载</Button></div> : loadingEvents ? <p role="status" className="text-xs text-muted-foreground">正在加载任务活动…</p> : <TaskAuditStream events={events} />}
              </div>
            </main>
          </div>

          {/* 3. 抽屉底栏：微辅助提示 */}
          <footer className="h-10 shrink-0 border-t border-border/60 px-6 bg-muted/20 flex items-center justify-between text-[11px] text-muted-foreground">
            <span>按 ESC 或点击遮罩退出抽屉</span>
            <Link
              href={`/p/${task.projectId}/tasks/${task.id}`}
              className="text-foreground hover:underline font-medium"
            >
              在独立页中编辑子任务与工时 →
            </Link>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
