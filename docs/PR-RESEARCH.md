# 产品参考、PR 调研与落地

## 当前采用与差异 · 0.5.0 · 2026-10-11

以飞书官方任务和云文档帮助为主来源，GitHub 补充任务组织与可选代码成果链接。本轮面向通用项目协作，课程、研究、竞赛及混合项目均可使用；阶段交付不要求 GitHub 账号、PR 或代码仓库。当前实施与验收进度见 [协作工作区](COLLABORATION-WORKSPACE.md) 和 [UX](UX.md)，下方 PR 状态、分支与旧版本检查均为历史观察记录。

| 官方来源 | 本轮采用 | 本平台差异与边界 |
|---|---|---|
| [飞书创建任务](https://www.feishu.cn/hc/zh-CN/articles/360741352378-%E5%88%9B%E5%BB%BA%E4%BB%BB%E5%8A%A1) | 围绕目标、负责人、日期、子任务和内容上下文组织工作 | 发布任务至少一项可核对验收标准，与任务同事务保存；仍为五态、单一负责人和按职务计算能力，不复制重复任务或多负责人规则 |
| [在任务中添加附件](https://www.feishu.cn/hc/zh-CN/articles/650357724285-%E5%9C%A8%E4%BB%BB%E5%8A%A1%E4%B8%AD%E6%B7%BB%E5%8A%A0%E9%99%84%E4%BB%B6) | 内容附近上传、预览和下载，沟通附件与成果材料清楚可见 | 正式提交单独绑定文件，生成不可变 v1/v2；自检允许记录未达到项，最终通过必须逐项核验。沿用单文件 10 MB 限制，不照搬飞书的附件容量和数量 |
| [快速上手云盘](https://www.feishu.cn/hc/zh-CN/articles/778513900437-%E5%BF%AB%E9%80%9F%E4%B8%8A%E6%89%8B%E4%BA%91%E7%9B%98) | 目录树、路径、主题下建子目录与就地创建/上传 | 主题属于同一空间和分类，最多八层，移动同时检查整个子树；不复制飞书的目录深度或权限继承体系 |
| [删除和恢复云文档、文件夹](https://www.feishu.cn/hc/zh-CN/articles/360049067425-%E5%88%A0%E9%99%A4%E5%92%8C%E6%81%A2%E5%A4%8D%E4%BA%91%E6%96%87%E6%A1%A3-%E6%96%87%E4%BB%B6%E5%A4%B9) | 明确回收与恢复入口，确认后操作，保留内容与路径 | 当前仅资料可恢复回收；被成果、讨论或来源引用的资料受保护，空目录才可删除。不做递归回收、永久清除或飞书的自动保留期限 |
| [飞书任务设置](https://www.feishu.cn/hc/en-US/articles/791692860649-task-settings) | 本人提醒、未读入口、摘要与偏好分别管理 | 消息与 AI 草稿统一一个右下角入口，气泡只短时预览真实站内消息；不执行飞书 IM 投递、系统推送或智能体操作 |
| [Radix Alert Dialog](https://www.radix-ui.com/primitives/docs/components/alert-dialog) | 确认动作、取消入口、焦点限制和键盘操作 | 复用已安装的 Radix 原语，保存期间防重复与误关闭；取消保留原数据，失败保留输入，并恢复合理焦点 |

逐项打回需说明未通过位置与通过条件；待验收和已完成期间冻结验收要求，先打回或重开才可调整，旧提交快照不变化。历史选择器只供阅读，验收仍绑定当前待验收版本；阶段交付只绑定真实已通过版本，确认时重新核对成果、检查项与未解决问题。这些是本平台的交付规则，不宣称飞书或 GitHub 采用相同状态机。

本轮自行实现，未复刻完整飞书/GitHub，未复制外部源码或图形。Marker 仅兼容真实 Markdown/JSON 转换产物导入，没有运行 OCR 或模型；AI 仍为本人本地草稿。GUI 与自动检查分别记录，阶段归档/导出、多端与主题尚待最终点验，不能以参考文档或源码存在替代验收。

## 历史 PR 调研快照

核对了本仓开放 PR，以及 Plane、OpenProject 的相关 PR 详情与差异。这里记录采用的设计思路；本轮实现使用仓库现有组件和契约，没有移植外部项目代码或增加依赖。开放/关闭状态是本次观察时的快照，不表示开放 PR 已得到上游认可。

| 来源与观察状态 | 值得保留的地方 | 本项目落地 |
|---|---|---|
| [AgileNest #1](https://github.com/RETEMPT/AgileNest/pull/1)、[#2](https://github.com/RETEMPT/AgileNest/pull/2)，开放，10-02 更新 | 任务状态共享、模块边界、稳定卡片排序、URL 筛选、真实成员选择、契约测试 | 看板调用任务状态入口，任务按 sortOrder/createdAt 排序；视图切换保留筛选；指派按姓名选择，不手填 ID |
| [Plane #9902](https://github.com/makeplane/plane/pull/9902)，09-28 创建，开放 | 组操作和单条操作共用可编辑权限，避免界面显示操作后 API 拒绝 | 共享场景能力计算，权限决定拖动把手与合法目标；成员职务、身份确认仅显示给管理员 |
| [Plane #9810](https://github.com/makeplane/plane/pull/9810)，09-10 创建，已关闭、未合并 | 状态配置权限与其他管理动作一致，并为非管理员增加拒绝用例 | 保留五态定义，不向队长开放验收；增加课程/实验室/竞赛范围、撤权和非法跳转测试 |
| [OpenProject #25464](https://github.com/opf/openproject/pull/25464)，09-24 合并 | 共享交互菜单的描述信息，消费端保持已有布局 | 职务标签、说明和权限统一来自 identity/client；成员卡片、设置页、负责人选择沿用现有 Badge/Button/tokens |
| [Plane #9014](https://github.com/makeplane/plane/pull/9014)，05-05 合并，历史参考 | 检查请求人的管理员权限，而非目标成员的角色 | 职务与确认操作检查操作者权限，并重新核对目标团队归属；事务中再次核对管理员权限 |
| [Plane #8801](https://github.com/makeplane/plane/pull/8801)，03-26 合并，历史参考 | 不同布局共用语义样式 | 复用既有品牌蓝、点缀色与状态徽章，不为身份模块新增颜色系统 |

本仓 #1/#2 的来源是 `hina-0219-p/AgileNest:main`，目标分别为本仓 `feature/tasks-status`、`feature/board-views`，两者当时具有同一组 19 个变更文件。它们属于协作者分支交付；本轮审阅其思路，不代替 Owner 自动合并、关闭或改目标分支。本次完整体验与权限改进在 `codex/workspace-workflow` 提交 PR 到本仓 `main`。

[OpenProject 角色权限文档](https://www.openproject.org/docs/system-admin-guide/users-permissions/roles-permissions/)支持同一用户承担多个角色和按项目授予权限。本项目结合高校场景，将本科/硕士/博士/老师留作资料，将管理员/指导老师/队长/队员留作团队职务；权限按项目种类计算。飞书的多视图、成员选择和侧边任务详情取舍见 [UX.md](UX.md)。

该历史迭代没有采用通用软件“提交即完成”的语义，只有验收通过才是已完成；当时未引入自定义工作流、Sprint、甘特、AI、学籍认证或实验数据文件库。后续通用团队/项目资料与本地 AI 草稿已独立实现，当前边界以本页首节为准；权限规则与升级说明见 [IDENTITY.md](IDENTITY.md)。

## 成员 PR 选择性集成 · 2026-10-04

用户授权提取新成员 PR 的有效内容合并到本轮集成分支。核对 #1/#2 同源提交 `b4520a8732f6742d51362451756a5c1e7f8ea0dd`，以及 [#5](https://github.com/RETEMPT/AgileNest/pull/5) 的提交 `6a536e23a48c3d35a5d7f92b49a41dbc393cb5b5`。以下为已落地的选择性集成，不表示原 PR 已整单合并或关闭。

| 来源 | 采用内容 | 适配结果 |
|---|---|---|
| #2 `board/service.ts` | 组内按 sortOrder，再按 createdAt 稳定排序 | 加入当前纯函数 model，切换任何分组保持排序，不修改输入；新增排序契约 |
| #5 `tasks/actions.ts` | 独立子任务创建动作、成功后刷新父任务与任务池 | 复用创建输入校验，父任务归属与页面刷新由服务结果决定；额外刷新概览、工作台和看板 |
| #5 `tasks/ui.tsx` / `views.tsx` | 任务详情提供编辑与子任务入口，保留错误时的输入，按能力显示 | 整合成可取消的 Radix 编辑弹窗；增加开始/截止日期、预计工时及里程碑，复用创建表单，避免重复组件 |
| #5 教师入口 | 只为有验收权限的团队加载待验收任务，避免混合身份时 500 | 统一工作台按每个项目的当前职务计算权限；兼任队员的事项仍显示在“我负责的”；新增两个团队不同身份的回归用例 |

未采用 #1/#2 中收窄管理员执行权限的三态白名单、手写角色按钮表、prompt 说明弹窗和无事务状态写入，它们与已确认的叠加职务及原子流转规则冲突。#5 的锁文件清理属于另一独立变更，不纳入本轮功能集成。全量集成在 `codex/collaboration-completion`，不向其他 Owner 分支直接覆盖文件。

## 产品体验补充调研 · 2026-10-04

核对 [Linear My issues](https://linear.app/docs/my-issues) 和[飞书项目工作台](https://www.feishu.cn/content/3c6y1qwl)官方文档。采用个人事项分类、优先事项排序、项目与日期筛选，以及从事项直接进入操作的设计思路。工作台合并重复计数区，新增 URL 搜索/项目/日期筛选；逾期优先，其次优先级和截止日期。筛选仅消费原有 ACL 限定的队列。

团队、项目、任务、个人资料与消息入口统一为功能名称及客观状态说明；移除姓名问候、鼓励式标语和无实际信息的卡片副标题。新手流程集中在空状态或可展开区域，不占据已有数据的主要操作空间。沿用现有品牌色、组件和五态验收规则，没有引入外部代码、依赖或路牌功能。

## 公共基础补充 · 2026-10-04

按用户确认的轻量接入边界，飞书保留既有 OAuth 登录与绑定，只提供本人连接摘要和手动采用姓名；平台身份、职务、头像与协作继续独立管理。检查现有实现发现私信发送封装未被业务调用，移除页面的自动私信承诺，并明确尚未联调。连接 UI 归 identity，解绑增加事务版本校验及占位邮箱登录保护。

公共验证参考 [GitHub PostgreSQL 服务容器](https://docs.github.com/en/actions/tutorials/use-containerized-services/create-postgresql-service-containers)、官方 [checkout v7.0.1](https://github.com/actions/checkout/releases/tag/v7.0.1) 与 [setup-node v7.0.0](https://github.com/actions/setup-node/releases/tag/v7.0.0)。工作流固定已核对的提交 SHA，使用现有锁文件、Node 22、隔离测试库和 Windows 构建，凭据仅为临时测试值。

页面验收中发现开发工具浮标遮挡折叠侧栏的退出按钮；依照 [Next devIndicators](https://nextjs.org/docs/app/api-reference/config/next-config-js/devIndicators) 及本仓已安装的配置类型关闭浮标，保留正常错误反馈。

首次 CI 在 npm ci 阶段发现 Vitest/esbuild 平台锁项未标可选，Windows/Linux 均尝试安装 AIX 组件。按 [npm 锁文件格式](https://docs.npmjs.com/cli/v11/configuring-npm/package-lock-json/) 在隔离目录用 CI 对应的 npm 10 重新生成依赖图，恢复 optional/dev/peer 标记、补全原有 Tailwind WASM 的包内置可选记录；核对保留条目的版本未变，未修改依赖声明。npm 10 与 11 分别验证全新安装，独立于开发目录已有 node_modules。

## AI 页面设计调研 · 2026-10-05

按用户指定方向核对 [DeepSeek Harness 的 ui-chat](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/ui-chat/README.md)、[Harnss](https://github.com/OpenSource03/harnss) 与 [Open WebUI](https://github.com/open-webui/open-webui) 的公开仓库说明。采用清晰的主区/输入区、可收起的会话列表、标题/内容搜索与移动抽屉。Harnss 在当时观察中自述处于早期开发并将重写，作为交互参考，不作稳定运行时依赖；没有声称此为官方 DeepSeek Chat 的源代码。

本仓仍采用既有品牌色、字体、SVG 线宽与共享 UI，自行实现，未复制外部代码或图形。用户已确认先做界面与本地草稿，模型调用与三级 Agent 不在本轮；空回复、推理过程、工具进度和历史对话不填演示内容。新建的验收草稿均标为本地界面验收，不写入团队任务。能力、存储限制与后续接入边界见 [AI.md](AI.md)。

## 用户提供个人日程资料 · 2026-10-05

完整核对 `schedule.docx`（Java/MyBatis 实体）、`script.js.docx`（月查询/增删改请求封装）、`路由注测.docx`（Vue 登录后日历路由）和 `数据库建表.docx`（MySQL schedule 表与用户/日期索引）。四份文档无图片、表格、批注或修订内容；原文件只读且不放进仓库。

采用个人归属、标题/说明、日期与起止时间、三级优先级、按月 CRUD、登录后入口和复合索引。按现有技术栈改为独立的 `personal_schedules` 追加表、UUID、当前会话归属、真实日期/同日时间校验和版本条件写入；本人日历与项目任务截止/里程碑分开，避免个人安排被团队管理员读取或被当成任务完成记录。没有移植 Java/Vue/MySQL 运行时，没有引入依赖。

本轮 E 在 `codex/calendar-schedules` 开发，foundation 仅配合共享导航；通过公开 `calendar`、`client`、`ui`、`views` 契约集成到 `codex/collaboration-completion`，不修改其他成员分支。具体输入、权限、并发和可重复迁移见 [SCHEDULES.md](SCHEDULES.md)。

## PR #7 日历排期整合 · 2026-10-06

核对 [PR #7](https://github.com/RETEMPT/AgileNest/pull/7)（已由主分支接受），采用项目 42 格月历、跨天任务事件、日程列表、负责人/状态/里程碑筛选和对应 51 条契约用例。个人日历使用既有个人日程表和版本保护，项目事件不写入个人安排，统一外部入口并保留旧月格 DTO。

整合时修复日程页查询固定从今天开始造成历史月份遗漏、月格与日程未共用筛选、完整任务跨度先展开再裁剪的性能问题，以及非法日期边界。新增六条集成用例和六条 HTTP 用例；API 路由只转发模块入口。配色转换为既有品牌 tokens，没有采用额外 UI 包、跨天个人日程或绕过任务状态机的改动。

便携包遵循 Next.js standalone 静态资源说明；Node 校验官方 SHA256，数据库来自官方推荐的 EDB Windows 二进制。运行环境来源、版本与版权在 [RELEASE.md](RELEASE.md) 和包内 licenses 留档。

## 成果验收与资料整理参考 · rc.6

本轮核对 [Plane 任务详情](https://docs.plane.so/work-items/work-item-details)、[Plane Pages](https://docs.plane.so/pages/overview)、[Linear 看板](https://linear.app/docs/board-layout) 和 [Marker 仓库](https://github.com/datalab-to/marker)。采用任务详情内证据/活动分层、资料分类与文档历史、同一数据多视图及保留筛选的快速详情；实现与本仓五态、职务权限和指定提交版本验收相结合，未复制外部源码或引入产品运行时。

Marker 用于真实转换产物兼容：用户可导入 Markdown 或含 markdown 内容的 JSON，预览后保存为共享文档；原文件单独保留。当前没有安装其 Python/PyTorch 环境或下载 OCR 模型，不把格式导入描述成 PDF 自动识别。任务提交引用服务器共享文件形成不可变成果快照，区别于 AI 页仅本机的 IndexedDB 资料。具体采用范围与接口见 [业务实施契约](BUSINESS-COMPLETION.md)。

## 飞书协作与 GitHub 补充 · rc.7

按用户最新方向核对飞书官方文档上传/评论/@引用、Lark 任务创建，以及 GitHub 官方协作沟通、附件、Projects、PR 与 Wiki 说明；链接和采用/后置范围见 [协作工作区](COLLABORATION-WORKSPACE.md#官方来源与采用)。本轮采用内容附近的讨论与文件选择、从资料到任务的明确入口、真实消息到事项的跳转，以及同数据筛选连续性；保持本仓五态与按版本验收。@、知识库目录、PR 差异与外部检查按后续轮次落实，没有照搬外部源码、安装运行时或连接外部账号。

## 协作基础调研与采用 · rc.8

核对飞书[文档快速上手](https://www.feishu.cn/hc/zh-CN/articles/945900971706-%E5%BF%AB%E9%80%9F%E4%B8%8A%E6%89%8B%E6%96%87%E6%A1%A3)、[权限FAQ](https://www.feishu.cn/hc/zh-CN/articles/360044508113-%E4%BA%91%E6%96%87%E6%A1%A3%E6%9D%83%E9%99%90%E5%B8%B8%E8%A7%81%E9%97%AE%E9%A2%98)、[知识库权限](https://www.feishu.cn/hc/zh-CN/articles/821998241087-%E5%BF%AB%E9%80%9F%E4%BA%86%E8%A7%A3%E7%9F%A5%E8%AF%86%E5%BA%93%E6%9D%83%E9%99%90)；采用目录/路径、内容附近的引文评论、评论/编辑/管理分层、姓名提及与项目资料上下文。本轮读取仍为当前团队，不声称完整复制外部权限体系。

GitHub[任务依赖](https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/creating-issue-dependencies)、[标签](https://docs.github.com/en/issues/using-labels-and-milestones-to-track-work/managing-labels)、[订阅](https://docs.github.com/en/subscriptions-and-notifications/how-tos/managing-subscriptions-for-activity-on-github/managing-your-subscriptions)补充任务组织与关注；Linear[筛选](https://linear.app/docs/filters)、[看板](https://linear.app/docs/board-layout)、[自定义视图](https://linear.app/docs/custom-views)补充同数据多表达、筛选chips、保存与分享。阻塞时禁止提交/验收是本项目结合验收链自行确定的规则，不把GitHub的关系展示描述成同样的强制流程。

依赖保持锁定，自行实现数据/交互，没有复制外部源码或图形、运行Marker/OCR或连接外部同步。真实文档摘录变成有来源版本的任务，通知偏好/收件过滤与本人提醒按本平台账户持久化。实时共同编辑与群聊的独立协议、权限和恢复方案见 [当前协作工作区](COLLABORATION-WORKSPACE.md)。

用户新增副管理员要求后，核对[飞书管理员类型与角色](https://www.feishu.cn/hc/zh-CN/articles/927897012636-%E7%AE%A1%E7%90%86%E5%91%98%E7%B1%BB%E5%9E%8B%E5%92%8C%E8%A7%92%E8%89%B2%E4%BB%8B%E7%BB%8D)，采用日常管理与权限授予分层。平台固定五项职务可叠加，副管理员参与项目和验收，主管理员保留职务授权；学术资料不授予任何权限，没有实现自定义角色后台。
