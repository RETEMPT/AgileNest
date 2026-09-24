import { ModulePlaceholder } from "@/components/ui/placeholder";

export default function StudentHome() {
  return (
    <main className="space-y-6">
      <header>
        <h1 className="font-display text-2xl font-semibold">今日工作台</h1>
        <p className="text-sm text-muted-foreground">
          待认领 · 进行中 · 待修改 · 本周节点 —— 一条主循环：认领 → 做事 → 提交 → 验收。
        </p>
      </header>
      <ModulePlaceholder
        title="学生工作台（Owner C）"
        owner="C · 前端2"
        branch="feature/review-portal"
        doc="src/modules/review/index.ts → listMyTodo / listMyInProgress / listMyRejected"
      />
    </main>
  );
}
