import { Suspense } from "react";
import { LoginExperience } from "@/components/auth/login-experience";
import { loginAction } from "./actions";

export default function LoginPage() {
  return (
    <Suspense fallback={<main className="p-8" aria-busy="true">正在准备登录…</main>}>
      <LoginExperience action={loginAction} />
    </Suspense>
  );
}
