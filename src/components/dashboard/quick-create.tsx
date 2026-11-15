"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };

async function postJson<T>(url: string, body: unknown): Promise<ApiResult<T>> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return (await res.json()) as ApiResult<T>;
}

interface Created {
  id: string;
  title?: string;
  name?: string;
}

/** 首屏主角：真实创建任务 → 写入 PostgreSQL → 刷新服务端数据 */
export function TaskComposer({ variant = "hero" }: { variant?: "hero" | "panel" }) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const isHero = variant === "hero";

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setDone("");
    const title = value.trim();
    if (title.length < 2) {
      setError("请至少输入 2 个字符");
      return;
    }
    setBusy(true);
    try {
      const result = await postJson<Created>("/api/v1/tasks", { title, source: "user" });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setValue("");
      setDone(`已创建「${result.data.title ?? title}」并写入数据库`);
      router.refresh();
    } catch {
      setError("请求失败：请确认本地服务与 PostgreSQL 正在运行");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <form className={isHero ? "composer" : "inline-form"} onSubmit={onSubmit}>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="描述一个目标，例如：比较三个平台的小家电佣金"
          aria-label="任务标题"
          maxLength={200}
          disabled={busy}
        />
        <button className={isHero ? "btn-primary" : "btn-ghost"} type="submit" disabled={busy}>
          {busy ? "创建中…" : "创建任务"}
        </button>
      </form>
      {error && <p className={isHero ? "composer-error" : "form-error"}>{error}</p>}
      {done && <p className={isHero ? "composer-note" : "row-meta"}>{done}</p>}
    </div>
  );
}

/** 分栏内：真实创建项目 → 写入 PostgreSQL */
export function ProjectComposer() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setDone("");
    const name = value.trim();
    if (name.length < 2) {
      setError("项目名称至少 2 个字符");
      return;
    }
    setBusy(true);
    try {
      const result = await postJson<Created>("/api/v1/projects", { name });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setValue("");
      setDone(`已创建项目「${result.data.name ?? name}」`);
      router.refresh();
    } catch {
      setError("请求失败：请确认本地服务与 PostgreSQL 正在运行");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <form className="inline-form" onSubmit={onSubmit}>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="新建项目，例如：东南亚小家电可行性研究"
          aria-label="项目名称"
          maxLength={120}
          disabled={busy}
        />
        <button className="btn-ghost" type="submit" disabled={busy}>
          {busy ? "创建中…" : "新建项目"}
        </button>
      </form>
      {error && <p className="form-error">{error}</p>}
      {done && <p className="row-meta">{done}</p>}
    </div>
  );
}
