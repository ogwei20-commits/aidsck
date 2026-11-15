"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

const ACCEPT = ".pdf,.docx,.xlsx,.pptx,.csv,.md,.txt,.png,.jpg,.jpeg,.webp,.zip";
const MAX_MB = 20;

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function FileUpload() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [picked, setPicked] = useState<File | null>(null);
  const [purpose, setPurpose] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  function choose(file: File | null) {
    setError(null);
    setDone(null);
    if (!file) return;
    if (file.size > MAX_MB * 1024 * 1024) {
      setError(`文件 ${humanSize(file.size)} 超过上限 ${MAX_MB} MB`);
      setPicked(null);
      return;
    }
    setPicked(file);
  }

  async function submit() {
    if (!picked || busy) return;
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const form = new FormData();
      form.append("file", picked);
      if (purpose.trim()) form.append("purpose", purpose.trim());

      const res = await fetch("/api/v1/files", { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json?.error?.message ?? "上传失败，请查看服务端日志");
        return;
      }
      setDone(`已保存：${json.data.filename} · ${humanSize(json.data.sizeBytes)}`);
      setPicked(null);
      setPurpose("");
      if (inputRef.current) inputRef.current.value = "";
      router.refresh();
    } catch {
      setError("网络异常，未完成上传");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="uploader">
      <div
        className={`dropzone${dragging ? " is-dragging" : ""}${picked ? " is-picked" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          choose(e.dataTransfer.files?.[0] ?? null);
        }}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          className="visually-hidden"
          onChange={(e) => choose(e.target.files?.[0] ?? null)}
        />
        {picked ? (
          <>
            <p className="dropzone-title">{picked.name}</p>
            <p className="dropzone-hint">{humanSize(picked.size)} · 点击可重新选择</p>
          </>
        ) : (
          <>
            <p className="dropzone-title">把文件拖到这里，或点击选择</p>
            <p className="dropzone-hint">
              支持 PDF / Word / Excel / PPT / CSV / Markdown / 图片 / ZIP，单个不超过 {MAX_MB} MB
            </p>
          </>
        )}
      </div>

      <div className="uploader-row">
        <label className="uploader-purpose">
          <span>用途说明（可选）</span>
          <input
            type="text"
            value={purpose}
            maxLength={200}
            placeholder="例如：供应商报价单 2026-11"
            onChange={(e) => setPurpose(e.target.value)}
            disabled={busy}
          />
        </label>
        <button type="button" className="btn-primary" onClick={submit} disabled={!picked || busy}>
          {busy ? "上传中…" : "上传并入库"}
        </button>
      </div>

      {error && (
        <p className="uploader-msg is-error" role="alert">
          {error}
        </p>
      )}
      {done && <p className="uploader-msg is-ok">{done}</p>}
      <p className="uploader-foot">
        原件存本机 storage/uploads，数据库只存元数据与 SHA-256 校验和；上传不会触发任何外部请求，不产生费用。
      </p>
    </div>
  );
}
