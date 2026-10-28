"use client";

import Link from "next/link";
import * as Dialog from "@radix-ui/react-dialog";
import { useEffect, useId, useState } from "react";
import { Boxes, Check, Pencil, Plus, RotateCcw, Send, Trash2 } from "lucide-react";
import { z } from "zod";
import { accountFetch } from "@/components/account-request";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { FormFeedback, useFeedback } from "@/components/ui/feedback";
import { assetListSchema, assetRequestListSchema, assetSchema, assetRequestSchema, type AssetDTO, type AssetListDTO, type AssetRequestDTO, type AssetRequestListDTO, type AssetRequestStatus } from "./client";

type Props = { teamId: string; actorId: string; teamName: string };

const STATUS_META: Record<AssetRequestStatus, { label: string; variant: "default" | "secondary" | "success" | "warning" | "destructive" }> = {
  pending: { label: "待审批", variant: "warning" },
  approved: { label: "已占用", variant: "success" },
  rejected: { label: "已拒绝", variant: "secondary" },
  returned: { label: "已归还", variant: "default" },
  withdrawn: { label: "已撤回", variant: "secondary" },
};

async function responseData(response: Response): Promise<unknown> {
  const data: unknown = await response.json();
  if (!response.ok) throw new Error(typeof data === "object" && data !== null && "error" in data && typeof data.error === "string" ? data.error : "操作失败，请重试");
  return data;
}

export function AssetsWorkspace(props: Props) {
  return <AssetsPanel key={`${props.actorId}:${props.teamId}`} {...props} />;
}

function AssetsPanel({ teamId, actorId, teamName }: Props) {
  const [assets, setAssets] = useState<AssetListDTO | null>(null);
  const [requests, setRequests] = useState<AssetRequestListDTO | null>(null);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [pending, setPending] = useState(false);
  const [editing, setEditing] = useState<{ asset?: AssetDTO } | null>(null);
  const [deleting, setDeleting] = useState<AssetDTO | null>(null);
  const [requestAssetId, setRequestAssetId] = useState("");
  const [requestQuantity, setRequestQuantity] = useState("");
  const [requestPurpose, setRequestPurpose] = useState("");
  const feedback = useFeedback();
  const id = useId();

  useEffect(() => {
    const controller = new AbortController();
    setLoadError("");
    void Promise.all([
      accountFetch(`/api/v1/teams/${teamId}/assets`, { signal: controller.signal, cache: "no-store" }).then(responseData).then((value) => assetListSchema.parse(value)),
      accountFetch(`/api/v1/teams/${teamId}/asset-requests`, { signal: controller.signal, cache: "no-store" }).then(responseData).then((value) => assetRequestListSchema.parse(value)),
    ]).then(([assetList, requestList]) => { if (!controller.signal.aborted) { setAssets(assetList); setRequests(requestList); } })
      .catch((cause: unknown) => { if (!controller.signal.aborted) setLoadError(cause instanceof Error ? cause.message : "资源加载失败"); });
    return () => controller.abort();
  }, [teamId, reload]);

  const list = assets?.assets ?? [];
  const requestList = requests?.requests ?? [];
  const canManage = assets?.canManage ?? requests?.canManage ?? false;
  const applyOptions = list.filter((asset) => asset.available > 0);

  function refresh() { setReload((value) => value + 1); }

  async function mutateAsset(asset: AssetDTO | null, patch: object) {
    setPending(true); setError("");
    try {
      const data = z.object({ asset: assetSchema }).parse(await responseData(await accountFetch(`/api/v1/teams/${teamId}/assets${asset ? `/${asset.id}` : ""}`, {
        method: asset ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch),
      })));
      setAssets((current) => {
        const rows = current ? current.assets : [];
        return { assets: rows.some((row) => row.id === data.asset.id) ? rows.map((row) => (row.id === data.asset.id ? data.asset : row)) : [...rows, data.asset], canManage: current?.canManage ?? false };
      });
      setEditing(null);
      refresh();
      feedback(asset ? "资源已更新" : "资源已录入");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "资源保存失败，请重试"); }
    finally { setPending(false); }
  }

  async function deleteAssetMutation(asset: AssetDTO) {
    setPending(true); setError("");
    try {
      await responseData(await accountFetch(`/api/v1/teams/${teamId}/assets/${asset.id}?version=${asset.version}`, { method: "DELETE" }));
      setAssets((current) => current ? { assets: current.assets.filter((row) => row.id !== asset.id), canManage: current.canManage } : current);
      setDeleting(null);
      refresh();
      feedback("资源已删除");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "删除失败，请重试"); }
    finally { setPending(false); }
  }

  async function mutateRequest(request: AssetRequestDTO | null, patch: object) {
    setPending(true); setError("");
    try {
      const data = z.object({ request: assetRequestSchema }).parse(await responseData(await accountFetch(`/api/v1/teams/${teamId}/asset-requests${request ? `/${request.id}` : ""}`, {
        method: request ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch),
      })));
      setRequests((current) => {
        const rows = current ? current.requests : [];
        return { requests: rows.some((row) => row.id === data.request.id) ? rows.map((row) => (row.id === data.request.id ? data.request : row)) : [data.request, ...rows], canManage: current?.canManage ?? false };
      });
      if (!request) { setRequestAssetId(""); setRequestQuantity(""); setRequestPurpose(""); }
      setDeleting(null);
      refresh();
      feedback(request ? "申请已更新" : "申请已提交");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "申请保存失败，请重试"); }
    finally { setPending(false); }
  }

  return <main className="space-y-6">
    <header>
      <Link href={`/t/${teamId}/projects`} className="text-xs text-muted-foreground hover:text-brand">← {teamName} / 团队项目</Link>
      <h1 className="mt-3 text-3xl font-semibold">资源占用与申请</h1>
      <p className="mt-2 text-sm text-muted-foreground">{teamName} · 教师录入资源类型与数量，成员查看可用并申请，批准后计入占用。</p>
    </header>
    {loadError && <div className="space-y-2"><FormFeedback message={loadError} /><Button type="button" variant="outline" size="sm" onClick={refresh}>重新加载</Button></div>}
    {(!assets || !requests) && !loadError && <p role="status" className="text-xs text-muted-foreground">正在加载资源…</p>}
    <section aria-labelledby={`${id}-pool`} className="space-y-4 rounded-2xl border border-border bg-card p-4 sm:p-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h2 id={`${id}-pool`} className="flex items-center gap-2 text-sm font-semibold"><Boxes className="h-4 w-4 text-brand" />资源池{assets && <span className="text-xs font-normal text-muted-foreground">{list.length} 项</span>}</h2>
        {canManage && <Button size="sm" disabled={pending} onClick={() => setEditing({})}><Plus className="h-4 w-4" />录入资源</Button>}
      </header>
      {assets && !list.length && <p className="rounded-xl border border-dashed border-border p-5 text-center text-sm text-muted-foreground">{canManage ? "还没有资源，先录入一种资源类型与数量。" : "教师录入资源后，会在这里显示可用与占用情况。"}</p>}
      <ul className="grid gap-3 md:grid-cols-2">
        {list.map((asset) => {
          const pct = asset.totalQuantity ? Math.round((asset.occupied / asset.totalQuantity) * 100) : 0;
          return <li key={asset.id} className="space-y-3 rounded-xl border border-border p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{asset.name}</p>
                {asset.note && <p className="mt-1 truncate text-xs text-muted-foreground">{asset.note}</p>}
              </div>
              {asset.canManage && <div className="flex shrink-0 gap-1">
                <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => setEditing({ asset })}><Pencil className="h-3.5 w-3.5" /></Button>
                <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => setDeleting(asset)}><Trash2 className="h-3.5 w-3.5" /></Button>
              </div>}
            </div>
            <div className="flex h-2 overflow-hidden rounded-full bg-muted" aria-label={`已占用 ${pct}%`}><span className="bg-brand" style={{ width: pct + "%" }} /></div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span>总量 <span className="font-medium text-foreground">{asset.totalQuantity}</span></span>
              <span>已占用 <span className="font-medium text-foreground">{asset.occupied}</span></span>
              <span>可用 <span className={asset.available > 0 ? "font-medium text-brand" : "font-medium text-foreground"}>{asset.available}</span></span>
            </div>
          </li>;
        })}
      </ul>
    </section>
    <section aria-labelledby={`${id}-apply`} className="space-y-4 rounded-2xl border border-border bg-card p-4 sm:p-5">
      <header>
        <h2 id={`${id}-apply`} className="flex items-center gap-2 text-sm font-semibold"><Send className="h-4 w-4 text-brand" />申请资源</h2>
        <p className="mt-1 text-xs text-muted-foreground">选择有可用数量的资源并说明用途；教师批准后即计入占用。</p>
      </header>
      <form className="grid gap-3 sm:grid-cols-[minmax(0,1.4fr)_9rem_minmax(0,1.4fr)_auto]" onSubmit={(event) => { event.preventDefault(); if (!pending && requestAssetId && requestQuantity) void mutateRequest(null, { assetId: requestAssetId, quantity: Number(requestQuantity), purpose: requestPurpose }); }}>
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-asset`}>资源</Label>
          <Select id={`${id}-asset`} value={requestAssetId} disabled={pending || !applyOptions.length} onChange={(event) => setRequestAssetId(event.target.value)}>
            <option value="">{applyOptions.length ? "选择资源" : "暂无可用资源"}</option>
            {applyOptions.map((asset) => <option key={asset.id} value={asset.id}>{asset.name}（可用 {asset.available}）</option>)}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-qty`}>数量</Label>
          <Input id={`${id}-qty`} type="number" min={1} value={requestQuantity} disabled={pending} onChange={(event) => setRequestQuantity(event.target.value)} placeholder="数量" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-purpose`}>用途（选填）</Label>
          <Input id={`${id}-purpose`} value={requestPurpose} maxLength={500} disabled={pending} onChange={(event) => setRequestPurpose(event.target.value)} placeholder="用于哪个项目或任务" />
        </div>
        <div className="flex items-end"><Button type="submit" disabled={pending || !requestAssetId || !requestQuantity} className="w-full sm:w-auto">{pending ? "提交中…" : "提交申请"}<Send className="h-4 w-4" /></Button></div>
      </form>
    </section>
    <section aria-labelledby={`${id}-requests`} className="space-y-4 rounded-2xl border border-border bg-card p-4 sm:p-5">
      <header className="flex items-center justify-between gap-3">
        <h2 id={`${id}-requests`} className="flex items-center gap-2 text-sm font-semibold"><Check className="h-4 w-4 text-brand" />{canManage ? "申请审批" : "我的申请"}{requests && <span className="text-xs font-normal text-muted-foreground">{requestList.length} 条</span>}</h2>
      </header>
      {requests && !requestList.length && <p className="rounded-xl border border-dashed border-border p-5 text-center text-sm text-muted-foreground">{canManage ? "还没有成员申请资源。" : "你还没有申请过资源。"}</p>}
      <ul className="space-y-2">
        {requestList.map((request) => {
          const meta = STATUS_META[request.status];
          return <li key={request.id} className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-border p-4">
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">{request.assetName}</span>
                <Badge variant={meta.variant}>{meta.label}</Badge>
              </div>
              <p className="text-xs text-muted-foreground">申请数量 {request.quantity}{request.applicantName ? ` · ${request.applicantName}` : ""}</p>
              {request.purpose && <p className="break-words text-xs">用途：{request.purpose}</p>}
            </div>
            <div className="flex shrink-0 flex-wrap gap-1">
              {request.canWithdraw && <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => void mutateRequest(request, { op: "withdraw", version: request.version })}>撤回</Button>}
              {request.canDecide && <>
                <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => void mutateRequest(request, { op: "decide", version: request.version, decision: "reject" })}>拒绝</Button>
                <Button type="button" size="sm" disabled={pending} onClick={() => void mutateRequest(request, { op: "decide", version: request.version, decision: "approve" })}>批准</Button>
              </>}
              {request.status === "approved" && (request.applicantId === actorId || canManage) && <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => void mutateRequest(request, { op: "return", version: request.version })}><RotateCcw className="h-3.5 w-3.5" />归还</Button>}
            </div>
          </li>;
        })}
      </ul>
      <FormFeedback message={error} />
    </section>
    <Dialog.Root open={!!editing || !!deleting} onOpenChange={(open) => { if (!open && !pending) { setEditing(null); setDeleting(null); setError(""); } }}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay fixed inset-0 z-[70] bg-black/40" />
        <Dialog.Content aria-describedby={`${id}-asset-desc`} onEscapeKeyDown={(event) => { if (pending) event.preventDefault(); }} onPointerDownOutside={(event) => { if (pending) event.preventDefault(); }} className="dialog-surface fixed left-1/2 top-1/2 z-[70] flex max-h-[85dvh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col rounded-2xl border border-border bg-card p-5 shadow-xl">
          {deleting ? <>
            <Dialog.Title className="text-lg font-semibold">删除资源</Dialog.Title>
            <Dialog.Description id={`${id}-asset-desc`} className="my-3 text-xs leading-5 text-muted-foreground">将删除“{deleting.name}”。已处理的申请记录会一并移除。</Dialog.Description>
            <div className="mt-2 flex justify-end gap-2">
              <Button type="button" variant="outline" disabled={pending} onClick={() => { setDeleting(null); setError(""); }}>取消</Button>
              <Button type="button" variant="destructive" disabled={pending} onClick={() => void deleteAssetMutation(deleting)}>{pending ? "删除中…" : "确认删除"}</Button>
            </div>
          </> : editing && <AssetEditor editing={editing} pending={pending} id={id} error={error} onCancel={() => { setEditing(null); setError(""); }} onSave={(patch) => void mutateAsset(editing.asset ?? null, patch)} />}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  </main>;
}

function AssetEditor({ editing, pending, id, error, onCancel, onSave }: {
  editing: { asset?: AssetDTO }; pending: boolean; id: string; error: string; onCancel: () => void;
  onSave: (patch: object) => void;
}) {
  const asset = editing.asset;
  const [name, setName] = useState(asset?.name ?? "");
  const [totalQuantity, setTotalQuantity] = useState(asset ? String(asset.totalQuantity) : "");
  const [note, setNote] = useState(asset?.note ?? "");
  const dirty = asset ? name !== asset.name || Number(totalQuantity) !== asset.totalQuantity || note !== asset.note : !!(name || totalQuantity);
  return <>
    <Dialog.Title className="text-lg font-semibold">{asset ? "编辑资源" : "录入资源"}</Dialog.Title>
    <Dialog.Description id={`${id}-asset-desc`} className="my-3 text-xs leading-5 text-muted-foreground">填写资源类型与总量，成员可按可用数量申请。</Dialog.Description>
    <div className="space-y-4">
      <div className="space-y-1.5"><Label htmlFor={`${id}-name`}>资源名称</Label><Input id={`${id}-name`} value={name} maxLength={80} disabled={pending} onChange={(event) => setName(event.target.value)} placeholder="如 RTX 4090 显卡、实验工位" /></div>
      <div className="space-y-1.5"><Label htmlFor={`${id}-qty`}>总量</Label><Input id={`${id}-qty`} type="number" min={1} value={totalQuantity} disabled={pending} onChange={(event) => setTotalQuantity(event.target.value)} placeholder="数量" /></div>
      <div className="space-y-1.5"><Label htmlFor={`${id}-note`}>备注（选填）</Label><Textarea id={`${id}-note`} rows={3} maxLength={500} value={note} disabled={pending} onChange={(event) => setNote(event.target.value)} placeholder="型号、位置或使用说明" /></div>
      <FormFeedback message={error} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" disabled={pending} onClick={onCancel}>取消</Button>
        <Button type="button" disabled={pending || !name.trim() || !Number(totalQuantity)} onClick={() => onSave(asset ? { version: asset.version, name: name.trim(), totalQuantity: Number(totalQuantity), note } : { name: name.trim(), totalQuantity: Number(totalQuantity), note })}>{pending ? "保存中…" : "保存"}</Button>
      </div>
    </div>
  </>;
}
