import { NextResponse } from "next/server";
import { scanAndNotifyDue } from "@/modules/notify";

// 定时提醒入口。宿主计划任务每日打一次。
// Windows：见 docs/WINDOWS.md 的 schtasks 一行。
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const result = await scanAndNotifyDue();
    return NextResponse.json(result);
  } catch (e) {
    console.error("[cron/reminders]", e);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
