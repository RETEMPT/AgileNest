"use client";

import { useState } from "react";
import { Check, Copy, KeyRound, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useFeedback } from "@/components/ui/feedback";
import type { ApiTokenItem, CreatedApiToken } from "./token-service";

export function TokensSettings({
  initialTokens,
}: {
  initialTokens: ApiTokenItem[];
}) {
  const [tokens, setTokens] = useState<ApiTokenItem[]>(initialTokens);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [expiresInDays, setExpiresInDays] = useState<number | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [justCreated, setJustCreated] = useState<CreatedApiToken | null>(null);
  const [copied, setCopied] = useState(false);
  const notify = useFeedback();

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/v1/account/tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), expiresInDays }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "创建失败");
      setJustCreated(data.token);
      setTokens((prev) => [data.token, ...prev]);
      setName("");
      setExpiresInDays(undefined);
      setCreating(false);
      notify("访问令牌已生成");
    } catch (err) {
      notify(err instanceof Error ? err.message : "创建失败");
    } finally {
      setBusy(false);
    }
  }

  async function handleRevoke(id: string) {
    if (!confirm("确定要撤销此令牌吗？撤销后依赖此令牌的程序将无法访问。")) return;
    try {
      const res = await fetch(`/api/v1/account/tokens/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "撤销失败");
      }
      setTokens((prev) => prev.filter((t) => t.id !== id));
      notify("令牌已撤销");
    } catch (err) {
      notify(err instanceof Error ? err.message : "撤销失败");
    }
  }

  async function copyToken(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      notify("令牌已复制到剪贴板");
    } catch {
      notify("复制失败，请手动选择复制");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">个人访问令牌 (Personal API Tokens)</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            用于 Claude Code CLI、脚本或外部程序以您的身份调用 AgileCampus 开放接口。
          </p>
        </div>
        {!creating && !justCreated && (
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="mr-1.5 h-4 w-4" />
            生成新令牌
          </Button>
        )}
      </div>

      {justCreated && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-amber-900 dark:text-amber-100">
              新生成的访问令牌：{justCreated.name}
            </h3>
            <span className="text-xs text-amber-800 dark:text-amber-200">
              请立即保存，离开后将不再显示明文！
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Input
              readOnly
              value={justCreated.token}
              className="font-mono text-xs bg-background select-all"
              onFocus={(e) => e.target.select()}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => copyToken(justCreated.token)}
            >
              {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
              {copied ? "已复制" : "复制"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setJustCreated(null)}
            >
              完成
            </Button>
          </div>
        </div>
      )}

      {creating && (
        <form onSubmit={handleCreate} className="rounded-xl border border-border bg-card p-5 space-y-4">
          <h3 className="text-sm font-semibold">新建个人访问令牌</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs text-muted-foreground mb-1">令牌名称 / 用途</label>
              <Input
                placeholder="例如：Claude Code 脚本"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={100}
                required
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">有效期（天）</label>
              <Input
                type="number"
                placeholder="留空为永不过期"
                value={expiresInDays ?? ""}
                onChange={(e) => setExpiresInDays(e.target.value ? parseInt(e.target.value, 10) : undefined)}
                min={1}
                max={365}
              />
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setCreating(false)} disabled={busy}>
              取消
            </Button>
            <Button type="submit" size="sm" loading={busy} disabled={!name.trim()}>
              生成
            </Button>
          </div>
        </form>
      )}

      <div className="space-y-3">
        {tokens.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            <KeyRound className="mx-auto h-8 w-8 opacity-40 mb-2" />
            您尚未创建任何个人访问令牌。
          </div>
        ) : (
          tokens.map((token) => (
            <div
              key={token.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 transition hover:border-brand/30"
            >
              <div className="min-w-0 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{token.name}</span>
                  <code className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground font-mono">
                    {token.prefix}...
                  </code>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  <span>创建于：{new Date(token.createdAt).toLocaleDateString()}</span>
                  <span>
                    最后使用：
                    {token.lastUsedAt ? new Date(token.lastUsedAt).toLocaleString() : "从未使用"}
                  </span>
                  {token.expiresAt && (
                    <span className={new Date(token.expiresAt) < new Date() ? "text-rose-600" : ""}>
                      到期时间：{new Date(token.expiresAt).toLocaleDateString()}
                    </span>
                  )}
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-rose-600 hover:bg-rose-500/10 hover:text-rose-700"
                onClick={() => handleRevoke(token.id)}
              >
                <Trash2 className="h-4 w-4" />
                撤销
              </Button>
            </div>
          ))
        )}
      </div>

      <div className="rounded-xl border border-border bg-muted/40 p-4 text-xs text-muted-foreground space-y-1">
        <p className="font-medium text-foreground">如何使用访问令牌？</p>
        <p>
          在请求头中携带 <code className="rounded bg-muted px-1 py-0.5 font-mono">Authorization: Bearer &lt;TOKEN&gt;</code> 访问
          <code className="rounded bg-muted px-1 py-0.5 font-mono">/api/v1/agent/tasks</code> 即可自动以您的身份创建或管理任务。
        </p>
      </div>
    </div>
  );
}
