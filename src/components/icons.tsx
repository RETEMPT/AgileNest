import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & {
  size?: number;
};

// 基础 SVG 属性包装器，保持极简 1.75px 线宽与优雅圆角端点
function BaseSvg({
  size = 18,
  className = "text-blue-600 dark:text-blue-500",
  children,
  ...props
}: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      {...props}
    >
      {children}
    </svg>
  );
}

/** 品牌徽标：敏捷飞鸟与鸟巢几何简约形态 */
export function LogoIcon({ size = 22, className = "text-blue-600", ...props }: IconProps) {
  return (
    <BaseSvg size={size} className={className} {...props}>
      <path d="M12 2L2 7l10 5 10-5-10-5z" />
      <path d="M2 17l10 5 10-5" />
      <path d="M2 12l10 5 10-5" />
    </BaseSvg>
  );
}

/** 1. 今日工作台：学士帽与仪表台 */
export function WorkbenchIcon(props: IconProps) {
  return (
    <BaseSvg {...props}>
      <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
      <path d="M6 12v5c3 3 9 3 12 0v-5" />
    </BaseSvg>
  );
}

export function AiChatIcon(props: IconProps) {
  return (
    <BaseSvg {...props}>
      <path d="M20 13v4a3 3 0 0 1-3 3H7l-4 2V7a3 3 0 0 1 3-3h5" />
      <path d="m17 2 1.5 4.5L23 8l-4.5 1.5L17 14l-1.5-4.5L11 8l4.5-1.5L17 2Z" />
      <path d="M7 14h4M7 17h7" />
    </BaseSvg>
  );
}

/** 2. 团队与空间：多用户协同组织 */
export function TeamIcon(props: IconProps) {
  return (
    <BaseSvg {...props}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </BaseSvg>
  );
}

/** 3. 任务池系统 [tasks 分支]：方框打勾任务流 */
export function TasksIcon(props: IconProps) {
  return (
    <BaseSvg {...props}>
      <rect width="18" height="18" x="3" y="3" rx="3" />
      <path d="m9 12 2 2 4-4" />
    </BaseSvg>
  );
}

/** 4. 多维看板系统 [board 分支]：三列泳道流水线 */
export function BoardIcon(props: IconProps) {
  return (
    <BaseSvg {...props}>
      <rect width="18" height="18" x="3" y="3" rx="3" />
      <path d="M9 3v18" />
      <path d="M15 3v18" />
    </BaseSvg>
  );
}

/** 5. 数据表格系统 [board 分支]：网格结构行列表 */
export function TableIcon(props: IconProps) {
  return (
    <BaseSvg {...props}>
      <rect width="18" height="18" x="3" y="3" rx="3" />
      <path d="M3 9h18" />
      <path d="M3 15h18" />
      <path d="M9 3v18" />
    </BaseSvg>
  );
}

/** 6. 教学日历系统 [calendar 分支]：月历与日期方格 */
export function CalendarIcon(props: IconProps) {
  return (
    <BaseSvg {...props}>
      <rect width="18" height="18" x="3" y="4" rx="3" />
      <path d="M16 2v4" />
      <path d="M8 2v4" />
      <path d="M3 10h18" />
      <path d="M8 14h.01" />
      <path d="M12 14h.01" />
      <path d="M16 14h.01" />
      <path d="M8 18h.01" />
      <path d="M12 18h.01" />
    </BaseSvg>
  );
}

/** 7. 教学里程碑系统 [milestone 分支]：立竿见影的旗帜 */
export function MilestoneIcon(props: IconProps) {
  return (
    <BaseSvg {...props}>
      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
      <line x1="4" x2="4" y1="22" y2="15" />
    </BaseSvg>
  );
}

/** 8. 教师验收台系统 [review 分支]：权威盾牌与通过印章 */
export function ReviewIcon(props: IconProps) {
  return (
    <BaseSvg {...props}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />
      <path d="m9 12 2 2 4-4" />
    </BaseSvg>
  );
}

/** 9. 工时与统计系统 [worklog/stats 分支]：成长趋势柱状图 */
export function StatsIcon(props: IconProps) {
  return (
    <BaseSvg {...props}>
      <line x1="18" x2="18" y1="20" y2="10" />
      <line x1="12" x2="12" y1="20" y2="4" />
      <line x1="6" x2="6" y1="20" y2="14" />
      <path d="M3 20h18" />
    </BaseSvg>
  );
}

/** 10. 通知中心系统 [notify 分支]：站内信与飞书私信铃铛 */
export function NotifyIcon(props: IconProps) {
  return (
    <BaseSvg {...props}>
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </BaseSvg>
  );
}

/** 11. 系统设置系统：精细调节齿轮 */
export function SettingsIcon(props: IconProps) {
  return (
    <BaseSvg {...props}>
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </BaseSvg>
  );
}

/** 12. 项目项目文件夹 */
export function ProjectFolderIcon(props: IconProps) {
  return (
    <BaseSvg {...props}>
      <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
    </BaseSvg>
  );
}

/** 退出图标 */
export function LogoutIcon(props: IconProps) {
  return (
    <BaseSvg {...props}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" x2="9" y1="12" y2="12" />
    </BaseSvg>
  );
}

/** 下拉箭头 */
export function ChevronDownIcon(props: IconProps) {
  return (
    <BaseSvg {...props}>
      <path d="m6 9 6 6 6-6" />
    </BaseSvg>
  );
}

/** 菜单折叠/展开汉堡图标 */
export function MenuIcon(props: IconProps) {
  return (
    <BaseSvg {...props}>
      <line x1="4" x2="20" y1="12" y2="12" />
      <line x1="4" x2="20" y1="6" y2="6" />
      <line x1="4" x2="20" y1="18" y2="18" />
    </BaseSvg>
  );
}

/** 侧栏收起图标 */
export function SidebarCollapseIcon(props: IconProps) {
  return (
    <BaseSvg {...props}>
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <path d="M9 3v18" />
      <path d="m14 9-3 3 3 3" />
    </BaseSvg>
  );
}

/** 侧栏展开图标 */
export function SidebarExpandIcon(props: IconProps) {
  return (
    <BaseSvg {...props}>
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <path d="M9 3v18" />
      <path d="m13 15 3-3-3-3" />
    </BaseSvg>
  );
}
