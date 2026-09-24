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

  console.log("SEED OK");
  console.log(`  admin   admin@agilecampus.local / password123`);
  console.log(`  student student@agilecampus.local / password123`);
  console.log(`  team    软件工程课程组  invite=${invite}`);
  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
