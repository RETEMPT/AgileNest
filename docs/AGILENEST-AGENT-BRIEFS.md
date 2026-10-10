# AgileNest Agent 执行任务卡

日期：2026-10-10 · 配套：[完整体验方案](AGILENEST-EXPERIENCE-PLAN.md)

状态：首轮 R0、F1/F2、A1/B1/C1/D1/E1 已实施；范围与实际验收见 [执行记录](AGILENEST-EXECUTION.md)。下列卡片保留为后续复核和派工模板，不代表授权发布或实现路线图功能。每张卡只负责明确的范围。

本文件是 rc.5 首轮派工模板；当前执行以 [文档提炼与计划](PROJECT-STATE.md)、[业务实施契约](BUSINESS-COMPLETION.md) 和 TEAM 当前范围为准。rc.6 已授权追加业务表与共享资料，不沿用旧卡中的“禁止所有 schema/附件”作为新范围限制；登录、core、依赖、OCR/模型等边界保留。

## 0. 所有 agent 共用的执行说明

```text
你在 E:\AgileCampus 工作。先完整阅读 AGENTS.md，再读 docs/TEAM.md、
docs/UX.md、docs/AGILENEST-EXPERIENCE-PLAN.md 和分配给你的任务卡。
此次是已有产品的体验迭代，保持当前真实业务语义，只执行分配的卡片。

开始前检查 git 状态、当前基线和本地已有改动；不得覆盖他人改动。
使用集成人指定的基线提交；下面的 codex/* 为建议分支名，不切换他人分支。
不要创建本仓以外的工作目录，不碰 E:\agilecampus-master。

只改本人 Owner 目录和对应路由薄壳/测试；共享文件找 foundation。
跨模块只消费已登记的根入口、client、ui、views，不深链内部文件。
状态修改走 transitionTask；UI 与拖动从 availableTransitions 派生。
权限按职务+场景，不按学术身份，也不能用“执行/管理视角”授予权限。
保留登录、core、依赖、schema；本轮卡片没有修改它们的授权。
不新增 Sprint、GitHub API、通用评论/附件/依赖系统或 AI 模型调用。

先说明现有实现、要改的文件与接口；缺契约时提交需求给 Owner，不自建副本。
实施只解决当前卡片目标，不顺手重构。使用中文业务文案和已有 UI 原语。
失败保留输入，取消不写数据，不伪造成功，不用演示数据填生产页面。

完成后按方案验收，运行规定的测试与 Windows 构建，报告实际结果。
报告变更、文件范围、公开契约、视觉/交互证据与未完成项。
不自行合并 main、不发布、不改版本或 tag；由集成人统一处理。
```

## 1. 集成人：R0 范围、契约与基线

- Owner：foundation；建议分支 `codex/experience-integration`，创建时核对最新真实基线，不假定 main/develop 与当前分支相同。
- 交付：本轮范围、模块任务映射、页面截图基线、待变更契约列表、集成顺序。
- 允许改动：规划/契约文档；开始实施后再登记实际共享 UI 范围。
- 输入：当前 `0.4.0-rc.4` 只是本次调研基线，执行时重新核对。
- 决策：任务导航先统一哪两个/三个入口；详情默认宽度；是否本轮实现 task query；日历共享筛选是否后置。
- 验收：所有任务卡指向同一基线，每个文件只有一个写入者，每个新增契约有提供方与消费方。

不要让所有 agent 同时改 TEAM.md、UX.md、package.json 或 globals.css。成员提交本模块契约片段；foundation 串行整合公共文档，成员 Owner 复核。

## 2. F1：共享外壳、导航与 UI 原语

- Owner：foundation；建议分支 `codex/experience-shell`；依赖 R0。
- 范围：`src/components/app-shell.tsx`、`app-sidebar.tsx`、`components/ui/**`、`src/app/globals.css`；仅直接服务本轮的 `identity` 页面导航组合。
- 任务：将项目任务入口收敛，页内视图仍保留旧地址；无项目时显示明确引导；统一页头、间距、工具栏、反馈、焦点与深浅主题。
- 复用：Button、StatusPill、PriorityPill、EmptyState、FormFeedback、FeedbackProvider、既有主题偏好。
- 不做：重写登录/偏好存储、全局命令面板、升级 UI 库、改业务状态。
- 输出：必要的共享展示组件和 props 文档，不把项目查询或 session 混入浏览器组件。
- 验收：1440/1024/390 宽度；导航收起展开；旧链接工作；主题切换；错误/成功反馈；键盘访问和关闭后的焦点。

## 3. F2：共享详情容器

- Owner：foundation；建议分支 `codex/experience-detail-shell`；依赖 F1 与 A1 契约。
- 范围：`src/components/cards/task-drawer.tsx`、直接相关共享 cards/UI 文件；不得代改 board/tasks。
- 任务：整理标题/关闭/完整页/滚动/底部操作布局；统一 600–680px 桌面目标和窄屏全屏；保留活动流的真实加载/重试。
- 与 A1 分工：foundation 只管共享容器与展示组合；任务详情内容和动作由 A 的公开 UI 提供；B 接入容器。
- 约束：不是为了复用而搬迁全部历史组件；先让现有两套详情在一个明确契约下呈现一致。不能将 service 放进共享客户端文件。
- 验收：长描述、长标题、活动加载失败、快速切换任务、Esc/关闭/焦点返回；当前任务内容不会被上一请求覆盖。

## 4. A1：任务内容与操作闭环

- Owner：A；建议分支 `codex/experience-tasks`；依赖 F1，可与 F2 协商后推进。
- 范围：`src/modules/tasks/**`、对应任务路由壳、`tests/contract/tasks/**`。
- 任务：目标/验收要求、最新完成说明/修改意见、属性、子任务与下一步按方案排序；创建/编辑渐进展开可选字段，错误保留输入；抽屉与独立页消费相同业务内容。
- 优先复用：TaskWorkflow、TaskActions、TransitionDialog、CreateTaskForm，以及已有编辑入口。
- 输出：若需要新 UI 导出，先提供具体 props 与 TEAM 契约片段；保持现有 service 签名优先。
- 不做：改五态定义、为 UI 加假状态、直接写 status、改 schema、把 description 当成已存在的独立验收标准字段。
- 验收：认领/指派/提交/打回/重交/验收/重开；本人和他人权限；并发认领；子任务验收限制；表单错误/取消。
- 测试证据：正常路径、越权、非法边、说明必填、日期、并发/父子约束至少覆盖相关改动。

## 5. B1：看板、表格与浏览连续性

- Owner：B；建议分支 `codex/experience-board`；依赖 F1 + A1/F2 已冻结接口。
- 范围：`src/modules/board/**`、对应路由壳、`tests/contract/board/**`。
- 任务：统一页头和筛选工具栏；任务卡信息层次；五态列顺序；用共享详情替换或接入现有内联详情；视图切换保留条件。
- URL：复用 board/client 的解析/序列化；新增 task query 仅在 R0 确认后实施；不得改变 review/client 的键名。
- 拖动：只在状态分组推动状态，其余分组用于浏览；需要说明时复用 TransitionDialog。失败/取消不移动。
- 不做：自行添加服务端批量操作、任意重排业务状态、写另一份角色矩阵、改 A 的内部文件。
- 验收：搜索→筛选→开详情→取消→表格→刷新→返回；任务被过滤后有说明；无匹配可重置；键盘替代拖动；390px 仅看板局部横滚。

## 6. C1：工作台与验收队列

- Owner：C；建议分支 `codex/experience-review`；依赖 A1/B1 的任务入口。
- 范围：`src/modules/review/**`、工作台/验收路由壳、`tests/contract/review/**`。
- 任务：“我负责的 / 待我验收 / 可以认领”对应真实可见事项；任务列表前置；验收页集中展示成果说明、子任务与修改历史。
- 复用：getWorkbench、review/client 的查询工具、A 的公开操作 UI；旧 student/teacher 路由仍可用。
- 不做：新增硬编码开发者/经理角色、以视角切换权限、自动批量验收、改 tasks 状态机。
- 验收：单人多职务、跨团队不同权限、课程/实验室/竞赛队长边界；通过或打回后计数刷新；空队列可理解。

## 7. D1：可信的工时与交付摘要

- Owner：D；建议分支 `codex/experience-stats`；依赖任务入口契约。
- 范围：`src/modules/worklog/**`、统计路由壳、`tests/contract/worklog/**`。
- 任务：顶层验收比例、总工时、成员投入的排版与口径；零分母/无记录状态；对已有合法任务链接提供下钻。
- 复用：projectCompletion、taskHours、memberContribution 等公开服务。
- 不做：自造健康分/趋势、用提交数替代验收完成、把工作时长称为绩效、无事件历史绘制燃尽图。
- 验收：顶层/子任务不重复计数、分钟显示与求和一致、成员范围 ACL、空项目/零工时；图表或进度条有文本数值。

## 8. E1：项目日期、个人日程与通知入口

- Owner：E；建议分支 `codex/experience-calendar-notify`；依赖 F1 与任务入口。
- 范围：`src/modules/calendar/**`、`milestone/**`、`notify/**`、对应路由壳/测试；仅本轮入口直接需要的改动。
- 第一优先：明确个人/项目语境，项目事项打开任务，里程碑打开关联任务；通知内容与未读反馈清晰。
- 第二优先：仅在 B/E 冻结契约后对齐项目日历可支持的筛选；未支持的条件显式告知，不能带着 URL 假装已生效。
- 约束：个人日程仅本人、同日时间、版本冲突不覆盖；不扩大团队管理员访问；不接入飞书私信或新 cron 能力。
- 验收：跨天项目排期、历史月份、个人版本 409、取消/失败输入保留、通知目标不可访问时的返回路径。

## 9. 共享契约先行表

| 契约 | 提供方 | 消费方 | 冻结要求 |
|---|---|---|---|
| 页头/反馈/抽屉容器 | foundation | A/B/C/D/E | props、关闭行为、加载状态、焦点、窄屏 |
| 任务内容与合法动作 | A | foundation/B/C/E | TaskDTO、权限快照、公开 UI，不新建客户端授权表 |
| 任务 URL 筛选 | B | foundation/E | 现有键与序列化、无效条件、跨项目行为 |
| task query（可选新约定） | A/B/foundation | C/E | 打开/关闭/后退、项目归属、失效对象 |
| 工作台 query | C | 工作台消费者 | view/q/projectId/due 保持兼容 |
| 完成度与工时口径 | D | 概览/统计消费者 | 顶层分母、空值、分钟、权限范围 |
| 项目日历筛选 | E + B | 日历/视图导航 | 可支持字段与不能支持字段的明确行为 |

上述表是对齐清单，不是新增 TypeScript 接口。先核对现有导出，只为真实需要增加字段；变更由提供方更新签名及测试，并同步 TEAM。shared 文件由 foundation 串行修改，其他 Owner 通过自己的 UI 入口接入。

## 10. 合并与验收

1. R0 固定基线和每卡范围。
2. F1 先合入；A1 与 F2 冻结详情契约后提交；B1 随后接入。
3. C1/D1/E1 可在不碰共享文件的前提下准备，接口可用后联调。
4. 每个 Owner 提交契约与本模块证据；集成人完成全链路及混合职务回归。
5. 完整 `npm test`、Windows `npm run build`、`git diff --check`；发布时按仓库工作流统一升版。

可直接给验收 agent 的说明：

```text
只读检查本轮 diff，逐项执行体验方案第 8 节的验收脚本。
重点检查权限来源、状态流转同源、URL 保留、取消/失败、父子任务、个人日程隐私。
核对所有 UI 数字是否来自真实数据及一致口径，不能把演示稿视为业务实现。
记录复现步骤、影响、文件位置与证据；未经分派不要代改其他 Owner 的文件。
没有执行的测试写“未执行”，不能根据历史文档宣称本轮通过。
```

每张卡交付格式：问题与结果；文件范围与 Owner；公开契约差异；实际测试/构建结果；桌面/窄屏与错误状态证据；未完成项和后续依赖。界面截图必须注明真实页面还是概念示意。
