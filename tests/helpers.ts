import { resetDb } from "./setup";
import { createUser } from "@/lib/user";

export { resetDb };

export async function makeUser(email: string) {
  return createUser({ email, password: "password123", name: email.split("@")[0] });
}
