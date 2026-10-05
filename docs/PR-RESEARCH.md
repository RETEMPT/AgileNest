# GitHub PR 调研与落地

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

没有采用通用软件“提交即完成”的语义，只有验收通过才是已完成；没有引入自定义工作流、Sprint、甘特、AI、学籍认证或实验数据文件库。规则与升级说明见 [IDENTITY.md](IDENTITY.md)。

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

按用户指定方向核对 [DeepSeek Harness 的 ui-chat](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/ui-chat/README.md)、[Harnss](https://github.com/OpenSource03/harnss) 与 [Open WebUI](https://github.com/open-webui/open-webui) 的公开仓库说明。采用清晰的主区/输入区、可收起的会话列表、标题/内容搜索与移动抽屉。Harnss 当前自述处于早期开发并将重写，作为交互参考，不作稳定运行时依赖；没有声称此为官方 DeepSeek Chat 的源代码。

本仓仍采用既有品牌色、字体、SVG 线宽与共享 UI，自行实现，未复制外部代码或图形。用户已确认先做界面与本地草稿，模型调用与三级 Agent 不在本轮；空回复、推理过程、工具进度和历史对话不填演示内容。新建的验收草稿均标为本地界面验收，不写入团队任务。能力、存储限制与后续接入边界见 [AI.md](AI.md)。
