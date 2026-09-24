// 跨平台清理：删除 .next / coverage / *.tsbuildinfo
import { rm, stat } from "node:fs/promises";
import path from "node:path";

const targets = [".next", "coverage", "tsconfig.tsbuildinfo", "next-env.d.ts"];

for (const t of targets) {
  const p = path.resolve(process.cwd(), t);
  try {
    await stat(p);
    await rm(p, { recursive: true, force: true });
    console.log(`cleaned ${t}`);
  } catch {
    // 不存在则跳过
  }
}
console.log("clean done");
