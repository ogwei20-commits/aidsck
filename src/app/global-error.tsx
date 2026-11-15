"use client";

/**
 * 根布局级错误页。
 *
 * 只有 layout 自己也崩了才会走到这里，所以不能依赖任何 CSS 变量或组件——
 * 样式全部内联，保证在「样式表都没加载成功」的情况下仍然可读。
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="zh-CN">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          padding: "24px",
          background: "#0d1117",
          color: "#c9d1d9",
          fontFamily:
            '"PingFang SC","Microsoft YaHei",system-ui,-apple-system,"Segoe UI",sans-serif',
        }}
      >
        <main
          style={{
            width: "100%",
            maxWidth: "620px",
            border: "1px solid #354152",
            borderRadius: "6px",
            background: "#151b23",
            padding: "32px",
          }}
        >
          <p
            style={{
              margin: "0 0 10px",
              fontSize: "11px",
              letterSpacing: ".16em",
              textTransform: "uppercase",
              color: "#4a9eff",
            }}
          >
            系统级错误
          </p>
          <h1 style={{ margin: "0 0 12px", fontSize: "22px", color: "#f0f6fc" }}>
            应用没能启动
          </h1>
          <p style={{ margin: "0 0 20px", fontSize: "14px", lineHeight: 1.8, color: "#8b949e" }}>
            连页面骨架都没能渲染出来，通常是环境配置问题：数据库连接串写错、端口被占用，
            或者构建产物不完整。先看终端输出，再点下面的按钮重试。
          </p>

          <pre
            style={{
              margin: "0 0 20px",
              padding: "12px 14px",
              border: "1px solid #262f3a",
              borderRadius: "4px",
              background: "#0a0e13",
              color: "#f0655c",
              fontSize: "12px",
              lineHeight: 1.7,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {error.message || "未知错误"}
            {error.digest ? `\n错误指纹：${error.digest}` : ""}
          </pre>

          <button
            type="button"
            onClick={reset}
            style={{
              padding: "9px 20px",
              border: 0,
              borderRadius: "4px",
              background: "#4a9eff",
              color: "#04121f",
              fontSize: "13px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            重试
          </button>
        </main>
      </body>
    </html>
  );
}
