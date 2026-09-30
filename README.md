# AgileNest · 高校轻量化敏捷项目管理与协作平台

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-16.2.10_(Turbopack)-black?style=flat-square&logo=next.js" alt="Next.js" />
  <img src="https://img.shields.io/badge/React-19-blue?style=flat-square&logo=react" alt="React" />
  <img src="https://img.shields.io/badge/TypeScript-Strict_5.x-blue?style=flat-square&logo=typescript" alt="TypeScript" />
  <img src="https://img.shields.io/badge/TailwindCSS-v4_Monochrome-black?style=flat-square&logo=tailwindcss" alt="Tailwind CSS" />
  <img src="https://img.shields.io/badge/PostgreSQL-17_Native_Portable-336791?style=flat-square&logo=postgresql" alt="PostgreSQL" />
  <img src="https://img.shields.io/badge/Tests-72%2F72_Passing-brightgreen?style=flat-square&logo=vitest" alt="Vitest Tests" />
</p>

> **面向高校教学、课程设计与实验室团队的轻量化敏捷开发系统**。  
> 告别传统软件工程课设的“期末突击、过程黑盒、摸鱼甩锅”，基于现代顶级工程实践打造 **认领 → 推进（工时/子任务）→ 成果提交 → 教师结构化验收/打回 → 闭环结项** 的全链路工作流。

---

## ✨ 核心特性与架构升级

### 1. 🎨 黑白双色极简质感与雅致微点缀 (Monochrome Duotone)
- **纯黑白高反差基底**：消除多余视觉噪声，以清晰的 `#e4e4e7` 微边框与系统字体排印为核心。
- **微蓝与语义指示器**：精细手绘 `1.75px` 极简线性 SVG 图标系统，点缀品牌宝蓝（`#2563eb`）与五态微胶囊，兼顾工业感与雅致感。

### 2. 🗂️ 全局多维协调侧边栏 (Global Coordinating Sidebar)
- **多层级系统统筹**：左侧一级侧栏整合“工作台 / 团队与成员 / 任务状态机 / 多维看板 / 交付物表格 / 日历与节点 / 教师验收台 / 统计概览 / 飞书集成与设置”。
- **多项目上下文无缝切换**：顶层内置项目协调器（Project Switcher），一键穿梭不同课设项目，顶栏平滑集成横向快捷导航。

### 3. 🪟 Interfere 风格双栏工作流抽屉 (Dual-Pane Inspector)
- **880px 宽版双栏体验**：点击任何任务卡片，右侧平滑滑出详情面板，主页面无刷新、不丢失浏览位置。
- **左栏 · 结构化属性矩阵 (Properties Inspector)**：负责人头像、状态微胶囊、开始/截止日期（逾期智能变红）、预估工时与已登记工时、原位流转动作条。
- **右栏 · 活动审计与交付物流 (Activity & Deliverables Feed)**：
  - **交付成果卡片**：等宽字体块（`font-mono`）呈现学生填写的代码提交说明、Git 分支与交付物。
  - **教师打回卡片**：极简红调线框标出打回意见与必修项，拒绝口头或零散群聊沟通。
  - **全生命周期时间轴**：垂直时序连线，精确记录每次转移、操作人与不可篡改存证。

### 4. ⚡ 物理级丝滑阻尼动效与渲染优化
- **三次贝塞尔弹簧曲线**：采用 `cubic-bezier(0.16, 1, 0.3, 1)`（Apple / Linear 级标准），配合 GPU 硬件加速（`will-change: transform`）实现 60~120fps 满帧侧滑。
- **长列表渲染优化**：采用 `content-visibility: auto; contain-intrinsic-size: 0 100px;`，对看板与大任务池进行视口外延迟绘制，大幅降低主线程延迟。
- **并行异步查询优化**：多项目与多监督队列全面采用 `Promise.all` 并行加载，显著缩短页面首包响应（TTFB）。

### 5. 🛡️ 稳固健壮的基础设施
- **原生便携式绿色数据库**：内置 `.tools/pgsql` 便携环境，支持 Windows 本地原生一键拉起，无需依赖重型 Docker Desktop。
- **飞书 OAuth 异常自愈**：未配置 AppID 时自动拦截外部 20028 错误，提供友好内联引导与开发账号跳过模式。

---

## 🚀 快速开始（Windows 环境）

本项目深度适配 Windows 开发环境，提供完整的脚本生命周期管理：

### 1. 首次初始化与环境构建
双击运行或在终端执行：
```powershell
setup.bat
```
> **自动完成**：拉起本地 PostgreSQL、创建数据库与 `.env`、安装依赖、推送 Drizzle Schema、注入演示初始数据。

### 2. 日常启动与停止
```powershell
start.bat     # 一键后台守护数据库并拉起 Next.js 极速热重载
status.bat    # 实时查看数据库和 Web 服务端口健康状态
stop.bat      # 优雅关闭所有进程，清理后台占用
```

### 3. 访问与演示账号
打开浏览器访问：<http://localhost:3000/login>

| 角色 | 演示账号 | 默认密码 | 说明 |
| :--- | :--- | :--- | :--- |
| **系统管理员** | `admin@agilecampus.local` | `password123` | 全系统管理、创建项目与团队 |
| **指导教师** | `teacher@agilecampus.local` | `password123` | 多项目大盘监督、任务验收与打回 |
| **学生成员** | `student@agilecampus.local` | `password123` | 认领任务、填报工时、提交成果交付物 |

---

## 🔄 核心状态机唯一真相

系统严格遵守五态状态机定义，一切状态流转强制校验前置守卫与用户权限：

```
unclaimed (待认领) ──claim──→ in_progress (进行中) ──submit──→ submitted (待验收) ──accept──→ accepted (已完成)
    ↑                              │                               │
    └──unclaim (退回池)────────────┘                               └──reject (打回)──→ rejected (待修改) ──resubmit──→ submitted
                                teacher assign (直接指派) ──→ in_progress
                                accepted (已结项) ──reopen (重新激活)──→ in_progress
```

- **非法转移拦截**：非状态机允许的操作统一抛出 `ConflictError` (409)；
- **越权保护**：学生仅可提交本人认领任务，学生禁止验收任务；仅教师/管理员有权进行验收或打回；
- **代码唯一真相**：[`src/modules/tasks/states.ts`](src/modules/tasks/states.ts)。

---

## 📂 模块化单体目录规范

跨模块只准通过 `@/modules/<m>`（`index.ts` 契约）导入，禁止越权深链：

```
src/
├── app/                  # Next.js App Router 路由壳（只调本模块 UI，不写底层业务）
│   ├── (auth)/           # 登录 / 注册 / 飞书回调安全代理
│   ├── (app)/
│   │   ├── (home)/       # 学生自主工作台 · 教师监督与风险预警大盘
│   │   ├── t/            # 团队管理 · 邀请码生成 · 项目一览
│   │   ├── p/[projectId] # 项目工作区：任务池、看板、表格、日历、里程碑、验收台、工时统计
│   │   └── settings/     # 个人偏好设置 · 飞书账号互联绑定
│   └── api/              # v1 RESTful API、Auth.js、Cron 提醒定时触发器
├── components/           # 高度复用的 UI 原语
│   ├── app-sidebar.tsx   # 全局多维协调侧边栏
│   ├── icons.tsx         # 手绘 1.75px 极简线性 SVG 矢量图标集
│   ├── cards/            # 高密度卡片流系统
│   │   ├── workstream-card.tsx    # 核心任务工作流卡片（支持 minimal 极简渐进披露）
│   │   ├── task-drawer.tsx        # Interfere 风格双栏详情抽屉
│   │   ├── task-audit-stream.tsx  # 全流程不可篡改活动审计时间轴
│   │   └── telemetry-card.tsx     # 高反差遥测大盘指标卡片
│   └── ui/               # 基础设计微原语 (Button, Badge, StatusPill, EmptyState)
├── db/                   # Drizzle ORM SchemaBarrel 与原生 Client 连接池
└── modules/              # 核心业务模块单体
    ├── core/             # Session 会话、ACL 鉴权守卫、ISO-8601 日期、AppError 错误域
    ├── identity/         # 用户、团队、项目、权限策略
    ├── tasks/            # 任务 CRUD、子任务拆解、五态唯一状态机
    ├── board/            # 拖拽流水线、多字段透视看板
    ├── review/           # 待验收队列、逾期风险扫描、全流程事件流
    ├── worklog/          # 原子工时登记、贡献度量化度量
    └── calendar/         # 日历聚合、里程碑卡点、站内消息
```

---

## 🧪 测试与质量保证

项目采用契约优先测试（Contract Tests），使用 Vitest 打真实隔离库 `agilecampus_test`：

```powershell
cmd /c npm test          # 执行全部 8 个测试套件，验证 72 条契约
cmd /c npm run build     # 验证全系统 39 条生产路由与静态生成优化
```

---

## 📜 许可与规范

- 详见：[docs/DESIGN.md](docs/DESIGN.md) · [docs/TEAM.md](docs/TEAM.md) · [AGENTS.md](AGENTS.md)
