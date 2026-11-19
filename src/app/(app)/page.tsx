import Image from "next/image";

/** 打开网站时只显示侧栏；右侧居中展示厦门大学校徽，点击侧栏按钮后再加载对应板块。 */
export default function LandingPage() {
  return (
    <div className="flex min-h-[calc(100dvh-3.5rem)] items-center justify-center md:min-h-dvh">
      <div className="flex flex-col items-center gap-4">
        <Image
          src="/images/login/xmu-emblem.jpg"
          width={128}
          height={128}
          alt="厦门大学校徽"
          priority
          className="rounded-full border border-border/60 bg-white shadow-sm"
        />
        <p className="text-sm font-medium tracking-[0.35em] text-muted-foreground">厦门大学</p>
      </div>
    </div>
  );
}
