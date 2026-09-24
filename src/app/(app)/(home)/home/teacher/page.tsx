import { ModulePlaceholder } from "@/components/ui/placeholder";

export default function TeacherHome() {
  return (
    <main className="space-y-6">
      <header>
        <h1 className="font-display text-2xl font-semibold">教学监督台</h1>
        <p className="text-sm text-muted-foreground">
          待验收队列 · 逾期风险 · 项目完成度 —— 过程性评价有据可依。
        </p>
      </header>
      <ModulePlaceholder
        title="教师监督台（Owner C）"
        owner="C"
        branch="feature/review-portal"
        doc="src/modules/review/index.ts → listPendingReview / listOverdueRisks"
      />
    </main>
  );
}
