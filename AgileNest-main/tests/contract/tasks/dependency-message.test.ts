import { describe, expect, it } from "vitest";
import { taskDependencyMessage, taskEventNote } from "@/modules/tasks/client";

const pending = { id: "before", title: "接口规范", status: "in_progress" as const };

describe("前置任务等待说明", () => {
  it("没有等待时不显示限制说明", () => {
    expect(taskDependencyMessage({ blocked: false, blockedByIds: [pending.id] }, [pending])).toBeNull();
    expect(taskDependencyMessage({})).toBeNull();
  });
  it("旧任务摘要缺少名称时提供可理解的说明", () => {
    expect(taskDependencyMessage({ blocked: true })).toBe("等待其他任务验收通过；可以继续执行，提交、重交和验收需等这些任务全部通过。");
    expect(taskDependencyMessage({ blocked: true })).not.toMatch(/依赖|阻塞|前置|blocked/);
  });
  it("说明包含真实的前置任务名称", () => {
    expect(taskDependencyMessage({ blocked: true, blockedByIds: [pending.id] }, [pending])).toContain("「接口规范」");
    expect(taskDependencyMessage({ blocked: true, blockedByIds: [pending.id] }, [pending])).not.toMatch(/依赖|阻塞|前置|blocked/);
  });
  it("不把无关项目任务当作等待原因", () => {
    expect(taskDependencyMessage({ blocked: true, blockedByIds: [pending.id] }, [pending, { id: "other", title: "无关任务", status: "submitted" }])).not.toContain("无关任务");
  });
  it("已经验收的前置任务不再列为等待原因", () => {
    expect(taskDependencyMessage({ blocked: true, blockedByIds: [pending.id, "done"] }, [pending, { id: "done", title: "已完成设计", status: "accepted" }])).not.toContain("已完成设计");
  });
  it("待修改的前置任务仍需验收", () => {
    expect(taskDependencyMessage({ blocked: true, blockedByIds: [pending.id] }, [{ ...pending, status: "rejected" }])).toContain("「接口规范」");
  });
  it("未取得名称时不暴露内部编号", () => {
    expect(taskDependencyMessage({ blocked: true, blockedByIds: ["unresolved-internal-id"] }, [])).not.toContain("unresolved-internal-id");
  });
  it("等待说明不会修改权限摘要和项目任务", () => {
    const task = Object.freeze({ blocked: true, blockedByIds: [pending.id] });
    const tasks = Object.freeze([Object.freeze(pending)]);
    expect(taskDependencyMessage(task, tasks)).toContain("可以继续执行");
    expect(tasks).toHaveLength(1);
  });
});

describe("历史任务先后活动的展示副本", () => {
  it.each([
    ["新增前置依赖：资料整理", "设置需要先完成的任务：资料整理"],
    ["解除前置依赖：资料整理", "取消需要先完成的任务：资料整理"],
    ["新增后续依赖：报告提交", "设置接下来进行的任务：报告提交"],
    ["解除后续依赖：报告提交", "取消接下来进行的任务：报告提交"],
  ])("只翻译已知系统活动 %s", (before, after) => {
    expect(taskEventNote("update", before)).toBe(after);
  });
  it("提交说明和评审意见即使匹配旧前缀也保持原文", () => {
    for (const action of ["submit", "resubmit", "accept", "reject", "reopen"]) {
      expect(taskEventNote(action, "新增前置依赖：成员自由填写的说明")).toBe("新增前置依赖：成员自由填写的说明");
    }
  });
  it("其他系统活动和包含类似词语的成员内容不做全文替换", () => {
    expect(taskEventNote("update", "设置标签：依赖研究")).toBe("设置标签：依赖研究");
    expect(taskEventNote("update", "说明：新增前置依赖：成员原文")).toBe("说明：新增前置依赖：成员原文");
    expect(taskEventNote("update", "新增前置依赖：先学习依赖分析\n再写报告")).toBe("设置需要先完成的任务：先学习依赖分析\n再写报告");
  });
  it("空记录保持为空，新文案不重复处理", () => {
    expect(taskEventNote("update", null)).toBeNull();
    expect(taskEventNote("update", "")).toBe("");
    expect(taskEventNote("update", "设置需要先完成的任务：资料整理")).toBe("设置需要先完成的任务：资料整理");
  });
});
