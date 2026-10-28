"use client";

import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { safeResourceUrl } from "./client";

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function highlightMentions(part: string, mentions: readonly string[]) {
  if (!mentions.length) return part;
  const pattern = new RegExp(`(@(?:${[...mentions].sort((left, right) => right.length - left.length).map(escapeRegExp).join("|")}))`, "g");
  const chunks = part.split(pattern);
  if (chunks.length === 1) return part;
  return chunks.map((chunk, index) => chunk.startsWith("@") && mentions.includes(chunk.slice(1))
    ? <mark key={`${part}-${index}`} className="rounded-sm bg-accent/10 px-0.5 font-medium text-accent">{chunk}</mark>
    : chunk);
}

function inline(text: string, mentions: readonly string[] = []): ReactNode[] {
  return text.split(/(`[^`]+`|\*\*[^*]+\*\*|~~[^~]+~~|\*[^*]+\*|!?\[[^\]]+\]\([^\s)]+\))/g).map((part, i) => {
    if (part.startsWith("`") && part.endsWith("`")) return <code key={i} className="rounded bg-muted px-1.5 py-0.5 text-[0.9em]">{part.slice(1, -1)}</code>;
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("~~") && part.endsWith("~~")) return <del key={i}>{part.slice(2, -2)}</del>;
    if (part.startsWith("*") && part.endsWith("*")) return <em key={i}>{part.slice(1, -1)}</em>;
    const link = part.match(/^(!?)\[([^\]]+)\]\(([^)]+)\)$/);
    // Remote images remain explicit links so viewing a document does not fetch third-party content.
    if (link && safeResourceUrl(link[3])) return <a key={i} href={link[3]} target="_blank" rel="noopener noreferrer" className="text-brand underline underline-offset-4">{link[1] ? `图片：${link[2]}` : link[2]}</a>;
    return highlightMentions(part, mentions);
  });
}

function tableCells(line: string) {
  return line.trim().replace(/^\|/, "").replace(/\|$/, "").split(/(?<!\\)\|/).map((cell) => cell.trim().replace(/\\\|/g, "|"));
}

export function ResourceMarkdown({ text, idPrefix = "resource", compact = false, mentions = [] }: { text: string; idPrefix?: string; compact?: boolean; mentions?: readonly string[] }) {
  const [largeText, setLargeText] = useState(false);
  const [wide, setWide] = useState(false);
  const headings: { id: string; label: string; level: number }[] = [];
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  const renderInline = (value: string) => inline(value, mentions);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const start = i;
    const id = `${idPrefix}-line-${i + 1}`;
    if (!line.trim()) continue;
    const fence = line.match(/^\s*(`{3,}|~{3,})([^\s]*)\s*$/);
    if (fence) {
      const code: string[] = [];
      while (++i < lines.length && !new RegExp(`^\\s*${fence[1][0]}{${fence[1].length},}\\s*$`).test(lines[i])) code.push(lines[i]);
      blocks.push(<div key={start} id={id} className="overflow-hidden rounded-lg border border-border">{fence[2] && <div className="border-b border-border bg-muted px-4 py-1.5 text-xs text-muted-foreground">{fence[2]}</div>}<pre className="overflow-x-auto bg-muted/40 p-4 text-xs leading-6"><code>{code.join("\n")}</code></pre></div>);
      continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.+?)(?:\s+#+)?$/);
    if (heading) {
      headings.push({ id, label: heading[2], level: heading[1].length });
      const Tag = `h${heading[1].length}` as "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
      blocks.push(<Tag key={i} id={id} className={`scroll-mt-4 font-semibold ${heading[1].length <= 2 ? compact ? "pt-2 text-base" : "border-b border-border pb-2 pt-4 text-xl" : compact ? "pt-1 text-sm" : "pt-4 text-base"}`}>{renderInline(heading[2])}</Tag>);
      continue;
    }
    if (line.includes("|") && i + 1 < lines.length && tableCells(lines[i + 1]).every((cell) => /^:?-{3,}:?$/.test(cell))) {
      const header = tableCells(line); const alignment = tableCells(lines[++i]); const rows: string[][] = [];
      while (i + 1 < lines.length && lines[i + 1].trim() && lines[i + 1].includes("|")) rows.push(tableCells(lines[++i]));
      const align = (column: number) => alignment[column]?.startsWith(":") && alignment[column]?.endsWith(":") ? "text-center" : alignment[column]?.endsWith(":") ? "text-right" : "text-left";
      blocks.push(<div key={start} id={id} className="overflow-x-auto rounded-lg border border-border"><table className="min-w-full text-sm"><thead className="bg-muted/50"><tr>{header.map((cell, column) => <th key={column} className={`border-b border-border px-3 py-2 font-semibold ${align(column)}`}>{renderInline(cell)}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={index} className="border-b border-border last:border-0 even:bg-muted/20">{header.map((_, column) => <td key={column} className={`px-3 py-2 ${align(column)}`}>{renderInline(row[column] ?? "")}</td>)}</tr>)}</tbody></table></div>);
      continue;
    }
    const list = line.match(/^\s*([-*+]\s+|\d+[.)]\s+)(.*)$/);
    if (list) {
      const ordered = /^\d/.test(list[1]); const items: ReactNode[] = [];
      do {
        const entry = lines[i].match(/^\s*([-*+]\s+|\d+[.)]\s+)(.*)$/);
        if (!entry || /^\d/.test(entry[1]) !== ordered) break;
        const check = entry[2].match(/^\[([ xX])\]\s*(.*)$/);
        items.push(<li key={i} id={`${idPrefix}-line-${i + 1}`} className={check ? "list-none" : "pl-1"}>{check ? <><span aria-label={check[1] === " " ? "未勾选" : "已勾选"} className="mr-2 text-brand">{check[1] === " " ? "□" : "☑"}</span>{renderInline(check[2])}</> : renderInline(entry[2])}</li>);
        i++;
      } while (i < lines.length);
      i--;
      blocks.push(ordered ? <ol key={start} start={Number.parseInt(list[1])} className="list-decimal space-y-1 pl-6">{items}</ol> : <ul key={start} className="list-disc space-y-1 pl-6">{items}</ul>);
      continue;
    }
    if (/^>\s?/.test(line)) {
      const quotes = [line.replace(/^>\s?/, "")];
      while (i + 1 < lines.length && /^>\s?/.test(lines[i + 1])) quotes.push(lines[++i].replace(/^>\s?/, ""));
      blocks.push(<blockquote key={start} id={id} className="whitespace-pre-wrap border-l-4 border-brand/30 pl-4 text-muted-foreground">{renderInline(quotes.join("\n"))}</blockquote>);
    } else if (/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) blocks.push(<hr key={i} className="border-border" />);
    else blocks.push(<p key={i} id={id} className="whitespace-pre-wrap">{renderInline(line)}</p>);
  }
  if (compact) return <div className="min-w-0 space-y-2 break-words text-sm leading-6 [overflow-wrap:anywhere]">{blocks}</div>;
  return <div className="min-w-0 space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
      <span className="text-xs text-muted-foreground">正文阅读</span>
      <div className="flex flex-wrap gap-2" aria-label="阅读设置">
        <Button type="button" size="sm" variant="outline" aria-pressed={largeText} onClick={() => setLargeText(!largeText)}>大字号</Button>
        <Button type="button" size="sm" variant="outline" aria-pressed={wide} onClick={() => setWide(!wide)}>宽版阅读</Button>
      </div>
    </div>
    {headings.length > 0 && <details className="rounded-lg border border-border bg-muted/20 px-4 py-3">
      <summary className="cursor-pointer text-sm font-medium focus-visible:outline-2 focus-visible:outline-brand">文章目录 · {headings.length} 节</summary>
      <nav aria-label="文章目录" className="mt-3 max-h-64 overflow-y-auto">
        <ol className="space-y-1">{headings.map((heading) => <li key={heading.id} style={{ paddingInlineStart: `${(heading.level - 1) * 12}px` }}>
          <a href={`#${heading.id}`} className="block rounded px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-brand">{heading.label}</a>
        </li>)}</ol>
      </nav>
    </details>}
    <article aria-label="资料正文" className={`mx-auto min-w-0 space-y-4 break-words leading-8 [overflow-wrap:anywhere] ${wide ? "max-w-none" : "max-w-3xl"} ${largeText ? "text-lg" : "text-sm"}`}>{blocks}</article>
  </div>;
}

export function ResourceSource({ text, idPrefix = "resource-source" }: { text: string; idPrefix?: string }) {
  const [page, setPage] = useState(0);
  const lines = text.split("\n"); const pages = Math.ceil(lines.length / 200);
  return <div className="space-y-3">{pages > 1 && <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground"><span>第 {page + 1} / {pages} 页 · {lines.length} 行</span><div className="flex gap-2"><Button type="button" variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>上一页</Button><Button type="button" variant="outline" size="sm" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>下一页</Button></div></div>}<div aria-label="文件源码" className="overflow-x-auto rounded-lg border border-border bg-muted/20 py-3 font-mono text-xs leading-6">{lines.slice(page * 200, (page + 1) * 200).map((line, index) => {
    const number = page * 200 + index + 1;
    return <div key={number} id={`${idPrefix}-line-${number}`} className="flex min-w-max hover:bg-accent/50"><span aria-label={`第 ${number} 行`} className="sticky left-0 w-14 shrink-0 select-none border-r border-border bg-card pr-3 text-right text-muted-foreground">{number}</span><span className="whitespace-pre px-4">{line || " "}</span></div>;
  })}</div></div>;
}
