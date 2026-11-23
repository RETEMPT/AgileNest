import { config } from "dotenv";
import postgres from "postgres";
import { readFile } from "node:fs/promises";

config({ path: process.argv.includes("--test") ? ".env.test" : ".env", quiet: true });
const connection = postgres(process.env.DATABASE_URL, { max: 1 });
try {
  await connection.begin(async (tx) => {
    await tx.unsafe(await readFile(new URL("../src/db/migrations/task-versions-public-files.sql", import.meta.url), "utf8"));
  });
  console.log("任务版本历史与公共文件库已就绪；既有数据保留。");
} finally { await connection.end(); }
