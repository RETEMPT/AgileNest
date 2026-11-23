"use client";

import { useRef, useState } from "react";
import { FileArchive, FileText, Image as ImageIcon, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormFeedback, useFeedback } from "@/components/ui/feedback";
import type { PublicFileDTO } from "./client";

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTime(iso: string) {
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function FileIcon({ mimeType }: { mimeType: string }) {
  if (mimeType.startsWith("image/")) return <ImageIcon className="h-4 w-4" aria-hidden="true" />;
  if (mimeType === "application/zip") return <FileArchive className="h-4 w-4" aria-hidden="true" />;
  return <FileText className="h-4 w-4" aria-hidden="true" />;
}

async function readError(response: Response): Promise<string> {
  try {
    const data = (await response.json()) as { error?: string };
    return data.error || "请求失败";
  } catch {
    return "请求失败";
  }
}

export function PublicFilesLibrary({ initialFiles }: { initialFiles: PublicFileDTO[] }) {
  const notify = useFeedback();
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<PublicFileDTO[]>(initialFiles);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function upload(selected: File) {
    setPending(true);
    setError("");
    try {
      const form = new FormData();
      form.append("file", selected);
      const response = await fetch("/api/v1/public-files", { method: "POST", body: form });
      if (!response.ok) {
        setError(await readError(response));
        return;
      }
      const data = (await response.json()) as { file: PublicFileDTO };
      setFiles((current) => [data.file, ...current]);
      notify("文件已上传到公共文件库");
    } catch {
      setError("上传失败，请重试");
    } finally {
      setPending(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function remove(file: PublicFileDTO) {
    setError("");
    try {
      const response = await fetch(`/api/v1/public-files/${file.id}`, { method: "DELETE" });
      if (!response.ok) {
        setError(await readError(response));
        return;
      }
      setFiles((current) => current.filter((item) => item.id !== file.id));
      notify("已删除文件");
    } catch {
      setError("删除失败，请重试");
    }
  }

  return (
    <main className="min-w-0 space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-semibold">公共文件库</h1>
          <p className="mt-1 text-sm text-muted-foreground">全站成员共享，登录即可上传与下载。</p>
        </div>
        <label className="ui-button inline-flex h-9 cursor-pointer items-center justify-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:bg-brand-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
          <Upload className="h-4 w-4" aria-hidden="true" />
          {pending ? "上传中…" : "上传文件"}
          <input
            ref={inputRef}
            type="file"
            className="sr-only"
            disabled={pending}
            accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.txt,.md,.markdown,.csv,.tsv,.json,.docx,.xlsx,.pptx,.zip"
            onChange={(event) => {
              const selected = event.target.files?.[0];
              if (selected) void upload(selected);
            }}
          />
        </label>
      </header>

      <FormFeedback message={error} />

      {files.length ? (
        <ul className="overflow-hidden rounded-2xl border border-border bg-card">
          {files.map((file, index) => (
            <li key={file.id} className={`flex items-center gap-3 p-4 ${index ? "border-t border-border" : ""}`}>
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand">
                <FileIcon mimeType={file.mimeType} />
              </span>
              <div className="min-w-0 flex-1">
                <a
                  href={`/api/v1/public-files/${file.id}?download=1`}
                  className="block truncate text-sm font-medium hover:text-brand"
                  title={file.fileName}
                >
                  {file.fileName}
                </a>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {formatSize(file.size)} · {file.uploaderName || "未知成员"} · {formatTime(file.createdAt)}
                </p>
              </div>
              {file.canDelete && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`删除 ${file.fileName}`}
                  onClick={() => void remove(file)}
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card/50 px-6 py-14 text-center">
          <p className="text-sm font-medium">公共文件库还是空的</p>
          <p className="mt-1 text-xs text-muted-foreground">上传第一个文件，全站成员即可下载。</p>
        </div>
      )}
    </main>
  );
}
