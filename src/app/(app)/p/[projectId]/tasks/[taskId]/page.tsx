import { ModulePlaceholder } from "@/components/ui/placeholder";

export default function TaskDetailPage() {
  return (
    <ModulePlaceholder
      title="任务详情（Owner A + D）"
      owner="A · 后端 / D · 工时"
      branch="feature/tasks-status + feature/worklog-stats"
      doc="src/modules/tasks/index.ts → getTaskDetail；src/modules/worklog/index.ts"
    />
  );
}
