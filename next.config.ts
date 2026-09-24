import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Windows 本地开发与 Docker standalone 产物共用
  output: "standalone",
};

export default nextConfig;
