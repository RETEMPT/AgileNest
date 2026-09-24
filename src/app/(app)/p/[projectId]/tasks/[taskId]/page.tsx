import { ModulePlaceholder } from "@/components/ui/placeholder";

export default function TaskDetailPage() {
  return (
    <ModulePlaceholder
      title="任务详情（A + D）"
      owner="A · D"
      branch="feature/tasks-status + feature/worklog-stats"
      doc="src/modules/tasks/index.ts → getTaskDetail；src/modules/worklog"
    />
  );
}
