import type { NextConfig } from "next";

/**
 * 第一阶段不启用 Cache Components / PPR。
 * 理由：所有页面与 /api/v1/* 都在请求时读取本机 PostgreSQL，
 * 用 force-dynamic 明确表达「数据实时、不预渲染、不缓存假数据」。
 * 等 Phase 2 需要静态化与缓存策略时再评估开启（文档 2.1「不因追求新技术增加复杂度」）。
 */
const nextConfig: NextConfig = {
  /** 关闭开发期悬浮指示器，避免它出现在界面截图里被当成产品元素 */
  devIndicators: false,
  /**
   * PDF / Word 解析库要按 Node 原生方式加载，不能打进 server bundle：
   * pdfjs 需要读取包内的 cmaps/ 与 standard_fonts/ 目录（中文 PDF 的 CID 字映射），
   * 打包后这些相对目录会找不到，表现为「中文 PDF 提取出空字符串」。
   */
  serverExternalPackages: ["pdfjs-dist", "mammoth"],
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
