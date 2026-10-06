import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Windows 本地开发与 Docker standalone 产物共用
  output: "standalone",
  // 开发工具浮标会遮挡折叠侧栏的账号操作。
  devIndicators: false,
};

export default nextConfig;
