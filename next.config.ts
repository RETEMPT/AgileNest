import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Windows 本地开发与 Docker standalone 产物共用
  output: "standalone",
  outputFileTracingExcludes: {
    "/*": [".data/**/*", ".tmp/**/*", ".tools/**/*", ".env*", "docs/**/*", "tests/**/*", "src/**/*", "scripts/**/*", "drizzle/**/*", "*.ts", "*.mjs", "*.md", "*.bat", "docker-compose.yml", "package-lock.json"],
  },
  // 开发工具浮标会遮挡折叠侧栏的账号操作。
  devIndicators: false,
};

export default nextConfig;
