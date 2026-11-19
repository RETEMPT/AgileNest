import { config } from "dotenv";
config({ path: ".env.test" });

import { db } from "@/db";
import { sql } from "drizzle-orm";

export async function resetDb() {
  await db.execute(
    sql`TRUNCATE notifications, worklogs, task_acceptance_events, tasks, milestones, projects, project_comments, asset_requests, assets, team_members, teams, users RESTART IDENTITY CASCADE`,
  );
}
