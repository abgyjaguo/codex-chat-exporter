# 同机多开 VSCode + Codex 的 worktree 工作流

> 目标：同一台电脑并行做不同模块：每个模块一个 worktree + 一个 VSCode 窗口 + 一个 Codex 会话；互不切分支、互不串上下文。

## 0. 前置原则（很重要）

- **先提交文档再开工**：未提交的文件不会出现在其它 worktree。
- **单窗口单模块**：尽量做到“一个目录只由一个窗口修改”（冲突会显著减少）。

## 1. 一次性初始化（推荐命令）

在主仓库目录执行。

## 1.1 让 `code` 默认打开 VS Code（而不是 Cursor）

如果你同时装了 Cursor 和 VS Code，WSL 里 `code` 命令可能会优先指向 Cursor，导致 `code <dir>` 打开的是 Cursor。

先检查当前 `code` 指向谁：

```bash
command -v code
```

如果输出类似 `.../cursor/.../code`，可以用「WSL 本地 wrapper」强制 `code` 打开 VS Code（推荐）：

```bash
sudo tee /usr/local/bin/code >/dev/null <<'EOF'
#!/usr/bin/env bash
exec "/mnt/d/Program Files/Microsoft VS Code/bin/code" "$@"
EOF
sudo chmod +x /usr/local/bin/code
```

可选：保留一个显式打开 Cursor 的命令：

```bash
sudo tee /usr/local/bin/code-cursor >/dev/null <<'EOF'
#!/usr/bin/env bash
exec "/mnt/d/Program Files/cursor/resources/app/bin/code" "$@"
EOF
sudo chmod +x /usr/local/bin/code-cursor
```

验证：

```bash
command -v code
code --version
```

> 如果你的 VS Code 不在 `D:`，把路径替换成你的实际位置（常见：`/mnt/c/Program Files/Microsoft VS Code/bin/code`）。

先决定 base ref：
- 如果你已经把 docs/PRD `push` 到远端：用 `origin/main`
- 如果你只是本地 commit 还没 push：用 `main`

下面命令里的 `<base>` 二选一替换即可。

```bash
git fetch origin

# ① 文档窗口：只写 docs/ 与 PRD（先提交一次再继续）
git worktree add ../cce-wt-docs -b chore/ai-learning-os-docs <base>

# ② VS Code 扩展窗口：只改扩展相关文件
git worktree add ../cce-wt-extension -b feat/vscode-sync-to-bridge <base>

# ③ Bridge 服务窗口：新增 bridge/ 目录为主
git worktree add ../cce-wt-bridge -b feat/bridge-service-mvp <base>

# ④ OpenNotebook 同步窗口：主要改 bridge/adapter（或独立目录）
git worktree add ../cce-wt-open-notebook -b feat/open-notebook-sync <base>
```

然后分别打开 VSCode 窗口：

```bash
code ../cce-wt-docs
code ../cce-wt-extension
code ../cce-wt-bridge
code ../cce-wt-open-notebook
```

## 2. 每个窗口怎么用 Codex（建议模板）

在每个窗口的 Codex 对话开头固定写三件事（减少跑偏）：

1) **范围**：我在 `feat/...` 分支，只做 `<模块名>`  
2) **契约**：请严格遵守 `docs/ai-learning-os/...` 中的接口/数据格式  
3) **改动边界**：只改 `<目录>`，不要动其它模块文件

## 3. 同步与合并节奏（同机也按协作来）

每个窗口完成一个小可验证点后：

```bash
git add -A
git commit -m "..."
git fetch origin
git rebase origin/main
```

合并策略（推荐）：
- 把各分支都 PR 到 `main`（即使你是一个人，也能保留审阅与回滚能力）
- 先合并 **docs**（契约稳定后，其它模块再动）

## 4. 清理 worktree（可选）

```bash
git worktree list
git worktree remove ../cce-wt-open-notebook
git branch -D feat/open-notebook-sync
```
