# 开发与发布流程

本文只维护仓库工作流程。环境与排错见 [WINDOWS.md](WINDOWS.md)，模块契约见 [TEAM.md](TEAM.md)，业务与验收见 [DESIGN.md](DESIGN.md)、[UX.md](UX.md)，编码硬约束见 [AGENTS.md](../AGENTS.md)。

## 1. Windows 开发环境

安装 Node.js 22 LTS 和 Git，然后运行根目录 `start.bat`；首次自动初始化，之后直接启动，关闭窗口停止网站。配置、便携 PostgreSQL、测试库和示例账号的细节统一放在 [WINDOWS.md](WINDOWS.md)。

```powershell
.\start.bat
.\start.bat -ConfigOnly # 仅生成缺失配置
.\start.bat -Setup      # 显式安装锁定依赖、初始化空库
```

只操作本仓 `E:\AgileCampus`；旧仓只读。脚本必须跨平台或明确为 Windows PowerShell，不使用 bash-only 语法。环境配置、密钥和运行数据不提交。

## 2. 分支与 Owner

`main` 保存已合入的稳定代码。工作分支从已确认的基线创建，默认使用 `codex/<描述>`；多人集成明确集成分支与 PR 目标，不假定必须有 `develop`，不得覆盖其他 Owner 的未合入工作。

```powershell
git fetch origin
git switch main
git pull --ff-only origin main
git switch -c codex/<描述>
```

按 [TEAM.md](TEAM.md) 的 Owner 开发。完整链路先登记跨模块范围，再通过公开契约协作；core 修改由 foundation 说明理由并使用 `feature/core-patch/<slug>`。登录文件、依赖、schema 与格式文件继续遵守 AGENTS 约束。

## 3. 实现与契约

确认目标行为、模块边界和公开签名，再实现 service → actions/API → UI。service 入口先 ACL；路由只做壳；跨模块业务从根 `index.ts` 导入，已登记的 `client/ui/views` 不得泄露 DB/session/service 运行时代码。

任务状态只由 `transitionTask()` 改变，按钮和拖动使用 `availableTransitions()`；指派按姓名选择。行为变更同步契约测试，公开签名变更同步 TEAM。日期使用 `YYYY-MM-DD`，工时为整数分钟，边界输入用 Zod，错误使用可展示中文消息的 AppError 家族，保持 TypeScript strict。

## 4. 验证

```powershell
npm test
npm run build
```

契约测试每模块至少 6 条，覆盖正常、越权和非法转移；新 service/ACL/并发行为验证对应边界。集成测试使用真实 `agilecampus_test`、`.env.test` 与串行文件执行，夹具使用 `resetDb()/makeUser()`。多人开发由集成人串行运行 DB 检查，禁止重置开发库。

无数据库时至少运行纯函数检查，明确完整 DB 验证尚未完成，不能据此宣布发布验收通过：

```powershell
npx vitest run tests/contract/exports.test.ts tests/contract/core tests/contract/identity/password.test.ts tests/contract/tasks/states.test.ts tests/contract/board/board.test.ts
```

UI 按 [UX.md](UX.md) 检查核心链路、职务权限、姓名指派、空状态、失败/取消保留、键盘和窄屏；看板/表格切换保留 URL 条件。文档整理等低影响变更先做链接、内容与差异检查；提交 DoD 仍以 AGENTS 与本次授权范围为准。

## 5. 数据库升级

仅追加本模块表到 `src/db/schema.ts` 末尾，不重排旧块、不修改历史 SQL/hash。既有 schema 的授权变化单独说明，不能用清库消除约束差异。

新增独立可重复的 SQL 迁移与迁移脚本，在旧库副本验证后由集成人串行应用开发/测试库。迁移成功再跑契约检查；已有库使用对应脚本，`db:push` 不能替代旧数据升级验收。

```powershell
node scripts/migrate-identity.mjs
# 其他追加迁移使用对应 scripts/migrate-*.mjs；支持时用 --test 指向测试库
```

新表同步公开入口、契约和 Windows 运行包 bootstrap 迁移列表。发布包迁移记录验证文件哈希，重复启动保留配置与数据。空库初始化与测试库建立见 WINDOWS。

## 6. 提交与 PR

小步提交一个逻辑单元，列出变更范围与 Owner。Commit 使用 `<type>(<scope>): <说明>`；type 为 feat/fix/chore/docs/test/refactor/perf，scope 使用对应模块或 docs。

```powershell
git add <相关文件>
git commit -m "docs(team): consolidate current contracts"
git push -u origin codex/<描述>
```

PR 使用仓库模板，目标为已确认的 main 或集成分支；描述问题、最终行为、契约/迁移/依赖变化、检查结果与实际限制。多行正文使用 UTF-8 文件和 `--body-file`，保留真实换行。不默认强推或改写他人历史。

## 7. Review 与合并

- 范围与 Owner 正确，跨模块只用公开契约，锁定文件保持边界。
- service ACL、五态入口与 UI 同源，版本/并发冲突和历史引用有保护。
- 公开签名与 TEAM 同步；契约覆盖正常、越权、非法转移。
- Windows `npm test`、`npm run build` 通过，UI 检查范围与未完成项如实记录。
- schema 仅授权追加，升级和运行包迁移列表一致；依赖变化有明确理由。

修复反馈后检查受影响范围。合并前确认 CI 对应当前提交，至少一位协作者 Review；冲突按 Owner 协调，不替其他成员合并开放 PR。发布还需对最终 main 代码重新验证。

## 8. 迭代版本与发布

版本来源为 `package.json.version`，`package-lock.json` 根版本与 `packages[""].version` 必须一致；README 显示当前版本，CHANGELOG 记录变化、升级要求和验证范围。由 foundation 集成人维护，同一轮的小提交和成员 PR 不各自升版。

| 变化 | 递增方式 |
|---|---|
| 兼容修复、文案、性能维护 | 补丁号 |
| 新功能或完整体验迭代 | 次版本号 |
| 不兼容契约/升级要求 | 0.x 递增次版本，1.0 后递增主版本 |
| 同一目标的下一轮候选 | `<目标版本>-rc.<递增序号>` |

候选版未合入 main 时保留 rc 后缀。正式发布顺序：解决冲突并合入 main → 最终代码完整测试和 Windows 构建 → 更新正式版本元数据并提交 → 构建正式包 → 独立目录验证 → tag 与 Release。源码出现新变化时重新检查受影响结果，不能以分支推送或 tag 代替发布。

```powershell
npm version <确定的版本> --no-git-tag-version
```

该命令仅同步包和锁文件，不自动提交/tag；README、CHANGELOG、PR 和记录仍须同步。完成验证的集成版本创建同名注释 tag，指向对应提交；历史 tag 不移动、不覆盖，只推送本轮具体 tag，不用 `--tags` 批量推送。

Windows ZIP 独立验证首装、关闭/停止、重启保留、旧数据升级、配置/源码/密钥/运行数据排除及 SHA256。`release.json.commit` 等于 tag 目标；只上传原始未运行的 ZIP 和 SHA256，发布前核对完整附件与候选/正式状态，发布后验证下载信息。包操作与升级见 [RELEASE.md](RELEASE.md)，实际版本结果集中在 CHANGELOG 与 GitHub Release。
