"use client";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { markReadAction } from "./actions";

export function MarkReadButton({ id }: { id: string }) {
  const [state, action, pending] = useActionState(markReadAction, null);
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
