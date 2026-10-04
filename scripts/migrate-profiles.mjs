import { config } from "dotenv";
import postgres from "postgres";
import { readFile } from "node:fs/promises";

config({
  path: process.argv.includes("--test") ? ".env.test" : ".env",
  quiet: true,
});
const connection = postgres(process.env.DATABASE_URL, { max: 1 });
try {
  await connection.begin(async (tx) => {
    await tx.unsafe(
      await readFile(
        new URL("../src/db/migrations/personal-profiles.sql", import.meta.url),
        "utf8",
      ),
    );
  });
  console.log("个人资料与头像表已就绪，既有数据保留。");
} finally {
  await connection.end();
}
