import { ModulePlaceholder } from "@/components/ui/placeholder";

export default function StatsPage() {
  return (
    <ModulePlaceholder
      title="工时 · 完成度 · 贡献（Owner D）"
      owner="D"
      branch="feature/worklog-stats"
      doc="src/modules/worklog/index.ts → completionRatio / taskHours / memberContribution"
    />
  );
}
