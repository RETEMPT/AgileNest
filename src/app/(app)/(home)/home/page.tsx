import { redirect } from "next/navigation";
import { requireUser } from "@/modules/core/session";
import { listMyTeams } from "@/modules/identity";

/** 按角色分流：任一团队里当 teacher/admin 进监督台，否则进学生工作台。 */
export default async function HomeIndex() {
  const user = await requireUser();
  const teams = await listMyTeams(user.id);
  const isStaff = teams.some((t) => t.role === "admin" || t.role === "teacher");
  redirect(isStaff ? "/home/teacher" : "/home/student");
}
