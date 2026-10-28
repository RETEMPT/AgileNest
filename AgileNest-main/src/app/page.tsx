import { redirect } from "next/navigation";
import { tryUser } from "@/modules/core/session";

export default async function Home() {
  const user = await tryUser();
  redirect(user ? "/home" : "/login");
}
