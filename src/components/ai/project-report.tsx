"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { accountFetch } from "@/components/account-request";
import { projectReportResultSchema, type ProjectReportRequest } from "@/modules/ai/client";

const KINDS = ["weekly", "defense"] as const;

export function ProjectReport({ projectId }: { projectId: string }) {
  const [kind, setKind] = useState<ProjectReportRequest["kind"]>("weekly");
  const [brief, setBrief] = useState("");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<{ text: string; model: string } | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  async function generate() {
    setPending(true);
    setError("");
    setResult(null);
    setCopied(false);
    try {
      const response = await accountFetch("/api/v1/ai/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, kind, brief }),
        cache: "no-store",
      });
      const value: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const message = value && typeof value === "object" && "error" in value && typeof (value as { error: unknown }).error === "string"
          ? (value as { error: string }).error
          : "报告生成失败，请稍后重试";
        throw new Error(message);
      }
      setResult(projectReportResultSchema.parse(value));
    } catch (err) {
      setError(err instanceof Error ? err.message : "报告生成失败，请稍后重试");
    } finally {
      setPending(false);
    }
  }

  async function copy() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.text);
      setCopied(true);
    } catch {
      setError("复制失败，请手动选择正文复制");
    }
  }

  function downloadMarkdown() {
    if (!result) return;
    const blob = new Blob([result.text], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${kind === "weekly" ? "项目周报" : "答辩讲稿"}.md`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="rounded-xl border border-border bg-card" aria-labelledby="report-heading">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div>
          <h2 id="report-heading" className="font-display text-base font-semibold">AI 项目报告</h2>
          <p className="mt-1 text-xs text-muted-foreground">由模型根据当前项目数据生成周报或答辩稿，请核对后使用</p>
        </div>
        <Sparkles className="h-4 w-4 text-brand" aria-hidden="true" />
      </div>
      <div className="space-y-3 px-4 py-4">
        <div className="flex flex-wrap items-center gap-2">
          {KINDS.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setKind(item)}
              aria-pressed={kind === item}
              className={`rounded-full border px-3 py-1 text-xs transition-colors ${kind === item ? "border-brand bg-brand/10 text-brand" : "border-border text-muted-foreground hover:bg-accent"}`}
            >
              {item === "weekly" ? "项目周报" : "答辩讲稿"}
            </button>
          ))}
          <Button size="sm" onClick={generate} loading={pending} disabled={pending}>
            生成{kind === "weekly" ? "周报" : "讲稿"}
          </Button>
        </div>
        <label className="block space-y-1">
          <span className="text-xs text-muted-foreground">补充说明（可选，最多 2000 字）</span>
          <textarea
            className="min-h-16 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
            maxLength={2000}
            value={brief}
            disabled={pending}
            placeholder="例如：重点说明本周完成的需求分析，下周进入开发"
            onChange={(event) => setBrief(event.target.value)}
          />
        </label>
        {pending && <p role="status" className="text-xs text-muted-foreground">模型正在整理项目数据并撰写报告…</p>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {result && (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">来自模型 {result.model}</p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={copy}>{copied ? "已复制" : "复制全文"}</Button>
                <Button size="sm" variant="outline" onClick={downloadMarkdown}>下载 .md</Button>
              </div>
            </div>
            <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-lg bg-muted/40 p-3 text-sm leading-relaxed">{result.text}</pre>
          </div>
        )}
      </div>
    </section>
  );
}
