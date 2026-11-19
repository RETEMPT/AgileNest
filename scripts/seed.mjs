// AgileNest 专属种子数据与演示环境初始化
// 包含：4 个演示账号 + 1 个标准团队 + 1 个 AgileNest 演示项目 + 完整五态任务 + 资料库 + 个人日程
import { config } from "dotenv";
config();
import postgres from "postgres";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("缺 DATABASE_URL，请先 cp .env.example .env");
  process.exit(1);
}

const sql = postgres(url);

async function main() {
  console.log("==========================================");
  console.log("  AgileNest · 演示数据构建与环境规范化");
  console.log("==========================================");

  const hash = await bcrypt.hash("password123", 10);

  // 1. 创建或同步 4 个标准演示账号
  const [admin] = await sql`
    INSERT INTO users (email, password_hash, name)
    VALUES ('admin@agilecampus.local', ${hash}, '张老师')
    ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
    RETURNING id`;

  const [teacher] = await sql`
    INSERT INTO users (email, password_hash, name)
    VALUES ('teacher@agilecampus.local', ${hash}, '王老师')
    ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
    RETURNING id`;

  const [student] = await sql`
    INSERT INTO users (email, password_hash, name)
    VALUES ('student@agilecampus.local', ${hash}, '李同学')
    ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
    RETURNING id`;

  const [dev] = await sql`
    INSERT INTO users (email, password_hash, name)
    VALUES ('dev@agilecampus.local', ${hash}, '赵同学')
    ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
    RETURNING id`;

  const devId = dev?.id ?? (await sql`SELECT id FROM users WHERE email = 'dev@agilecampus.local'`)[0]?.id;

  // 2. 获取或创建唯一的权威团队
  let [team] = await sql`SELECT id, name, invite_code FROM teams WHERE name = '软件工程课程组' ORDER BY created_at DESC LIMIT 1`;
  if (!team) {
    const invite = randomBytes(5).toString("hex");
    [team] = await sql`
      INSERT INTO teams (name, invite_code)
      VALUES ('软件工程课程组', ${invite})
      RETURNING id, name, invite_code`;
  }
  const teamId = team.id;
  console.log(`[1/5] 权威团队已就绪：${team.name} (ID: ${teamId})`);

  // 3. 清理数据库中所有其他无用团队及关联的历史遗留数据（保证纯净）
  await sql`
    DELETE FROM task_action_item_origins
    WHERE resource_id IN (SELECT id FROM team_resources WHERE team_id != ${teamId})
       OR task_id IN (SELECT t.id FROM tasks t JOIN projects p ON p.id = t.project_id WHERE p.team_id != ${teamId})`;

  await sql`
    DELETE FROM resource_references
    WHERE resource_id IN (SELECT id FROM team_resources WHERE team_id != ${teamId})
       OR submission_id IN (
         SELECT ts.id FROM task_submissions ts
         JOIN tasks t ON t.id = ts.task_id
         JOIN projects p ON p.id = t.project_id
         WHERE p.team_id != ${teamId}
       )`;

  await sql`
    DELETE FROM discussion_resource_references
    WHERE resource_id IN (SELECT id FROM team_resources WHERE team_id != ${teamId})`;

  await sql`
    DELETE FROM task_dependencies
    WHERE project_id IN (SELECT id FROM projects WHERE team_id != ${teamId})`;

  await sql`
    DELETE FROM resource_placements
    WHERE resource_id IN (SELECT id FROM team_resources WHERE team_id != ${teamId})`;

  await sql`
    DELETE FROM resource_comments
    WHERE resource_id IN (SELECT id FROM team_resources WHERE team_id != ${teamId})`;

  await sql`
    DELETE FROM project_space_assignments
    WHERE project_id IN (SELECT id FROM projects WHERE team_id != ${teamId})`;

  await sql`
    DELETE FROM delivery_records
    WHERE batch_id IN (SELECT id FROM delivery_batches WHERE project_id IN (SELECT id FROM projects WHERE team_id != ${teamId}))`;

  await sql`
    DELETE FROM delivery_issues
    WHERE batch_id IN (SELECT id FROM delivery_batches WHERE project_id IN (SELECT id FROM projects WHERE team_id != ${teamId}))`;

  await sql`
    DELETE FROM delivery_entries
    WHERE batch_id IN (SELECT id FROM delivery_batches WHERE project_id IN (SELECT id FROM projects WHERE team_id != ${teamId}))`;

  await sql`
    DELETE FROM delivery_batches
    WHERE project_id IN (SELECT id FROM projects WHERE team_id != ${teamId})`;

  await sql`
    DELETE FROM task_submission_reviews
    WHERE submission_id IN (
      SELECT ts.id FROM task_submissions ts
      JOIN tasks t ON t.id = ts.task_id
      JOIN projects p ON p.id = t.project_id
      WHERE p.team_id != ${teamId}
    )`;

  await sql`
    DELETE FROM task_submissions
    WHERE task_id IN (
      SELECT t.id FROM tasks t
      JOIN projects p ON p.id = t.project_id
      WHERE p.team_id != ${teamId}
    )`;

  const deletedTeams = await sql`
    DELETE FROM teams WHERE id != ${teamId}
    RETURNING id, name`;
  if (deletedTeams.length > 0) {
    console.log(`[清理] 已移除 ${deletedTeams.length} 个历史无用团队：${deletedTeams.map(t => t.name).join("、")}`);
  }

  // 4. 维护团队成员与职务
  await sql`
    INSERT INTO team_members (team_id, user_id, role)
    VALUES
      (${teamId}, ${admin.id}, 'admin'),
      (${teamId}, ${student.id}, 'student'),
      (${teamId}, ${teacher.id}, 'teacher'),
      (${teamId}, ${devId}, 'student')
    ON CONFLICT (team_id, user_id) DO NOTHING`;

  const memberships = await sql`
    SELECT id, user_id FROM team_members WHERE team_id = ${teamId}`;
  for (const m of memberships) {
    let pos = ['member'];
    if (m.user_id === admin.id) pos = ['admin', 'member'];
    else if (m.user_id === teacher.id) pos = ['advisor'];
    else if (m.user_id === devId) pos = ['leader', 'member'];
    else if (m.user_id === student.id) pos = ['member'];

    await sql`
      INSERT INTO member_positions (membership_id, positions, updated_by_id)
      VALUES (${m.id}, ${pos}, ${admin.id})
      ON CONFLICT (membership_id) DO UPDATE SET positions = EXCLUDED.positions`;
  }
  console.log(`[2/5] 4 位演示成员及多重职务授权已同步（张老师、王老师、李同学、赵同学）`);

  // 5. 维护唯一的 AgileNest 演示项目
  let [project] = await sql`
    SELECT id FROM projects WHERE team_id = ${teamId} ORDER BY created_at ASC LIMIT 1`;
  if (!project) {
    [project] = await sql`
      INSERT INTO projects (team_id, name, description, kind)
      VALUES (
        ${teamId},
        'AgileNest 敏捷协作平台',
        '面向课程、研究与软件项目的敏捷协作平台 · 代码仓库 https://github.com/RETEMPT/AgileNest',
        'course'
      )
      RETURNING id`;
  } else {
    await sql`
      UPDATE projects
      SET
        name = 'AgileNest 敏捷协作平台',
        description = '面向课程、研究与软件项目的敏捷协作平台 · 代码仓库 https://github.com/RETEMPT/AgileNest',
        kind = 'course'
      WHERE id = ${project.id}`;
  }
  const projectId = project.id;

  // 清理同一个团队下可能多余创建的旧同名项目
  await sql`
    DELETE FROM projects WHERE team_id = ${teamId} AND id != ${projectId}`;

  console.log(`[3/5] 演示项目已就绪：AgileNest 敏捷协作平台 (ID: ${projectId})`);

  // 6. 里程碑
  await sql`
    DELETE FROM milestones WHERE project_id = ${projectId}`;
  const [msOpen] = await sql`
    INSERT INTO milestones (project_id, title, kind, target_date, status)
    VALUES (${projectId}, '阶段一：开题与架构设计', 'open_topic', '2026-10-15', 'done')
    RETURNING id`;
  const [msMid] = await sql`
    INSERT INTO milestones (project_id, title, kind, target_date, status)
    VALUES (${projectId}, '阶段二：中期研发与成果验收', 'midterm', '2026-11-30', 'open')
    RETURNING id`;
  await sql`
    INSERT INTO milestones (project_id, title, kind, target_date, status)
    VALUES (${projectId}, '阶段三：结题答辩与部署交付', 'final', '2026-12-31', 'open')`;

  // 7. 任务池（完整五态，紧扣 AgileNest 真实开发任务）
  await sql`DELETE FROM tasks WHERE project_id = ${projectId}`;

  // 7.1 待认领
  await sql`
    INSERT INTO tasks (project_id, title, description, status, priority, due_date, milestone_id, created_by_id, sort_order)
    VALUES
      (${projectId}, '设计全宽知识库阅读器界面', '支持文章目录、字号与版心宽度调节，优化移动端与窄屏阅读排版', 'unclaimed', 'high', '2026-11-25', ${msMid.id}, ${teacher.id}, 1),
      (${projectId}, '基于 GitHub API 扩展 Issues 概览', '轻量调用 GitHub API 展现最近 Issues 动态与提交记录', 'unclaimed', 'medium', '2026-11-28', ${msMid.id}, ${teacher.id}, 2)`;

  // 7.2 执行中（李同学负责）
  await sql`
    INSERT INTO tasks (project_id, title, description, status, priority, due_date, milestone_id, created_by_id, assignee_id, claimed_at, sort_order)
    VALUES
      (${projectId}, '对接 GitHub 仓库卡片与 README 预览', '实现项目概览中 GitHub 代码仓库卡片、分支状态及可折叠 Markdown 预览', 'in_progress', 'high', '2026-11-20', ${msMid.id}, ${teacher.id}, ${student.id}, now(), 3)`;

  // 7.3 待验收（赵同学负责，已提交）
  await sql`
    INSERT INTO tasks (project_id, title, description, status, priority, due_date, milestone_id, created_by_id, assignee_id, claimed_at, submitted_at, completion_note, sort_order)
    VALUES
      (${projectId}, '实现个人账号隔离的安全配置加密存储', 'AES 加密提供商与凭据，严格按个人会话账号隔离，禁止泄露至浏览器明文', 'submitted', 'high', '2026-11-22', ${msMid.id}, ${teacher.id}, ${devId}, now(), now(), '已完成按账号服务端 AES-256-GCM 加密，并通过单元测试校验隔离有效性', 4)`;

  // 7.4 已验收（赵同学完成，王老师验收）
  await sql`
    INSERT INTO tasks (project_id, title, description, status, priority, due_date, milestone_id, created_by_id, assignee_id, claimed_at, submitted_at, accepted_at, accepted_by_id, completion_note, sort_order)
    VALUES
      (${projectId}, '搭仓库骨架与 Drizzle 数据库集成', '建立模块化单体架构，集成 Drizzle ORM，配置 Windows 原生脚本与 CI 验证', 'accepted', 'medium', '2026-10-10', ${msOpen.id}, ${teacher.id}, ${devId}, now(), now(), now(), ${teacher.id}, '仓库已初始化：https://github.com/RETEMPT/AgileNest，通过 Drizzle-Kit 实现迁移治理，全套契约用例测试通过', 5)`;

  // 7.5 待修改（李同学负责，张老师打回）
  await sql`
    INSERT INTO tasks (project_id, title, description, status, priority, due_date, milestone_id, created_by_id, assignee_id, claimed_at, submitted_at, rejected_at, rejected_by_id, reject_reason, sort_order)
    VALUES
      (${projectId}, '补齐 AI 资料检索与工具契约测试', '补充未授权跨项目读取的边界防御用例与纯函数测试', 'rejected', 'low', '2026-11-18', ${msMid.id}, ${teacher.id}, ${student.id}, now(), now(), now(), ${admin.id}, '需补充跨租户资料检索的越权拦截断言，确保以个人账号权限查询', 6)`;

  console.log(`[4/5] 五态任务池已构建（覆盖待认领、执行中、待验收、已验收、待修改）`);

  // 8. 构建丰富完备的资料库（team_resources）
  await sql`DELETE FROM team_resources WHERE project_id = ${projectId}`;

  // 8.1 官方开源仓库链接 (specification)
  await sql`
    INSERT INTO team_resources (team_id, project_id, kind, title, url, category, tags, created_by_id)
    VALUES (
      ${teamId},
      ${projectId},
      'link',
      'AgileNest 官方开源代码仓库',
      'https://github.com/RETEMPT/AgileNest',
      'specification',
      ${JSON.stringify(["代码仓库", "开源", "GitHub"])},
      ${admin.id}
    )`;

  // 8.2 系统架构与说明文档 (specification)
  const archDoc = `# AgileNest · 高校项目协作架构概览

面向课程、研究、竞赛与软件项目，覆盖团队 → 项目资料与目标 → 任务分工 → 成果提交 → 逐项验收 → 阶段交付。

## 1. 软件工程技术栈
- **核心前端**：Next.js 16 (App Router) + React 19 + Tailwind CSS 4
- **组件规范**：Radix UI + Lucide Icons + 自研响应式阅读器
- **持久化层**：PostgreSQL 17 + Drizzle ORM
- **数据校验**：Zod 4 运行时边界检查

## 2. 状态机唯一真相
任务生命周期严格由状态机管控，禁止越权直接更改字段：
\`\`\`
[待认领 unclaimed]
       │ (认领 / 指派)
       ▼
[执行中 in_progress] ──(提交)──► [待验收 submitted]
       ▲                              │
       │ (重交)                        ├─► [已验收 accepted]
       │                              │
[待修改 rejected] ◄────(打回)─────────┘
\`\`\`

## 3. 个人权限与资料隔离
- 个人日程仅本人可读写，无越权风险；
- AI 检索工具严格绑定登录会话的真实权限，不可跨团队穿透；
- 提供商配置与密钥在服务端按账号隔离加密保存。`;

  await sql`
    INSERT INTO team_resources (team_id, project_id, kind, title, body, category, tags, created_by_id)
    VALUES (
      ${teamId},
      ${projectId},
      'document',
      'AgileNest 系统架构与设计规范',
      ${archDoc},
      'specification',
      ${JSON.stringify(["架构设计", "课设文档", "系统规范"])},
      ${admin.id}
    )`;

  // 8.3 技术调研报告 (research)
  const researchDoc = `# Next.js 16 与 React 19 服务端组件实战调研

## 调研目标
评估 Next.js 16 App Router 在大型教学协作单体应用中的性能与安全边界。

## 关键结论
1. **纯服务端页面组合 (views.tsx)**：直接从数据库取数并完成 ACL 校验，杜绝未经授权的数据流出；
2. **轻量客户端组件 (ui.tsx)**：仅负责交互动画、表单与快捷键，维持最小 JS 打包体积；
3. **零额外臃肿依赖**：复用内建 Markdown 与原生 Fetch，保障系统在低配服务器及本地离线环境极速秒开。`;

  await sql`
    INSERT INTO team_resources (team_id, project_id, kind, title, body, category, tags, created_by_id)
    VALUES (
      ${teamId},
      ${projectId},
      'document',
      'Next.js 16 与 React 19 服务端组件实战调研',
      ${researchDoc},
      'research',
      ${JSON.stringify(["技术调研", "React19", "Next16"])},
      ${devId}
    )`;

  // 8.4 项目周会记录 (meeting)
  const meetingDoc = `# AgileNest 研发团队第一次周例会纪要

- **时间**：2026-11-19 14:00 - 15:30
- **参会人员**：张老师、王老师、李同学、赵同学
- **记录人**：李同学

## 会议议题与决议
1. **GitHub 仓库集成**：由李同学负责在项目概览嵌入轻量仓库卡片及 README 预览，已完成开发并进入联调；
2. **账号安全与凭据隔离**：赵同学已实现服务端 AES 加密，进入待验收状态，请王老师进行安全点验；
3. **知识库体验升级**：移除无用小字与冗余提示，AI 资料检索范围默认对齐当前账号所有可访问资料；
4. **下一步计划**：下周二前完成全套契约测试验证，准备进入中期答辩。`;

  await sql`
    INSERT INTO team_resources (team_id, project_id, kind, title, body, category, tags, created_by_id)
    VALUES (
      ${teamId},
      ${projectId},
      'document',
      'AgileNest 研发团队周例会纪要（第 10 周）',
      ${meetingDoc},
      'meeting',
      ${JSON.stringify(["周例会", "会议记录"])},
      ${student.id}
    )`;

  // 8.5 阶段交付成果清单 (delivery)
  const deliveryDoc = `# AgileNest 阶段成果与交付清单 (v0.6.1-rc.3)

## 交付产物
- [x] **Windows 独立开箱即用运行包**：集成 Node.js 与 PostgreSQL，双击 start.bat 即可一键启动；
- [x] **五态敏捷任务看板与表格双视图**；
- [x] **结构化成果提交与逐项验收报告**；
- [x] **个人日程管理与项目日历全景联动**；
- [x] **全宽知识库阅读器与按账号收藏**。`;

  await sql`
    INSERT INTO team_resources (team_id, project_id, kind, title, body, category, tags, created_by_id)
    VALUES (
      ${teamId},
      ${projectId},
      'document',
      'AgileNest 阶段成果与交付清单',
      ${deliveryDoc},
      'delivery',
      ${JSON.stringify(["交付成果", "版本清单"])},
      ${teacher.id}
    )`;

  console.log(`[5/5] 资料库已构建（涵盖需求设计、开源链接、架构文档、技术调研、周会纪要、交付清单等 5 项高价值资料）`);

  // 9. 构建个人日程（围绕当前时间 2026-11-19，方便现场演示日历联动）
  await sql`
    DELETE FROM personal_schedules WHERE user_id IN (${admin.id}, ${student.id}, ${devId}, ${teacher.id})`;

  // 张老师日程
  await sql`
    INSERT INTO personal_schedules (user_id, title, description, schedule_date, start_time, end_time, priority)
    VALUES
      (${admin.id}, 'AgileNest 敏捷协作平台周例会', '审查各组员任务五态流转及中期交付进展', '2026-11-19', '14:00', '15:30', 2),
      (${admin.id}, '评审李同学提交的 GitHub 仓库卡片组件', '核实 README 预览与频限降级表现', '2026-11-20', '10:00', '11:00', 1),
      (${admin.id}, '软件工程课程中期答辩指导', '组织各组答辩演练与材料合规审查', '2026-11-23', '15:00', '17:00', 1)`;

  // 李同学日程
  await sql`
    INSERT INTO personal_schedules (user_id, title, description, schedule_date, start_time, end_time, priority)
    VALUES
      (${student.id}, '联调知识库阅读器排版与 AI 资料检索', '验证以个人账号权限检索资料功能完备性', '2026-11-19', '16:00', '18:00', 1),
      (${student.id}, '准备代码仓库卡片与 README 预览成果验收', '准备成果链接与逐项自检说明', '2026-11-21', '09:30', '11:00', 1)`;

  // 赵同学日程
  await sql`
    INSERT INTO personal_schedules (user_id, title, description, schedule_date, start_time, end_time, priority)
    VALUES
      (${devId}, 'Drizzle 数据库索引与迁移脚本验证', '测试 Windows 独立启动脚本与种子数据幂等性', '2026-11-19', '13:30', '15:00', 1),
      (${devId}, '向王老师演示安全配置加密存储模块', '演示 AES-256 加密与个人会话隔离', '2026-11-22', '14:00', '15:30', 2)`;

  // 王老师日程
  await sql`
    INSERT INTO personal_schedules (user_id, title, description, schedule_date, start_time, end_time, priority)
    VALUES
      (${teacher.id}, '阶段成果逐项验收与打回指导', '验收赵同学的加密存储任务与数据库骨架', '2026-11-22', '16:00', '17:30', 2)`;

  console.log(`[日历] 个人日程已生成（张老师、王老师、李同学、赵同学在 2026-11-19 至今后两周的日程全部排布就绪）`);

  console.log("\n==========================================");
  console.log("  SEED SUCCESS · 纯净 AgileNest 演示环境就绪");
  console.log("==========================================");
  console.log(`  团队：软件工程课程组 (邀请码：${team.invite_code})`);
  console.log(`  项目：AgileNest 敏捷协作平台`);
  console.log("\n  演示账号（通用密码：password123）：");
  console.log(`  1. admin@agilecampus.local   - 张老师（管理员/组员，全局权限）`);
  console.log(`  2. teacher@agilecampus.local - 王老师（指导老师，成果验收与指导）`);
  console.log(`  3. student@agilecampus.local - 李同学（前端核心/组员，任务执行与提交）`);
  console.log(`  4. dev@agilecampus.local     - 赵同学（后端架构/队长，数据模型与交付）`);
  console.log("==========================================");

  await sql.end();
}

main().catch((e) => {
  console.error("Seed 失败:", e);
  process.exit(1);
});
