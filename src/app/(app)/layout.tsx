import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/modules/core/session";
import { signOut } from "@/lib/auth";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-border bg-background/85 px-6 py-3 backdrop-blur">
        <div className="flex items-center gap-6">
          <Link href="/home" className="flex items-center gap-2">
            <span
              aria-hidden
              className="grid h-7 w-7 place-items-center rounded-md bg-primary font-display text-sm font-bold text-primary-foreground"
            >
              A
            </span>
            <span className="font-display text-lg font-semibold">AgileNest</span>
          </Link>
          <nav className="flex items-center gap-1">
            <Link
              href="/home"
              className="rounded-md px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              工作台
            </Link>
            <Link
              href="/t"
              className="rounded-md px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              我的团队
            </Link>
            <Link
              href="/settings"
              className="rounded-md px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              设置
            </Link>
          </nav>
        </div>
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/login" });
          }}
          className="flex items-center gap-3"
        >
          <span className="hidden text-sm text-muted-foreground sm:inline">{user.name}</span>
          <button className="rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent">
            退出
          </button>
        </form>
      </header>
      <div className="mx-auto max-w-6xl p-6">{children}</div>
    </div>
  );
}
