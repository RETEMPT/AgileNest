"use client";
import { useActionState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { markReadAction } from "./actions";
import { NOTIFICATIONS_CHANGED_EVENT } from "./dock";
export { NotificationDockPanel, useNotificationFeed } from "./dock";

export function MarkReadButton({ id }: { id: string }) {
  const [state, action, pending] = useActionState(markReadAction, null);
  useEffect(() => {
    if (state?.error === "") window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED_EVENT));
  }, [state]);
  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <Button size="sm" variant="ghost" disabled={pending} loading={pending}>
        {pending ? "更新中…" : "标为已读"}
      </Button>
      {state?.error && (
        <p role="alert" className="text-xs text-destructive">
          {state.error}
        </p>
      )}
    </form>
  );
}
