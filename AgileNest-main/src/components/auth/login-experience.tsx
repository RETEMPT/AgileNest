"use client";

import { useActionState, useState, type ReactNode } from "react";
import Image, { getImageProps } from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowDown, ArrowRight, ArrowUpRight, BookOpen, Check, Eye, EyeOff, Layers3, Sparkles, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import styles from "./login-experience.module.css";

const FEATURES = [
  { label: "任务协作", eyebrow: "01 / TEAMWORK", title: "一起推进，每一步都有回应。", description: "从认领、提交到逐项验收，让分工清楚，让成果有据可查。", icon: Layers3, tags: ["五态任务", "逐项验收"] },
  { label: "知识共建", eyebrow: "02 / KNOWLEDGE", title: "好资料，成为团队的共同积累。", description: "把文档、文件与讨论留在项目里，阅读、收藏，也能追溯来源版本。", icon: BookOpen, tags: ["项目知识库", "版本追溯"] },
  { label: "AI 搭档", eyebrow: "03 / CO-PILOT", title: "灵感有人接，决定由你做。", description: "查阅有权限的资料，梳理任务与路线；建议经你预览确认，再采用。", icon: Sparkles, tags: ["真实模型 API", "确认后采纳"] },
] as const;

type LoginState = { error: string } | null;

const desktopArtwork = getImageProps({
  src: "/images/login/campus-desktop-blue.webp",
  alt: "参考厦门大学建南大会堂与嘉庚楼群重绘的蓝白校园建筑拼贴",
  width: 1536,
  height: 1024,
  sizes: "100vw",
  loading: "eager",
  fetchPriority: "high",
}).props;
const mobileArtwork = getImageProps({
  src: "/images/login/campus-mobile-blue.webp",
  alt: desktopArtwork.alt,
  width: 960,
  height: 640,
  sizes: "100vw",
}).props;

export function LoginExperience({ action, children }: {
  action: (previous: LoginState, formData: FormData) => Promise<LoginState>;
  children: ReactNode;
}) {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(action, null);
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [activeFeature, setActiveFeature] = useState(0);
  const searchParams = useSearchParams();
  const feature = FEATURES[activeFeature];
  const FeatureIcon = feature.icon;

  return (
    <main className={styles.page}>
      <picture className={styles.artworkFrame}>
        <source media="(max-width: 999px)" srcSet={mobileArtwork.srcSet} sizes={mobileArtwork.sizes} />
        <img {...desktopArtwork} className={styles.artwork} alt="参考厦门大学地标重绘的蓝白校园建筑，桌面为建南大会堂拼贴，手机为独立山海全景" />
      </picture>
      <a className={styles.skipLink} href="#login-email">跳到登录表单</a>
      <header className={styles.header}>
        <Link href="/login" className={styles.brand} aria-label="AgileNest 登录首页">
          <span className={styles.brandMark} aria-hidden="true"><Layers3 size={24} strokeWidth={2.6} /></span>
          <span>AgileNest<span className={styles.brandDot} aria-hidden="true">✳</span></span>
        </Link>
        <span className={styles.headerNote}>好想法，值得一起完成。</span>
        <Link href="/register" className={styles.headerLink}>加入你的团队 <ArrowUpRight size={15} aria-hidden="true" /></Link>
      </header>

      <div className={styles.stage}>
        <section className={styles.showcase} aria-labelledby="showcase-title">
          <div className={styles.heroCopy}>
            <div className={styles.edition}><span className={styles.editionDot} /> CAMPUS COLLECTIVE <span>VOL. 01</span></div>
            <h1 id="showcase-title" className={styles.heroTitle}>
              <span>把想法，</span>
              <strong>变成我们的成果。</strong>
            </h1>
            <p className={styles.heroSubtitle}>你的团队，你的主场。<br />从第一份灵感，到最后一次漂亮交付。</p>
          </div>
          <div className={styles.sideLabel} aria-hidden="true">LESS CHAOS. MORE CREATION.</div>
          <span className={styles.heroStar} aria-hidden="true">✳</span>
          <div className={styles.artCaption} aria-hidden="true"><span>TEAM UP.</span><span>MAKE IT REAL.</span></div>

          <div className={styles.featureCard} aria-live="polite" aria-atomic="true">
            <div className={styles.featureEyebrow}><FeatureIcon size={18} aria-hidden="true" />{feature.eyebrow}<ArrowUpRight size={18} aria-hidden="true" /></div>
            <h2>{feature.title}</h2>
            <p>{feature.description}</p>
            <div className={styles.featureTags}>{feature.tags.map((tag) => <span key={tag}><Check size={12} aria-hidden="true" />{tag}</span>)}</div>
          </div>
          <div className={styles.featureNav} role="group" aria-label="功能速览">
            {FEATURES.map((item, index) => (
              <button key={item.label} type="button" onClick={() => setActiveFeature(index)} aria-pressed={index === activeFeature}>
                <span>0{index + 1}</span>{item.label}<ArrowUpRight size={15} aria-hidden="true" />
              </button>
            ))}
          </div>
        </section>

        <section className={styles.loginPanel} aria-labelledby="login-title">
          <div className={styles.panelTop}>
            <a className={styles.universityMark} href="https://www.xmu.edu.cn/sdgl/xxbs.htm" target="_blank" rel="noopener noreferrer" aria-label="厦门大学校徽，查看官方学校标识">
              <Image src="/images/login/xmu-emblem.jpg" width={50} height={50} alt="厦门大学校徽" />
              <span>厦门大学<small>XIAMEN UNIVERSITY</small></span>
            </a>
            <span>YOUR NEXT CHAPTER <ArrowDown size={13} aria-hidden="true" /></span>
          </div>
          <div className={styles.formContent}>
            <div className={styles.welcomeTag}><Star size={13} fill="currentColor" aria-hidden="true" /> 欢迎归队</div>
            <h2 id="login-title">好久不见，<br />一起做点<span>了不起的。</span></h2>
            <p className={styles.formIntro}>登录 AgileNest，继续你们的下一个好项目。</p>

            {searchParams.get("registered") && (
              <p className={styles.success} role="status">注册成功，请使用新账号登录。</p>
            )}
            {searchParams.get("error") === "feishu_not_configured" && (
              <p className={styles.notice} role="status">当前站点尚未配置飞书登录，请使用邮箱和密码登录。</p>
            )}

            <form action={formAction} className={styles.form} aria-busy={pending} aria-describedby={state?.error ? "login-error" : undefined}>
              <div className={styles.field}>
                <Label htmlFor="login-email">邮箱 <span>EMAIL</span></Label>
                <Input id="login-email" name="email" type="email" autoComplete="username" placeholder="输入你的邮箱" required value={email} onChange={(event) => setEmail(event.target.value)} aria-describedby={state?.error ? "login-error" : undefined} />
              </div>
              <div className={styles.field}>
                <Label htmlFor="login-password">密码 <span>PASSWORD</span></Label>
                <div className={styles.passwordField}>
                  <Input id="login-password" name="password" type={showPassword ? "text" : "password"} autoComplete="current-password" placeholder="输入你的密码" required value={password} onChange={(event) => setPassword(event.target.value)} aria-describedby={state?.error ? "login-error" : undefined} />
                  <button className={styles.passwordToggle} type="button" aria-label={showPassword ? "隐藏密码" : "显示密码"} aria-pressed={showPassword} aria-controls="login-password" onClick={() => setShowPassword((visible) => !visible)}>
                    {showPassword ? <EyeOff size={19} aria-hidden="true" /> : <Eye size={19} aria-hidden="true" />}
                  </button>
                </div>
              </div>
              {state?.error && <p id="login-error" className={styles.error} role="alert">{state.error}</p>}
              <Button type="submit" loading={pending} className={styles.submit}>
                {pending ? "正在登录…" : "登录，开启协作"}<ArrowRight size={18} aria-hidden="true" />
              </Button>
            </form>

            <div className={styles.feishu}>{children}</div>
            <p className={styles.register}>还没有账号？<Link href="/register">创建账号 <ArrowUpRight size={14} aria-hidden="true" /></Link></p>
            <details className={styles.demo}>
              <summary>只是来看看？使用演示账号 <span aria-hidden="true">＋</span></summary>
              <div>成员：<code>student@agilecampus.local</code><br />管理员：<code>admin@agilecampus.local</code><br />初始密码：<code>password123</code><p>仅适用于已初始化演示数据的环境。</p></div>
            </details>
          </div>
          <div className={styles.panelBottom}><span className={styles.miniMark} aria-hidden="true">✳</span><p>为课程、研究、竞赛与软件项目而生。<br /><span>让协作有序，让创作自由。</span></p><span className={styles.panelIndex} aria-hidden="true">01—03</span></div>
        </section>
      </div>
      <footer className={styles.footer}><span>© {new Date().getFullYear()} AGILENEST</span><span>想法不止于想法。<span className={styles.footerStar} aria-hidden="true">✦</span></span><span>BUILT FOR THE WAY WE CREATE.</span></footer>
    </main>
  );
}
