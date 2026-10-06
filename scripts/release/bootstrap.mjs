import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { createHash, randomBytes } from "node:crypto";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const require = createRequire(path.join(root, "app", "package.json"));
const postgres = require("postgres");
const bcrypt = require("bcryptjs");
const config = JSON.parse((await readFile(path.join(root, "data", "config.json"), "utf8")).replace(/^\uFEFF/, ""));
const connection = { host: "127.0.0.1", port: config.dbPort, username: "agilenest", password: config.dbPassword, max: 1, onnotice: () => {} };
const admin = postgres({ ...connection, database: "postgres" });
try {
  const exists = await admin`SELECT 1 FROM pg_database WHERE datname = 'agilenest'`;
  if (!exists.length) await admin.unsafe("CREATE DATABASE agilenest");
} finally { await admin.end(); }

const sql = postgres({ ...connection, database: "agilenest" });
try {
  await sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(73463211)`;
    const [{ fresh }] = await tx`SELECT to_regclass('public.users') IS NULL AS fresh`;
    await tx.unsafe("CREATE TABLE IF NOT EXISTS _agilenest_release_migrations (name text PRIMARY KEY, sha256 text NOT NULL, applied_at timestamp NOT NULL DEFAULT now())");
    for (const name of ["0000_init.sql", "identity-positions.sql", "personal-profiles.sql", "personal-schedules.sql"]) {
      const source = await readFile(path.join(root, "release-db", name), "utf8");
      const digest = createHash("sha256").update(source).digest("hex");
      const [previous] = await tx`SELECT sha256 FROM _agilenest_release_migrations WHERE name = ${name}`;
      if (previous) {
        if (previous.sha256 !== digest) throw new Error(`迁移 ${name} 与已安装版本不同，请保留原数据并联系维护者`);
        continue;
      }
      if (name !== "0000_init.sql" || fresh) await tx.unsafe(source);
      await tx`INSERT INTO _agilenest_release_migrations (name, sha256) VALUES (${name}, ${digest})`;
    }
    if (!fresh) return;
    const hash = await bcrypt.hash("password123", 10);
    const accounts = [
      { email: "admin@agilecampus.local", name: "管理员", role: "admin", positions: ["admin", "member"] },
      { email: "teacher@agilecampus.local", name: "指导老师", role: "teacher", positions: ["advisor"] },
      { email: "student@agilecampus.local", name: "协作成员", role: "student", positions: ["member"] },
    ];
    const [team] = await tx`INSERT INTO teams (name, invite_code) VALUES ('项目协作空间', ${randomBytes(5).toString("hex")}) RETURNING id`;
    const members = [];
    for (const account of accounts) {
      const [user] = await tx`INSERT INTO users (email, name, password_hash) VALUES (${account.email}, ${account.name}, ${hash}) RETURNING id`;
      const [membership] = await tx`INSERT INTO team_members (team_id, user_id, role) VALUES (${team.id}, ${user.id}, ${account.role}) RETURNING id`;
      await tx`INSERT INTO member_positions (membership_id, positions, updated_by_id) VALUES (${membership.id}, ${tx.array(account.positions)}::team_position[], ${user.id})`;
      members.push(user);
    }
    const [project] = await tx`INSERT INTO projects (team_id, name, description, kind) VALUES (${team.id}, '协作示例课题', '成员分工、任务协作与成果验收', 'lab') RETURNING id`;
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    const [milestone] = await tx`INSERT INTO milestones (project_id, title, kind, target_date) VALUES (${project.id}, '阶段汇报', 'midterm', ${today}::date + 14) RETURNING id`;
    for (const [i, title] of ["整理研究目标", "确定成员分工", "准备阶段材料"].entries()) {
      const [task] = await tx`INSERT INTO tasks (project_id, title, description, status, priority, start_date, due_date, milestone_id, created_by_id, sort_order) VALUES (${project.id}, ${title}, '填写完成说明后提交，由指导老师验收。', 'unclaimed', 'medium', ${today}, ${today}::date + ${i + 3}::integer, ${milestone.id}, ${members[0].id}, ${i}) RETURNING id`;
      await tx`INSERT INTO task_acceptance_events (task_id, actor_id, action, note) VALUES (${task.id}, ${members[0].id}, 'create', '创建示例任务')`;
    }
  });
  console.log("数据库与追加迁移已就绪；已有记录保持原样。");
} finally { await sql.end(); }
