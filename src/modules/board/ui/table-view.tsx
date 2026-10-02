"use client";

import { useMemo } from "react";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef as TanColumnDef,
} from "@tanstack/react-table";
import { PriorityPill, StatusPill } from "@/components/ui/badge";
import type { TaskPriority, TaskStatus } from "@/db/schema";
import type { TaskDTO } from "@/modules/tasks";

export function TableView({ tasks }: { tasks: TaskDTO[] }) {
  const columns = useMemo<TanColumnDef<TaskDTO>[]>(
    () => [
      {
        accessorKey: "title",
        header: "标题",
        cell: (info) => <span className="font-medium">{info.getValue() as string}</span>,
      },
      {
        accessorKey: "status",
        header: "状态",
        cell: (info) => <StatusPill status={info.getValue() as TaskStatus} />,
      },
      {
        accessorKey: "priority",
        header: "优先级",
        cell: (info) => <PriorityPill priority={info.getValue() as TaskPriority} />,
      },
      {
        accessorKey: "assigneeName",
        header: "负责人",
        cell: (info) => (info.getValue() as string | null) ?? "—",
      },
      {
        accessorKey: "dueDate",
        header: "截止日期",
        cell: (info) => (info.getValue() as string | null) ?? "—",
      },
      {
        accessorKey: "milestoneId",
        header: "里程碑",
        cell: (info) => (info.getValue() as string | null) ?? "—",
      },
    ],
    [],
  );

  const table = useReactTable({
    data: tasks,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <table className="w-full text-sm">
        <thead>
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id} className="border-b border-border">
              {hg.headers.map((h) => (
                <th
                  key={h.id}
                  className="px-3 py-2 text-left font-medium text-muted-foreground"
                >
                  {flexRender(h.column.columnDef.header, h.getContext())}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr key={row.id} className="border-b border-border last:border-0 hover:bg-accent/40">
              {row.getVisibleCells().map((cell) => (
                <td key={cell.id} className="px-3 py-2">
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {tasks.length === 0 && (
        <div className="p-8 text-center text-sm text-muted-foreground">暂无任务</div>
      )}
    </div>
  );
}
