import { describe, it, expect, beforeEach } from "vitest";
import { createUser } from "@/lib/user";
import { verifyPassword } from "@/lib/password";
import { AppError } from "@/modules/core/errors";
import { resetDb } from "../../helpers";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

describe("createUser", () => {
  beforeEach(resetDb);

  it("创建用户并存哈希而非明文", async () => {
    const user = await createUser({
      email: "zhou@example.com",
      password: "password123",
      name: "周瑜",
    });
    expect(user.email).toBe("zhou@example.com");
    const [row] = await db.select().from(users).where(eq(users.id, user.id));
    expect(row.passwordHash).not.toBe("password123");
    expect(await verifyPassword("password123", row.passwordHash)).toBe(true);
  });

  it("重复邮箱抛出可展示错误", async () => {
    await createUser({ email: "dup@example.com", password: "password123", name: "甲" });
    await expect(
      createUser({ email: "dup@example.com", password: "password123", name: "乙" }),
    ).rejects.toThrow("该邮箱已被注册");
  });

  it("并发注册同一邮箱：恰一个成功，另一个收到可展示的 AppError", async () => {
    const input = { email: "race@example.com", password: "password123", name: "并" };
    const results = await Promise.allSettled([createUser(input), createUser(input)]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    const reason = (rejected[0] as PromiseRejectedResult).reason;
    expect(reason).toBeInstanceOf(AppError);
    expect(reason.message).toBe("该邮箱已被注册");
  });

  it("绕过查重的唯一键冲突（23505）被转译为可展示的 AppError", async () => {
    const email = "locked@example.com";
    let releaseTx!: () => void;
    const hold = new Promise<void>((r) => (releaseTx = r));
    let markInserted!: () => void;
    const inserted = new Promise<void>((r) => (markInserted = r));

    const tx = db.transaction(async (trx) => {
      await trx.insert(users).values({ email, passwordHash: "x", name: "先" });
      markInserted();
      await hold;
    });

    await inserted;
    const pending = createUser({ email, password: "password123", name: "后" });
    pending.catch(() => {});
    await new Promise((r) => setTimeout(r, 300));
    releaseTx();
    await tx;

    await expect(pending).rejects.toBeInstanceOf(AppError);
    await expect(pending).rejects.toThrow("该邮箱已被注册");
  });

  it("邮箱统一转小写存储，大小写不同视为同一邮箱", async () => {
    const user = await createUser({
      email: "Zhou@Example.COM",
      password: "password123",
      name: "周瑜",
    });
    expect(user.email).toBe("zhou@example.com");
    await expect(
      createUser({ email: "ZHOU@example.com", password: "password123", name: "乙" }),
    ).rejects.toThrow("该邮箱已被注册");
  });
});
