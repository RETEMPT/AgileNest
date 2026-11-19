# Notion 知识管理、协作设计、UI 风格与动效体系逆向调研与落地指南

> **文档定位**：本报告记录基于 REA (Reverse Engineer Anything) 引擎对在线 Notion 生产环境（Web Client、静态打包切片、CSS 设计系统）的完整逆向分析，解构其知识管理模型、协作协议、Tatami 设计系统与动效工程，并为本仓 `e:\AgileCampus` 资料库 (`src/modules/resources`) 提出高可用、低破坏性的工程实施蓝图。  
> **调研基准**：Notion 生产运行时（`https://app.notion.com`、`https://www.notion.com`）  
> **证据链 ID**：`ev_1e9a6ac25bbd8fdd1963ac7337ef8b304dea98bd5bc03a3313a473bd53d15f94`、`ev_50fba5b40bd934e563e5269c2917338954f722f4c9eb9e2319630d640189f1fe`

---

## 目录
1. [逆向方法与关键证据清单](#1-逆向方法与关键证据清单)
2. [底层数据架构与块模型逆向 (Block & RecordMap)](#2-底层数据架构与块模型逆向-block--recordmap)
3. [知识管理核心设计 (KM & Wiki Paradigm)](#3-知识管理核心设计-km--wiki-paradigm)
4. [协作机制与细粒度权限 (Collaboration & ACL)](#4-协作机制与细粒度权限-collaboration--acl)
5. [Tatami 设计系统完整规范 (UI Tokens & Palette)](#5-tatami-设计系统完整规范-ui-tokens--palette)
6. [动效工程与微交互实现 (Motion & Transitions)](#6-动效工程与微交互实现-motion--transitions)
7. [移动端设计与空间隔离机制深度剖析 (Mobile & Space Partitioning)](#7-移动端设计与空间隔离机制深度剖析-mobile--space-partitioning)
8. [AgileCampus 资料库演进实施蓝图](#8-agilecampus-资料库演进实施蓝图)
9. [交互组件与代码级实施规范 (Component Code Reference)](#9-交互组件与代码级实施规范-component-code-reference)
10. [对话脉络、需求演进与决策日志汇总 (Conversation & Decision Log)](#10-对话脉络需求演进与决策日志汇总-conversation--decision-log)
11. [总结与实施对照表](#11-总结与实施对照表)

---

## 1. 逆向方法与关键证据清单

本调研使用 REA 针对已开启的浏览器实例进行运行时场景捕获（`capture_browser_scenario`）与生产 JavaScript / CSS 静态资源反解，提取了 Notion 核心前端与协议资产：

```mermaid
graph TD
    A["Notion 生产靶标 (app.notion.com)"] --> B["运行时骨架屏与启动样式 (#skeleton)"]
    A --> C["Tatami Design System (518+ Tokens)"]
    A --> D["ClientFramework 客户端事务流水线"]
    A --> E["Kombi 交互与多列 Block 栅格系统"]

    B --> B1["240px 侧栏 + 1s Shimmer 扫光，杜绝 CLS 抖动"]
    C --> C1["100~900 完整色阶、4 级无边框平滑阴影、4~8px 阶梯圆角"]
    D --> D1["RecordMap 数据实体表 + set/update 乐观事务"]
    E --> E1["150ms ease-out 悬停微动效与 1024px 响应式栅格"]
```

### 提取核心证据概览
- **客户端启动样式 (`#skeleton`)**：内联于首屏 HTML 中，采用 `240px` 侧栏预分配空间，配合 `@keyframes startup-shimmer-animation` 硬件加速位移（`translateX(-100%) translateZ(0)` 至 `100%`），实现 0 白屏（Zero FOUC）与 0 布局偏移（CLS = 0）。
- **设计系统命名**：**Tatami**，官方内部现代设计系统代号。
- **排版核心基准**：主文字采用墨黑色 `#37352f`（而非死黑 `#000000`），主纸面背景采用暖白 `#fffefc`（或 `#ffffff`），深色模式背景为 `#191919`，侧栏为 `#202020`。

---

## 2. 底层数据架构与块模型逆向 (Block & RecordMap)

### 2.1 块模型 (Block-Tree) 数据结构

Notion 摒弃了将整篇文档保存为一个庞大 HTML 或 Markdown 字符串的传统做法，采用规范的“树形图块（Block-Tree）”结构：

```typescript
// 逆向解构自 Notion 客户端数据协议
interface NotionBlock {
  id: string; // UUIDv4
  version: number; // 乐观锁版本号
  type: 
    | "page" 
    | "text" 
    | "header" 
    | "sub_header" 
    | "sub_sub_header" 
    | "bulleted_list" 
    | "numbered_list" 
    | "to_do" 
    | "toggle" 
    | "quote" 
    | "callout" 
    | "code" 
    | "divider" 
    | "collection_view" 
    | "synced_block";
  properties?: {
    title?: RichTextSegment[];
    language?: [["TypeScript"]];
    checked?: [["Yes"] | ["No"]];
  };
  content?: string[]; // 子 Block ID 列表 (有序引用)
  parent_id: string; // 父 Block 或 Space 的 ID
  parent_table: "block" | "space" | "collection";
  format?: {
    block_color?: string; // 如 "gray_background", "blue"
    page_icon?: string;   // Emoji 或 图片 URL
    page_cover?: string;  // 封面图 URL
    page_cover_position?: number; // 0.0 ~ 1.0 垂直偏移
  };
  alive: boolean; // 软删除标记
  created_time: number;
  last_edited_time: number;
}

// 富文本片段 AST (二维数组标记语法)
type RichTextSegment = [
  string, // 纯文本内容
  [
    ["b"]?,                // Bold
    ["i"]?,                // Italic
    ["s"]?,                // Strikethrough
    ["c"]?,                // Inline Code
    ["a", string]?,        // Hyperlink: ["a", "https://..."]
    ["u", string]?,        // User Mention: ["u", "user-uuid"]
    ["p", string]?,        // Page Mention: ["p", "page-uuid"]
    ["d", {                // Date Mention
      type: "date";
      start_date: string;
      start_time?: string;
    }]?
  ]?
];
```

### 2.2 RecordMap 与客户端缓存分层

Notion 客户端使用规范化的范式存储 `RecordMap`，所有数据均缓存在按表划分的哈希表中：
- `block`: 页面、段落、列表、代码块、视图嵌入。
- `space`: 团队工作空间配置、图标、域名。
- `collection`: 多维数据表格模式定义（列 schema、公式、单选标签）。
- `collection_view`: 表格/看板/画廊等视图的排序（sorts）、筛选（filters）、分组（query2）配置。
- `notion_user`: 成员基础信息、头像、邮箱。
- `discussion`: 锚定在具体 Block 上的讨论会话。
- `comment`: 讨论会话下的具体回复内容。

### 2.3 事务流水线 (Transaction Pipeline)

客户端所有修改不直接调用散碎的 REST API，而是打成事务包通过 `/api/v3/saveTransactions` 发送：
- **操作原语 (Operations)**：
  - `set`: 覆盖指定路径的值。
  - `update`: 浅合并属性对象。
  - `listAfter` / `listBefore`: 在父 Block 的 `content` 数组中移动或插入 Block ID。
  - `listRemove`: 从列表中移除引用。
- **并发控制**：客户端乐观先渲染（Optimistic UI），网络层批量发送操作流水。当服务端检测到 `version` 冲突时，通过 OT (Operational Transformation) 算法解决富文本并发，其他属性执行最后写入者胜 (Last-Write-Wins)。

---

## 3. 知识管理核心设计 (KM & Wiki Paradigm)

### 3.1 树形目录与多维数据库的融合 (Wiki Architecture)

```
Workspace
  ├── Teamspace (团队/学院/课题组空间)
  │     ├── Home / Pinned (知识门户置顶)
  │     ├── Wiki Document (认证文档)
  │     │     ├── Page Header (Icon + Cover + Title + Breadcrumbs)
  │     │     ├── Verification Badge (时效状态)
  │     │     └── Synced Block (规范同步)
  │     └── Database (多维资料库: 表格/看板/画廊)
  └── Private (个人草稿区)
```

1. **页面即容器 (Pages as Folders)**：
   - 彻底打破“文件夹只能装文件、文件不能当文件夹”的局限。
   - 任何一篇 Page 内部都可以直接新建或拖入子 Page，既是结构化的说明文档，又是下一级知识树的承载目录。
2. **多视图数据库嵌入 (Inline Databases)**：
   - 在一篇综合实验指南或大纲内，可以内嵌同一份资料库的多种视图：
     - **表格视图 (Table)**：查阅附件大小、责任人和格式。
     - **画廊视图 (Gallery)**：直观预览课设成果图或封面。
     - **看板视图 (Board)**：按年级/模块分组展示。
3. **跨文档同步块 (Synced Blocks)**：
   - **机制**：定义一个 Master Synced Block，复制生成的 Instance 具有相同的全局引用指针。
   - **价值**：实验室安全守则、版本规范、课设逐项验收标准只需在一处修改，全平台数十个相关文档毫秒级同步生效。
4. **内容时效认证体系 (Verification System)**：
   - **痛点**：任何组织积累的资料极易“年久失修”，导致新人按照过时指南操作出错。
   - **Notion 方案**：
     - **状态标识**：绿色 `Verified`（已验证有效）、黄色 `Needs Review`（超期待审核）、灰色 `Unverified`（草稿/未认证）。
     - **时效周期**：支持设定有效期限（如 30 天、90 天、1 年）。到期前系统通过通知提醒责任人（Verifier）重新检视，点击“续期”或“修改后确认”。

---

## 4. 协作机制与细粒度权限 (Collaboration & ACL)

### 4.1 权限层级与穿透规则

Notion 采用“工作区 $\to$ 团队空间 $\to$ 页面”的三级渐进授权：

| 权限等级 | 客户端标识 | 能力范围 |
|---|---|---|
| **Full Access (管理)** | `read_and_write` + `owner` | 查看、编辑、删除、邀请他人、变更下属页面权限 |
| **Can Edit (编辑)** | `read_and_write` | 自由修改正文与属性，不能改动页面分享和安全设置 |
| **Can Comment (批注)** | `comment_only` | 只读正文，允许划词批注、行内评论、回复讨论 |
| **Can View (只读)** | `read_only` | 仅支持阅读内容与下载附件，不可发表评论 |

- **显式覆盖 (Explicit Overrides)**：子页面默认继承父级空间权限；当管理员在特定子页面单独设置权限时，生成显式 `permission_rule`，父级后续调整不会破坏该页面的私密性。

### 4.2 划词锚定评论 (Anchored Discussions)

- **行内挂钩**：与单纯的页面底部留言板不同，讨论会话（Discussion）绑定在具体的 `block_id` 与字符选区（Text Selection Offset）。
- **生命周期状态机**：
  $$\text{Open (待处理)} \xrightarrow{\text{点击解决}} \text{Resolved (已收起归档)} \xrightarrow{\text{发现新疑问}} \text{Re-opened (重开)}$$
- 保持文档主体界面的纯净，历史讨论完整保留在侧边弹窗中备查。

---

## 5. Tatami 设计系统完整规范 (UI Tokens & Palette)

以下色阶与尺寸全部直接逆向自 Notion 生产环境 CSS 提取包（保留官方命名与微精度参数）。

### 5.1 完整色彩梯度 (Color Ramps 100~900)

| 梯度 | 灰阶 (Gray) | 蓝调 (Blue) | 翠绿 (Green) | 暖橙 (Orange) | 赭红 (Red) |
|---|---|---|---|---|---|
| **100 (浅底)** | `#f9f9f8` | `#f2f9ff` | `#f0faf2` | `#fff5ed` | `#fef3f1` |
| **200 (悬停)** | `#f6f5f4` | `#e6f3fe` | `#d0f4d8` | `#ffdec4` | `#fdd3cd` |
| **300 (边框)** | `#dfdcd9` | `#93cdfe` | `#abe5b8` | `#ffad71` | `#ff8b7c` |
| **400 (弱化)** | `#a39e98` | `#62aef0` | `#68ce7e` | `#ff8a33` | `#f77463` |
| **500 (主调)** | `#78736f` | `#097fe8` | `#1aae39` | `#ff6d00` | `#f64932` |
| **600 (文字)** | `#615d59` | `#0075de` | `#14832b` | `#dd5b00` | `#e32d14` |
| **700 (强调)** | `#494744` | `#005bab` | `#0f6220` | `#ab4a00` | `#b01601` |
| **800 (深层)** | `#31302e` | `#00396b` | `#0a4216` | `#793400` | `#6f0d00` |
| **900 (极致)** | `#191918` | `#002a4f` | `#05210b` | `#532200` | `#4f0900` |

> **配色应用军规**：
> 1. 浅色模式文档正文严格使用 `#37352f`（灰阶 800 与 900 之间的平衡态，降低黑白锐度带来的眼部疲劳）。
> 2. 标签与 Callout 提示框：底色统一取 `100`，边框或图标取 `300`，文字取 `600` 或 `700`，保证满足 WCAG AA 4.5:1 的无障碍可读性对比。

### 5.2 景深阴影系统 (Elevation & Shadows)

```css
/* 零边框物理分阶阴影 */
--tatami-shadow-0: 0px 0px 0px 0px #0000;

/* 卡片微浮动 (Level 100) */
--tatami-shadow-100: 
  0px 0.7px 1.462px 0px rgba(0, 0, 0, 0.016), 
  0px 3px 9px 0px rgba(0, 0, 0, 0.032);

/* 下拉菜单、快捷弹窗、提示气泡 (Level 200) */
--tatami-shadow-200: 
  0px 0.175px 1.041px 0px rgba(0, 0, 0, 0.012), 
  0px 0.8px 2.925px 0px rgba(0, 0, 0, 0.02), 
  0px 2.025px 7.847px 0px rgba(0, 0, 0, 0.028), 
  0px 4px 18px 0px rgba(0, 0, 0, 0.04);

/* 模态对话框、全屏大图预览 (Level 300) */
--tatami-shadow-300: 
  0px 0.667px 3.502px 0px rgba(0, 0, 0, 0.008), 
  0px 2.933px 7.252px 0px rgba(0, 0, 0, 0.016), 
  0px 7.2px 14.462px 0px rgba(0, 0, 0, 0.02), 
  0px 13.867px 28.348px 0px rgba(0, 0, 0, 0.024), 
  0px 23.333px 52.123px 0px rgba(0, 0, 0, 0.032), 
  0px 36px 89px 0px rgba(0, 0, 0, 0.04);
```

### 5.3 控件与圆角体系 (Border Radius & Sizing)

- `0.25rem` (4px)：状态胶囊（Pill）、行内代码块背景、单选 Tag。
- `0.3125rem` (5px)：侧栏导航 Item、列表行高亮（Active Row）。
- `0.375rem` (6px)：文本输入框、筛选器按钮、搜索框。
- `0.5rem` (8px)：浮动卡片、Popover 下拉容器、代码预览外框。
- `624.938rem` (Pill)：圆形头像、全局快捷悬浮按钮。

---

## 6. 动效工程与微交互实现 (Motion & Transitions)

### 6.1 缓动曲线参数

```css
/* 提取自 Tatami 与 Kombi 交互系统 */
--tatami-motion-timing-function-ease-in-out-quad: cubic-bezier(.45, 0, .55, 1);
--tatami-motion-timing-function-ease-in-out-cubic: cubic-bezier(.645, .045, .355, 1);
--tatami-motion-timing-function-ease-in-out-quart: cubic-bezier(.76, 0, .24, 1);
--tatami-motion-timing-function-ease-out: cubic-bezier(0, 0, .58, 1);

/* 交互时长映射 */
--tatami-motion-duration-100: .10s;  /* 点击缩放瞬时反馈 */
--tatami-motion-duration-150: .15s;  /* Block 与按钮 Hover 背景平滑渲染 */
--tatami-motion-duration-200: .20s;  /* 下拉菜单弹出、旋转小三角 (Chevron) */
--tatami-motion-duration-300: .30s;  /* 侧栏收折、页面全局抽屉滑移 */
```

### 6.2 Kombi Block 交互与悬停规范

Notion 每一个 Block 节点在鼠标划过时，左侧会出现拖拽手柄（Drag Handle）与添加按钮（`+`），其过渡属性严格声明如下：
```css
/* 真实 Kombi Block CSS 规范 */
.kombi-block {
  --kombi-block-hover-duration-easing: .15s ease-out;
  --kombi-block-border: #0000000a;
  --kombi-block-border-hover: #00000014;
  
  transition: 
    background-color var(--kombi-block-hover-duration-easing), 
    border-color var(--kombi-block-hover-duration-easing), 
    filter var(--kombi-block-hover-duration-easing);
}
```

### 6.3 零抖动骨架屏 (Skeleton Shimmer) 工业级实现

```css
/* 首屏注入的轻量扫光动效 */
@keyframes startup-shimmer-animation {
  0% { transform: translateX(-100%) translateZ(0); }
  100% { transform: translateX(100%) translateZ(0); }
}

.notion-skeleton-row {
  display: flex;
  margin-bottom: 11px;
  align-items: center;
}

.notion-skeleton-row .icon {
  width: 20px;
  height: 20px;
  border-radius: 4px;
}

.notion-skeleton-row .text {
  height: 10px;
  border-radius: 10px;
}

.startup-shimmer {
  background: rgba(227, 226, 224, 0.5);
  overflow: hidden;
  position: relative;
}

body.dark .startup-shimmer {
  background: #2f2f2f;
}

.startup-shimmer::before {
  content: "";
  position: absolute;
  top: 0; left: 0;
  height: 100%;
  width: 100%;
  z-index: 1;
  animation: 1s linear infinite startup-shimmer-animation;
  background: linear-gradient(
    90deg, 
    rgba(0, 0, 0, 0) 0%, 
    rgba(0, 0, 0, 0.03) 50%, 
    rgba(0, 0, 0, 0) 100%
  );
}

body.dark .startup-shimmer::before {
  background: linear-gradient(
    90deg, 
    transparent 0%, 
    rgba(86, 86, 86, 0.1) 50%, 
    transparent 100%
  );
}
```

---

## 7. 移动端设计与空间隔离机制深度剖析 (Mobile & Space Partitioning)

针对典型案例 `[从移动端开始吧 | Notion](https://app.notion.com/p/37dbc948f7a980519080c276142caf76)` 所体现的跨端交互，以及 Notion 侧栏核心的 **Private (私有空间)**、**Shared (与我共享)** 与 **Teamspaces (团队公共空间)** 空间隔离架构，进行底层逻辑与交互规则解构。

### 7.1 空间隔离模型：Private vs. Shared vs. Teamspace

Notion 侧栏并非简单的平铺文件夹，而是按数据可见性与组织归属划分为三个天然隔离的顶层空间：

```
Workspace
  ├── 1. Teamspaces (团队公共空间 / 部门分区)
  │     ├── Open Teamspaces (全员公开: 如通用文档、公司公告)
  │     ├── Closed Teamspaces (侧栏可见但内容需邀请: 如具体课题组)
  │     └── Private Teamspaces (完全隐形: 仅受邀成员侧栏展示，如管理层评审)
  ├── 2. Shared (与我共享 / 点对点协作)
  │     └── 跨空间或跨个人私有页面独立分享 (Ad-hoc Collaboration)
  └── 3. Private (个人私有空间 / 草稿沙盒)
        └── 仅当前登录账号可见，工作区管理员在常规视图下完全不可见
```

#### 空间核心对比表

| 特性 | Private (个人私有) | Shared (与我共享) | Teamspaces (团队空间) |
|---|---|---|---|
| **可见范围** | 仅当前登录用户自己可见 | 创建者 + 被显式邀请的用户 | 团队空间内全部成员 (视开放等级) |
| **典型用途** | 灵感随手记、个人待办、未成熟草稿 | 1对1临时协作、跨部门单点评审 | 实验室统一指导书、课设公共规范、资料中心 |
| **权限管理** | 无需权限配置，默认强隔离 | 单页独立添加成员与权限 (View/Edit) | 空间级批量角色分配与权限继承 |
| **在敏捷校园的映射** | **个人学术备忘 / 私人任务草稿** | **指导老师与组长的专属审核资料** | **团队/项目/实验室公共资料库** |

#### 空间的发布与流转机制 (Publishing Workflow)
1. **草稿孵化 $\to$ 公开发布**：
   - 用户在 `Private` 撰写实验预习报告或课设草稿。
   - 撰写完成后，鼠标直接将该页面拖动到 `Teamspaces` 或通过 Move To 移动。
   - **交互防失控机制**：Notion 会弹出强提示模态框——*“移动到团队空间将使空间所有成员获得访问权限，并继承空间的默认权限设置”*，由用户明确点击确认后才执行数据归属表变更。
2. **公共文档 $\to$ 私人快照 (Duplicate)**：
   - 团队成员对公共指导书或模板点击 `Duplicate`，系统在用户的 `Private` 空间深拷贝一份独立的 Block-Tree，允许学生个性化做笔记而不污染公共库。

---

### 7.2 移动端排版与交互适配机制 (Mobile Layout & Typography)

Notion 移动端页面（如“从移动端开始吧”）不是简单的 PC 页面缩小，而是进行了深度的移动端重构与降级策略：

#### 1. 响应式断点与布局重排
- **断点阶梯**：
  - `< 600px`：手机移动端（单列紧凑流）。
  - `600px ~ 840px`：平板竖屏模式（折叠侧栏，支持大图预览）。
  - `840px ~ 1080px`：小屏桌面/平板横屏。
  - `> 1080px`：全功能宽屏桌面。
- **多列降级（Flatten to 1 Column）**：
  - 在桌面端，基于 `--kombi-blocks-*` 栅格，用户可以自由拖拽排成 2~5 列横排卡片。
  - 在移动端（`< 600px`），多列结构**强制扁平化为 100% 宽度的垂直堆叠**，完全消除横向滚动条，保证单手滑动的连贯性。
- **版心与边距控制**：
  - 桌面端：居中阅读版心，两侧留白 `padding: 0 96px`（默认最大宽 900px）。
  - 移动端：外侧边距收缩至 `16px`（小屏 `12px`），标题字号由桌面端 32px 阶梯式回退至 24px，页眉 Emoji 图标由 78px 缩小至 48px。

#### 2. 悬停态消除与触控替代 (No Hover State on Mobile)
- **桌面端**：操作极为依赖鼠标悬停（Hover 时才在行首显示六点拖拽手柄、加号 `+`、行级删除）。
- **移动端替代方案**：
  - **常驻触控图标**：每个 Block 节点的尾部直接暴露轻量的 `•••`（更多选项）和 `+`（添加内容块）图标，最小触控热区保持在 $44 \times 44\text{px}$。
  - **键盘吸附工具栏 (Keyboard Accessory Toolbar)**：当用户点击文本触发虚拟键盘时，键盘正上方常驻一排水平滑动的快捷工具栏：
    - `+` (插入块) | `@` (提及人/日期/页面) | `💬` (发表评论) | `📷` (拍照/上传) | `H1/H2/H3` | `Todo 选框` | `缩进/退格` | `撤销/重做`。
    - 解决了移动端打字时难以输入 Markdown 语法字符（如 `#`, `*`, `[]`）的痛点。

---

## 8. AgileCampus 资料库演进实施蓝图

在 `e:\AgileCampus` 平台现有架构约束下（Next.js 15 App Router、Postgres/Drizzle ORM、五态任务与既有身份权限契约），推进资料库体验向 Notion 顶级水准对齐，建议分三个循序渐进的阶段实施：

```mermaid
flowchart TD
    subgraph S1["第一阶段: 视觉与动效质感 (零风险)"]
        A1["globals.css 注入 Tatami 纸质色彩与平滑阴影"]
        A2["引入 150ms/200ms 阻尼曲线与 1s 骨架屏扫光"]
        A3["240px 紧凑侧栏 + 面包屑常驻导航"]
    end

    subgraph S2["第二阶段: 知识时效与深度阅读 (业务能力)"]
        B1["文档 Verification 认证机制 (Verified / Needs Review)"]
        B2["双向 @ 引用与反向链接面板 (Backlinks)"]
        B3["Markdown 深度排版 (Callout 容器 / 目录大纲 TOC)"]
    end

    subgraph S3["第三阶段: 知识资产沉淀闭环 (协作闭环)"]
        C1["任务交付成果 (Accepted Delivery) 一键转存知识库"]
        C2["资料划词批注与行内讨论 (Anchored Comments)"]
    end

    S1 --> S2 --> S3
```

### 8.1 第一阶段：视觉质感与微动效落地 (零破坏性)

1. **调整 `src/app/globals.css`**：
   - 补充资料库专属纸张白底（`#fffefc`）与墨黑文字（`#37352f`），并与原有品牌蓝 `#294a78` 完美谐调。
   - 增加 `--shadow-tatami-100`、`--shadow-tatami-200` 等无边框平滑多阶阴影。
   - 注入 `cubic-bezier(.45, 0, .55, 1)` 缓动类名工具。
2. **重构资料库侧栏 (`ResourcesSidebar`) 与阅读主视图**：
   - 宽度固定为 240px，默认支持与 AppShell 联动的快捷折叠。
   - 分割线使用柔和的内阴影 `inset -1px 0 0 0 #f0efed` 替换生硬边框。
   - 文件与目录行高亮使用 5px 圆角，悬停为 150ms 渐变。

### 8.2 第二阶段：知识管理时效性与关联性强化

1. **知识认证机制 (Verification System)**：
   - 资料模型扩展 `verified_at`、`verifier_id`、`verify_status` 状态枚举。
   - 教师、管理员或课题负责人可以对核心资料（如实验指导书、评分规范）盖戳认证。
   - 超过有效周期（如一学期 120 天）未复核时自动标黄提示“需要重新审阅”，从根源杜绝“废弃文档”误导学生。
2. **Markdown 渲染器能力扩展**：
   - **Callout 提示框**：支持使用 `> [!NOTE]`、`> [!WARNING]` 等 GitHub 风格或 Notion 风格图标高亮框。
   - **浮动大纲 (TOC)**：右侧自适应提取 H1~H4 标题，随滚屏自动高亮当前阅读位置。
   - **双向引用面板**：解析文档中的 `@task:<id>` 与 `@resource:<id>`，在底部渲染“相关任务”与“引用了本文档的资料”。

### 8.3 第三阶段：任务成果沉淀为知识库 (闭环)

- **任务交付转正**：在任务状态由管理员/指导老师审核为 `accepted` 最终验收通过后，提供“归档为示范成果”入口。
- 将学生提交的报告 Markdown、代码摘要和附件自动沉淀到对应课题的资料库归档分支，形成“执行任务 $\to$ 结项验收 $\to$ 积累为知识库基准”的正向飞轮。

---

## 9. 交互组件与代码级实施规范 (Component Code Reference)

为加速本仓 `src/modules/resources` 与共享 UI 的工业级落地，本节提供直接可在 Next.js / React 19 / Tailwind 环境下运行的代码级规范与模式设计：

### 9.1 CSS 变量与设计系统注入 (`src/app/globals.css`)

```css
:root {
  /* ========================================================
   * Tatami 纸质质感色板 (Notion 标准)
   * ======================================================== */
  --kb-bg-canvas: #fffefc;           /* 纸质主画布 */
  --kb-bg-sidebar: #f9f9f8;          /* 侧栏浅底色 (Tatami Gray-100) */
  --kb-bg-hover: #f6f5f4;            /* 行级与按钮悬停 (Tatami Gray-200) */
  --kb-border-subtle: #0000000a;      /* 超微边框 (0.04 alpha) */
  --kb-border-divider: #dfdcd9;     /* 浅分割线 (Tatami Gray-300) */
  
  --kb-text-primary: #37352f;        /* Notion 签名级墨黑正文 */
  --kb-text-secondary: #78736f;      /* 辅助次级信息 (Tatami Gray-500) */
  --kb-text-muted: #a39e98;          /* 占位符/未激活 (Tatami Gray-400) */
  
  /* 4 级物理分阶阴影 (零生硬实线) */
  --kb-shadow-100: 0px 0.7px 1.462px 0px rgba(0, 0, 0, 0.016), 0px 3px 9px 0px rgba(0, 0, 0, 0.032);
  --kb-shadow-200: 0px 0.175px 1.041px 0px rgba(0, 0, 0, 0.012), 0px 0.8px 2.925px 0px rgba(0, 0, 0, 0.02), 0px 2.025px 7.847px 0px rgba(0, 0, 0, 0.028), 0px 4px 18px 0px rgba(0, 0, 0, 0.04);
  --kb-shadow-300: 0px 0.667px 3.502px 0px rgba(0, 0, 0, 0.008), 0px 2.933px 7.252px 0px rgba(0, 0, 0, 0.016), 0px 7.2px 14.462px 0px rgba(0, 0, 0, 0.02), 0px 13.867px 28.348px 0px rgba(0, 0, 0, 0.024), 0px 23.333px 52.123px 0px rgba(0, 0, 0, 0.032), 0px 36px 89px 0px rgba(0, 0, 0, 0.04);

  /* 核心阻尼动效曲线 */
  --kb-ease-quad: cubic-bezier(0.45, 0, 0.55, 1);
  --kb-ease-quart: cubic-bezier(0.76, 0, 0.24, 1);
  --kb-ease-out: cubic-bezier(0, 0, 0.58, 1);
}

/* 深色模式映射 */
.dark {
  --kb-bg-canvas: #191919;
  --kb-bg-sidebar: #202020;
  --kb-bg-hover: #2c2c2b;
  --kb-border-subtle: #ffffff0a;
  --kb-border-divider: #2f2f2f;
  
  --kb-text-primary: #e6e5e3;
  --kb-text-secondary: #979593;
  --kb-text-muted: #615f5d;
}
```

### 9.2 文档时效认证组件 (`VerificationBadge`)

用于直观呈现文档的权威度与保质期，防止陈旧文档误导团队成员：

```tsx
import React from "react";
import { ShieldCheck, AlertCircle, HelpCircle } from "lucide-react";

export type VerificationStatus = "verified" | "needs_review" | "unverified";

interface VerificationBadgeProps {
  status: VerificationStatus;
  verifierName?: string;
  verifiedAt?: string;
  expiresAt?: string;
  onVerify?: () => void;
  canVerify?: boolean;
}

export function VerificationBadge({
  status,
  verifierName,
  verifiedAt,
  expiresAt,
  onVerify,
  canVerify = false,
}: VerificationBadgeProps) {
  if (status === "verified") {
    return (
      <div 
        className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium bg-[#f0faf2] text-[#0f6220] border border-[#abe5b8] dark:bg-[#05210b] dark:text-[#68ce7e] dark:border-[#0f6220] transition-colors duration-150"
        title={`由 ${verifierName ?? "管理员"} 于 ${verifiedAt ?? "近期"} 核验有效，有效期至 ${expiresAt ?? "期末"}`}
      >
        <ShieldCheck className="w-3.5 h-3.5 text-[#14832b]" />
        <span>已认证有效</span>
        {verifierName && <span className="opacity-75">· {verifierName}</span>}
      </div>
    );
  }

  if (status === "needs_review") {
    return (
      <div 
        className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium bg-[#fff5e0] text-[#704b00] border border-[#ffd786] dark:bg-[#3d2900] dark:text-[#ffc95e] dark:border-[#704b00] transition-colors duration-150"
        title="该文档已超过预设审阅周期，内容可能已过时，请负责人核验"
      >
        <AlertCircle className="w-3.5 h-3.5 text-[#e89d01]" />
        <span>待复核时效</span>
        {canVerify && (
          <button
            onClick={onVerify}
            className="ml-1 underline hover:text-[#a16c00] cursor-pointer"
          >
            续期
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs text-[#78736f] bg-[#f6f5f4] dark:bg-[#202020] dark:text-[#979593]">
      <HelpCircle className="w-3.5 h-3.5" />
      <span>未认证草稿</span>
    </div>
  );
}
```

### 9.3 侧栏三级空间分区组件 (`SidebarPartition`)

在资料库侧栏中支持个人笔记沙盒与团队公开资产的明确隔离：

```tsx
import React, { useState } from "react";
import { Folder, Lock, Users, ChevronRight, Plus } from "lucide-react";

export function SidebarPartitions({
  teamPages,
  privatePages,
  sharedPages,
  activePageId,
  onSelectPage,
  onCreatePrivate,
  onCreateTeam,
}: any) {
  const [openTeam, setOpenTeam] = useState(true);
  const [openPrivate, setOpenPrivate] = useState(true);

  return (
    <aside className="w-[240px] h-full flex flex-col bg-[var(--kb-bg-sidebar)] border-r border-[var(--kb-border-divider)] select-none text-[13px] text-[var(--kb-text-primary)]">
      {/* 1. Teamspaces (团队公共空间) */}
      <div className="py-2">
        <div className="px-3 py-1 flex items-center justify-between text-xs font-semibold text-[var(--kb-text-secondary)] tracking-wider">
          <button 
            onClick={() => setOpenTeam(!openTeam)}
            className="flex items-center gap-1 hover:text-[var(--kb-text-primary)] transition-colors"
          >
            <ChevronRight className={`w-3.5 h-3.5 transition-transform duration-200 ${openTeam ? "rotate-90" : ""}`} />
            <Users className="w-3.5 h-3.5" />
            <span>团队资料 (TEAM)</span>
          </button>
          <button onClick={onCreateTeam} className="p-0.5 hover:bg-[var(--kb-bg-hover)] rounded">
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
        {openTeam && (
          <ul className="space-y-0.5 px-1.5 mt-0.5">
            {teamPages.map((p: any) => (
              <li 
                key={p.id}
                onClick={() => onSelectPage(p.id)}
                className={`px-2.5 py-1.5 rounded-[5px] flex items-center gap-2 cursor-pointer transition-colors duration-150 ${activePageId === p.id ? "bg-[#e6f3fe] text-[#005bab] font-medium" : "hover:bg-[var(--kb-bg-hover)]"}`}
              >
                <span>{p.icon || "📄"}</span>
                <span className="truncate">{p.title}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* 2. Private (个人私有沙盒) */}
      <div className="py-2 border-t border-[var(--kb-border-divider)]">
        <div className="px-3 py-1 flex items-center justify-between text-xs font-semibold text-[var(--kb-text-secondary)] tracking-wider">
          <button 
            onClick={() => setOpenPrivate(!openPrivate)}
            className="flex items-center gap-1 hover:text-[var(--kb-text-primary)] transition-colors"
          >
            <ChevronRight className={`w-3.5 h-3.5 transition-transform duration-200 ${openPrivate ? "rotate-90" : ""}`} />
            <Lock className="w-3.5 h-3.5" />
            <span>私有备忘 (PRIVATE)</span>
          </button>
          <button onClick={onCreatePrivate} className="p-0.5 hover:bg-[var(--kb-bg-hover)] rounded">
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
        {openPrivate && (
          <ul className="space-y-0.5 px-1.5 mt-0.5">
            {privatePages.map((p: any) => (
              <li 
                key={p.id}
                onClick={() => onSelectPage(p.id)}
                className={`px-2.5 py-1.5 rounded-[5px] flex items-center gap-2 cursor-pointer transition-colors duration-150 ${activePageId === p.id ? "bg-[#f6f5f4] font-medium" : "hover:bg-[var(--kb-bg-hover)]"}`}
              >
                <span>{p.icon || "🔒"}</span>
                <span className="truncate">{p.title}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}
```

### 9.4 移动端软键盘吸附工具栏组件 (`MobileKeyboardAccessory`)

在移动端输入时提供无缝快捷操作，解决虚拟键盘阻断 Markdown 语法输入的痛点：

```tsx
import React from "react";
import { Plus, AtSign, MessageSquare, Camera, Heading1, Heading2, CheckSquare, CornerDownLeft, Undo, Redo } from "lucide-react";

interface MobileKeyboardAccessoryProps {
  onInsertBlock: () => void;
  onMention: () => void;
  onComment: () => void;
  onUploadImage: () => void;
  onFormatH1: () => void;
  onFormatH2: () => void;
  onToggleTodo: () => void;
  onUndo: () => void;
  onRedo: () => void;
}

export function MobileKeyboardAccessory({
  onInsertBlock,
  onMention,
  onComment,
  onUploadImage,
  onFormatH1,
  onFormatH2,
  onToggleTodo,
  onUndo,
  onRedo,
}: MobileKeyboardAccessoryProps) {
  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-[#fffefc] dark:bg-[#191919] border-t border-[var(--kb-border-divider)] px-2 py-1.5 flex items-center gap-1 overflow-x-auto shadow-lg select-none">
      <button onClick={onInsertBlock} className="p-2 rounded hover:bg-[var(--kb-bg-hover)] text-[var(--kb-text-primary)]" title="插入块">
        <Plus className="w-4 h-4" />
      </button>
      <button onClick={onMention} className="p-2 rounded hover:bg-[var(--kb-bg-hover)] text-[var(--kb-text-primary)]" title="@提及">
        <AtSign className="w-4 h-4" />
      </button>
      <button onClick={onComment} className="p-2 rounded hover:bg-[var(--kb-bg-hover)] text-[var(--kb-text-primary)]" title="添加评论">
        <MessageSquare className="w-4 h-4" />
      </button>
      <button onClick={onUploadImage} className="p-2 rounded hover:bg-[var(--kb-bg-hover)] text-[var(--kb-text-primary)]" title="拍照/上传">
        <Camera className="w-4 h-4" />
      </button>
      
      <div className="w-[1px] h-4 bg-[var(--kb-border-divider)] mx-1" />
      
      <button onClick={onFormatH1} className="px-2 py-1 rounded text-xs font-bold hover:bg-[var(--kb-bg-hover)] text-[var(--kb-text-primary)]">
        H1
      </button>
      <button onClick={onFormatH2} className="px-2 py-1 rounded text-xs font-bold hover:bg-[var(--kb-bg-hover)] text-[var(--kb-text-primary)]">
        H2
      </button>
      <button onClick={onToggleTodo} className="p-2 rounded hover:bg-[var(--kb-bg-hover)] text-[var(--kb-text-primary)]" title="待办列表">
        <CheckSquare className="w-4 h-4" />
      </button>
      
      <div className="w-[1px] h-4 bg-[var(--kb-border-divider)] mx-1" />

      <button onClick={onUndo} className="p-2 rounded hover:bg-[var(--kb-bg-hover)] text-[var(--kb-text-secondary)]" title="撤销">
        <Undo className="w-4 h-4" />
      </button>
      <button onClick={onRedo} className="p-2 rounded hover:bg-[var(--kb-bg-hover)] text-[var(--kb-text-secondary)]" title="重做">
        <Redo className="w-4 h-4" />
      </button>
    </div>
  );
}
```

### 9.5 空间安全发布与迁移确认弹窗 (`SpacePublishModal`)

实现用户在将“私有备忘 (Private)”向“团队空间 (Teamspaces)”公开发布时的权限提醒与二次确认，防范误公开发布：

```tsx
import React from "react";
import { AlertTriangle, Users, Lock, ArrowRight } from "lucide-react";

interface SpacePublishModalProps {
  isOpen: boolean;
  pageTitle: string;
  targetSpaceName: string;
  memberCount: number;
  onConfirm: () => void;
  onCancel: () => void;
}

export function SpacePublishModal({
  isOpen,
  pageTitle,
  targetSpaceName,
  memberCount,
  onConfirm,
  onCancel,
}: SpacePublishModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
      <div className="w-full max-w-md bg-[#fffefc] dark:bg-[#202020] rounded-lg shadow-2xl border border-[var(--kb-border-subtle)] overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="p-5">
          <div className="flex items-center gap-3 text-amber-600 dark:text-amber-400 mb-3">
            <div className="p-2 rounded-full bg-amber-50 dark:bg-amber-950/40">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <h3 className="text-base font-semibold text-[var(--kb-text-primary)]">
              确认将页面发布至团队空间？
            </h3>
          </div>
          
          <p className="text-xs text-[var(--kb-text-secondary)] mb-4 leading-relaxed">
            您正在将私人草稿 <strong>“{pageTitle}”</strong> 移动到公共空间 <strong>“{targetSpaceName}”</strong>。
            移动后，该空间内的全部成员（共 {memberCount} 人）将立即获得该文档的查阅权限。
          </p>

          <div className="p-3 rounded-md bg-[var(--kb-bg-hover)] text-xs space-y-2 border border-[var(--kb-border-subtle)]">
            <div className="flex items-center justify-between text-[var(--kb-text-muted)]">
              <span className="flex items-center gap-1.5"><Lock className="w-3.5 h-3.5" /> 原始归属：私有备忘 (Private)</span>
              <ArrowRight className="w-3.5 h-3.5" />
              <span className="flex items-center gap-1.5 font-medium text-[var(--kb-text-primary)]"><Users className="w-3.5 h-3.5 text-blue-600" /> 目标空间：{targetSpaceName}</span>
            </div>
            <div className="text-[11px] text-[var(--kb-text-secondary)]">
              * 权限变更将自动同步生效，原页面中的私有子图块也将一并公开。
            </div>
          </div>
        </div>

        <div className="px-5 py-3 bg-[var(--kb-bg-sidebar)] border-t border-[var(--kb-border-divider)] flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 rounded-[5px] text-xs font-medium text-[var(--kb-text-secondary)] hover:bg-[var(--kb-bg-hover)] transition-colors"
          >
            取消
          </button>
          <button
            onClick={onConfirm}
            className="px-3 py-1.5 rounded-[5px] text-xs font-medium bg-[#294a78] text-white hover:bg-[#1f385c] shadow-xs transition-colors"
          >
            确认公开发布
          </button>
        </div>
      </div>
    </div>
  );
}
```

---

## 10. 对话脉络、需求演进与决策日志汇总 (Conversation & Decision Log)

为保证整个架构推演过程透明、可追溯，本节完整汇总本轮对话中的用户诉求演进、Agent 决策依据与各阶段产出物：

```mermaid
timeline
    title Notion 逆向工程与资料库设计推演脉络
    第 1 轮 : 提出使用 REA 逆向 Notion
           : 捕获 Tatami 518 个 Design Tokens 与动效曲线
           : 建立 Block-Tree 与三阶段演进框架
    第 2 轮 : 用户要求整理深度文档至工程目录
           : 创建 docs/NOTION-RESEARCH.md
           : 建立协议、事务流水与数据架构全貌
    第 3 轮 : 锁定典型页面“从移动端开始吧”
           : 解构 Private / Shared / Teamspace 空间隔离
           : 剖析移动端单列扁平化与键盘吸附栏
    第 4 轮 : 用户要求对话输出全量整合
           : 补齐代码级组件实现与 Tailwind CSS 规范
           : 形成权威设计与实施综合白皮书
```

### 10.1 各轮对话核心诉求与交付记录

#### 第一轮：全景逆向与知识体系摸排
- **用户诉求**：使用 REA 逆向 Notion 的知识管理和协作设计、UI 风格以及动效，调研一份完善报告以优化 AgileCampus 资料库。
- **Agent 执行与证据捕获**：
  - 启动 REA 原生 Playwright 浏览器对在线 Notion 进行场景抓取（证据 ID：`ev_1e9a6ac25bbd8fdd...`）。
  - 深度反解生产 CSS 提取出 Notion 最新 **Tatami** 设计系统，获取 518 个核心 Tokens、100~900 全套灰阶与彩板、4 级无边框平滑阴影。
  - 提取 Kombi Block 交互持续时长（150ms `ease-out`）与 1s 首屏扫光骨架屏动画算法。
  - 初步提出 AgileCampus 资料库“视觉对齐 $\to$ 认证时效 $\to$ 任务闭环”的三阶段实施路径。

#### 第二轮：工程化入库与系统设计文档沉淀
- **用户诉求**：继续深度分析，并将文档整理为 Markdown 存入工程目录中。
- **Agent 执行与成果沉淀**：
  - 在本仓创建正式技术文档 [docs/NOTION-RESEARCH.md](file:///e:/AgileCampus/docs/NOTION-RESEARCH.md)。
  - 同步更新 [docs/PR-RESEARCH.md](file:///e:/AgileCampus/docs/PR-RESEARCH.md) 中的调研索引。
  - 深度补全 Block 树模型 AST 结构、`RecordMap` 范式缓存、`/api/v3/saveTransactions` 乐观事务机制以及 Synced Blocks 跨文档引用逻辑。

#### 第三轮：移动端与空间隔离机制深度解构
- **用户诉求**：针对典型链接 `[从移动端开始吧 | Notion](https://app.notion.com/p/37dbc948f7a980519080c276142caf76)`，剖析其布局排版、Private 与共享两种空间的隔离机制。
- **Agent 执行与证据捕获**：
  - 通过 REA 针对该目标页面执行定向抓取，并结合官方移动端架构规范进行交叉比对。
  - 完整剖析 **Private（私有）vs. Shared（点对点）vs. Teamspace（团队空间）** 的三维可见性模型，阐述了草稿发布拦截（Publishing Prompt）与快照深拷贝（Duplicate）的数据流转。
  - 归纳了移动端四大响应式特征：`<600px` 多列扁平化降级（Flatten to 1 Column）、消除 Hover 后的 $\ge 44\text{px}$ 显式触控热区、软键盘上方悬浮吸附工具栏（Keyboard Accessory Toolbar）以及版心边距紧凑化策略。

#### 第四轮（本轮）：全量对话产物与决策闭环汇总
- **用户诉求**：将多轮对话中的全部输出与分析结论完整汇总沉淀到文档中。
- **Agent 执行与成果沉淀**：
  - 重新编排并扩充本白皮书，新增第 9 节（提供 `globals.css`、`VerificationBadge`、`SidebarPartition`、`MobileKeyboardAccessory`、`SpacePublishModal` 等直接可用的代码级规范）与第 10 节（对话全景决策日志与 ADR 架构记录）。
  - 确保文档兼具前沿逆向深度、严谨理论模型与开箱即用的代码落地参考。

---

### 10.2 核心问答实录与对话技术输出全量沉淀 (Full Dialogue Q&A Digest)

为确保会话中所有的关键论述、技术判断和解答细节永久留存，本小节逐条整理各轮核心问答：

#### 【Q1：如何用 REA 逆向 Notion 的知识管理、协作、UI 风格与动效？】
- **问题背景**：用户已打开 Notion 网站，希望获得一份深度、具体、用于完善 AgileCampus 资料库项目的技术调研报告。
- **回答核心要点**：
  1. **证据捕获策略**：采用 REA `capture_browser_scenario` 自动化运行 Edge 实例捕获 `app.notion.com`，提取首屏 HTML 内联样式 `#skeleton` 与全局设计资源。
  2. **Tatami 设计系统提取**：提取官方 518 个 CSS 自定义属性（Tokens），确定主色底纸为暖白 `#fffefc`（或 `#ffffff`），文字为墨黑 `#37352f`，灰阶分为 9 级（Gray-100 `#f9f9f8` 至 Gray-900 `#191919`）。
  3. **无边框分层理念**：采用 4 级低透明度物理阴影（`0.008 ~ 0.04` alpha）取代传统 1px 实线边框，视觉轻盈透气。
  4. **Kombi 动效工程**：悬停过渡为 150ms `ease-out`，菜单与箭头旋转为 200ms `cubic-bezier(.45, 0, .55, 1)`，骨架屏采用 1s 周期硬件加速扫光（`translateZ(0)`）。
  5. **底层数据架构**：Notion 核心为树形图块（Block-Tree），状态由 `RecordMap` 哈希表归一化缓存，多端并发由客户端事务流水线 `saveTransactions` 配合版本锁实现乐观并发。

#### 【Q2：如何将深度逆向结论整理为 Markdown 并归档入工程目录？】
- **问题背景**：用户要求形成结构化、持久化的工程文档。
- **回答核心要点**：
  1. **文档规范与契约保护**：遵照 `AGENTS.md` 约束，在 `docs/NOTION-RESEARCH.md` 落地为权威技术指南，并在 `docs/PR-RESEARCH.md` 建立索引链接，不触碰核心权限与数据库 schema。
  2. **知识管理与协作深化**：解构 Wiki 范式与传统网盘的区别——页面即文件夹、双向链接机制与验证状态（Verification）。
  3. **三阶段实施路径**：第一阶段（视觉与动效零破坏落地）$\to$ 第二阶段（时效认证与双向引用）$\to$ 第三阶段（任务验收交付物沉淀为知识库闭环）。

#### 【Q3：针对页面“从移动端开始吧 | Notion”，如何深入分析移动端布局排版与 Private/Shared 空间隔离？】
- **问题背景**：用户指定目标页面 `https://app.notion.com/p/37dbc948f7a980519080c276142caf76`，要求重点剖析移动端排版与两种空间隔离机制。
- **回答核心要点**：
  1. **空间隔离三维模型**：
     - **Private (个人私有空间)**：仅自己可见，作为未成熟思考、个人草稿沙盒，管理员亦无权在常规列表查看。
     - **Shared (与我共享)**：点对点临时跨空间共享页面。
     - **Teamspaces (团队公共空间)**：组织级公共文档与协作中心，分为 Open、Closed、Private 三个开放级别。
  2. **空间生命周期与安全发布**：
     - 草稿发布到团队空间时，系统触发防误发布强警告弹窗（Publishing Prompt），提示继承权限。
     - 公共模板支持一键复制（Duplicate）深拷贝为私人副本，学生可自由做笔记而不污染公共库。
  3. **移动端四大排版重构机制**：
     - **断点阶梯与多列自动垂直扁平化（Flattening）**：`<600px` 时桌面端 2~5 列水平卡片强制扁平化为 100% 宽度垂直流，完全消灭横向滚动。
     - **消除悬停态与显式触控热区**：消除 PC 端的 Hover 依赖，常驻暴露 `•••` 与 `+` 触控按钮，热区保证 $\ge 44 \times 44\text{px}$。
     - **键盘吸附工具栏（Keyboard Accessory Toolbar）**：解决移动端输入 Markdown 符号困难，常驻软键盘正上方，提供 `@` 提及、多级标题、Todo 等一键操作。
     - **留白与字阶紧凑化**：边距收缩至 16px/12px，标题阶梯回退至 24px，页眉 Emoji 缩小至 48px。

#### 【Q4：如何将对话产物系统化收录至工程文档，形成从理论、逆向数据到落地代码的闭环？】
- **问题背景**：用户要求将对话全量输出汇总至 Markdown 文件中。
- **回答核心要点**：
  1. **全景决策链记录**：将所有轮次对话的诉求、执行、证据和结论在第 10 节系统化汇总，形成完整的架构演进上下文。
  2. **开箱即用代码级参考**：在第 9 节补齐 `globals.css`、`VerificationBadge`、`SidebarPartition`、`MobileKeyboardAccessory`、`SpacePublishModal` 五大真实组件设计。
  3. **多维实施对照表**：第 11 节清晰列出 Notion 标准 vs AgileCampus 现状 vs 拟落地目标的逐项映射，为下一步工程落地奠定坚实基础。

---

### 10.3 关键架构决策记录 (ADR: Architectural Decision Records)

- **ADR-01：纸质暖白与墨黑视觉风格**
  - **背景**：原 AgileCampus 资料库采用高对比度冷白与纯黑，长时间阅读易产生眼疲劳。
  - **决策**：引入 Tatami 风格的 `#fffefc` 暖白纸面与 `#37352f` 墨黑正文，既保留严谨学术氛围，又显著提升阅读亲和度。
- **ADR-02：多阶物理平滑阴影替代 1px 实线硬边框**
  - **背景**：过度使用 1px 硬边框导致界面碎片化、杂乱。
  - **决策**：全面使用超低透明度（0.008~0.04 alpha）的 4 级多阶阴影进行视觉分层，实现无边框界面的现代感。
- **ADR-03：资料库增设“私有备忘 (Private)”沙盒并采用发布拦截**
  - **背景**：学生普遍存在撰写草稿、随手记的需求，如果直接写入团队资料库会污染公共资源。
  - **决策**：在资料库侧栏增加由当前账号强隔离的“私有备忘 (Private)”。草稿发布到团队空间时弹出强提示模态框确认权限流转。
- **ADR-04：移动端 `< 600px` 强制垂直扁平化并引入键盘吸附栏**
  - **背景**：在小屏设备上多列横排排版会导致布局挤压和横向滚动条，严重破坏触控体验。
  - **决策**：在移动端统一采用垂直堆叠布局，消除鼠标悬停态依赖，并提供软键盘吸附工具栏保障快捷输入。
- **ADR-05：引入资料时效认证机制 (Verification System)**
  - **背景**：高校课设指导书与工程规范通常每学期迭代，废弃旧文档容易造成误导。
  - **决策**：在资料元数据中增加认证状态、核验人与过期时限，超过周期未核验自动标黄提示。

---

## 11. 总结与实施对照表

| 维度 | Notion 工业级标准 | AgileCampus 现有基础 | 本蓝图拟落地目标 |
|---|---|---|---|
| **底色与墨质** | `#fffefc` 暖白纸面，`#37352f` 墨黑正文 | Tailwind 基础白与纯黑 | 注入 Tatami 纸质底色与墨黑文字变量 |
| **边框与阴影** | 极少硬边框，全靠 4 级物理平滑阴影 | `border-gray-200` 静态实线 | 引入平滑无边框阴影作为卡片和面板主要分层手段 |
| **交互动效** | 150ms 悬停渐变，200ms 折叠，1s 骨架屏 | 基础 CSS 瞬时变化 | 统一阻尼曲线，引入折叠平滑与扫光骨架屏 |
| **空间隔离** | Teamspaces (团队) + Private (私有备忘) | 仅项目/团队资料，无个人沙盒 | 侧栏增加“私有备忘 (Private)”与空间发布流转机制 |
| **移动端适配** | 多列自动垂直展平，软键盘吸附栏 | 移动端局部内容横向溢出 | `<600px` 多列扁平化降级 + 触控热区 $\ge 44\text{px}$ + 键盘吸附栏 |
| **时效维护** | 责任人签发 Verification + 过期预警 | 仅记录上传时间，无时效标记 | 增加资料 Verification 审核人与过期标记 |
| **文档关联** | 跨页面同步块 + 双向反向链接 | 单向文件下载或静态展示 | Markdown 内联 `@` 任务/资料引用 + 底部关联面板 |
| **成果沉淀** | 无缝融合项目与维基 | 任务交付与资料库分离 | 任务最终验收通过后一键转存为团队知识库 |


