"use client";

import { useState } from "react";
import type { TeamRole } from "@/db/schema";
import type { TaskDTO } from "@/modules/tasks";
import { TaskDrawer } from "@/components/cards/task-drawer";
import { Button } from "@/components/ui/button";

export function ReviewTaskDetails({ task, role, actorId }: {
  task: TaskDTO;
  role: TeamRole;
  actorId: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" size="sm" aria-label={`查看详情与修改历史：${task.title}`} onClick={() => setOpen(true)}>
        详情与修改历史
      </Button>
      <TaskDrawer task={task} role={role} actorId={actorId} isOpen={open} onClose={() => setOpen(false)} />
    </>
  );
}
