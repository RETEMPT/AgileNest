"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { CheckCircle2, CircleAlert, X } from "lucide-react";
import { Button } from "./button";
import { cn } from "@/lib/utils";

type Notice = { id: number; message: string; expiresAt: number };
const FeedbackContext = createContext<(message: string) => void>(() => {});

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [notices, setNotices] = useState<Notice[]>([]);
  const nextId = useRef(0);
  const notify = useCallback((message: string) => {
    const item = { id: ++nextId.current, message, expiresAt: Date.now() + 6000 };
    setNotices((items) => [...items.filter((notice) => notice.message !== message), item].slice(-3));
  }, []);
  const dismiss = useCallback((id: number) => setNotices((items) => items.filter((item) => item.id !== id)), []);
  useEffect(() => {
    const timers = notices.map((notice) => window.setTimeout(() => dismiss(notice.id), Math.max(0, notice.expiresAt - Date.now())));
    return () => timers.forEach(window.clearTimeout);
  }, [notices, dismiss]);
  return (
    <FeedbackContext.Provider value={notify}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2 sm:bottom-6 sm:right-6" aria-label="操作反馈">
        {notices.map((notice) => (
          <div key={notice.id} role="status" className="feedback-toast pointer-events-auto flex items-start gap-3 rounded-xl border border-brand/20 bg-card p-3.5 shadow-lg">
            <CheckCircle2 aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
            <p className="flex-1 break-words text-sm leading-5">{notice.message}</p>
            <Button type="button" variant="ghost" size="icon" className="-mr-1 -mt-1 h-7 w-7 shrink-0 text-muted-foreground" aria-label={`关闭反馈：${notice.message}`} onClick={() => dismiss(notice.id)}><X aria-hidden="true" className="h-3.5 w-3.5" /></Button>
          </div>
        ))}
      </div>
    </FeedbackContext.Provider>
  );
}

export function useFeedback() { return useContext(FeedbackContext); }

export function FormFeedback({ message, tone = "error", className }: { message?: string; tone?: "error" | "success"; className?: string }) {
  if (!message) return null;
  const Icon = tone === "error" ? CircleAlert : CheckCircle2;
  return <div role={tone === "error" ? "alert" : "status"} className={cn("feedback-inline flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm leading-5", tone === "error" ? "border-destructive/20 bg-destructive/5 text-destructive" : "border-brand/15 bg-brand-soft text-brand", className)}><Icon aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" /><p className="min-w-0 whitespace-pre-wrap break-words">{message}</p></div>;
}
