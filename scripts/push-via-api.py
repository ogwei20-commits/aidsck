#!/usr/bin/env python3
"""在 git 协议不可用时，通过 GitHub REST API 推送提交历史。

背景
----
某些网络环境（企业代理、CI 沙箱、跨境线路）能访问 api.github.com，
但到 github.com:443 的 git smart-http 连不上或极慢，此时 `git push` 会
报 `Failed to connect to github.com port 443` 或 `Operation too slow`。

本脚本改用 Git Data API 逐对象重放：上传 blob → 建 tree → 建 commit →
更新分支引用。因为 Git 是内容寻址的，只要 tree 相同，远端文件内容就与
本地逐字节一致（可用 `git rev-parse HEAD^{tree}` 与远端 tree sha 比对验证）。

增量：若远端 tip 的内容与本地某个提交的 tree 相同，脚本自动从该提交之后
续推，不重传已有 blob。

用法
----
    python3 scripts/push-via-api.py --dry-run      # 只统计，不写入
    python3 scripts/push-via-api.py                # 推送当前分支
    python3 scripts/push-via-api.py --force        # 远端内容对不上时强制覆盖
    python3 scripts/push-via-api.py --branch main

前置：`gh auth status` 已登录，且 token 具备 repo 权限。

注意
----
- 只推送提交历史，不推送标签、子模块与 LFS 对象。
- 若本地提交带 GPG 签名，远端 sha 会与本地不同（签名不在重放范围内），
  但 tree sha 仍然一致，文件内容不受影响。
- 远端已存在同内容 blob 时 GitHub 会去重，不重复占用配额。
"""

from __future__ import annotations

import argparse
import base64
import json
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor

API = "https://api.github.com"


def sh(*args: str, raw: bool = False, check: bool = True):
    out = subprocess.run(["git", *args], capture_output=True, check=False)
    if check and out.returncode != 0:
        sys.exit(f"git {' '.join(args)} 失败：{out.stderr.decode('utf-8', 'ignore')[:200]}")
    return out.stdout if raw else out.stdout.decode("utf-8", "ignore")


def resolve_repo() -> tuple[str, str]:
    url = sh("remote", "get-url", "origin").strip()
    m = re.search(r"github\.com[:/]([^/]+)/([^/.]+?)(?:\.git)?$", url)
    if not m:
        sys.exit(f"无法从 origin 解析 owner/repo：{url}")
    return m.group(1), m.group(2)


class Client:
    def __init__(self, token: str, owner: str, repo: str):
        self.token, self.owner, self.repo = token, owner, repo

    def __call__(self, method: str, path: str, payload: dict | None = None,
                 retries: int = 4, allow_404: bool = False):
        body = json.dumps(payload).encode() if payload is not None else None
        for attempt in range(retries):
            req = urllib.request.Request(API + path, data=body, method=method)
            req.add_header("Authorization", "Bearer " + self.token)
            req.add_header("Accept", "application/vnd.github+json")
            req.add_header("X-GitHub-Api-Version", "2022-11-28")
            req.add_header("User-Agent", "push-via-api")
            if body:
                req.add_header("Content-Type", "application/json")
            try:
                with urllib.request.urlopen(req, timeout=60) as r:
                    return json.load(r)
            except urllib.error.HTTPError as e:
                detail = e.read().decode("utf-8", "ignore")[:300]
                if e.code == 404 and allow_404:
                    return None
                if e.code in (403, 429, 502, 503) and attempt < retries - 1:
                    time.sleep(4 * (attempt + 1))
                    continue
                sys.exit(f"{method} {path} -> HTTP {e.code}: {detail}")
            except Exception as e:  # 网络抖动
                if attempt < retries - 1:
                    time.sleep(3 * (attempt + 1))
                    continue
                sys.exit(f"{method} {path} -> {type(e).__name__}: {e}")
        sys.exit("unreachable")


def read_commits(branch: str) -> list[dict]:
    fmt = "%H%x00%an%x00%ae%x00%aI%x00%cn%x00%ce%x00%cI%x00%P%x00%B%x00%x1e"
    commits, seen = [], set()
    for rec in sh("log", "--reverse", "--format=" + fmt, branch).split("\x1e"):
        rec = rec.strip("\n")
        if not rec:
            continue
        f = rec.split("\x00")
        if len(f) < 9 or f[0] in seen:
            continue
        seen.add(f[0])
        commits.append({
            "sha": f[0], "an": f[1], "ae": f[2], "ad": f[3],
            "cn": f[4], "ce": f[5], "cd": f[6],
            "parents": f[7].split(), "message": f[8].rstrip("\n"),
        })
    return commits


def tree_of(commit: str) -> dict[str, tuple[str, str]]:
    out = {}
    for line in sh("ls-tree", "-r", "-z", commit).split("\x00"):
        if not line:
            continue
        meta, path = line.split("\t", 1)
        mode, typ, sha = meta.split()
        if typ == "blob":
            out[path] = (mode, sha)
    return out


def remote_tip(api: Client, owner: str, repo: str, branch: str):
    ref = api("GET", f"/repos/{owner}/{repo}/git/ref/heads/{branch}", allow_404=True)
    if not ref:
        return None
    sha = ref["object"]["sha"]
    commit = api("GET", f"/repos/{owner}/{repo}/git/commits/{sha}")
    return sha, commit["tree"]["sha"]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--branch", default=None)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--force", action="store_true", help="远端内容与本地历史无关时允许覆盖")
    ap.add_argument("--workers", type=int, default=4)
    args = ap.parse_args()

    branch = args.branch or sh("rev-parse", "--abbrev-ref", "HEAD").strip()
    owner, repo = resolve_repo()
    token = subprocess.run(["gh", "auth", "token"], capture_output=True, text=True)
    if token.returncode != 0:
        sys.exit("gh 未登录，先执行 gh auth login")
    api = Client(token.stdout.strip(), owner, repo)

    commits = read_commits(branch)
    trees = {c["sha"]: tree_of(c["sha"]) for c in commits}
    print(f"{owner}/{repo}  分支 {branch}  本地提交 {len(commits)} 个")

    # 找增量起点：远端 tip 的 tree 与哪个本地提交一致
    base_index, base_tree, base_commit = -1, None, None
    tip = remote_tip(api, owner, repo, branch)
    if tip:
        tip_sha, tip_tree = tip
        for i, c in enumerate(commits):
            if sh("rev-parse", f"{c['sha']}^{{tree}}").strip() == tip_tree:
                base_index, base_tree, base_commit = i, tip_tree, tip_sha
                break
        if base_index < 0 and not args.force:
            sys.exit(f"远端 {branch} 的内容与本地任何提交都不一致（可能有人推过）。"
                     f"确认覆盖请加 --force")
        print(f"远端 tip {tip_sha[:7]} → 增量起点 {base_index + 1}/{len(commits)}")
    else:
        print(f"远端分支 {branch} 不存在，将全量创建")

    if base_index == len(commits) - 1:
        print("远端已是最新，无需推送")
        return 0

    plan, prev_tree, uniq = [], (base_tree and trees[commits[base_index]["sha"]]) or {}, set()
    for c in commits[base_index + 1:]:
        cur = trees[c["sha"]]
        changed = {p: v for p, v in cur.items() if prev_tree.get(p) != v}
        removed = [p for p in prev_tree if p not in cur]
        uniq.update(sha for _, sha in changed.values())
        plan.append((c, changed, removed))
        print(f"  {c['sha'][:7]}  +{len(changed):3d} -{len(removed):2d}  "
              f"{c['message'].splitlines()[0][:48]}")
        prev_tree = cur

    if not plan:
        print("无待推送提交")
        return 0

    size = sum(len(sh("cat-file", "blob", s, raw=True)) for s in uniq)
    print(f"需上传 blob {len(uniq)} 个，合计 {size / 1048576:.2f} MB，tree {len(plan)} 个")
    if args.dry_run:
        print("dry-run，未写入")
        return 0

    cache: dict[str, str] = {}

    def upload(sha: str) -> tuple[str, str]:
        content = base64.b64encode(sh("cat-file", "blob", sha, raw=True)).decode()
        res = api("POST", f"/repos/{owner}/{repo}/git/blobs",
                  {"content": content, "encoding": "base64"})
        return sha, res["sha"]

    print("上传 blob…", flush=True)
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        for i, (local, remote) in enumerate(pool.map(upload, sorted(uniq)), 1):
            cache[local] = remote
            if i % 40 == 0 or i == len(uniq):
                print(f"  {i}/{len(uniq)}", flush=True)

    for c, changed, removed in plan:
        entries = [
            {"path": p, "mode": m, "type": "blob", "sha": cache[s]}
            for p, (m, s) in changed.items()
        ]
        entries += [{"path": p, "mode": "100644", "type": "blob", "sha": None} for p in removed]
        payload = {"tree": entries}
        if base_tree:
            payload["base_tree"] = base_tree
        tree = api("POST", f"/repos/{owner}/{repo}/git/trees", payload)

        rc = api("POST", f"/repos/{owner}/{repo}/git/commits", {
            "message": c["message"],
            "tree": tree["sha"],
            "parents": [base_commit] if base_commit else [],
            "author": {"name": c["an"], "email": c["ae"], "date": c["ad"]},
            "committer": {"name": c["cn"], "email": c["ce"], "date": c["cd"]},
        })
        base_tree, base_commit = tree["sha"], rc["sha"]
        print(f"  commit {rc['sha'][:7]} ← {c['sha'][:7]}", flush=True)

    api("PATCH", f"/repos/{owner}/{repo}/git/refs/heads/{branch}",
        {"sha": base_commit, "force": True})
    local_tree = sh("rev-parse", "HEAD^{tree}").strip()
    print(f"\n分支 {branch} -> {base_commit}")
    print(f"本地 tree {local_tree}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
