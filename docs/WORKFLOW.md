# 开发工作流全流程

> 从新人上手到发布上线的完整路径。配合 [CONTRIBUTING.md](../CONTRIBUTING.md) 和 [AGENTS.md](../AGENTS.md) 使用。

---

## 1. 全流程总览

```
环境准备 → 创建分支 → 开发 → 本地测试 → 提交 → 推送 → PR → Review → 合并 → 发布
                                              ↑                         │
                                              └───── 修复反馈 ←──────────┘
```

---

## 2. 新人首次上手（30 分钟）

```powershell
# ① 确认前置工具
node -v     # >= 22
git --version

# ② 克隆仓库
git clone https://github.com/RETEMPT/AgileNest.git
cd AgileNest

# ③ 首次自动初始化，以后直接启动开发服务器
.\start.bat

# ④ 保持窗口打开，关闭窗口停止网站

# ⑤ 浏览器验证
# http://localhost:3000/login → 用 admin@agilecampus.local / password123 登录
```

初始化完成后你会看到：登录页 → 今日工作台（有示例任务可点）。

---

## 3. Git 分支模型

### 分支结构

```
main          ← 生产发布，打 tag
  └─ develop  ← 集成分支，所有 PR 合到这
       ├─ feature/tasks-status         ← A：五态状态机
       ├─ feature/board-views          ← B：看板 / 表格
       ├─ feature/review-portal        ← C：验收台 / 双首页
       ├─ feature/worklog-stats        ← D：工时 / 统计
       ├─ feature/calendar-notify      ← E：日历 / 里程碑
       └─ feature/core-patch/<slug>    ← 任何人修 core 的临时分支
```

### 创建分支

```powershell
git checkout develop
git pull origin develop
git checkout -b feature/<模块名>
# 例：feature/tasks-status
```

### 提交规范

```
<type>(<scope>): <一句话说明>

type: feat | fix | chore | docs | test | refactor | perf
scope: tasks | board | review | worklog | calendar | milestone | notify | core | identity

feat(tasks): add subtask completion ratio calculation
fix(board): prevent drag to illegal status column
docs(worklog): update API contract for addWorklog
```

### 合并策略

```powershell
# PR 合并前 rebase 保持历史干净
git checkout feature/tasks-status
git fetch origin
git rebase origin/develop
# 解决冲突后
git push origin feature/tasks-status --force-with-lease

# 合并到 develop（保留提交历史）
git checkout develop
git merge --no-ff feature/tasks-status
git push origin develop
```

---

## 4. 新功能开发完整路径

### 4.1 规划

```
1. 打开 docs/TEAM.md → 找到你的模块目录和契约
2. 确认要改哪些 service 函数（签名是否需要变动）
3. 写契约测试（先于代码，保证接口稳定）
```

### 4.2 编码

```
src/modules/<你的模块>/
  schema.ts      ← 加字段/表（只追加，不重排）
  service.ts     ← 业务逻辑 + ACL（纯函数，无 UI 依赖）
  actions.ts     ← server action（useActionState 用的）
  api.ts         ← RESTful 路由处理（可选）
  ui.tsx         ← 客户端组件（"use client"）
  index.ts       ← 公开契约（只 export 需要被外部 import 的）
```

**核心规则：**
- actions/API 使用 session；service 接收 actorId 并在读取项目或团队数据时先检查 ACL
- 状态变更走 `transitionTask()`，绝不直接 `UPDATE tasks SET status=...`
- 路由 `page.tsx` 只做壳：调 `ui.tsx` 的组件，不写业务
- 页面组合放在模块 `views.tsx`；客户端规则从登记的 `client.ts` 导入，业务仍走模块根契约
- 状态按钮与看板目标复用 `availableTransitions()`，不得复制角色×状态表

### 4.3 写测试

```powershell
# 在 tests/contract/<模块>/ 下新建测试文件
# 每个模块 ≥ 6 条：happy path + 越权 + 非法状态转移
```

示例结构：
```ts
describe("tasks", () => {
  it("happy path: claim → submit → accept", ...);
  it("越权：student 不能 accept", ...);
  it("非法状态：accepted 状态不能 claim（409）", ...);
  it("submit 必须填 completionNote", ...);
  it("非本项目成员不能读", ...);
  it("subtask 完成度计算正确", ...);
});
```

### 4.4 本地验证

```powershell
npm test        # 全绿
npm run build   # 零错误
npm run dev     # 浏览器手动点一遍流程
```

### 4.5 提交 & 推送

```powershell
git add <你改的文件>
git commit -m "feat(tasks): ..."
git push origin feature/<分支名>
```

### 4.6 开 PR

在 GitHub 上开 PR 到 `develop`，使用仓库自带的 PR 模板：

- 勾选「模块归属」
- 填「做了什么」（重点说 why，不是 what）
- 确认「契约变更」和「测试证据」
- 如果动了不属于你的目录，在「目录越界」里说明理由

---

## 5. Bug 修复路径

```powershell
# ① 从 develop 切分支
git checkout develop
git pull
git checkout -b fix/<简短描述>

# ② 定位问题 → 写失败测试（先失败再修）
# ③ 修复 → 测试通过
# ④ npm test + npm run build
# ⑤ 开 PR，type 填 fix
```

---

## 6. 测试工作流

### 快速测试（纯函数，无需数据库）

```powershell
npx vitest run tests/contract/exports.test.ts tests/contract/core tests/contract/identity/password.test.ts tests/contract/tasks/states.test.ts tests/contract/board/board.test.ts
```

### 完整测试（需要 Postgres）

```powershell
npm test
```

> Docker 测试库 `agilecampus_test` 在首次初始化数据卷时创建。已有卷或本机 PostgreSQL 需先创建测试库，再执行 `npm run db:push:test`，见 [Windows 说明](WINDOWS.md)。

### 什么必须写测试

| 改动 | 测试要求 |
|---|---|
| 新增 service 函数 | happy path + 越权 + 边界 |
| 状态转移逻辑 | 覆盖 `TRANSITIONS` 表中所有合法/非法路径 |
| ACL 变更 | 越权访问必须返回 `ForbiddenError` |
| 前端 UI | 可选，手动浏览器验证 |
| 改了 `index.ts` 导出 | 必须更新 `docs/TEAM.md` |

---

## 7. 数据库 Schema 变更

```
# ① 在模块的 schema.ts 加字段/表（追加到文件末尾）
# ② 生成迁移 SQL
npx drizzle-kit generate

# ③ 手动应用（Windows）
# 用 .tools/pgsql/pgsql/bin/psql 或你的 Postgres 客户端
psql -d agilenest -f drizzle/0000_<name>.sql

# ④ 同步测试库
psql -d agilecampus_test -f drizzle/0000_<name>.sql

# ⑤ 同步 .env.test 的连接串（如改了数据库名）
# ⑥ 更新 db/schema.ts barrel（如有新表）
# ⑦ 在 PR 里附上迁移文件
```

---

## 8. PR / Code Review 流程

```
PR 打开 → CI（npm test + build）自动跑
         → 至少 1 人 Review
         → 通过 → 合并到 develop
         → 有问题 → 评论反馈 → 作者修复 → 再次 Review
```

### Reviewer 检查清单

- [ ] 只改了 Owner 目录（对照 docs/TEAM.md）
- [ ] `npm test` 全绿（截图或本地日志）
- [ ] `npm run build` 零错误
- [ ] service 函数入口有 ACL 检查
- [ ] 状态变更走 `transitionTask()`
- [ ] 契约测试 ≥ 6 条
- [ ] 没有引入新依赖（或在 PR 中说明理由）
- [ ] 改了 `index.ts` 签名 → `docs/TEAM.md` 已同步
- [ ] UI 状态操作与服务端同源，指派使用成员姓名
- [ ] 取消/失败不移动任务，看板/表格切换保留 URL 条件
- [ ] 依照 [UX.md](UX.md) 验证团队→项目→任务→验收、角色差异与窄屏

---

## 9. 迭代版本与发布

版本唯一来源为 `package.json.version`；`package-lock.json` 的根版本和 `packages[""].version` 必须相同。README 显示当前分支版本，CHANGELOG 按版本记录变化、升级要求和验证范围。当前集成分支为 `codex/ai-settings-workspace`，通过 PR 交付到 `main`，不要求另建 `develop`。

每轮完成验收的集成迭代必须有递增编号；同一轮中的编辑、小提交和成员模块 PR 不各自升版，由 foundation 集成人统一维护，避免多分支抢占版本。

| 变化 | 递增方式 | 示例 |
|---|---|---|
| 修复、文案、性能或其他兼容维护 | 补丁号 | `0.3.0` → `0.3.1` |
| 新功能或完整体验迭代 | 次版本号 | `0.3.1` → `0.4.0` |
| 不兼容的契约或升级要求 | 次版本号（0.x 阶段），1.0 后主版本号 | `0.4.0` → `0.5.0`，`1.2.0` → `2.0.0` |
| 同一目标正式版的下一轮候选迭代 | 候选序号 | `0.3.0-rc.1` → `0.3.0-rc.2` |

候选版使用 `<目标版本>-rc.<序号>`。本轮 `0.4.0-rc.3` 包含 AI 项目会话与本地文件资料、个人中心设置分区、选填联系方式和 Windows 数据库启动修复；PR 尚未合入主分支时保留候选标识。正式版必须先解决主分支冲突、完成合并，再对最终代码运行测试与 Windows 构建，随后移除候选后缀并提交元数据。不得把分支推送或 tag 当作已经部署。

维护下一轮候选版时，可在版本管理短分支运行下列命令，同步 README、CHANGELOG 与 PR 后完成验证；这里仅更新包和锁文件，不自动提交或打 tag。

```powershell
npm version prerelease --preid=rc --no-git-tag-version
npm test
npm run build
```

每个完成验证并提交的集成版本创建同名注释 tag，如 `v0.4.0-rc.3`；tag 指向该版本提交，既有 tag 不移动、不覆盖。仅推送本轮具体 tag，不使用 `--tags` 批量推送。候选 tag 保留用于追溯；未来正式版 `v0.4.0` 指向主分支中已验证的正式版本提交。正式版本编号同样通过 `npm version <确定的版本> --no-git-tag-version` 更新，并同步上述记录。

查当前本地版本与提交：

```powershell
node -p "require('./package.json').version"
git branch --show-current
git rev-parse --short HEAD
git describe --tags --always
```

---

## 10. 每日开发循环（建议）

```
早上  → git pull origin develop
      → 同步你的 feature 分支：git rebase origin/develop

开发  → 在 src/modules/<你的模块>/ 里改代码
      → 在 tests/contract/<你的模块>/ 里写/改测试

验证  → npm test（全绿）
      → npm run build（零错误）
      → 浏览器手点核心流程

提交  → 小步提交（一个逻辑单元一个 commit）
      → git push origin feature/<分支名>

收尾  → 改动积累够一个功能点 → 开 PR
      → 回复 Reviewer 评论
```

---

## 11. 常见场景速查

| 我要做什么 | 怎么做 |
|---|---|
| 新增一个 service 函数 | 写 service → ACL → actions → ui → 测试 |
| 加字段到现有表 | 改模块 schema.ts → generate → 手动 SQL → 同步测试库 |
| 改公开接口签名 | 改 index.ts → 更新 docs/TEAM.md 对应契约节 |
| 修 core 的 bug | foundation 使用 `feature/core-patch/<slug>`，PR 里说明理由 |
| 加新依赖 | 先在 PR 里声明理由，等 foundation Owner 确认 |
| 本地库起不来 | 跑 `start.bat -Setup`，或检查 5432 端口，或用 `.tools/pgsql` 便携 Postgres |
| 想改登录逻辑 | **不要改**，逻辑原样保留（AGENTS.md §3） |
| 实现 AI / 甘特 / Sprint | **不实现**，只在 ROADMAP.md 留条目 |

---

## 相关文档

| 文档 | 用途 |
|---|---|
| [CONTRIBUTING.md](../CONTRIBUTING.md) | 贡献规则速查 |
| [AGENTS.md](../AGENTS.md) | 编码 Agent 硬约束 |
| [docs/TEAM.md](TEAM.md) | 模块分工 + 契约 |
| [docs/DESIGN.md](DESIGN.md) | 链路设计 + 状态机 |
| [docs/WINDOWS.md](WINDOWS.md) | 环境配置 |

## 本轮身份权限交付

学术身份、可叠加职务和场景权限按 [IDENTITY.md](IDENTITY.md) 与 [PR-RESEARCH.md](PR-RESEARCH.md) 落地。core ACL 补丁先在 `feature/core-patch/member-capabilities` 提交并通过兼容测试，再合入 `codex/workspace-workflow`。集成分支保留当前工作区已有业务与侧栏提交，统一推送并创建面向 `main` 的 PR，不替其他 Owner 合并开放 PR。已有库升级先执行追加迁移，再执行完整测试与 Windows 构建。
