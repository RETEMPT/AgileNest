# 设计说明 · 链路 / IA / 借鉴

## 产品一句话

面向高校实验室 / 课程 / 竞赛团队的**轻量敏捷项目管理平台**：把企业级敏捷改造成师生用得起来的协作流程。

## 主循环（对齐分工 Word）

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

| 状态 | 中文 | 视觉（`StatusPill`） |
|---|---|---|
| `unclaimed` | 待认领 | 灰 |
| `in_progress` | 进行中 | 蓝 |
| `submitted` | 待验收 | 琥珀 |
| `accepted` | 已完成 | 绿 |
| `rejected` | 待修改 | 赤 |

唯一真相：`src/modules/tasks/states.ts` 的 `TRANSITIONS`。

## 信息架构

```
/home
  /home/student   今日工作台：待认领 · 进行中 · 待修改 · 本周节点
  /home/teacher   监督台：待验收队列 · 逾期风险 · 项目完成度
/t                我的团队
/t/[teamId]/…     项目 / 成员 / 设置
/p/[projectId]    项目工作区（Notion 式左图标侧栏）
  ├ tasks / tasks/[taskId]   任务池 · 详情（子任务 + 工时 + 活动流）
  ├ board / table            多视图（同一份 tasks）
  ├ calendar / milestones    日历 · 节点
  ├ review                   验收台（teacher/admin）
  ├ stats                    工时 · 完成度 · 贡献
  └ settings
/settings         账号 · 飞书绑定
```

**多视图**（Notion / GitHub Projects）：Board / Table / Calendar / Timeline 共用同一份 `tasks`；筛选走 URL、跨视图共享。

## 借鉴点

| 来源 | 拿什么 |
|---|---|
| **Notion** | 项目左侧图标侧栏；同一数据集多视图；任务详情抽屉（子任务 checklist + 属性 + 活动流） |
| **Linear** | 五态 pill；行内快捷动作；键盘可达 |
| **GitHub Projects** | 视图切换器 + URL 同步筛选；按状态/指派/优先级/里程碑分组 |
| **shadcn/ui + Radix** | 组件底座；New York 风格；tokens 见 `globals.css` |
| **dub.co / cal.com** | `src/modules/<m>/{schema,service,actions,api,ui,index}` 模块化单体 |
| **TanStack Table** | 表格视图 |
| **react-day-picker** | 日历底座 |

## 权限矩阵

| 动作 | student | teacher | admin |
|---|---|---|---|
| 认领 / 提交 / 填工时 / 改自己的任务 | ✅ | ❌ | ✅ |
| 创建任务 | ✅ | ✅ | ✅ |
| 指派 / 验收 / 打回 / 重新打开 | ❌ | ✅ | ✅ |
| 建项目 / 改成员角色 / 团队设置 | ❌ | ❌ | ✅ |
| 看全部 | ✅ | ✅ | ✅ |

> 本期沿用旧仓口径：`requireTaskWrite` = admin+student；`requireReviewer` = admin+teacher。

## 视觉 tokens

见 `src/app/globals.css`：品牌 `#294a78`、点缀 `#bf6a34`、暖纸背景 `#f3f1ea`、五态色板 `--status-*`。
