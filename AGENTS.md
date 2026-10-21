# AGENTS.md — 本仓库 Agent 约束

2026-10-21 接续范围：用户授权登录背景全屏与半透明浮层、账号隔离和敏感信息检查，并在完善后更新 GitHub、发布 0.6.0。foundation/root 负责共享 auth 展示、共享账号请求防护、ai/resources 配置与存储边界及对应检查；root 串行整合此前已登记成果、完整测试、Windows 构建与独立运行包验收后发布。保留原认证语义、锁定登录文件、core、schema、依赖和历史数据，不提交本机配置、缓存、密钥或用户数据；评估建议仍不视为业务扩权。

本轮发布验收补修既有 Windows 停止脚本的跨端口清理与退出竞态：只处理指定端口且已核实入口归属的进程及其自身 Next 祖先链，拒绝其他工程；停止夹具改在独立目录、随机端口和空模拟数据库内运行，不触碰真实演示库。用户随后明确演示/测试数据可以保留，重点不泄露 API 配置；真实服务器配置保持原样。

> 给任何编码 Agent（Claude / Cursor / Copilot 等）的硬规则。**先读完再改代码。**
> 人类协作者请看 [docs/TEAM.md](docs/TEAM.md)。

## 0. 工作区与身份

- 只动 `E:\AgileCampus`（本仓）。**不要**改 `E:\agilecampus-master\`（旧仓，只读参照）。
- 目标平台是 **Windows**。禁止 bash-only 语法（`export`、`rm -rf`、`&&` 链式脚本）；npm scripts 必须跨平台。
- 本期目标：课设框架，**刚需完整 + 重要占位 + 创新只挂路牌**。用户最新授权真实模型 API 配置/测试、对话和确认采纳任务规划，取代早期仅本地草稿限制；不扩展为三级 Agent / 通用 Agent API / 甘特 / Sprint / 作品集 / 模板库。

## 1. 模块边界与当前授权

默认单模块 Owner 开发；完整跨模块链路先登记范围，再由对应 Owner 通过公开契约协作。root 可接续已登记模块的集成遗漏，不覆盖成员分支、不顺手重构。

| 路径 | Owner / 规则 |
|---|---|
| `src/modules/<m>/**` | 仅该模块 Owner 修改 |
| `src/lib/{auth,password,feishu,user}.ts` | 锁定；登录原样保留，不换库 |
| `src/modules/core/**` | 仅 foundation；说明理由并走 `feature/core-patch/<slug>` |
| `src/db/schema.ts` | root 串行集成，只在末尾追加，不重排既有块 |
| `package.json` 依赖 | 锁定；确需新增在 PR 单独声明理由 |
| `src/app/**/page.tsx` | 对应 Owner；只调模块 UI/views，不写业务 |
| `tests/contract/<m>/**` | 对应 Owner；每模块至少 6 条 |
| `docs/TEAM.md` | 对应契约 Owner；改变 index.ts 签名必须同步 |

| 模块 | Owner | 职责 |
|---|---|---|
| core、identity、共享 UI、lib | foundation | ACL/session/日期、团队项目与职务、共享入口 |
| resources | foundation/resources Owner | 共享资料、目录、版本、权限、恢复与引用保护 |
| tasks、delivery | A | 五态任务、结构化成果/逐项验收、阶段交付 |
| board | B | 看板/表格、同源筛选、拖拽与本人视图 |
| review、discussions | C / root | 工作台、验收、活动、讨论及历史 |
| worklog（含 stats） | D | 工时、完成度与贡献 |
| calendar、milestone、notify | E | 日历、节点、关注/偏好与本人通知 |

0.5.0 跨模块协作与 R7 验收已完成，`codex/v050-collaboration-release` 已合入 main 并发布。现行能力与数据规则见 [DESIGN](docs/DESIGN.md)，契约见 [TEAM](docs/TEAM.md)，实际检查见 [UX](docs/UX.md)，历史范围见 CHANGELOG/Git。DB 检查、schema/迁移集成和最终发布由 root 串行执行。

当前授权保留团队/项目共享资料、身份与叠加职务、任务/讨论/验收/交付、本人日程提醒、统一通知，以及真实模型配置/测试、对话与确认创建规划任务；不调整 core、登录或依赖，不运行 OCR、实时共同编辑、群聊或外部自动同步。历史工时保留，产品流程改为任务贡献。Marker 仅导入真实转换产物。副管理员仅作为已追加的 deputy 枚举值，旧迁移与其他成员职务不改写。下列日期记录保留各轮当时授权，冲突时以最新接续范围为准。

文档整理已完成。用户随后授权修复侧栏项目选择丢失：foundation/root 仅调整共享 AppSidebar、按账号保存的浏览器项目上下文及对应契约测试/文档；全局页面沿用选中的可访问项目，进入另一项目时切换，不自动选取首个项目。保留现有文档整理，不调整业务、core、登录、数据库或依赖，不覆盖已发布 tag/Release。

接续优化包含共享 AppShell 的侧栏折叠存储与快捷键、AppSidebar 的项目选择空状态和选中提示，以及相应测试与文档，继续保持上述模块边界。

用户进一步授权完善现有功能与排版。本轮登记 root/review 工作台范围：基于现有 getWorkbench 权限结果增加待办摘要、状态/日期筛选、排序、分页与响应式布局，修改 review 的 client/views、对应契约和文档；通过已公开的 identity/tasks 契约读取项目与执行任务操作，不修改其他模块业务、core、登录、数据库或依赖。

2026-10-14 用户授权“更新 md 并 PR”：同步本轮文档，将已有文档整理、共享侧栏及 root/review 工作台成果、契约测试和截图提交到 `codex/v051-workbench-sidebar-docs`，创建目标为 main 的 PR。候选版本保持 `0.5.1-rc.5`；该授权取代此前仅本地修改的限制，不包含合并、tag、Release 或运行包发布。浏览器待测项继续如实保留在 UX。


2026-10-14 用户进一步授权规划和完善 Agent 查阅、整理及云端资料控制。本轮 foundation/root 范围为 `components/ai`、对应契约测试与文档：先接通既有团队/项目资料 API，提供主动打开后的搜索、正文查阅、版本来源引用和名称/标签修改预览；写入仍使用 resources 的当前账号 ACL、版本校验和既有更新接口。模型执行与外部资料连接另列阶段方案，本轮不新增依赖、数据库、登录或 core 改动，不将本地配置草稿描述为已连接服务。本轮不自动修改任务或批量执行资料操作。

2026-10-14 接续范围登记：用户授权资料库文件浏览排版与 Markdown 阅读、移除工时产品流程并改为任务贡献统计、完善 AI 配置、页面说明集中到个人指引、通知设置集中到个人设置及工作通知减噪、任务图标打开详情与依赖措辞优化。对应 Owner 协作：foundation/resources 负责资料 UI；D/worklog 负责任务贡献查询与页面并停用工时写入入口；A/tasks 与 B/board 负责任务入口及依赖展示；foundation/root 负责 AI 配置、共享指引与设置；E/notify 负责消息展示与设置入口集成。历史工时表与记录保留，不运行破坏性迁移；登录/core/依赖不改。root 串行集成文档、版本和完整验收。

2026-10-14 用户要求使用指引从个人中心独立，并增加图例、替换指引图标。本轮 foundation/root 仅调整 identity 的指引/设置组合、共享侧栏及 AI 指引链接，新增 `/guide` 薄页面与相应文档/检查；指引图例采用已有图标、状态与公开任务转移契约，不执行业务操作。保留此前未提交成果，不修改业务权限、登录、core、数据库或依赖。

2026-10-15 用户授权里程碑任务树与顺序关联可视化，并规划 AI 辅助拆分/调整。本轮登记 E/milestone 负责新增 client/ui/views 与薄页面，通过 tasks 公开读取契约展示真实任务层级、依赖和五态；foundation 负责 AI 工作区的可编辑任务树本地草稿、规划输入/导出及来源上下文。AI 模型尚未接入，仅承接人工编辑或真实外部结果，不生成模拟模型回答、不自动创建/变更真实任务与依赖。root 串行集成文档、版本和验收；不改 core、登录、依赖、数据库或其他模块业务。父子层级与依赖顺序分别展示，不假定树形层级等于执行顺序。

2026-10-15 用户接续要求可折叠内容默认收起，减少资料库侧栏与里程碑杂乱。本轮 foundation/resources 和 E/milestone 仅调整目录/分组/任务树的初始展开、搜索命中展开与键盘可达；root 整合其他已可折叠区域的默认状态，不隐藏必要表单/当前阅读内容，不改资源与任务业务、权限、数据库或依赖。

2026-10-15 用户明确纠正此前仅本地草稿的范围，要求现在可填写真实模型 API 并测试，参考开源 CC Switch 的配置项。本轮以此最新授权替代上文“模型不接入/只保存变量名”的限制：foundation/root 新增 ai 模块及薄 API，接通直接密钥配置、真实连接测试/对话/任务规划，密钥不进入浏览器持久化明文或导出；生成结果由本人预览并明确采纳后通过 tasks 公开契约创建真实任务。A/tasks、B/board、E/milestone 与 root/review 协作清理页面及可展示错误中的“依赖/阻塞”术语，改为任务先后与等待说明，不改五态或权限。保留历史数据与已有未提交成果；不修改登录/core/依赖/schema，不自动改已有真实任务，不发送任何未选资料。root 串行集成版本、文档与完整验收。

## 2. 架构不变量

2026-10-16 用户要求继续优化AI输出，参考GPT交互式UI及外部优秀项目README，支持由用户审批改动请求。本轮foundation/ai与UI Owner接续既有插件/规划范围，采用受限结构化摘要、问题、路线与改进提案卡片；数据经Zod校验，仅映射本仓可信组件，不执行模型生成HTML/JS或任意动作。改进请求默认待审，用户选择后进入既有规划预览与确认创建项目任务链路；现有任务修改仍走已登记版本/权限契约，不将提案批准等同于自动改网站源码、执行命令或部署。root研究ChatKit/A2UI/json-render等官方文档及README，记录采用内容、实际能力和检查范围；不新增依赖、core/登录/schema变更，保留当前API及所有既有成果，日常针对性检查。

2026-10-16 用户接续要求将提问模板改为插件库弹窗，按功能开关扩展文本模型的工具能力，并参考优秀MCP/插件实现。foundation/ai Owner 负责按账号加密的插件设置、内置工具实际执行开关及受控远程MCP连接/工具发现/调用；foundation UI Owner 负责插件库弹窗、工具状态/开关/连接表单和旧模板入口迁移；root研究官方协议及优秀项目、串行集成文档版本和针对性GUI验证。MCP仅连接本人明确配置的HTTP服务，不执行本机命令或安装第三方代码，不扩大项目ACL，不自动执行业务写入；默认不启用外部工具，凭据不进入浏览器持久存储。既有文件文字读取继续可供纯文本模型使用，不把协议连接称为模型原生多模态，不宣称运行未接通的OCR/语音/图像服务。保留真实模型API配置和所有既有成果；不改core/登录/schema/依赖，全面测试仍留到发布。

2026-10-16 用户进一步要求根据具体资料/任务简介梳理规划、路线和需求扩展建议，并自行确认是否应用。foundation/ai负责现有规划链路的来源衔接；A/tasks Owner 与foundation协作新增独立任务建议入口，读取真实任务/验收上下文，呈现目标建议、可选扩展和路线。本人预览勾选并明确确认后，才通过tasks.updateTask公开契约修改标题/工作背景，携带expectedUpdatedAt；待验收/已完成目标冻结，历史和其他字段保留。任务拆分继续进入现有规划预览/确认创建链路，不自动修改先后关系或验收结论；无新数据库实体/迁移，不增加甘特/Sprint，保留既有成果。根串行集成独立AI入口导出和文档。

2026-10-16 用户已接真实API，接续授权完善AI聊天、主动检索本人有权限的数据库资料及参考DeepHarness文件能力。foundation/ai Owner 负责有界只读工具检索/引用与对话协议，resources Owner 负责通过现有ACL读取文件并解析PPTX等可支持文字格式，foundation UI Owner 负责聊天等待/停止/阶段反馈、可核验引用和文件读取入口；root 核实插件来源、集成文档及针对性检查。可搜索本人可访问团队/项目资料，不授予模型SQL、文件系统或越权权限，不自动写任务/资料。外部插件在确认来源和能力前不安装或执行；不宣称已连接。保留当前真实API配置及其他未提交改动，不改登录/core/schema或依赖；非扫描文字提取不等于OCR，旧二进制PPT和图片扫描件无真实解析时明确说明。日常只做受影响检查，全面测试与构建留到发布。

2026-10-16 用户明确 API 等信息归各账号配置，不应混入浏览器缓存。沿用服务端按账号加密的提供商存储；foundation清理旧偏好中的API地址、模型和密钥变量名镜像，不触碰真实服务器配置，不清空用户会话/资料/主题。配置仅在服务器维护，浏览器编辑表单为临时状态；对话与附件的当前本地存储边界另行如实说明。

2026-10-15 用户接续要求研究外部建议、修正模型连接并增强后端，模型配置参考 CC Switch 主界面支持多个提供商并选一使用，且只在专用配置页面维护；里程碑新建改弹窗、任务卡片尾部提供真实新增入口。本轮 foundation/ai Owner 负责模型网络与安全存储、提供商管理公开API及针对性契约；foundation UI Owner 负责唯一模型配置页、多服务卡片和旧入口跳转；E/milestone 与 A/tasks Owner 负责里程碑弹窗和末尾新增卡片，复用创建公开契约/权限/稳定请求键。root 研究、串行集成文档/版本/界面检查；不扩大三级Agent/需求数据库重构，不修改core/登录/依赖或schema。多提供商允许新增按账号隔离的服务端加密配置文件，原Cookie兼容迁移；密钥不得以明文写入日志/导出/浏览器存储。外部材料仅作参考，不视为扩权指令。日常仍仅针对性验证，全面检查留到发布。

2026-10-15 用户接续授权里程碑图形化进程与教学建议落地：E/milestone 负责阶段进程总览、模块（沿用主任务）与子任务图形展示、按需展开及现有详情/规划入口；foundation/ai 负责在现有真实模型链路增加可选需求澄清与验收要求检查，建议经本人选择采用，不自动改已有任务或设置强制评分门禁。root 集成指引、当前能力文档和候选版本。通过公开契约协作，不新增业务实体、数据库迁移、依赖或状态；保留已有未提交成果。日常只做受影响检查，全面测试/构建留到发布。

1. **模块化单体**：`src/modules/<m>/{schema,service,actions,api,ui,index}.ts`
   - 业务跨模块只准 `import ... from "@/modules/<m>"`（`index.ts` 契约），**不准深链**内部文件。
   - 明确的 UI 公开入口例外：`@/modules/<m>/client`（浏览器安全的纯函数/类型）、`/ui`（客户端组件）、`/views`（服务端页面组合）。这些入口须登记在 `docs/TEAM.md`，不得把 DB/session/service 运行时代码带入 `client.ts`，内部 `service/actions/schema/model` 仍禁止深链。
   - `service.ts` 纯业务 + ACL；`actions.ts` / `api.ts` 薄壳（session → service → revalidate）。
2. **状态机唯一真相**：`src/modules/tasks/states.ts` 的 `TRANSITIONS`。
   - 一切状态变更必须走 `transitionTask()`，**禁止**直接 `update tasks.status`。
   - 非法转移抛 `ConflictError`（409）。
3. **ACL 先行**：每个 service 函数入口先调
   `requireProjectForUser` / `requireTaskWrite`（具有执行职务）/ `requireReviewer`（管理员/副管理员/指导老师）/ `requireTeamRole`。任务能力由 `identity/client.capabilitiesFor` 按职务并集和项目场景计算，身份不得参与授权。
4. **错误**：只抛 `AppError` / `ForbiddenError` / `NotFoundError` / `ConflictError`；message 可直接展示给用户（中文）。
5. **日期**：一律 `YYYY-MM-DD` 字符串（用 `@/modules/core/dates`）；工时用 `minutes: number`。
6. **校验**：边界输入用 Zod v4；DB 信任内部调用。
7. **UI**：复用 `src/components/ui/*`；状态用 `<StatusPill>`；设计 tokens 在 `globals.css`（品牌 `#294a78`，点缀 `#bf6a34`）。
8. **交互同源**：按钮、拖拽目标和服务端权限都使用 `availableTransitions()`；不得复制角色×状态按钮表。提交/重交需完成说明，打回需修改意见，指派选择团队成员，禁止让用户输入数据库 ID。
9. **一致性**：`transitionTask()` 在事务中锁住任务后查转移表，状态与事件一同提交；并发认领不能覆盖负责人。失败或取消时卡片保留原列，成功后刷新相关视图。
10. **产品链路**：团队空间 → 成员与角色 → 项目/课题 → 任务 → 验收。实验室在本期是团队空间内的 `lab` 类型项目；不新增实验数据、实验专属文件库和设备管理。用户授权的通用团队/项目资料由 resources 模块管理。
11. **个人日程**：仅当前账号读写，团队职务不授予他人日程访问。日期仍为 `YYYY-MM-DD`，可选时间为同日 `HH:mm`；编辑/删除携带版本，旧版本返回 409，个人日程不修改项目任务。

## 3. 禁止事项

- AI 通过已登记模块提供真实 API 配置/测试、对话和任务规划，不接入 AI SDK、不生成模拟模型回答。用户确认采纳后才通过 tasks 公开契约创建任务，不自动改已有任务/状态；通用 agent-api、gantt、sprint、portfolio、templates 留在路线图。
- 不要引入 AI SDK、MSW、重型状态库、CSS 框架以外的 UI 套件。
- 不要写多段 docstring / 注释块；注释只写非显而易见的 WHY。
- 不要为不可能的分支加 fallback；不要留半成品抽象。
- 不要改登录语义（Credentials + 飞书双 provider、JWT session、bcrypt）。
- 不要用 `any`；不要关 `strict`。
- 不要动 `.gitattributes` / `.editorconfig`（LF + UTF-8）。

## 4. 完成定义（DoD）

2026-10-15 用户要求日常测试简化，全面测试留到发布。本项按最新授权调整：日常只运行与实际改动直接相关的检查及必要页面确认，不重复全量测试/生产构建；扩大改动或发现异常时再补相关检查，不以未完成的检查宣称全面通过。

发布前必须：

```powershell
npm test          # 全绿
npm run build     # Windows 上零改动通过
```

- 新增/改动模块行为 → 契约测试覆盖 happy path + 越权 + 非法状态转移。
- 改了 `index.ts` 导出 → 同步 [docs/TEAM.md](docs/TEAM.md) 对应契约节。
- 只包含本模块相关文件；不顺手重构别人的目录。
- 体验改动按 [docs/UX.md](docs/UX.md) 检查空状态、姓名指派、取消/失败、角色权限、键盘操作与窄屏；看板/表格切换保留 URL 筛选。
- 每轮完成验收的集成迭代递增版本，同步 `package.json`、`package-lock.json` 根与根包版本、README 及 `CHANGELOG.md`。候选版递增 `rc` 序号，合入主分支并重新验证后才标正式版；只为本轮版本创建对应 tag，不覆盖历史 tag。规则见 [docs/WORKFLOW.md](docs/WORKFLOW.md#8-迭代版本与发布)。

## 5. 测试约定

- 集成测试打真实 Postgres `agilecampus_test`（见 `.env.test`），`fileParallelism: false`。
- 夹具用 `tests/helpers.ts` 的 `resetDb()` / `makeUser()`。
- 无 Docker / DB 时，至少保证纯函数用例绿：
  ```powershell
  npx vitest run tests/contract/exports.test.ts tests/contract/core tests/contract/identity/password.test.ts
  ```

## 6. 常用命令

```powershell
start.bat          # 首次自动初始化，以后直接启动；关闭窗口停止网站
start.bat -ConfigOnly # 仅生成缺失环境配置
start.bat -Setup    # 显式安装锁定依赖 + 新库 schema + 空库示例
stop.bat           # 停止开发服务器；-All 一并停止数据库
npm run db:push    # schema → dev 库
npm run db:push:test
npm run db:seed    # 演示账号 admin@ / student@agilecampus.local
npm test
npm run build
npm run clean      # 清 .next / coverage
```

细节见 [docs/WINDOWS.md](docs/WINDOWS.md) · 链路与状态机见 [docs/DESIGN.md](docs/DESIGN.md)。

## 7. 身份与职务补充约束

- 学术身份由本人填写、另一位团队管理员按当前资料版本确认；修改资料使旧确认失效，确认不得跨团队复用。
- 职务管理必须验证操作者、目标归属并保留至少一名管理员。兼容三态 role 由职务派生，不赋予学术身份任何权限。
- 队长仅管理实验室/竞赛项目与指派；验收保持管理员/副管理员/指导老师权限。按钮、拖动和服务端共享能力及转移规则。
- schema 只追加，已有库升级运行 `node scripts/migrate-identity.mjs`，不得通过清空历史数据消除约束差异。
- 调整身份/职务/状态行为时同步 [docs/IDENTITY.md](docs/IDENTITY.md) 与契约测试；PR 来源与取舍记录在 [docs/PR-RESEARCH.md](docs/PR-RESEARCH.md)。

## 8. 可选外部连接

- 平台账号、资料、团队权限、任务和验收独立于飞书；外部资料仅在本人确认后采用，不自动覆盖姓名、头像或身份。
- 连接摘要不暴露 openId、密码或应用密钥；解绑只允许会话本人，校验当前绑定版本并保留可用登录方式。历史 `@feishu.local` 占位邮箱账号当前禁止解绑。
- 尚未接入业务投递的飞书私信不显示启用开关或成功承诺；实际能力与联调范围同步 [docs/FEISHU.md](docs/FEISHU.md)。公共验证归 foundation，成员模块继续按 Owner 协作。

## 9. 任务交付边界

管理者发布至最终验收使用以下约束：A/tasks 与 delivery Owner 负责负责人、逐项验收要求、稳定请求键、编辑版本与草稿保护，以及指派/认领、执行、结构化提交、打回重交、逐项验收、重开和真实交付引用；C/review Owner 通过 tasks 公开查询与 `availableTransitions` 保留依赖、子任务与当前权限守卫，不复制状态机。创建输入实际字段为 acceptanceCriteria，验收要求保存使用 criteria；GUI 编辑必须携带 expectedUpdatedAt，submitted/accepted 的工作目标与验收要求冻结，变更需先打回或重开，历史提交/评审/交付快照保留。签名见 [docs/TEAM.md](docs/TEAM.md) 的公开契约。

任务交付接续不增加第六状态，不修改 core、登录文件或依赖，不扩大为 Sprint、代码同步、实时共同编辑或群聊；真实模型调用按上方最新 ai 模块范围执行。各 Owner 只修改自身模块并通过登记的公开契约协作。DB 检查、构建与综合 GUI 验收由 root 串行集成；当前候选未合并或发布，不以局部检查代替发布验收。

2026-10-19 用户授权参考两份 research 重构知识库前端并补充个人收藏。foundation/resources 负责阅读器、资料浏览、按账号收藏存储与页面；foundation/root 集成共享侧栏及适配、文档和针对检查。沿用资料 ACL，不改登录/core/schema/依赖，保留已有工作。

2026-10-19 用户纠正上一轮仅功能微调，要求 Notion 式知识库布局。foundation/resources 接续将抽屉阅读改为页面正文、目录导航与渐进展开操作；保持编辑/评论草稿、权限、URL 与版本链路，不新增块编辑器或数据库模型。

2026-10-20 用户授权评估项目、参考外部资源并重构登录页面。foundation/root 本轮仅调整登录薄页面与共享 auth 展示组件，采用右侧登录、左侧校园漫画拼贴与真实功能介绍，补充密码显隐、字段标签、错误播报与窄屏布局；用户随后要求去掉人物，参考厦门大学地标和建筑照片重绘，美术资源随仓库保存。保留 Credentials/飞书双入口、原登录 action、JWT 与 bcrypt；不改锁定登录文件、core、数据库、依赖或其他模块业务。评估与创新建议记录在 PR-RESEARCH/ROADMAP，建议不等于获准实施；串行更新候选版本与实际检查，保留所有既有未提交成果。

2026-10-20 用户接续要求手机使用独立背景、主题改为浅蓝并加入厦门大学校徽，随后明确浅蓝偏淡，要求增强深浅对比。foundation/root 仅接续共享 auth 展示、美术资源和相关文档：桌面建筑拼贴与手机山海全景分别生成并按断点选择，浅蓝配深海军蓝强化层次，校徽取自厦门大学官方学校标识页并保持原比例。保留原认证和全部既有工作，不改登录业务、core、schema、依赖或其他 Owner 模块；本轮仍只做受影响检查，不发布。
