"use client";

import { useState } from "react";
import { ListTree } from "lucide-react";
import type { ChatOutputUi, ChatResult } from "@/modules/ai/client";
import { Button } from "@/components/ui/button";
import { safeChatSourceHref } from "./chat-response-ui";

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

export function ChatOutputCards({ ui, workSources, disabled, onPreview }: { ui: ChatOutputUi; workSources?: ChatResult["workSources"]; disabled: boolean; onPreview: (source: string, selectionKey: string) => void }) {
  const [selected, setSelected] = useState<number[]>([]);
  const [error, setError] = useState("");
  return <section aria-label="项目建议卡片" className="mt-4 space-y-4 border-t border-border pt-4">
    <div className="rounded-xl bg-brand-soft/50 p-3"><h3 className="text-xs font-semibold text-brand">摘要</h3><p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6">{ui.summary}</p></div>
    {!!ui.questions.length && <details className="rounded-xl border border-border p-3"><summary className="cursor-pointer text-xs font-medium">待确认问题 · {ui.questions.length}</summary><ol className="mt-3 list-decimal space-y-2 pl-5 text-xs leading-6">{ui.questions.map((question, index) => <li key={index} className="whitespace-pre-wrap break-words">{question}</li>)}</ol></details>}
    {!!ui.roadmap.length && <details className="rounded-xl border border-border p-3"><summary className="cursor-pointer text-xs font-medium">建议路线 · {ui.roadmap.length} 步</summary><ol className="mt-3 space-y-3 border-l-2 border-brand/25 pl-3">{ui.roadmap.map((step, index) => <li key={index} className="text-xs leading-6"><p className="font-semibold">{index + 1}. {step.title}</p><p className="whitespace-pre-wrap break-words text-muted-foreground">阶段产物：{step.outcome}</p><p className="whitespace-pre-wrap break-words text-muted-foreground">先后安排：{step.orderNote}</p></li>)}</ol><p className="mt-2 text-[11px] text-muted-foreground">建议路线尚未创建为里程碑或任务。</p></details>}
    {!!ui.changeRequests.length && <div className="space-y-3"><h3 className="text-xs font-semibold">项目变更建议 · 待你审批</h3>{ui.changeRequests.map((request, index) => <div key={index} className="rounded-xl border border-border p-3"><label className="flex items-start gap-2 text-sm font-medium"><input type="checkbox" aria-label={`选择项目变更建议：${request.title}`} checked={selected.includes(index)} disabled={disabled} className="mt-1 h-4 w-4 shrink-0 accent-brand" onChange={(event) => setSelected((old) => event.target.checked ? [...old, index] : old.filter((item) => item !== index))} /><span className="break-words">{request.title}</span></label><details className="mt-2 text-xs"><summary className="cursor-pointer text-muted-foreground">查看问题、方案与影响</summary><div className="mt-3 space-y-2 leading-6"><p className="whitespace-pre-wrap break-words"><strong>当前问题：</strong>{request.problem}</p><p className="whitespace-pre-wrap break-words"><strong>建议：</strong>{request.proposal}</p><div><p className="font-semibold">验收要求</p><ul className="list-disc pl-5">{request.acceptanceCriteria.map((item, criterion) => <li key={criterion} className="whitespace-pre-wrap break-words">{item}</li>)}</ul></div><p className="whitespace-pre-wrap break-words"><strong>影响范围：</strong>{request.impact}</p>{!!request.risks.length && <div><p className="font-semibold">风险与待确认条件</p><ul className="list-disc pl-5">{request.risks.map((item, risk) => <li key={risk} className="whitespace-pre-wrap break-words">{item}</li>)}</ul></div>}</div></details></div>)}<Button size="sm" disabled={disabled || !selected.length} onClick={() => { try { const source = changeRequestSource(ui, selected); setError(""); onPreview(source.text, source.selectionKey); } catch (failure) { setError(failure instanceof Error ? failure.message : "请核对选择后重试"); } }}><ListTree size={14} />预览新任务规划{selected.length ? `（${selected.length} 项）` : ""}</Button>{error && <p role="alert" className="text-xs text-destructive">{error}</p>}<p className="text-[11px] leading-5 text-muted-foreground">选择建议不会直接修改项目。进入规划后，先采纳目标，再生成、核对并确认创建新任务。</p></div>}
    {workSources?.some((source) => source.kind === "task") && <details className="rounded-xl border border-border p-3"><summary className="cursor-pointer text-xs font-medium">修改已有任务</summary><p className="mt-2 text-xs leading-5 text-muted-foreground">到来源任务审阅 AI 建议后决定是否修改；此处不会自动保存。</p><ul className="mt-2 space-y-2">{workSources.filter((source) => source.kind === "task").map((source) => <li key={source.id}><a href={safeChatSourceHref(source.href)} target="_blank" rel="noopener noreferrer" className="break-words text-xs text-brand underline underline-offset-4">前往任务审阅修改 · {source.title}</a></li>)}</ul></details>}
  </section>;
}
