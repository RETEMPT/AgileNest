import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
    // 共享测试库，串行执行避免数据互踩
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // next-auth 在 node 测试环境下解析 next/server 需要完整扩展名
      "next/server": path.resolve(__dirname, "node_modules/next/server.js"),
    },
  },
});
