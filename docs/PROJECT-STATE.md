# AgileNest 当前状态与文档入口

更新：2026-10-11 · 发布目标：0.5.0 · 分支：`codex/v050-collaboration-release`

产品主线是团队空间 → 项目目标与资料 → 任务分工与讨论 → 成果版本 → 逐项验收。飞书作为日常协作参考，GitHub 补充任务组织与研发证据。当前候选范围、未实施项和后续分步执行统一看 [协作工作区](COLLABORATION-WORKSPACE.md)。检查结果只在实际完成后登记于 CHANGELOG，源码候选与已发布 Windows 包分别记录。

## 先读哪些文档

| 用途 | 文档 | 说明 |
|---|---|---|
| 使用平台 | [README](../README.md)、[WINDOWS](WINDOWS.md)、[RELEASE](RELEASE.md) | 唯一启动入口、旧数据升级、已发布包与备份 |
| 继续编码 | [AGENTS](../AGENTS.md)、[TEAM](TEAM.md)、[WORKFLOW](WORKFLOW.md) | 最新授权、Owner、公开接口、迁移、候选与正式版规则 |
| 当前计划 | [COLLABORATION-WORKSPACE](COLLABORATION-WORKSPACE.md) | 实装能力、分步派工、后续实时协作与研发集成方案 |
| 业务与权限 | [DESIGN](DESIGN.md)、[IDENTITY](IDENTITY.md)、[SCHEDULES](SCHEDULES.md) | 五态、成果验收、职务授权及私人日程隔离 |
| 界面实施 | [FRONTEND-DESIGN-GUIDE](FRONTEND-DESIGN-GUIDE.md)、[UX](UX.md) | 视觉、交互、空态、失败保留输入、窄屏与键盘标准 |
| 外部参考与边界 | [PR-RESEARCH](PR-RESEARCH.md)、[FEISHU](FEISHU.md)、[AI](AI.md)、[ROADMAP](ROADMAP.md) | 来源与采用内容，外部连接、模型及创新功能边界 |
| 历史证据 | [AGILENEST-EXECUTION](AGILENEST-EXECUTION.md)、[BUSINESS-COMPLETION](BUSINESS-COMPLETION.md)、[CHANGELOG](../CHANGELOG.md) | rc.5/rc.6 契约与验收记录；历史证据不代表最新版本已全面验收 |

冲突处理：最新用户要求 → AGENTS 当前范围与架构 → TEAM 公开契约 → 当前实施记录 → 设计指南。旧截图、概念原型、历史派工与路线图不得覆盖实际代码。

## 本轮工作组织

1. 冻结追加数据、权限和公开接口，按 Owner 并行实施。
2. 连接资料、任务、通知和本人日程，处理失效成员、来源版本与并发冲突。
3. root 串行应用迁移、运行必要数据库契约与生产构建，修复集成遗漏。
4. 本轮用户已明确最终方向，更新 R6 为通用协作与交付，完成 R7 综合验收后合入主分支并发布 0.5.0 运行包和 Release。

本轮不清空历史数据库，不替换登录或 core，不新增运行依赖。用户追加副管理员要求后，保留既有职务并只追加一个枚举值；学术信息与多重职务分开。项目目录与文件夹仅整理位置；链接、关注和保存视图不授予额外访问权。文档行动项创建真实任务，讨论解决不改变任务完成状态。

## 文档清理记录

`AGILENEST-EXPERIENCE-PLAN.md` 和 `AGILENEST-AGENT-BRIEFS.md` 已被后续实施替代，包含旧基线与相互冲突的范围限制。有效的页面职责、设计尺度、参考来源及派工规范已合并至设计指南、协作工作区与 TEAM；移除这两份重复 Markdown，并修正入链。原文可从 Git 历史恢复。

保留 AGENTS、业务/权限契约、使用文档、更新日志与真实验收记录。rc.7 实际截图仍在 [历史页面清单](design/collaboration-rc7/page-list.md)；`design/agilenest-preview.html` 为早期概念稿，不作为当前功能证明。

## 最终综合验收

本轮执行最终综合验收，统一检查角色与撤权、并发、旧数据升级、原文件与版本证据、父子/依赖约束、通知及统计一致性、多端/主题/键盘/减少动效，以及 Windows 首启、停止、重启与数据保留。只在实际检查通过后登记结果，完整多人实时编辑、群聊、外部同步与模型运行仍为独立后续方案。
