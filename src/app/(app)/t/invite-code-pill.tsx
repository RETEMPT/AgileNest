"use client";

import { useState } from "react";

export function InviteCodePill({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      title="点击一键复制邀请码"
      className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/50 px-2 py-0.5 font-mono text-xs text-foreground hover:bg-muted transition"
    >
      <span>{code}</span>
      <span className="text-[10px] text-blue-600 font-sans font-medium">
        {copied ? "已复制 ✓" : "复制"}
      </span>
    </button>
  );
}
