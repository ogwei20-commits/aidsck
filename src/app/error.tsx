"use client";

import Link from "next/link";
import { useEffect } from "react";

/**
 * 路由级错误边界。
 *
 * 之前数据库断开是整页堆栈——用户既看不懂也不知道该干什么。
 * 这里做三件事：说清「哪一步坏了」、给一个不丢当前上下文的「重试」、
 * 给一条「怎么修」的路（数据库没起来 / 迁移没跑）。
 *
 * 不展示 error.stack：堆栈里有文件路径与内部结构，页面不该暴露；
 * digest 是 Next.js 生成的错误指纹，能和服务端日志对上，足够排查。
 */
export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // 页面错误也要进浏览器控制台，方便一边点一边看
    console.error("[page] 渲染失败:", error);
  }, [error]);

  return (
    <div className="fallback">
      <div className="fallback-card">
        <div className="eyebrow">出错了</div>
        <h1>这个页面没能加载出来</h1>
        <p className="fallback-lead">
          页面在准备数据时中断了。最常见的原因是 PostgreSQL 没启动，或者数据库迁移没跑。
          当前页面的数据没有丢失，修好后点「重试」即可。
        </p>

        <div className="fallback-detail">
          <strong>错误信息</strong>
          <code>{error.message || "未知错误"}</code>
          {error.digest && <span className="fallback-digest">错误指纹 {error.digest}</span>}
        </div>

        <div className="fallback-actions">
          <button type="button" className="btn-primary" onClick={reset}>
            重试
          </button>
          <Link className="btn-mini" href="/">
            回首页
          </Link>
          <Link className="btn-mini" href="/security">
            查看系统状态
          </Link>
        </div>

        <div className="fallback-help">
          <h2>本机排查顺序</h2>
          <ol>
            <li>
              <code>pg_isready</code> 看数据库是否在跑；没跑就启动 PostgreSQL 服务。
            </li>
            <li>
              <code>npm run db:check</code> 验证连接串与表结构。
            </li>
            <li>
              <code>npm run db:migrate</code> 补齐未应用的迁移。
            </li>
            <li>
              以上都正常还报错，看终端里 <code>npm run dev</code> 的输出。
            </li>
          </ol>
        </div>
      </div>
    </div>
  );
}
