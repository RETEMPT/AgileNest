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
| Notion | 项目图标侧栏 · 多视图 · 详情抽屉（子任务 + 属性 + 活动流） |
| Linear | 五态 pill · 行内快捷动作 |
| GitHub Projects | 视图切换 + URL 同步筛选 |
| shadcn/ui + Radix | 组件底座 |
| dub.co / cal.com | `modules/<m>/{schema,service,actions,api,ui,index}` |

## 权限矩阵

| 动作 | student | teacher | admin |
|---|---|---|---|
| 认领 / 提交 / 填工时 / 改自己的任务 | ✅ | ❌ | ✅ |
| 创建任务 | ✅ | ✅ | ✅ |
| 指派 / 验收 / 打回 / 重新打开 | ❌ | ✅ | ✅ |
| 建项目 / 改成员角色 | ❌ | ❌ | ✅ |
| 看全部 | ✅ | ✅ | ✅ |

实现口径：`requireTaskWrite` = admin+student · `requireReviewer` = admin+teacher。

## 视觉

`src/app/globals.css`：品牌 `#294a78` · 点缀 `#bf6a34` · 暖纸背景 `#f3f1ea` · 五态 `--status-*`。
