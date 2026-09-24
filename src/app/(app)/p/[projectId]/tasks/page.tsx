import { ModulePlaceholder } from "@/components/ui/placeholder";

export default function TasksPage() {
  return (
    <ModulePlaceholder
      title="任务池（Owner A）"
      owner="A · 后端"
      branch="feature/tasks-status"
      doc="src/modules/tasks/index.ts → listProjectTasks / createTask / transitionTask"
    />
  );
}
