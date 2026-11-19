"use client";

import { accountFetch } from "@/components/account-request";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { ArrowRight, ListTree, Sparkles, Square, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label, Textarea } from "@/components/ui/input";
import { FormFeedback, useFeedback } from "@/components/ui/feedback";
import { selectedTaskAssistancePatch, taskAssistanceResultSchema, type TaskAssistanceResult, type TaskAssistanceSelection } from "@/modules/ai/task-assistance-client";
import type { TaskDTO } from "./service";

const noSelection = (): TaskAssistanceSelection => ({ title: false, description: false, extensions: [] });
async function responseBody(response: Response): Promise<unknown> {
  try { return await response.json(); } catch { throw new Error(response.ok ? "服务返回的内容无法读取，请重试" : "任务建议暂时无法处理，请稍后重试"); }
}
function responseError(body: unknown, fallback: string) {
  return body && typeof body === "object" && "error" in body && typeof body.error === "string" ? body.error : fallback;
}

export function TaskAssistanceButton({ task }: { task: TaskDTO }) {
  const [open, setOpen] = useState(false);
  const [brief, setBrief] = useState("");
  const [result, setResult] = useState<TaskAssistanceResult | null>(null);
  const [generatedBrief, setGeneratedBrief] = useState<string | null>(null);
  const [selection, setSelection] = useState(noSelection);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);
  const writePending = useRef(false);
  const id = useId();
  const router = useRouter();
  const notify = useFeedback();
  const frozen = ["submitted", "accepted"].includes(task.status) || Boolean(result && ["submitted", "accepted"].includes(result.task.status));
  const stale = Boolean(result && (generatedBrief !== brief || result.task.updatedAt !== task.updatedAt.toISOString()));
  const preview = useMemo(() => {
    if (!result) return { patch: {}, error: "" };
    try { return { patch: selectedTaskAssistancePatch(result, selection), error: "" }; }
    catch (caught) { return { patch: {}, error: caught instanceof Error ? caught.message : "选中的建议无法应用，请调整选择" }; }
  }, [result, selection]);
  useEffect(() => () => { controller.current?.abort(); }, []);

  function stop() {
    controller.current?.abort(); controller.current = null; setLoading(false);
    setError("已停止生成，当前任务未修改；已获得的建议与补充说明仍保留。");
  }
  function close() {
    if (writePending.current) return;
    if (controller.current) stop();
    setOpen(false);
  }
  async function generateSuggestion() {
    if (controller.current || writePending.current) return;
    const active = new AbortController(); controller.current = active;
    setLoading(true); setError("");
    try {
      const response = await accountFetch("/api/v1/ai/task-assist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ taskId: task.id, expectedUpdatedAt: task.updatedAt.toISOString(), brief }), signal: active.signal });
      const body = await responseBody(response);
      if (!response.ok) throw new Error(responseError(body, "生成任务建议失败，请重试"));
      const parsed = taskAssistanceResultSchema.safeParse(body);
      if (!parsed.success || parsed.data.task.id !== task.id || parsed.data.task.projectId !== task.projectId) throw new Error("任务建议的来源无法确认，请重新生成");
      if (controller.current !== active || active.signal.aborted) return;
      setResult(parsed.data); setGeneratedBrief(brief); setSelection(noSelection());
    } catch (caught) {
      if (controller.current === active && !active.signal.aborted) setError(caught instanceof Error ? caught.message : "生成任务建议失败，请重试");
    } finally {
      if (controller.current === active) { controller.current = null; setLoading(false); }
    }
  }
  async function applySelected() {
    if (!result || writePending.current || controller.current || frozen || stale || preview.error || !Object.keys(preview.patch).length) return;
    writePending.current = true; setApplying(true); setError("");
    try {
      const response = await accountFetch("/api/v1/ai/task-assist/apply", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ taskId: task.id, expectedUpdatedAt: result.task.updatedAt, ...preview.patch, confirmed: true }) });
      const body = await responseBody(response);
      if (!response.ok) throw new Error(responseError(body, "修改结果暂时无法确认，请先刷新核对任务；选中的建议仍保留"));
      if (!body || typeof body !== "object" || !("task" in body) || !body.task || typeof body.task !== "object" || !("id" in body.task) || body.task.id !== task.id) throw new Error("修改结果无法确认，请先刷新核对任务；选中的建议仍保留");
      notify("已应用选中的任务修改。"); setOpen(false); setResult(null); setSelection(noSelection()); router.refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "修改结果暂时无法确认，请先刷新核对任务；选中的建议仍保留"); }
    finally { writePending.current = false; setApplying(false); }
  }

  if (!task.permissions?.actions.includes("update")) return null;
  return <Dialog.Root open={open} onOpenChange={(next) => { if (!next) close(); else if (!writePending.current) setOpen(true); }}>
    <Dialog.Trigger asChild><Button size="sm" variant="outline"><Sparkles aria-hidden="true" className="h-4 w-4" />AI 梳理与完善</Button></Dialog.Trigger>
    <Dialog.Portal><Dialog.Overlay className="dialog-overlay fixed inset-0 z-50 bg-black/35" />
      <Dialog.Content onEscapeKeyDown={(event) => { if (applying) event.preventDefault(); }} onPointerDownOutside={(event) => { if (loading || applying) event.preventDefault(); }} className="dialog-surface fixed left-1/2 top-1/2 z-50 max-h-[90dvh] w-[calc(100%-2rem)] max-w-4xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-border bg-card p-4 shadow-xl sm:p-6">
        <header className="flex items-start justify-between gap-4"><div><Dialog.Title className="text-lg font-semibold">AI 梳理与完善</Dialog.Title><Dialog.Description className="mt-2 text-sm leading-6 text-muted-foreground">根据当前任务和验收要求整理目标、路线与可选扩展。生成建议不会修改任务，由你选择后确认应用。</Dialog.Description></div><Button variant="ghost" size="icon" aria-label="关闭任务建议" disabled={applying} onClick={close}><X aria-hidden="true" className="h-4 w-4" /></Button></header>
        <div className="mt-5 space-y-5">
          <section className="space-y-3 rounded-xl border border-border bg-muted/20 p-4"><h2 className="break-words text-sm font-semibold">当前任务：{task.title}</h2><div className="space-y-2"><Label htmlFor={`${id}-brief`}>补充目标或已确认的信息（可选）</Label><Textarea id={`${id}-brief`} value={brief} maxLength={4000} disabled={loading || applying} onChange={(event) => setBrief(event.target.value)} placeholder="说明实际需求、已有资料摘要，或答复下方需要确认的问题" /></div><p className="text-xs leading-5 text-muted-foreground">点击生成后，将发送这个任务的标题、工作背景、验收要求和上述补充到你启用的模型。</p><div className="flex flex-wrap gap-2"><Button disabled={loading || applying} loading={loading} onClick={() => void generateSuggestion()}><Sparkles aria-hidden="true" className="h-4 w-4" />{result ? "重新梳理" : "生成任务建议"}</Button>{loading && <Button variant="outline" onClick={stop}><Square aria-hidden="true" className="h-3.5 w-3.5" />停止生成</Button>}<Button asChild variant="ghost" disabled={loading || applying}><Link href={`/ai?planning=task&projectId=${task.projectId}&taskId=${task.id}`} aria-disabled={loading || applying} tabIndex={loading || applying ? -1 : undefined} onClick={(event) => { if (loading || applying) event.preventDefault(); }}><ListTree aria-hidden="true" className="h-4 w-4" />基于此任务拆分规划</Link></Button></div></section>
          {loading && <p role="status" className="text-sm text-muted-foreground">正在根据真实任务整理建议，当前任务未修改…</p>}
          <FormFeedback message={error} />
          {stale && <p role="status" className="rounded-lg border border-border bg-muted/30 p-3 text-sm">补充说明或任务内容已变化，本次建议已过期，请重新生成。旧建议仍可查看。</p>}
          {result && <>
            <p className="text-xs text-muted-foreground">来源：当前任务与验收要求 · 模型：{result.model}</p>
            <section className="space-y-3" aria-labelledby={`${id}-changes`}><h2 id={`${id}-changes`} className="text-sm font-semibold">选择要应用的修改</h2><p className="text-sm leading-6 text-muted-foreground">{result.suggestion.rationale}</p>
              <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" className="h-4 w-4 accent-brand" checked={selection.title} disabled={loading || applying || frozen || stale || result.suggestion.title === result.task.title} onChange={(event) => setSelection((current) => ({ ...current, title: event.target.checked }))} />采用建议标题{result.suggestion.title === result.task.title ? "（标题无需调整）" : ""}</label>
              <div className="grid gap-3 sm:grid-cols-2"><Comparison label="原标题" text={result.task.title} /><Comparison label="建议标题" text={result.suggestion.title} /></div>
              <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" className="h-4 w-4 accent-brand" checked={selection.description} disabled={loading || applying || frozen || stale || result.suggestion.description === (result.task.description ?? "")} onChange={(event) => setSelection((current) => ({ ...current, description: event.target.checked }))} />采用建议工作背景</label>
              <div className="grid gap-3 sm:grid-cols-2"><Comparison label="原工作背景" text={result.task.description || "尚未填写"} /><Comparison label="建议工作背景" text={result.suggestion.description} /></div>
            </section>
            {result.suggestion.extensions.length > 0 && <section className="space-y-3" aria-labelledby={`${id}-extensions`}><h2 id={`${id}-extensions`} className="text-sm font-semibold">可选需求扩展</h2><p className="text-xs leading-5 text-muted-foreground">只有勾选的扩展才追加到工作背景；不会改动验收要求。</p>{result.suggestion.extensions.map((item, index) => <label key={index} className="flex items-start gap-3 rounded-xl border border-border p-3"><input type="checkbox" className="mt-1 h-4 w-4 shrink-0 accent-brand" checked={selection.extensions.includes(index)} disabled={loading || applying || frozen || stale} onChange={(event) => setSelection((current) => ({ ...current, extensions: event.target.checked ? [...current.extensions, index] : current.extensions.filter((value) => value !== index) }))} /><span className="min-w-0 text-sm"><strong className="break-words">{item.title}</strong><span className="mt-1 block break-words leading-6 text-muted-foreground">{item.reason}</span><span className="mt-2 block whitespace-pre-wrap break-words leading-6">{item.addition}</span></span></label>)}</section>}
            {result.suggestion.questions.length > 0 && <section className="space-y-2 rounded-xl border border-border p-4"><h2 className="text-sm font-semibold">需要你进一步确认</h2><ul className="list-inside list-disc space-y-2 text-sm leading-6">{result.suggestion.questions.map((question, index) => <li key={index} className="break-words">{question}</li>)}</ul><p className="text-xs text-muted-foreground">可把答复填入上方补充说明，再重新梳理。</p></section>}
            <details className="rounded-xl border border-border p-4"><summary className="cursor-pointer text-sm font-semibold">建议路线（{result.suggestion.roadmap.length} 个阶段）</summary><ol className="mt-4 space-y-3">{result.suggestion.roadmap.map((item, index) => <li key={index} className="rounded-lg bg-muted/30 p-3"><h3 className="break-words text-sm font-semibold">{index + 1}. {item.title}</h3><p className="mt-2 break-words text-sm leading-6">{item.outcome}</p><p className="mt-1 break-words text-xs leading-5 text-muted-foreground">{item.orderNote}</p></li>)}</ol><p className="mt-3 text-xs text-muted-foreground">路线仅供参考，不会创建任务或改变任务先后顺序。</p></details>
            {Object.keys(preview.patch).length > 0 && <section className="space-y-3 rounded-xl border border-brand/25 bg-brand-soft/30 p-4"><h2 className="text-sm font-semibold">确认后将保存的内容</h2>{preview.patch.title !== undefined && <Comparison label="任务标题" text={preview.patch.title} />}{preview.patch.description !== undefined && <Comparison label="工作背景" text={preview.patch.description} />}</section>}
            <FormFeedback message={preview.error} />
            {frozen && <p className="rounded-lg border border-border bg-muted/30 p-3 text-sm">当前任务待验收或已完成，目标已冻结。建议可查看；需要修改时，请先打回或重新打开任务。</p>}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4"><p className="text-xs text-muted-foreground">标题、工作背景及扩展均默认不采纳。</p><Button disabled={loading || applying || frozen || stale || Boolean(preview.error) || !Object.keys(preview.patch).length} loading={applying} onClick={() => void applySelected()}>确认应用选中修改<ArrowRight aria-hidden="true" className="h-4 w-4" /></Button></div>
          </>}
        </div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}

function Comparison({ label, text }: { label: string; text: string }) {
  return <div className="min-w-0 rounded-lg border border-border bg-background p-3"><p className="text-xs font-medium text-muted-foreground">{label}</p><p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 [overflow-wrap:anywhere]">{text}</p></div>;
}
