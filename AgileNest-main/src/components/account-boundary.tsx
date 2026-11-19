"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ACCOUNT_CHANGED_EVENT, ACCOUNT_CHANGED_MESSAGE, ACCOUNT_HEADER, ACCOUNT_STORAGE_KEY } from "./account-context";

export function AccountBoundary({ userId, children }: { userId: string; children: ReactNode }) {
  const [stale, setStale] = useState(false);
  const [checking, setChecking] = useState(false);
  const blocked = useRef(false);
  useEffect(() => {
    let disposed = false;
    let request: AbortController | null = null;
    const invalidate = () => { blocked.current = true; setStale(true); };
    const check = async () => {
      if (disposed || request || document.visibilityState === "hidden") return;
      blocked.current = true;
      setChecking(true);
      request = new AbortController();
      try {
        const response = await fetch("/api/v1/account", { cache: "no-store", headers: { [ACCOUNT_HEADER]: userId }, signal: request.signal });
        if (disposed) return;
        if (!response.ok) { window.dispatchEvent(new Event(ACCOUNT_CHANGED_EVENT)); return; }
        blocked.current = false;
        setChecking(false);
      } catch {
        if (!disposed) invalidate();
      } finally { request = null; }
    };
    const storage = (event: StorageEvent) => {
      if (event.key === ACCOUNT_STORAGE_KEY && event.newValue !== userId) window.dispatchEvent(new Event(ACCOUNT_CHANGED_EVENT));
    };
    window.addEventListener(ACCOUNT_CHANGED_EVENT, invalidate);
    window.addEventListener("storage", storage);
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    const interval = window.setInterval(check, 60000);
    try { localStorage.setItem(ACCOUNT_STORAGE_KEY, userId); } catch { /* Session checks also protect browsers without storage. */ }
    void check();
    return () => {
      disposed = true;
      request?.abort();
      window.clearInterval(interval);
      window.removeEventListener(ACCOUNT_CHANGED_EVENT, invalidate);
      window.removeEventListener("storage", storage);
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", check);
    };
  }, [userId]);
  if (stale) return <main className="grid min-h-dvh place-items-center bg-background p-6"><div role="alert" className="max-w-sm space-y-4 rounded-xl border border-border bg-card p-6 shadow-lg"><h1 className="text-lg font-semibold">请重新确认登录状态</h1><p className="text-sm text-muted-foreground">{ACCOUNT_CHANGED_MESSAGE}原账号的已保存草稿会继续保留。</p><button type="button" className="rounded-lg bg-brand px-4 py-2 text-sm text-white" onClick={() => window.location.reload()}>刷新页面</button><a className="ml-4 text-sm underline" href="/login">前往登录</a></div></main>;
  return <div data-agilenest-account={userId} onSubmitCapture={(event) => { if (blocked.current) { event.preventDefault(); event.stopPropagation(); } }} onClickCapture={(event) => { if (blocked.current) { event.preventDefault(); event.stopPropagation(); } }}>
    {checking && <div role="status" className="fixed top-0 right-0 left-0 z-[100] bg-brand px-4 py-2 text-center text-xs text-white">正在核对登录状态…</div>}
    {children}
  </div>;
}
