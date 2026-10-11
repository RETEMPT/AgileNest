"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Archive, ArrowUpRight, CheckCheck, ClipboardCheck, Download, FileText, FolderCheck, Plus, RefreshCw, RotateCcw, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { Badge, StatusPill } from "@/components/ui/badge";
import { FormFeedback, useFeedback } from "@/components/ui/feedback";
import { DELIVERY_ACTION_LABELS, deliveryCompletionError, type DeliveryBatchDTO, type DeliveryBatchInput, type DeliveryMutation, type DeliveryProjectDTO, type DeliveryRecordDTO } from "./client";

const emptyInput = (): DeliveryBatchInput => ({ name: "", description: "", ownerId: null, dueDate: null, checklist: [{ id: crypto.randomUUID(), text: "", checked: false, note: "" }] });
const batchInput = (batch: DeliveryBatchDTO): DeliveryBatchInput => ({ name: batch.name, description: batch.description, ownerId: batch.ownerId, dueDate: batch.dueDate, checklist: batch.checklist });
const examples = ["研究报告", "课程作业", "竞赛方案", "软件发布"];
const formattedTime = (time: string) => new Date(time).toLocaleString("zh-CN", { hour12: false });

async function requestJSON<T>(path: string, method: "GET" | "POST" | "PATCH", body?: unknown): Promise<T> {
  const response = await fetch(path, { method, cache: "no-store", headers: { "Content-Type": "application/json" }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  const value: unknown = await response.json();
  if (!response.ok) throw new Error(typeof value === "object" && value !== null && "error" in value && typeof value.error === "string" ? value.error : "操作失败，请稍后重试");
  return value as T;
}

type ConfirmationContent = { title: string; description: string; confirmLabel: string; cancelLabel?: string; destructive?: boolean; origin: HTMLElement | null };
function DeliveryConfirmation({ request, busy, onCancel, onConfirm }: { request: ConfirmationContent; busy: boolean; onCancel: () => void; onConfirm: () => Promise<string | null> }) {
  const cancelButton = useRef<HTMLButtonElement>(null);
  const submitting = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const blocked = busy || pending;
  const close = () => { if (!busy && !submitting.current) onCancel(); };
  async function confirm() {
    if (busy || submitting.current) return;
    submitting.current = true; setPending(true); setError("");
    try { const failure = await onConfirm(); if (failure) setError(failure); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "操作失败，请重试"); }
    finally { submitting.current = false; setPending(false); }
  }
  return <Dialog.Root open onOpenChange={(open) => { if (!open) close(); }}><Dialog.Portal>
    <Dialog.Overlay className="dialog-overlay fixed inset-0 z-[60] bg-black/40" />
    <Dialog.Content
      onOpenAutoFocus={(event) => { event.preventDefault(); cancelButton.current?.focus(); }}
      onCloseAutoFocus={(event) => { event.preventDefault(); if (request.origin?.isConnected) request.origin.focus(); else document.querySelector<HTMLElement>("[data-delivery-focus]")?.focus(); }}
      onEscapeKeyDown={(event) => { if (blocked || submitting.current) event.preventDefault(); }}
      onPointerDownOutside={(event) => { if (blocked || submitting.current) event.preventDefault(); }}
      className="dialog-surface fixed left-1/2 top-1/2 z-[60] max-h-[90dvh] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-border bg-card p-5 shadow-xl"
    >
      <Dialog.Title className="text-lg font-semibold">{request.title}</Dialog.Title>
      <Dialog.Description className="mt-3 break-words text-sm leading-6 text-muted-foreground">{request.description}</Dialog.Description>
      <FormFeedback message={error} className="mt-4" />
      <div className="mt-5 flex flex-wrap justify-end gap-2"><Button ref={cancelButton} type="button" variant="outline" disabled={blocked} onClick={close}>{request.cancelLabel ?? "取消"}</Button><Button type="button" variant={request.destructive ? "destructive" : "default"} loading={pending} disabled={blocked} onClick={() => void confirm()}>{request.confirmLabel}</Button></div>
    </Dialog.Content>
  </Dialog.Portal></Dialog.Root>;
}

function BatchFields({ input, setInput, members, disabled }: { input: DeliveryBatchInput; setInput: (value: DeliveryBatchInput) => void; members: DeliveryProjectDTO["members"]; disabled: boolean }) {
  return <fieldset disabled={disabled} className="space-y-4">
    <div className="grid gap-4 sm:grid-cols-2"><Label className="space-y-2"><span>阶段 / 交付批次名称</span><Input required maxLength={120} value={input.name} placeholder="例如：中期研究报告 / 课程结项材料" onChange={(event) => setInput({ ...input, name: event.target.value })} /></Label><Label className="space-y-2"><span>责任人</span><Select value={input.ownerId ?? ""} onChange={(event) => setInput({ ...input, ownerId: event.target.value || null })}><option value="">请选择责任人</option>{members.map((member) => <option key={member.id} value={member.id}>{member.name ?? "未命名成员"}</option>)}</Select></Label></div>
    <Label className="block space-y-2"><span>交付目标与材料说明</span><Textarea value={input.description} maxLength={10000} placeholder="写明阶段目标、需要汇总的报告、设计或成果材料。" onChange={(event) => setInput({ ...input, description: event.target.value })} /></Label>
    <Label className="block max-w-xs space-y-2"><span>交付截止日期</span><Input type="date" value={input.dueDate ?? ""} onChange={(event) => setInput({ ...input, dueDate: event.target.value || null })} /></Label>
    <section className="space-y-3"><h3 className="text-sm font-semibold">交付检查清单</h3>{input.checklist.map((check, index) => <div key={check.id} className="space-y-2 rounded-xl border border-border bg-muted/20 p-3"><div className="flex items-center gap-2"><input aria-label={`确认第 ${index + 1} 项交付检查`} type="checkbox" checked={check.checked} onChange={(event) => setInput({ ...input, checklist: input.checklist.map((item) => item.id === check.id ? { ...item, checked: event.target.checked } : item) })} className="h-4 w-4 accent-brand" /><Input aria-label={`第 ${index + 1} 项交付要求`} required maxLength={1000} value={check.text} placeholder="例如：报告已包含研究结论与原始材料索引" onChange={(event) => setInput({ ...input, checklist: input.checklist.map((item) => item.id === check.id ? { ...item, text: event.target.value } : item) })} /><Button type="button" size="icon" variant="ghost" disabled={input.checklist.length <= 1} aria-label={`移除第 ${index + 1} 项交付要求`} onClick={() => setInput({ ...input, checklist: input.checklist.filter((item) => item.id !== check.id) })}><Trash2 aria-hidden="true" className="h-4 w-4" /></Button></div><Input aria-label={`第 ${index + 1} 项核对依据`} value={check.note} maxLength={3000} placeholder="核对依据或补充说明（可选）" onChange={(event) => setInput({ ...input, checklist: input.checklist.map((item) => item.id === check.id ? { ...item, note: event.target.value } : item) })} /></div>)}<Button type="button" variant="outline" size="sm" disabled={input.checklist.length >= 40} onClick={() => setInput({ ...input, checklist: [...input.checklist, { id: crypto.randomUUID(), text: "", checked: false, note: "" }] })}><Plus className="h-4 w-4" aria-hidden="true" />添加检查项</Button></section>
  </fieldset>;
}

function DeliveryRecord({ record, batchId, projectId }: { record: DeliveryRecordDTO; batchId: string; projectId: string }) {
  return <details className="rounded-xl border border-border p-3"><summary className="cursor-pointer text-sm font-medium">v{record.version} · {DELIVERY_ACTION_LABELS[record.action]}<span className="ml-2 text-xs font-normal text-muted-foreground">{record.actorName ?? "历史成员"} · {formattedTime(record.createdAt)}</span></summary><div className="mt-3 space-y-3 text-sm"><p className="text-xs text-muted-foreground">此记录是当时的独立快照，后续修改不会覆盖。</p><p className="font-medium">{record.snapshot.name} · {record.snapshot.ownerName ?? "未指定责任人"}</p><p className="whitespace-pre-wrap break-words">{record.snapshot.description}</p><ul className="space-y-1">{record.snapshot.checklist.map((item) => <li key={item.id}>{item.checked ? "✓" : "○"} {item.text}{item.note ? ` · ${item.note}` : ""}</li>)}</ul>{record.snapshot.entries.map((entry) => <p key={entry.taskId}><Link className="text-brand hover:underline" href={`/p/${projectId}/tasks/${entry.taskId}`}>{entry.taskTitle}</Link> · 通过提交 v{entry.submission.version} · {entry.submission.review?.reviewerName ?? "历史验收人"}</p>)}{record.snapshot.issues.map((issue) => <p key={issue.id}>{issue.resolved ? "已解决" : "待处理"}：{issue.title} · {issue.resolution ?? issue.detail}</p>)}<div className="flex flex-wrap gap-3"><a className="text-brand hover:underline" href={`/api/v1/delivery/${batchId}/export?version=${record.version}&format=markdown`}>导出此版本 Markdown</a><a className="text-brand hover:underline" href={`/api/v1/delivery/${batchId}/export?version=${record.version}&format=json`}>导出 JSON</a></div></div></details>;
}

function BatchDetail({ batch, data, busy, onMutate, onDirty }: { batch: DeliveryBatchDTO; data: DeliveryProjectDTO; busy: boolean; onMutate: (input: DeliveryMutation) => Promise<DeliveryBatchDTO>; onDirty: (dirty: boolean) => void }) {
  const [input, setInput] = useState(() => batchInput(batch));
  const [editVersion, setEditVersion] = useState(batch.version);
  const [baseline, setBaseline] = useState(() => JSON.stringify(batchInput(batch)));
  const [error, setError] = useState("");
  const [latest, setLatest] = useState<DeliveryBatchDTO | null>(null);
  const [readingLatest, setReadingLatest] = useState(false);
  const [candidate, setCandidate] = useState("");
  const [issueInput, setIssueInput] = useState({ title: "", detail: "", ownerId: "", taskId: "" });
  const [resolutions, setResolutions] = useState<Record<string, string>>({});
  const [confirmation, setConfirmation] = useState<(ConfirmationContent & { change: DeliveryMutation }) | null>(null);
  const editable = batch.canOrganize && !batch.archived && batch.status === "draft";
  const metadataDirty = JSON.stringify(input) !== baseline;
  const issueDirty = Boolean(issueInput.title || issueInput.detail || issueInput.ownerId || issueInput.taskId || Object.values(resolutions).some(Boolean));
  useEffect(() => { onDirty(metadataDirty || issueDirty); return () => onDirty(false); }, [metadataDirty, issueDirty, onDirty]);

  async function send(change: DeliveryMutation) {
    setError("");
    try {
      const result = await onMutate(change);
      setLatest(null);
      if (change.op === "edit" || !metadataDirty) { setInput(batchInput(result)); setEditVersion(result.version); setBaseline(JSON.stringify(batchInput(result))); }
      if (change.op === "issue") setIssueInput({ title: "", detail: "", ownerId: "", taskId: "" });
      if (change.op === "resolve") setResolutions((current) => ({ ...current, [change.issueId]: "" }));
      if (change.op === "bind") setCandidate("");
      return null;
    } catch (caught) { const message = caught instanceof Error ? caught.message : "操作失败，草稿已保留"; setError(message); return message; }
  }
  function confirmChange(change: DeliveryMutation, title: string, description: string, confirmLabel: string, origin: HTMLElement, destructive = false) {
    if (busy) return;
    setConfirmation({ change, title, description, confirmLabel, origin, destructive });
  }
  const completionError = deliveryCompletionError(batch);
  const operationsDisabled = busy || metadataDirty;
  return <article className="min-w-0 space-y-5">
    <header tabIndex={-1} data-delivery-focus className="space-y-3 rounded-2xl border border-border bg-card p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><div className="mb-2 flex flex-wrap gap-2"><Badge variant="secondary">{batch.archived ? "已归档" : batch.status === "completed" ? "已确认交付" : "整理中"}</Badge><span className="text-xs text-muted-foreground">v{batch.version}</span></div><h2 className="break-words text-xl font-semibold">{batch.name}</h2><p className="mt-2 text-sm text-muted-foreground">责任人 {batch.ownerName ?? "未指定"} · {batch.dueDate ?? "未设置截止日期"}</p></div><a className="inline-flex items-center gap-1.5 text-sm text-brand hover:underline" href={`/api/v1/delivery/${batch.id}/export?version=${batch.version}&format=markdown`}><Download className="h-4 w-4" />导出当前记录</a></div>{batch.completedAt && <p className="text-xs text-muted-foreground">{batch.completedByName ?? "历史验收人"} 于 {formattedTime(batch.completedAt)} 确认交付。后续任务状态变化不会改写这份历史记录。</p>}<div className="flex flex-wrap gap-2">
      {batch.canConfirm && !batch.archived && batch.status === "draft" && <Button size="sm" loading={busy} disabled={Boolean(completionError) || metadataDirty || issueDirty} title={completionError ?? undefined} onClick={(event) => confirmChange({ op: "complete", version: batch.version }, "确认阶段交付？", "确认所选通过版本、全部交付项和评审问题已核对？这将保存独立交付记录。", "确认交付", event.currentTarget)}><CheckCheck className="h-4 w-4" aria-hidden="true" />确认阶段交付</Button>}
      {batch.canConfirm && !batch.archived && batch.status === "completed" && <Button size="sm" variant="outline" disabled={busy} onClick={(event) => confirmChange({ op: "reopen", version: batch.version }, "重新开启交付？", "重新开启交付后需要重新核对清单；原确认记录将完整保留。", "重新开启", event.currentTarget)}><RotateCcw className="h-4 w-4" aria-hidden="true" />重新开启</Button>}
      {batch.canOrganize && <Button size="sm" variant="outline" disabled={operationsDisabled || issueDirty} onClick={(event) => confirmChange({ op: batch.archived ? "restore" : "archive", version: batch.version }, batch.archived ? "恢复交付？" : "归档交付？", batch.archived ? "恢复后回到原交付状态，已有确认与历史记录保持不变。" : "归档后本批次保持只读，全部成果、问题和交付记录继续保留，可随时恢复。", batch.archived ? "恢复交付" : "确认归档", event.currentTarget)}><Archive className="h-4 w-4" aria-hidden="true" />{batch.archived ? "恢复交付" : "归档"}</Button>}
    </div>{batch.status === "draft" && !batch.archived && completionError && <p className="text-xs leading-relaxed text-muted-foreground">确认前需要：{completionError}</p>}<FormFeedback message={error} />{error.includes("重新加载") && metadataDirty && <div className="space-y-3"><Button size="sm" variant="outline" disabled={busy} loading={readingLatest} onClick={() => { setReadingLatest(true); void requestJSON<DeliveryBatchDTO>(`/api/v1/delivery/${batch.id}`, "GET").then(setLatest).catch((caught) => setError(caught instanceof Error ? caught.message : "无法读取最新版本")).finally(() => setReadingLatest(false)); }}>查看最新清单并保留草稿</Button>{latest && <div className="space-y-3 rounded-xl bg-brand-soft p-3 text-sm"><p className="font-medium">服务器当前版本 v{latest.version} · {latest.name}</p><ul className="space-y-1">{latest.checklist.map((item) => <li key={item.id}>{item.checked ? "✓" : "○"} {item.text}</li>)}</ul><p className="text-xs text-muted-foreground">上方草稿仍保留。核对后可以用草稿更新最新版本；这会覆盖最新的阶段目标与检查清单，并保留原记录。</p><Button size="sm" variant="outline" disabled={busy || latest.status !== "draft" || latest.archived || !latest.canOrganize} onClick={() => void send({ op: "edit", version: latest.version, data: input })}>已核对，保存草稿到最新版本</Button></div>}</div>}{error.includes("重新加载") && !metadataDirty && <p className="text-xs text-muted-foreground">问题处理草稿仍保留。请先复制需要保留的内容，再刷新查看最新版本。</p>}</header>

    <section className="space-y-4 rounded-2xl border border-border bg-card p-5"><div className="flex items-center gap-2"><ClipboardCheck className="h-4 w-4 text-brand" aria-hidden="true" /><h3 className="font-semibold">阶段目标与交付清单</h3></div>{editable ? <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void send({ op: "edit", version: editVersion, data: input }); }}><BatchFields input={input} setInput={setInput} members={data.members} disabled={busy} /><div className="flex flex-wrap items-center gap-3"><Button type="submit" size="sm" loading={busy} disabled={!metadataDirty}>保存清单</Button>{metadataDirty && <span className="text-xs text-muted-foreground">有未保存修改 · 编辑依据 v{editVersion}</span>}</div></form> : <><p className="whitespace-pre-wrap break-words text-sm leading-6">{batch.description || "未填写说明"}</p><ul className="space-y-2 text-sm">{batch.checklist.map((item) => <li key={item.id} className="rounded-xl bg-muted/30 p-3"><p>{item.checked ? "✓" : "○"} {item.text}</p>{item.note && <p className="mt-1 text-xs text-muted-foreground">{item.note}</p>}</li>)}</ul></>}</section>

    <section className="space-y-4 rounded-2xl border border-border bg-card p-5"><div><h3 className="font-semibold">已通过的成果版本</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">从项目任务选择真实验收通过的提交，报告、设计、研究材料和代码成果都适用。</p></div>{batch.entries.map((entry) => <div key={entry.id} className="space-y-3 rounded-xl border border-border p-4"><div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><Link href={`/p/${data.projectId}/tasks/${entry.taskId}`} className="break-words font-medium text-brand hover:underline">{entry.taskTitle}<ArrowUpRight aria-hidden="true" className="ml-1 inline h-3.5 w-3.5" /></Link><p className="mt-1 text-xs text-muted-foreground">通过提交 v{entry.submission.version} · {entry.submission.review?.reviewerName ?? "历史验收人"}</p></div>{editable && <Button size="icon" variant="ghost" disabled={operationsDisabled} aria-label={`移除 ${entry.taskTitle} 的交付关联`} onClick={(event) => confirmChange({ op: "unbind", version: batch.version, entryId: entry.id }, "移除成果关联？", "仅移除当前批次中的成果关联。任务、通过版本和历史交付记录完整保留。", "确认移除", event.currentTarget, true)}><X className="h-4 w-4" /></Button>}</div>{entry.currentTaskStatus !== "accepted" && <div className="flex flex-wrap items-center gap-2 rounded-lg bg-muted p-2 text-xs"><span>当前任务状态已有变化；交付保留当时通过的版本。</span><StatusPill status={entry.currentTaskStatus} /></div>}<p className="whitespace-pre-wrap break-words text-sm">{entry.submission.summary}</p><p className="whitespace-pre-wrap break-words text-xs text-muted-foreground">验证：{entry.submission.verification || "历史提交未记录结构化验证"}</p><div className="flex flex-wrap gap-3">{entry.submission.resources.map((resource) => <a key={resource.id} href={`/p/${data.projectId}/resources?resource=${resource.id}`} className="inline-flex items-center gap-1 text-xs text-brand hover:underline"><FileText className="h-3.5 w-3.5" />{resource.title}</a>)}{entry.submission.links.map((link, index) => <a key={`${link.url}:${index}`} href={link.url} target="_blank" rel="noreferrer noopener" className="text-xs text-brand hover:underline">{link.title}</a>)}</div></div>)}{!batch.entries.length && <p className="rounded-xl border border-dashed border-border p-5 text-sm text-muted-foreground">还没有成果版本。先在任务中提交材料并完成验收，再加入本阶段。</p>}{editable && <div className="flex flex-col gap-2 sm:flex-row"><Select aria-label="选择已通过的任务版本" disabled={operationsDisabled} value={candidate} onChange={(event) => setCandidate(event.target.value)}><option value="">选择任务与通过版本</option>{data.candidates.filter((item) => !batch.entries.some((entry) => entry.taskId === item.taskId)).map((item) => <option value={item.submission.id} key={item.submission.id}>{item.taskTitle} · v{item.submission.version}</option>)}</Select><Button size="sm" variant="outline" disabled={!candidate || operationsDisabled} onClick={() => { const item = data.candidates.find((row) => row.submission.id === candidate); if (item) void send({ op: "bind", version: batch.version, taskId: item.taskId, submissionId: item.submission.id }); }}>加入交付</Button></div>}</section>

    <section className="space-y-4 rounded-2xl border border-border bg-card p-5"><h3 className="font-semibold">评审问题与处理结果</h3>{batch.issues.map((issue) => <div key={issue.id} className="space-y-3 rounded-xl border border-border p-4"><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-medium">{issue.title}</p><Badge variant="secondary">{issue.resolved ? "已解决" : "待处理"}</Badge></div><p className="whitespace-pre-wrap break-words text-sm">{issue.detail}</p><p className="text-xs text-muted-foreground">责任人：{issue.ownerName ?? "未指定"} · 问题 v{issue.version}</p>{issue.taskId && <Link href={`/p/${data.projectId}/tasks/${issue.taskId}`} className="inline-block text-xs text-brand hover:underline">查看关联任务</Link>}{issue.resolution && <p className="whitespace-pre-wrap break-words rounded-lg bg-muted/30 p-3 text-sm">处理结果：{issue.resolution}</p>}{issue.canResolve && (issue.resolved ? <Button size="sm" variant="outline" disabled={operationsDisabled || issueDirty} onClick={(event) => confirmChange({ op: "reopenIssue", version: batch.version, issueId: issue.id, issueVersion: issue.version }, "重新开启问题？", "问题重新进入待处理，需要重新记录处理结果后才能确认阶段交付。", "重新开启问题", event.currentTarget)}>重新开启问题</Button> : <form className="space-y-2" onSubmit={(event) => { event.preventDefault(); void send({ op: "resolve", version: batch.version, issueId: issue.id, issueVersion: issue.version, resolution: resolutions[issue.id] ?? "" }); }}><Textarea aria-label={`${issue.title} 的处理结果`} required value={resolutions[issue.id] ?? ""} maxLength={10000} placeholder="填写处理结果和验证依据，不能只写“已修改”。" disabled={operationsDisabled} onChange={(event) => setResolutions((current) => ({ ...current, [issue.id]: event.target.value }))} /><Button size="sm" variant="outline" disabled={operationsDisabled} type="submit">记录解决结果</Button></form>)}</div>)}{!batch.issues.length && <p className="text-sm text-muted-foreground">暂未登记评审问题。</p>}{editable && <details className="rounded-xl border border-dashed border-border p-4"><summary className="cursor-pointer text-sm font-medium">登记评审问题</summary><form className="mt-4 space-y-3" onSubmit={(event) => { event.preventDefault(); void send({ op: "issue", version: batch.version, title: issueInput.title, detail: issueInput.detail, ownerId: issueInput.ownerId || null, taskId: issueInput.taskId || null }); }}><Input aria-label="评审问题标题" required value={issueInput.title} maxLength={200} placeholder="问题标题" disabled={operationsDisabled} onChange={(event) => setIssueInput({ ...issueInput, title: event.target.value })} /><Textarea aria-label="问题位置与通过条件" required value={issueInput.detail} maxLength={10000} placeholder="问题位置、具体差异和通过条件" disabled={operationsDisabled} onChange={(event) => setIssueInput({ ...issueInput, detail: event.target.value })} /><div className="grid gap-3 sm:grid-cols-2"><Select aria-label="评审问题责任人" value={issueInput.ownerId} disabled={operationsDisabled} onChange={(event) => setIssueInput({ ...issueInput, ownerId: event.target.value })}><option value="">请选择问题责任人</option>{data.members.map((member) => <option key={member.id} value={member.id}>{member.name ?? "未命名成员"}</option>)}</Select><Select aria-label="评审问题关联任务" value={issueInput.taskId} disabled={operationsDisabled} onChange={(event) => setIssueInput({ ...issueInput, taskId: event.target.value })}><option value="">不关联任务</option>{batch.entries.map((entry) => <option key={entry.taskId} value={entry.taskId}>{entry.taskTitle}</option>)}</Select></div><Button type="submit" size="sm" variant="outline" disabled={operationsDisabled}>保存评审问题</Button></form></details>}</section>

    <section className="space-y-3 rounded-2xl border border-border bg-card p-5"><h3 className="font-semibold">交付与变更记录</h3>{batch.records.map((record) => <DeliveryRecord key={record.id} record={record} batchId={batch.id} projectId={data.projectId} />)}<p className="text-xs leading-5 text-muted-foreground">页面展示最近 40 个版本。所有历史版本继续保留，可通过版本号导出。</p><form className="flex flex-wrap items-center gap-2" onSubmit={(event) => { event.preventDefault(); const value = new FormData(event.currentTarget).get("version"); window.location.assign(`/api/v1/delivery/${batch.id}/export?version=${value}&format=markdown`); }}><Input name="version" type="number" min={1} max={batch.version} required defaultValue={batch.version} aria-label="导出历史版本号" className="w-24" /><Button type="submit" size="sm" variant="outline">导出指定版本</Button></form></section>
    {confirmation && <DeliveryConfirmation request={confirmation} busy={busy} onCancel={() => setConfirmation(null)} onConfirm={async () => { if (confirmation.change.version !== batch.version) return "交付批次已变化，请取消并重新核对当前版本后再确认。"; const failure = await send(confirmation.change); if (!failure) setConfirmation(null); return failure; }} />}
  </article>;
}

export function DeliveryWorkspace({ initial, selectedBatchId }: { initial: DeliveryProjectDTO; selectedBatchId?: string }) {
  const router = useRouter(); const feedback = useFeedback();
  const [data, setData] = useState(initial);
  const [selected, setSelected] = useState(initial.batches.some((batch) => batch.id === selectedBatchId) ? selectedBatchId! : initial.batches.find((batch) => !batch.archived)?.id ?? initial.batches[0]?.id ?? "");
  const [showArchived, setShowArchived] = useState(false); const [creating, setCreating] = useState(false); const [createInput, setCreateInput] = useState<DeliveryBatchInput | null>(null);
  const [createRequestKey, setCreateRequestKey] = useState("");
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [detailDirty, setDetailDirty] = useState(false);
  const [navigation, setNavigation] = useState<(ConfirmationContent & { perform: () => Promise<void> | void }) | null>(null);
  const onDirty = useCallback((dirty: boolean) => setDetailDirty(dirty), []);
  const dirty = detailDirty || Boolean(createInput?.name || createInput?.description || createInput?.checklist.some((item) => item.text));
  useEffect(() => { if (!dirty) return; const listener = (event: BeforeUnloadEvent) => { event.preventDefault(); }; window.addEventListener("beforeunload", listener); return () => window.removeEventListener("beforeunload", listener); }, [dirty]);
  function withDiscard(perform: () => Promise<void> | void, origin: HTMLElement) {
    if (busy) return;
    if (dirty) setNavigation({ title: "放弃未保存的输入？", description: "有尚未保存的输入，离开当前编辑会丢失这些草稿。确认继续？", confirmLabel: "放弃并继续", cancelLabel: "继续编辑", destructive: true, origin, perform });
    else void perform();
  }
  const choose = (id: string, origin: HTMLElement) => withDiscard(() => { setSelected(id); setCreating(false); setCreateInput(null); setDetailDirty(false); router.replace(`/p/${data.projectId}/delivery?batch=${id}`, { scroll: false }); }, origin);
  const beginCreate = (origin: HTMLElement) => withDiscard(() => { setCreating(true); setCreateInput(emptyInput()); setCreateRequestKey(crypto.randomUUID()); setDetailDirty(false); }, origin);
  async function reload() {
    if (busy) return;
    setBusy(true); setError("");
    try { const next = await requestJSON<DeliveryProjectDTO>(`/api/v1/projects/${data.projectId}/delivery`, "GET"); setData(next); setCreating(false); setCreateInput(null); setSelected(""); setDetailDirty(false); feedback("交付资料已刷新，请重新选择批次查看"); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "刷新失败，当前内容仍保留"); } finally { setBusy(false); }
  }
  async function create(event: FormEvent) {
    event.preventDefault(); if (!createInput || busy) return; setBusy(true); setError("");
    let established = false;
    try { const result = await requestJSON<{ id: string }>(`/api/v1/projects/${data.projectId}/delivery`, "POST", { ...createInput, requestKey: createRequestKey }); established = true; setCreating(false); setCreateInput(null); setSelected(result.id); feedback("交付批次已建立"); router.replace(`/p/${data.projectId}/delivery?batch=${result.id}`, { scroll: false }); const next = await requestJSON<DeliveryProjectDTO>(`/api/v1/projects/${data.projectId}/delivery`, "GET"); setData(next); }
    catch (caught) { setError(established ? "交付批次已建立，详情刷新失败。请点击刷新查看已建立的批次，无需再次新建。" : caught instanceof Error ? caught.message : "请求结果尚未确认，输入仍保留；重试会核对同一次新建请求"); } finally { setBusy(false); }
  }
  async function mutate(input: DeliveryMutation) {
    setBusy(true);
    try { const next = await requestJSON<DeliveryBatchDTO>(`/api/v1/delivery/${selected}`, "PATCH", input); setData((current) => ({ ...current, batches: current.batches.map((batch) => batch.id === next.id ? next : batch) })); feedback(DELIVERY_ACTION_LABELS[input.op]); return next; }
    finally { setBusy(false); }
  }
  const active = data.batches.find((batch) => batch.id === selected);
  const visible = data.batches.filter((batch) => showArchived || !batch.archived);
  return <main tabIndex={-1} data-delivery-focus className="min-w-0 space-y-5"><header className="flex flex-wrap items-start justify-between gap-3"><div><p className="mb-2 text-xs text-muted-foreground">{data.projectName} / 阶段交付</p><h1 className="text-2xl font-semibold tracking-tight">阶段交付中心</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">按阶段汇总任务成果、材料和评审问题，核对通过的具体版本，形成可追溯的交付记录。</p></div><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" loading={busy} onClick={(event) => withDiscard(reload, event.currentTarget)}><RefreshCw className="h-4 w-4" aria-hidden="true" />刷新</Button>{data.canOrganize && <Button size="sm" disabled={busy} onClick={(event) => beginCreate(event.currentTarget)}><Plus className="h-4 w-4" aria-hidden="true" />新建交付批次</Button>}</div></header><FormFeedback message={error} />
    <div className="grid min-w-0 gap-5 lg:grid-cols-[260px_minmax(0,1fr)]"><aside className="space-y-3 self-start rounded-2xl border border-border bg-card p-4"><div className="flex items-center justify-between"><h2 className="text-sm font-semibold">交付批次</h2><label className="flex items-center gap-1.5 text-xs text-muted-foreground"><input type="checkbox" checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} />含归档</label></div>{visible.map((batch) => <button key={batch.id} disabled={busy} onClick={(event) => choose(batch.id, event.currentTarget)} aria-current={!creating && selected === batch.id ? "page" : undefined} className={`w-full rounded-xl border p-3 text-left transition-colors ${!creating && selected === batch.id ? "border-brand/20 bg-brand-soft" : "border-transparent hover:bg-muted"}`}><p className="break-words text-sm font-medium">{batch.name}</p><p className="mt-2 text-xs text-muted-foreground">{batch.archived ? "归档" : batch.status === "completed" ? "已确认" : "整理中"} · {batch.entries.length} 项成果 · {batch.issues.filter((issue) => !issue.resolved).length} 个待处理问题</p></button>)}{!visible.length && <p className="py-4 text-sm text-muted-foreground">尚无交付批次</p>}<Link href={`/p/${data.projectId}/tasks`} className="block border-t border-border pt-3 text-xs text-brand hover:underline">前往任务提交与验收</Link><Link href={`/p/${data.projectId}/resources`} className="block text-xs text-brand hover:underline">整理项目资料</Link></aside>
    {creating && createInput ? <section className="space-y-5 rounded-2xl border border-border bg-card p-5"><div className="flex items-center justify-between"><h2 className="text-lg font-semibold">建立阶段交付</h2><Button variant="ghost" size="icon" disabled={busy} aria-label="取消新建交付" onClick={(event) => withDiscard(() => { setCreating(false); setCreateInput(null); }, event.currentTarget)}><X className="h-4 w-4" /></Button></div><div className="flex flex-wrap gap-2">{examples.map((example) => <Button key={example} type="button" variant="outline" size="sm" disabled={busy} onClick={() => setCreateInput({ ...createInput, name: example, checklist: [{ id: crypto.randomUUID(), text: `${example}材料齐全且与通过版本对应`, checked: false, note: "" }, { id: crypto.randomUUID(), text: "评审问题已逐项处理并记录结果", checked: false, note: "" }] })}>{example}</Button>)}</div><p className="text-xs text-muted-foreground">选择示例只填入草稿，可按项目实际情况修改，不要求代码仓库。</p><form onSubmit={create} className="space-y-5"><BatchFields input={createInput} setInput={setCreateInput} members={data.members} disabled={busy} /><Button type="submit" size="sm" loading={busy}>建立交付批次</Button></form></section> : active ? <BatchDetail key={active.id} batch={active} data={data} busy={busy} onMutate={mutate} onDirty={onDirty} /> : <section className="flex min-h-[360px] flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card p-6 text-center"><FolderCheck className="mb-4 h-10 w-10 text-brand/60" aria-hidden="true" /><h2 className="text-lg font-semibold">把阶段成果整理成一次完整交付</h2><p className="mt-3 max-w-lg text-sm leading-6 text-muted-foreground">研究报告、课程作业、竞赛方案和软件发布都可以建立交付批次。材料来自真实任务的通过版本，评审意见和交付记录集中保留。</p>{data.canOrganize && <Button className="mt-5" size="sm" onClick={(event) => beginCreate(event.currentTarget)}><Plus className="h-4 w-4" />建立第一批交付</Button>}</section>}</div>
    {navigation && <DeliveryConfirmation request={navigation} busy={busy} onCancel={() => setNavigation(null)} onConfirm={async () => { await navigation.perform(); setNavigation(null); return null; }} />}
  </main>;
}
