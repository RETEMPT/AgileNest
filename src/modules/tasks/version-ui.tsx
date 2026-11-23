"use client";

import { useState } from "react";
import { History, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { FormFeedback, useFeedback } from "@/components/ui/feedback";
import { saveTaskVersionAction } from "./actions";
import type { TaskVersionDTO } from "./version-service";

function formatTime(iso: string) {
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function TaskVersionHistory({
  taskId,
  initialVersions,
  currentContent,
}: {
  taskId: string;
  initialVersions: TaskVersionDTO[];
  currentContent: string;
}) {
  const notify = useFeedback();
  const [versions, setVersions] = useState<TaskVersionDTO[]>(initialVersions);
  const [selectedId, setSelectedId] = useState<string | null>(initialVersions[0]?.id ?? null);
  const [content, setContent] = useState(currentContent);
  const [remark, setRemark] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  const selected = versions.find((version) => version.id === selectedId) ?? versions[0] ?? null;

  async function submit() {
    if (!content.trim()) return;
    setPending(true);
    setError("");
    try {
      const result = await saveTaskVersionAction(taskId, { content, remark });
      if (result.error) {
        setError(result.error);
        return;
      }
      if (result.versions) {
        setVersions(result.versions);
        setSelectedId(result.versions[0]?.id ?? null);
      }
      setRemark("");
      notify(result.ok || "已记录新版本");
    } catch {
      setError("保存失败，请重试");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <h2 className="font-display text-sm font-semibold text-foreground">任务版本历史</h2>
          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
            {versions.length} 个版本
          </span>
        </div>
        <span className="text-[11px] text-muted-foreground">记录任务内容快照，可回看与切换</span>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
        <div className="space-y-1.5">
          {versions.length ? (
            <ul className="space-y-1.5">
              {versions.map((version) => (
                <li key={version.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(version.id)}
                    aria-pressed={selected?.id === version.id}
                    className={`w-full rounded-lg border p-3 text-left transition ${
                      selected?.id === version.id
                        ? "border-brand/40 bg-brand-soft/50"
                        : "border-border bg-background hover:bg-accent"
                    }`}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium">版本 v{version.version}</span>
                      <span className="text-[11px] tabular-nums text-muted-foreground">
                        {formatTime(version.createdAt)}
                      </span>
                    </span>
                    {version.remark ? (
                      <p className="mt-1 truncate text-xs text-muted-foreground">{version.remark}</p>
                    ) : null}
                    <p className="mt-0.5 text-[11px] text-muted-foreground">{version.authorName || "未知成员"}</p>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
              还没有版本记录，可先记录当前任务内容作为第一个版本。
            </p>
          )}
        </div>

        <div className="space-y-4">
          {selected ? (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-medium">版本 v{selected.version} 内容</p>
                <p className="text-[11px] text-muted-foreground">
                  {selected.authorName || "未知成员"} · {formatTime(selected.createdAt)}
                  {selected.remark ? ` · ${selected.remark}` : ""}
                </p>
              </div>
              <Textarea value={selected.content} readOnly rows={8} className="bg-muted/30" />
            </div>
          ) : null}

          <div className="border-t border-border pt-4">
            <p className="text-sm font-medium">新建版本</p>
            <div className="mt-2 space-y-3">
              <label className="block space-y-1.5">
                <span className="text-xs text-muted-foreground">版本内容</span>
                <Textarea
                  value={content}
                  onChange={(event) => setContent(event.target.value)}
                  rows={5}
                  maxLength={20000}
                  placeholder="记录当前任务的内容或需求快照"
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs text-muted-foreground">备注（可选）</span>
                <Input
                  value={remark}
                  onChange={(event) => setRemark(event.target.value)}
                  maxLength={500}
                  placeholder="例如：完成需求评审后的定稿"
                />
              </label>
              <FormFeedback message={error} />
              <Button
                type="button"
                size="sm"
                onClick={() => void submit()}
                loading={pending}
                disabled={pending || !content.trim()}
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                记录新版本
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
