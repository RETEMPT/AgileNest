# 设计说明

## 一句话

面向高校实验室 / 课程 / 竞赛团队的轻量敏捷项目管理：把企业级敏捷改造成师生用得起来的协作流程。

## 主循环

```
认领 → 做事（子任务 / 工时）→ 提交（完成说明）→ 教师验收通过 / 打回待修改 → 修改后重交
```

## 五态状态机

```
unclaimed ──claim──→ in_progress ──submit──→ submitted ──accept──→ accepted
    ↑                    │                       │
    └──unclaim───────────┘                       └──reject──→ rejected ──resubmit──→ submitted
                       teacher assign ──→ in_progress
                       accepted ──reopen──→ in_progress
```

| 状态 | 中文 | `StatusPill` |
|---|---|---|
| `unclaimed` | 待认领 | 灰 |
| `in_progress` | 进行中 | 蓝 |
| `submitted` | 待验收 | 琥珀 |
| `accepted` | 已完成 | 绿 |
| `rejected` | 待修改 | 赤 |

唯一真相：`src/modules/tasks/states.ts` 的 `TRANSITIONS`。非法转移 → `ConflictError`(409)。

## 信息架构

```
/home
  /home/student   待认领 · 进行中 · 待修改 · 本周节点
  /home/teacher   待验收队列 · 逾期风险 · 项目完成度
/t  /t/[teamId]/{projects,members,settings}
/p/[projectId]    项目工作区（左侧栏）
  tasks / tasks/[taskId]   任务池 · 详情（子任务 + 工时 + 活动流）
  board / table            多视图（同一份 tasks）
  calendar / milestones    日历 · 节点
  review                   验收台（teacher/admin）
  stats                    工时 · 完成度 · 贡献
  settings
/settings         账号 · 飞书绑定
```

筛选走 URL，Board / Table / Calendar 共享同一份 `tasks`（Notion / GitHub Projects 式多视图）。

## 借鉴

| 来源 | 拿什么 |
|---|---|
| Interfere | 双栏工作流抽屉（左栏属性矩阵 Inspector + 右栏活动代码与交付物流） · Apple/Linear 弹簧阻尼曲线 |
| Linear | 五态微胶囊 pill · 原位行内快捷动作条 · 键盘优先 · 高密度信息排版 |
| Notion / GitHub Projects | 统一数据源多视图透视（看板、表格、日历） · 视图切换与 URL 同步筛选 |
| Resend | 极简纯黑白高反差排版 · 细灰边框 · 不可篡改事件审计时间轴 |
| shadcn/ui + Radix | 现代可控无头组件原语 |

## 权限矩阵

| 动作 | student | teacher | admin |
|---|---|---|---|
| 认领 / 提交 / 填工时 / 改自己的任务 | ✅ | ❌ | ✅ |
| 创建任务 | ✅ | ✅ | ✅ |
| 指派 / 验收 / 打回 / 重新打开 | ❌ | ✅ | ✅ |
| 建项目 / 改成员角色 | ❌ | ❌ | ✅ |
| 看全部 | ✅ | ✅ | ✅ |

实现口径：`requireTaskWrite` = admin+student · `requireReviewer` = admin+teacher。

## 视觉与动效

- `src/app/globals.css`：黑白极简双色（Monochrome Duotone）· 纯黑白高反差底座（`#fbfbfb` / `#09090b`）· 极细 `#e4e4e7` 边框 · 雅致宝蓝微高亮与手绘线性 SVG 图标（`#2563eb`）。
- 动效系统：`cubic-bezier(0.16, 1, 0.3, 1)` 物理级阻尼曲线，长列表采用 `content-visibility: auto` GPU 视口外延迟绘制。

