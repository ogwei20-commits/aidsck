import type { NextConfig } from "next";

/**
 * 第一阶段不启用 Cache Components / PPR。
 * 理由：所有页面与 /api/v1/* 都在请求时读取本机 PostgreSQL，
 * 用 force-dynamic 明确表达「数据实时、不预渲染、不缓存假数据」。
 * 等 Phase 2 需要静态化与缓存策略时再评估开启（文档 2.1「不因追求新技术增加复杂度」）。
 */
const nextConfig: NextConfig = {
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
