// 种子数据：一名 admin + 一名 student + 一个团队 + 一个项目（便于本地点验双端链路）
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
  const hash = await bcrypt.hash("password123", 10);
  const invite = randomBytes(5).toString("hex");

  const [admin] = await sql`
    INSERT INTO users (email, password_hash, name)
    VALUES ('admin@agilecampus.local', ${hash}, '张老师')
    ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
    RETURNING id`;
  const [student] = await sql`
    INSERT INTO users (email, password_hash, name)
    VALUES ('student@agilecampus.local', ${hash}, '李同学')
    ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
    RETURNING id`;

  const [team] = await sql`
    INSERT INTO teams (name, invite_code)
    VALUES ('软件工程课程组', ${invite})
    ON CONFLICT DO NOTHING
    RETURNING id`;
  const teamId =
    team?.id ??
    (await sql`SELECT id FROM teams WHERE name = '软件工程课程组'`)[0]?.id;
  if (!teamId) throw new Error("建团队失败");

  await sql`
    INSERT INTO team_members (team_id, user_id, role)
    VALUES (${teamId}, ${admin.id}, 'admin'), (${teamId}, ${student.id}, 'student')
    ON CONFLICT (team_id, user_id) DO NOTHING`;

  const [project] = await sql`
    INSERT INTO projects (team_id, name, description, kind)
    VALUES (${teamId}, 'AgileCampus 课设', '开题 → 中期 → 结题', 'course')
    ON CONFLICT DO NOTHING
    RETURNING id`;
  const projectId =
    project?.id ??
    (await sql`SELECT id FROM projects WHERE name = 'AgileCampus 课设'`)[0]?.id;

  await sql`
    INSERT INTO milestones (project_id, title, kind, target_date)
    VALUES
      (${projectId}, '开题', 'open_topic', '2026-09-30'),
      (${projectId}, '中期', 'midterm', '2026-12-31'),
      (${projectId}, '结题答辩', 'final', '2027-05-31')
    ON CONFLICT DO NOTHING`;

  const [teacher] = await sql`
    INSERT INTO users (email, password_hash, name)
    VALUES ('teacher@agilecampus.local', ${hash}, '王老师')
    ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
    RETURNING id`;
  await sql`
    INSERT INTO team_members (team_id, user_id, role)
    VALUES (${teamId}, ${teacher.id}, 'teacher')
    ON CONFLICT (team_id, user_id) DO NOTHING`;

  const [ms] = await sql`SELECT id FROM milestones WHERE project_id = ${projectId} AND kind = 'open_topic' LIMIT 1`;

  // 示例任务覆盖五态，便于直接点验主链路
  await sql`
    INSERT INTO tasks (project_id, title, description, status, priority, due_date, milestone_id, created_by_id, sort_order)
    VALUES
      (${projectId}, '整理开题报告大纲', '写出三级提纲并提交', 'unclaimed', 'high', '2026-10-01', ${ms?.id ?? null}, ${teacher.id}, 1),
      (${projectId}, '调研同类系统', '对比 2 个开源项目', 'unclaimed', 'medium', '2026-10-05', ${ms?.id ?? null}, ${teacher.id}, 2),
      (${projectId}, '画信息架构图', 'IA 图 + 页面清单', 'in_progress', 'medium', '2026-10-08', ${ms?.id ?? null}, ${teacher.id}, 3),
      (${projectId}, '写用例文档', '核心用例 10 条', 'submitted', 'high', '2026-10-03', ${ms?.id ?? null}, ${teacher.id}, 4),
      (${projectId}, '搭仓库骨架', '模块化目录 + CI', 'accepted', 'medium', '2026-09-20', ${ms?.id ?? null}, ${teacher.id}, 5),
      (${projectId}, '补测试用例', '契约测试 ≥6 条', 'rejected', 'low', '2026-10-10', ${ms?.id ?? null}, ${teacher.id}, 6)
    ON CONFLICT DO NOTHING`;
  await sql`
    UPDATE tasks SET assignee_id = ${student.id}, claimed_at = now(), submitted_at = now(), completion_note = '大纲已完成'
    WHERE project_id = ${projectId} AND title = '写用例文档' AND assignee_id IS NULL`;
  await sql`
    UPDATE tasks SET assignee_id = ${student.id}, claimed_at = now()
    WHERE project_id = ${projectId} AND title = '画信息架构图' AND assignee_id IS NULL`;
  await sql`
    UPDATE tasks SET assignee_id = ${student.id}, claimed_at = now(), submitted_at = now(), accepted_at = now(), accepted_by_id = ${teacher.id}, completion_note = '仓库已初始化'
    WHERE project_id = ${projectId} AND title = '搭仓库骨架' AND assignee_id IS NULL`;
  await sql`
    UPDATE tasks SET assignee_id = ${student.id}, claimed_at = now(), submitted_at = now(), rejected_at = now(), rejected_by_id = ${teacher.id}, reject_reason = '用例覆盖不足，请补边界'
    WHERE project_id = ${projectId} AND title = '补测试用例' AND assignee_id IS NULL`;

  console.log("SEED OK");
  console.log(`  admin   admin@agilecampus.local / password123`);
  console.log(`  teacher teacher@agilecampus.local / password123`);
  console.log(`  student student@agilecampus.local / password123`);
  console.log(`  team    软件工程课程组  invite=${invite}`);
  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
