import { config } from "dotenv";
import postgres from "postgres";
import { readFile } from "node:fs/promises";

config({ path: process.argv.includes("--test") ? ".env.test" : ".env", quiet: true });
if (!process.env.DATABASE_URL) throw new Error("数据库连接未配置，请先生成环境配置后重试。");
const connection = postgres(process.env.DATABASE_URL, { max: 1, onnotice: () => {} });
try {
  await connection.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(73463211)`;
    await tx.unsafe(await readFile(new URL("../src/db/migrations/collaboration-foundations.sql", import.meta.url), "utf8"));
  });
  console.log("项目目录、知识库协作、标签依赖、行动项与通知偏好已就绪；既有数据保留。");
} finally { await connection.end(); }
