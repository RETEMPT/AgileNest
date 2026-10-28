import { config } from "dotenv";
import postgres from "postgres";
import { readFile } from "node:fs/promises";

config({ path: process.argv.includes("--test") ? ".env.test" : ".env", quiet: true });
if (!process.env.DATABASE_URL) throw new Error("数据库连接未配置，请先生成环境配置后重试。");
const connection = postgres(process.env.DATABASE_URL, { max: 1, onnotice: () => {} });
try {
  await connection.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(73463211)`;
    await tx.unsafe(await readFile(new URL("../src/db/migrations/collaboration-v050.sql", import.meta.url), "utf8"));
  });
  console.log("分类主题、资料回收与阶段交付已就绪；既有资料与成果历史保留。");
} finally { await connection.end(); }
