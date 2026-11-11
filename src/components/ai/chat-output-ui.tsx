"use client";

import { useState } from "react";
import { AlertCircle, Check, Clock, ExternalLink, Kanban, ListTree, LoaderCircle, UserCheck } from "lucide-react";
import type { ChatOutputUi, ChatResult, TaskActionCard, TaskStatsSummary } from "@/modules/ai/client";
import { Button } from "@/components/ui/button";
import { safeChatSourceHref } from "./chat-response-ui";
import { accountFetch } from "@/components/account-request";

export function changeRequestSource(ui: ChatOutputUi, selected: number[]) {
  const indices = [...new Set(selected)].sort((a, b) => a - b);
  if (!indices.length || indices.some((index) => !Number.isInteger(index) || !ui.changeRequests[index])) throw new Error("请先选择需要审阅的项目变更建议");
  const text = ["以下为本人选中、待进一步核对的项目变更建议。请据此生成新任务规划；创建前仍需预览确认，不自动修改现有任务。", ...indices.flatMap((index) => {
    const request = ui.changeRequests[index];
    return [`\n## ${request.title}`, `当前问题：${request.problem}`, `建议：${request.proposal}`, "验收要求：", ...request.acceptanceCriteria.map((item) => `- ${item}`), `影响范围：${request.impact}`, "风险与待确认条件：", ...request.risks.map((item) => `- ${item}`)];
  })].join("\n");
  if (text.length > 30000) throw new Error("所选建议超过规划目标容量，请减少选择后分批处理");
  return { text, selectionKey: indices.join("-") };
}

function TaskStatsSummaryCard({ stats }: { stats: TaskStatsSummary }) {
  return (
    <div className="rounded-xl border border-brand/20 bg-brand-soft/30 p-3.5 space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="flex h-5 w-5 items-center justify-center rounded-md bg-brand text-[11px] font-bold text-brand-foreground">
            ✓
          </div>
          <h4 className="text-xs font-semibold text-foreground">任务完成情况概览</h4>
        </div>
        {stats.completionRate && (
          <span className="inline-flex items-center rounded-full bg-brand/15 px-2.5 py-0.5 text-xs font-bold text-brand">
            完成率 {stats.completionRate}
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        <div className="rounded-lg border border-border/50 bg-card/80 p-2 text-center">
          <span className="text-[11px] text-muted-foreground">总负责任务</span>
          <p className="mt-0.5 text-base font-bold text-foreground">{stats.total}</p>
        </div>
        <div className="rounded-lg border border-border/50 bg-card/80 p-2 text-center">
          <span className="text-[11px] text-emerald-600 dark:text-emerald-400">已完成</span>
          <p className="mt-0.5 text-base font-bold text-emerald-600 dark:text-emerald-400">{stats.completed}</p>
        </div>
        <div className="rounded-lg border border-border/50 bg-card/80 p-2 text-center">
          <span className="text-[11px] text-blue-600 dark:text-blue-400">进行中</span>
          <p className="mt-0.5 text-base font-bold text-blue-600 dark:text-blue-400">{stats.inProgress}</p>
        </div>
        <div className="rounded-lg border border-border/50 bg-card/80 p-2 text-center">
          <span className="text-[11px] text-amber-600 dark:text-amber-400">待认领任务</span>
          <p className="mt-0.5 text-base font-bold text-amber-600 dark:text-amber-400">{stats.unclaimed}</p>
        </div>
      </div>

      {(stats.overdue ?? 0) > 0 && (
        <p className="flex items-center gap-1 text-[11px] font-medium text-rose-600 dark:text-rose-400">
          <AlertCircle size={12} /> 注意：当前有 {stats.overdue} 项任务已超过截止日期，请尽快推进或调整排期。
        </p>
      )}
    </div>
  );
}

function TaskActionItemCard({ card }: { card: TaskActionCard }) {
  const [claiming, setClaiming] = useState(false);
  const [claimed, setClaimed] = useState(false);
  const [error, setError] = useState("");

  const handleClaim = async () => {
    setClaiming(true);
    setError("");
    try {
      const res = await accountFetch(`/api/v1/tasks/${card.taskId}/transition`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "claim" }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "认领失败，请稍后重试");
      }
      setClaimed(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "认领失败");
    } finally {
      setClaiming(false);
    }
  };

  const statusStyle: Record<string, string> = {
    unclaimed: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20",
    in_progress: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20",
    submitted: "bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/20",
    accepted: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20",
    rejected: "bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/20",
  };

  const currentStatus = claimed ? "in_progress" : card.status ?? "unclaimed";
  const currentStatusLabel = claimed ? "进行中" : card.statusLabel ?? "待认领";

  return (
    <div className="rounded-xl border border-border/70 bg-card p-3 shadow-2xs transition-all hover:border-brand/40">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium ${statusStyle[currentStatus] || statusStyle.unclaimed}`}>
              {currentStatusLabel}
            </span>
            <span className="break-words text-sm font-semibold text-foreground">{card.title}</span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            {card.dueDate && (
              <span className="inline-flex items-center gap-1">
                <Clock size={11} /> 截止：{card.dueDate}
              </span>
            )}
            {card.assigneeName && <span>负责人：{card.assigneeName}</span>}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {card.canClaim && !claimed && (
            <Button
              size="sm"
              className="h-7 gap-1 bg-brand px-2.5 text-xs text-brand-foreground hover:bg-brand/90"
              disabled={claiming}
              onClick={handleClaim}
            >
              {claiming ? (
                <>
                  <LoaderCircle size={12} className="animate-spin" />
                  认领中…
                </>
              ) : (
                <>
                  <UserCheck size={13} />
                  确认认领
                </>
              )}
            </Button>
          )}

          {claimed && (
            <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
              <Check size={13} /> 已认领 (进行中)
            </span>
          )}

          {card.jumpHref && (
            <a
              href={safeChatSourceHref(card.jumpHref)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-background px-2.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <ExternalLink size={12} /> 查看详情
            </a>
          )}

          {card.boardHref && (
            <a
              href={safeChatSourceHref(card.boardHref)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-background px-2.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <Kanban size={12} /> 看板视图
            </a>
          )}
        </div>
      </div>

      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
      {claimed && (
        <p className="mt-2 text-[11px] text-emerald-600 dark:text-emerald-400">
          任务已成功认领并分配给您，已转为进行中！可在看板或详情页推进。
        </p>
      )}
    </div>
  );
}

export function ChatOutputCards({ ui, workSources, disabled, onPreview }: { ui: ChatOutputUi; workSources?: ChatResult["workSources"]; disabled: boolean; onPreview: (source: string, selectionKey: string) => void }) {
  const [selected, setSelected] = useState<number[]>([]);
  const [error, setError] = useState("");
  return <section aria-label="项目建议卡片" className="mt-4 space-y-4 border-t border-border pt-4">
    <div className="rounded-xl bg-brand-soft/50 p-3"><h3 className="text-xs font-semibold text-brand">摘要</h3><p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6">{ui.summary}</p></div>
    {ui.taskStats && <TaskStatsSummaryCard stats={ui.taskStats} />}
    {!!ui.taskActions?.length && (
      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-semibold text-foreground">任务列表与交互操作 · {ui.taskActions.length} 项</h4>
          <span className="text-[11px] text-muted-foreground">可一键认领或跳转详情/看板</span>
        </div>
        <div className="space-y-2">
          {ui.taskActions.map((card) => (
            <TaskActionItemCard key={card.taskId} card={card} />
          ))}
        </div>
      </div>
    )}
    {!!ui.questions.length && <details className="rounded-xl border border-border p-3"><summary className="cursor-pointer text-xs font-medium">待确认问题 · {ui.questions.length}</summary><ol className="mt-3 list-decimal space-y-2 pl-5 text-xs leading-6">{ui.questions.map((question, index) => <li key={index} className="whitespace-pre-wrap break-words">{question}</li>)}</ol></details>}
    {!!ui.roadmap.length && <details className="rounded-xl border border-border p-3"><summary className="cursor-pointer text-xs font-medium">建议路线 · {ui.roadmap.length} 步</summary><ol className="mt-3 space-y-3 border-l-2 border-brand/25 pl-3">{ui.roadmap.map((step, index) => <li key={index} className="text-xs leading-6"><p className="font-semibold">{index + 1}. {step.title}</p><p className="whitespace-pre-wrap break-words text-muted-foreground">阶段产物：{step.outcome}</p><p className="whitespace-pre-wrap break-words text-muted-foreground">先后安排：{step.orderNote}</p></li>)}</ol><p className="mt-2 text-[11px] text-muted-foreground">建议路线尚未创建为里程碑或任务。</p></details>}
    {!!ui.changeRequests.length && <div className="space-y-3"><h3 className="text-xs font-semibold">项目变更建议 · 待你审批</h3>{ui.changeRequests.map((request, index) => <div key={index} className="rounded-xl border border-border p-3"><label className="flex items-start gap-2 text-sm font-medium"><input type="checkbox" aria-label={`选择项目变更建议：${request.title}`} checked={selected.includes(index)} disabled={disabled} className="mt-1 h-4 w-4 shrink-0 accent-brand" onChange={(event) => setSelected((old) => event.target.checked ? [...old, index] : old.filter((item) => item !== index))} /><span className="break-words">{request.title}</span></label><details className="mt-2 text-xs"><summary className="cursor-pointer text-muted-foreground">查看问题、方案与影响</summary><div className="mt-3 space-y-2 leading-6"><p className="whitespace-pre-wrap break-words"><strong>当前问题：</strong>{request.problem}</p><p className="whitespace-pre-wrap break-words"><strong>建议：</strong>{request.proposal}</p><div><p className="font-semibold">验收要求</p><ul className="list-disc pl-5">{request.acceptanceCriteria.map((item, criterion) => <li key={criterion} className="whitespace-pre-wrap break-words">{item}</li>)}</ul></div><p className="whitespace-pre-wrap break-words"><strong>影响范围：</strong>{request.impact}</p>{!!request.risks.length && <div><p className="font-semibold">风险与待确认条件</p><ul className="list-disc pl-5">{request.risks.map((item, risk) => <li key={risk} className="whitespace-pre-wrap break-words">{item}</li>)}</ul></div>}</div></details></div>)}<Button size="sm" disabled={disabled || !selected.length} onClick={() => { try { const source = changeRequestSource(ui, selected); setError(""); onPreview(source.text, source.selectionKey); } catch (failure) { setError(failure instanceof Error ? failure.message : "请核对选择后重试"); } }}><ListTree size={14} />预览新任务规划{selected.length ? `（${selected.length} 项）` : ""}</Button>{error && <p role="alert" className="text-xs text-destructive">{error}</p>}<p className="text-[11px] leading-5 text-muted-foreground">选择建议不会直接修改项目。进入规划后，先采纳目标，再生成、核对并确认创建新任务。</p></div>}
    {workSources?.some((source) => source.kind === "task") && <details className="rounded-xl border border-border p-3"><summary className="cursor-pointer text-xs font-medium">修改已有任务</summary><p className="mt-2 text-xs leading-5 text-muted-foreground">到来源任务审阅 AI 建议后决定是否修改；此处不会自动保存。</p><ul className="mt-2 space-y-2">{workSources.filter((source) => source.kind === "task").map((source) => <li key={source.id}><a href={safeChatSourceHref(source.href)} target="_blank" rel="noopener noreferrer" className="break-words text-xs text-brand underline underline-offset-4">前往任务审阅修改 · {source.title}</a></li>)}</ul></details>}
  </section>;
}
