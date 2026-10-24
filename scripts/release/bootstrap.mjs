import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { createHash, randomBytes, randomUUID } from "node:crypto";
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
      for (const name of ["0000_init.sql", "identity-positions.sql", "personal-profiles.sql", "personal-schedules.sql", "personal-contacts.sql", "business-completion.sql", "discussions.sql", "collaboration-foundations.sql", "member-deputy.sql", "collaboration-v050.sql"]) {
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
    const requirements = [
      ["说明研究问题、方法和预计成果", "提供需求说明或参考资料证据"],
      ["成员职责与各项工作负责人明确", "分工记录可查看并与任务目标一致"],
      ["阶段报告包含进展、成果和未解决问题", "附原始材料索引和验证结果"],
    ];
    for (const [i, title] of ["整理研究目标", "确定成员分工", "准备阶段材料"].entries()) {
      const now = new Date().toISOString();
      const [task] = await tx`INSERT INTO tasks (project_id, title, description, status, priority, start_date, due_date, milestone_id, created_by_id, sort_order, created_at, updated_at) VALUES (${project.id}, ${title}, '按验收要求执行，提交完成说明、验证结果和文件或链接证据，由具有验收职务的成员逐项核对。', 'unclaimed', 'medium', ${today}, ${today}::date + ${i + 3}::integer, ${milestone.id}, ${members[0].id}, ${i}, ${now}, ${now}) RETURNING id`;
      await tx`INSERT INTO task_requirements (task_id, version, criteria, updated_at) VALUES (${task.id}, 1, ${tx.json(requirements[i].map((text) => ({ id: randomUUID(), text })))}, ${now})`;
      await tx`INSERT INTO task_acceptance_events (task_id, actor_id, action, note, created_at) VALUES (${task.id}, ${members[0].id}, 'create', '创建示例任务和验收要求', ${now})`;
    }
  });
  console.log("数据库与追加迁移已就绪；已有记录保持原样。");
} finally { await sql.end(); }
