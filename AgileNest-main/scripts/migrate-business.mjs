import { config } from "dotenv";
import postgres from "postgres";
import { readFile } from "node:fs/promises";

config({ path: process.argv.includes("--test") ? ".env.test" : ".env", quiet: true });
const connection = postgres(process.env.DATABASE_URL, { max: 1 });
try {
  await connection.begin(async (tx) => {
    await tx.unsafe(await readFile(new URL("../src/db/migrations/business-completion.sql", import.meta.url), "utf8"));
  });
  console.log("团队资料、共享文件及提交验收版本表已就绪；既有数据保留。");
} finally { await connection.end(); }
