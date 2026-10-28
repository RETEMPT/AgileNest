import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/db/schema";

const globalForDb = globalThis as unknown as { pgClient?: ReturnType<typeof postgres> };

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.warn("[db] DATABASE_URL 未配置，数据库调用将不可用。");
}

const client =
  globalForDb.pgClient ??
  postgres(connectionString || "postgres://localhost:5432/agilenest", {
    max: process.env.DB_MAX_CONNECTIONS ? Number(process.env.DB_MAX_CONNECTIONS) : 10,
    idle_timeout: 20, // 20 秒释放空闲连接，避免长期运行连接泄露
    connect_timeout: 10, // 10 秒连接超时，防止网络或进程挂起无响应
    max_lifetime: 60 * 30, // 30 分钟连接生命周期，避免在 Windows / 长时间运行时僵死
    onnotice: () => {}, // 静默普通 notice，避免控制台刷屏
  });

if (process.env.NODE_ENV !== "production") globalForDb.pgClient = client;

export const db = drizzle(client, { schema });
export type DbTx = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];
