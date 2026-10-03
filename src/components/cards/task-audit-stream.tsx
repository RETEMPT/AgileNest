import React from "react";

export type AuditEvent = {
  id: string;
  taskId: string;
  actorId?: string | null;
  actorName?: string | null;
  action: string;
  note?: string | null;
  createdAt: string | Date;
};

type ActionMeta = {
  label: string;
  icon: string;
  badgeClass: string;
  transition: string;
  dotColor: string;
  calloutType?: "submit" | "resubmit" | "reject" | "accept" | "normal";
};

const ACTION_MAP: Record<string, ActionMeta> = {
  create: {
    label: "创建任务",
    icon: "➕",
    badgeClass: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
    transition: "初始化 · 待认领",
    dotColor: "bg-zinc-400",
  },
  claim: {
    label: "认领任务",
    icon: "👤",
    badgeClass: "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300",
    transition: "待认领 → 进行中",
    dotColor: "bg-blue-500",
  },
  unclaim: {
    label: "退回任务池",
    icon: "↩️",
    badgeClass: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
    transition: "流转中止 → 退回待认领",
    dotColor: "bg-zinc-400",
  },
  assign: {
    label: "指派责任人",
    icon: "🎯",
    badgeClass: "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300",
    transition: "直接指派 → 进行中",
    dotColor: "bg-indigo-500",
  },
  submit: {
    label: "提交成果待验收",
    icon: "📤",
    badgeClass: "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
    transition: "进行中 → 待验收",
    dotColor: "bg-amber-500",
    calloutType: "submit",
  },
  resubmit: {
    label: "修改后重新提交",
    icon: "🔄",
    badgeClass: "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
    transition: "待修改 → 待验收",
    dotColor: "bg-amber-500",
    calloutType: "resubmit",
  },
  accept: {
    label: "教师验收通过",
    icon: "✅",
    badgeClass: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
    transition: "待验收 → 已完成 (结项)",
    dotColor: "bg-emerald-500",
    calloutType: "accept",
  },
  reject: {
    label: "教师评审打回",
    icon: "⚠️",
    badgeClass: "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300",
    transition: "待验收 → 待修改",
    dotColor: "bg-rose-500",
    calloutType: "reject",
  },
  reopen: {
    label: "重新激活任务",
    icon: "🔁",
    badgeClass: "bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300",
    transition: "已完成 → 重新激活进行中",
    dotColor: "bg-purple-500",
  },
  update: {
    label: "更新属性变更",
    icon: "✏️",
    badgeClass: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
    transition: "修改工期/属性",
    dotColor: "bg-zinc-400",
  },
  delete: {
    label: "删除任务",
    icon: "🗑️",
    badgeClass: "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300",
    transition: "任务已归档移除",
    dotColor: "bg-rose-500",
  },
};

function formatTimestamp(time: string | Date): { absolute: string; relative: string } {
  const d = new Date(time);
  if (isNaN(d.getTime())) {
    return { absolute: "", relative: "" };
  }
  const now = Date.now();
  const diffSec = Math.floor((now - d.getTime()) / 1000);

  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  const absolute = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;

  let relative = "刚刚";
  if (diffSec >= 60 && diffSec < 3600) {
    relative = `${Math.floor(diffSec / 60)} 分钟前`;
  } else if (diffSec >= 3600 && diffSec < 86400) {
    relative = `${Math.floor(diffSec / 3600)} 小时前`;
  } else if (diffSec >= 86400 && diffSec < 86400 * 30) {
    relative = `${Math.floor(diffSec / 86400)} 天前`;
  } else if (diffSec >= 86400 * 30) {
    relative = absolute.split(" ")[0];
  }

  return { absolute, relative };
}

export function TaskAuditStream({
  events,
  compact = false,
}: {
  events: AuditEvent[];
  compact?: boolean;
}) {
  if (!events || events.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
        暂无状态流转记录 · 当前处于初始阶段
      </div>
    );
  }

  return (
    <div className="relative pl-6 space-y-6 before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-[2px] before:bg-border/60">
      {events.map((evt) => {
        const meta = ACTION_MAP[evt.action] || {
          label: evt.action,
          icon: "•",
          badgeClass: "bg-muted text-muted-foreground",
          transition: "状态转移",
          dotColor: "bg-muted-foreground",
        };

        const { absolute, relative } = formatTimestamp(evt.createdAt);

        return (
          <div key={evt.id} className="relative group">
            {/* 时间轴节点标记圆点 */}
            <div
              className={`absolute -left-[19px] top-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full border-2 border-background ${meta.dotColor} ring-2 ring-border/50`}
            />

            <div className="space-y-2">
              {/* 节点顶栏：操作者 + 动作类型 + 转移标记 + 时间 */}
              <div className="flex flex-wrap items-center justify-between gap-1.5 text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-foreground tracking-tight">
                    {evt.actorName || "系统 / 协作成员"}
                  </span>
                  <span
                    className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium ${meta.badgeClass}`}
                  >
                    <span>{meta.icon}</span>
                    <span>{meta.label}</span>
                  </span>
                  <span className="font-mono text-[10px] text-muted-foreground">
                    [{meta.transition}]
                  </span>
                </div>

                <div className="text-[11px] text-muted-foreground" title={absolute}>
                  {relative}
                  {!compact && <span className="hidden sm:inline"> ({absolute})</span>}
                </div>
              </div>

              {/* 现代极简结构化卡片：教师打回理由与修改要求 */}
              {evt.note && meta.calloutType === "reject" && (
                <div className="rounded-xl border border-rose-200/80 bg-card p-3.5 text-xs shadow-2xs dark:border-rose-900/40">
                  <div className="flex items-center justify-between border-b border-rose-100 pb-1.5 mb-2 text-rose-700 dark:border-rose-900/30 dark:text-rose-400 font-semibold">
                    <span className="flex items-center gap-1.5">
                      <span>⚠️</span>
                      <span>教师打回修改意见与驳回原因</span>
                    </span>
                    <span className="font-mono text-[10px] text-muted-foreground">Action Required</span>
                  </div>
                  <p className="whitespace-pre-wrap leading-relaxed text-foreground pl-1">
                    {evt.note}
                  </p>
                </div>
              )}

              {/* 现代极简结构化卡片：成果交付物与提交附言 */}
              {evt.note && (meta.calloutType === "submit" || meta.calloutType === "resubmit") && (
                <div className="rounded-xl border border-border/80 bg-card p-3.5 text-xs shadow-2xs">
                  <div className="flex items-center justify-between border-b border-border/50 pb-1.5 mb-2 font-semibold text-foreground">
                    <span className="flex items-center gap-1.5">
                      <span>📝</span>
                      <span>成果交付物与提交说明</span>
                    </span>
                    <span className="font-mono text-[10px] text-muted-foreground">Deliverables</span>
                  </div>
                  <div className="rounded-lg bg-muted/40 p-2.5 font-mono text-[11px] leading-relaxed text-foreground whitespace-pre-wrap">
                    {evt.note}
                  </div>
                </div>
              )}

              {/* 现代极简结构化卡片：教师验收评语 */}
              {evt.note && meta.calloutType === "accept" && (
                <div className="rounded-xl border border-emerald-200/80 bg-card p-3.5 text-xs shadow-2xs dark:border-emerald-900/40">
                  <div className="flex items-center justify-between border-b border-emerald-100 pb-1.5 mb-2 text-emerald-700 dark:border-emerald-900/30 dark:text-emerald-400 font-semibold">
                    <span className="flex items-center gap-1.5">
                      <span>🎉</span>
                      <span>教师验收结项评语</span>
                    </span>
                    <span className="font-mono text-[10px] text-muted-foreground">Completed</span>
                  </div>
                  <p className="whitespace-pre-wrap leading-relaxed text-foreground pl-1">
                    {evt.note}
                  </p>
                </div>
              )}

              {/* 普通变更备注 */}
              {evt.note && !meta.calloutType && (
                <div className="rounded-lg bg-muted/50 border border-border/40 px-3 py-1.5 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">备注：</span>
                  {evt.note}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
