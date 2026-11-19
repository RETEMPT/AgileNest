"use client";

import { useState, useEffect } from "react";
import {
  Github,
  Star,
  GitFork,
  GitBranch,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  BookOpen,
  Loader2,
  Code2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ResourceMarkdown } from "@/modules/resources/ui";

export type ProjectRepoCardProps = {
  owner: string;
  repo: string;
  url: string;
  description?: string | null;
};

type RepoMeta = {
  stars?: number;
  forks?: number;
  branch: string;
  language: string;
  description?: string;
};

export function ProjectRepoCard({
  owner,
  repo,
  url,
  description: initialDesc,
}: ProjectRepoCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [loadingReadme, setLoadingReadme] = useState(false);
  const [readmeText, setReadmeText] = useState<string | null>(null);
  const [meta, setMeta] = useState<RepoMeta>({
    branch: "main",
    language: "TypeScript",
    description: initialDesc?.replace(/^.*https?:\/\/github\.com\/[^\s]+/, "").trim() || undefined,
  });

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);

    fetch(`https://api.github.com/repos/${owner}/${repo}`, {
      signal: controller.signal,
      headers: { Accept: "application/vnd.github.v3+json" },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data && typeof data === "object") {
          setMeta((prev) => ({
            stars: typeof data.stargazers_count === "number" ? data.stargazers_count : prev.stars,
            forks: typeof data.forks_count === "number" ? data.forks_count : prev.forks,
            branch: data.default_branch || prev.branch,
            language: data.language || prev.language,
            description: data.description || prev.description,
          }));
        }
      })
      .catch(() => {
        // 离线或受限时静默保留默认元数据
      })
      .finally(() => clearTimeout(timeout));

    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(timeout);
    };
  }, [owner, repo]);

  const handleToggleReadme = async () => {
    if (expanded) {
      setExpanded(false);
      return;
    }

    setExpanded(true);
    if (readmeText) return;

    setLoadingReadme(true);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    try {
      // 优先从 raw.githubusercontent.com 获取，不受 api.github.com 的 60 次/小时频限限制
      const res = await fetch(
        `https://raw.githubusercontent.com/${owner}/${repo}/HEAD/README.md`,
        { signal: controller.signal }
      );
      if (res.ok) {
        const text = await res.text();
        setReadmeText(text);
      } else {
        setReadmeText(
          `### 无法实时获取 README\n\nGitHub 返回状态码：\`${res.status}\`。\n\n请直接访问代码仓库查看最新文档：\n[${url}](${url})`
        );
      }
    } catch {
      setReadmeText(
        `### 网络连接超时或离线\n\n当前未能连接到 GitHub Raw 内容源。\n\n你可稍后重试，或直接点击上方 **在 GitHub 打开 ↗** 查看完整仓库。`
      );
    } finally {
      clearTimeout(timeout);
      setLoadingReadme(false);
    }
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border p-5">
        <div className="flex items-center gap-2">
          <Github className="h-5 w-5 text-foreground" />
          <h2 className="font-semibold">关联代码仓库</h2>
          <span className="rounded-full bg-brand-soft px-2 py-0.5 text-xs font-medium text-brand">
            GitHub
          </span>
        </div>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline"
        >
          在 GitHub 打开 <ExternalLink className="h-3 w-3" />
        </a>
      </div>

      <div className="p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm font-semibold text-foreground">
                {owner}/{repo}
              </span>
            </div>
            {meta.description && (
              <p className="mt-1 text-xs leading-5 text-muted-foreground line-clamp-2">
                {meta.description}
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            <Badge variant="secondary" className="gap-1 font-mono text-[11px]">
              <GitBranch className="h-3 w-3" />
              {meta.branch}
            </Badge>
            {meta.language && (
              <Badge variant="secondary" className="gap-1 text-[11px]">
                <Code2 className="h-3 w-3" />
                {meta.language}
              </Badge>
            )}
            {typeof meta.stars === "number" && (
              <Badge variant="secondary" className="gap-1 text-[11px]">
                <Star className="h-3 w-3" />
                {meta.stars}
              </Badge>
            )}
            {typeof meta.forks === "number" && (
              <Badge variant="secondary" className="gap-1 text-[11px]">
                <GitFork className="h-3 w-3" />
                {meta.forks}
              </Badge>
            )}
          </div>
        </div>

        <div className="pt-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleToggleReadme}
            className="w-full justify-between text-xs"
          >
            <span className="inline-flex items-center gap-1.5">
              <BookOpen className="h-3.5 w-3.5 text-brand" />
              {expanded ? "收起项目说明 (README)" : "展开项目说明 (README)"}
            </span>
            {loadingReadme ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : expanded ? (
              <ChevronUp className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>

        {expanded && (
          <div className="mt-3 overflow-hidden rounded-xl border border-border bg-muted/20">
            <div className="flex items-center justify-between border-b border-border/70 bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              <span className="font-mono">README.md · 仓库正文预览</span>
              <a
                href={`${url}/blob/${meta.branch}/README.md`}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-brand inline-flex items-center gap-1"
              >
                源码 <ExternalLink className="h-3 w-3" />
              </a>
            </div>

            <div className="max-h-96 overflow-y-auto p-4 text-xs leading-6">
              {loadingReadme ? (
                <div className="flex items-center justify-center py-10 text-muted-foreground">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin text-brand" />
                  <span>正在从 GitHub 获取项目 README...</span>
                </div>
              ) : readmeText ? (
                <ResourceMarkdown
                  text={readmeText}
                  compact
                  idPrefix={`repo-readme-${repo}`}
                />
              ) : null}
            </div>

            <div className="border-t border-border/70 bg-muted/30 px-3 py-2 text-right">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setExpanded(false)}
                className="h-7 text-xs text-muted-foreground hover:text-foreground"
              >
                收起预览
              </Button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
