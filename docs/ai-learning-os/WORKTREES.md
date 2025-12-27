# 同机多开 VSCode + Codex 的 worktree 工作流

> 目标：同一台电脑并行做不同模块：每个模块一个 worktree + 一个 VSCode 窗口 + 一个 Codex 会话；互不切分支、互不串上下文。

## 你的电脑当前情况（已确认）

- 主仓库目录：`/mnt/d/codex-chat-exporter-main`
- VS Code（Windows）CLI：`/mnt/d/Program Files/Microsoft VS Code/bin/code`
- Cursor（Windows）CLI：`/mnt/d/Program Files/cursor/resources/app/bin/code`
- 你已经创建好的 4 个 worktree：
  - `/mnt/d/cce-wt-docs`（分支：`chore/ai-learning-os-docs`）
  - `/mnt/d/cce-wt-extension`（分支：`feat/vscode-sync-to-bridge`）
  - `/mnt/d/cce-wt-bridge`（分支：`feat/bridge-service-mvp`）
  - `/mnt/d/cce-wt-open-notebook`（分支：`feat/open-notebook-sync`）

## 0. 前置原则（很重要）

- **先提交文档再开工**：未提交的文件不会出现在其它 worktree。
- **单窗口单模块**：尽量做到“一个目录只由一个窗口修改”（冲突会显著减少）。

## 1. 一次性初始化（推荐命令）

先打开一个 WSL 终端，然后进入主仓库目录：

```bash
cd /mnt/d/codex-chat-exporter-main
```

## 1.1 让 `code` 默认打开 VS Code（而不是 Cursor）

如果你同时装了 Cursor 和 VS Code，WSL 里 `code` 命令可能会优先指向 Cursor，导致 `code -n /mnt/d/cce-wt-docs` 打开的是 Cursor。

先检查当前 `code` 指向谁：

```bash
command -v code
```

如果输出是 `/mnt/d/Program Files/cursor/resources/app/bin/code`，说明当前 `code` 会打开 Cursor，可以用「WSL 本地 wrapper」强制 `code` 打开 VS Code（推荐）：

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

说明：
- 上面路径是你电脑当前的实际路径（`D:` 盘对应 WSL 的 `/mnt/d`）。
- 如果你未来把 VS Code 装到 `C:` 盘，常见路径是：`/mnt/c/Program Files/Microsoft VS Code/bin/code`

## 1.2 创建 4 个 worktree（如果你还没创建过）

只有在你没有 `/mnt/d/cce-wt-docs` 这些目录时才需要执行本段；如果已经存在，直接跳到「2. 打开 4 个 VS Code 窗口」。

```bash
cd /mnt/d/codex-chat-exporter-main

# 保证 main 是最新（如果你对 origin 没有 push 权限也没关系，pull 仍然可用）
git checkout main
git pull --rebase origin main

# 创建 4 个 worktree（每个 worktree 自动绑定一个新分支）
git worktree add /mnt/d/cce-wt-docs -b chore/ai-learning-os-docs main
git worktree add /mnt/d/cce-wt-extension -b feat/vscode-sync-to-bridge main
git worktree add /mnt/d/cce-wt-bridge -b feat/bridge-service-mvp main
git worktree add /mnt/d/cce-wt-open-notebook -b feat/open-notebook-sync main

git worktree list
```

## 2. 打开 4 个 VS Code 窗口（每个窗口一个 worktree）

在 WSL 终端里依次执行（`-n` 表示每次都开新窗口）：

```bash
code -n /mnt/d/cce-wt-docs
code -n /mnt/d/cce-wt-extension
code -n /mnt/d/cce-wt-bridge
code -n /mnt/d/cce-wt-open-notebook
```

打开后，每个窗口都用 VS Code 的集成终端（菜单 Terminal → New Terminal，或快捷键 Ctrl+`）执行一次：

```bash
git status -sb
```

你应该能看到 4 个窗口分别显示不同分支名：
- 文档窗口：`## chore/ai-learning-os-docs`
- 扩展窗口：`## feat/vscode-sync-to-bridge`
- Bridge 窗口：`## feat/bridge-service-mvp`
- OpenNotebook 窗口：`## feat/open-notebook-sync`

## 3. 每个窗口具体做什么（避免互相打架）

- 文档窗口（`/mnt/d/cce-wt-docs`，分支 `chore/ai-learning-os-docs`）
  - 只改：`docs/ai-learning-os/`、`AI_Learning_OS_PRD_Adult_v0.2.2.md`
- 扩展窗口（`/mnt/d/cce-wt-extension`，分支 `feat/vscode-sync-to-bridge`）
  - 只改：`extension.js`、`package.json`、`README.md`
- Bridge 窗口（`/mnt/d/cce-wt-bridge`，分支 `feat/bridge-service-mvp`）
  - 只改：`bridge/`（需要你在该分支新建这个目录）
- OpenNotebook 窗口（`/mnt/d/cce-wt-open-notebook`，分支 `feat/open-notebook-sync`）
  - 只改：`bridge/src/adapters/`（等 Bridge 分支建立 `bridge/` 基础结构后再做）

## 4. 每个窗口怎么用 Codex（建议你直接复制到对话第一条）

你在对应窗口打开 Codex 扩展的聊天面板后，把下面对应段落原样发给 Codex。

### 4.1 文档窗口（`chore/ai-learning-os-docs`）
我在分支 chore/ai-learning-os-docs，只修改 docs/ai-learning-os/ 和 AI_Learning_OS_PRD_Adult_v0.2.2.md。请不要修改 extension.js、package.json 或 bridge/ 相关代码。目标是把架构、接口与工作流文档写清楚，作为其他分支的开发契约。

### 4.2 扩展窗口（`feat/vscode-sync-to-bridge`）
我在分支 feat/vscode-sync-to-bridge，只修改 extension.js、package.json、README.md。请严格按照 docs/ai-learning-os/SPECS/10-vscode-extension-sync.md 实现：新增同步到 Bridge 的命令与配置项，并确保默认不上传 tool outputs 与 environment context。

### 4.3 Bridge 窗口（`feat/bridge-service-mvp`）
我在分支 feat/bridge-service-mvp，只在 bridge/ 目录下新增代码。请严格按照 docs/ai-learning-os/SPECS/20-bridge-service-mvp.md 实现 Bridge 服务骨架与 import 接口（POST /bridge/v1/import/codex-chat），并把数据落到 SQLite（先最小可用）。

### 4.4 OpenNotebook 窗口（`feat/open-notebook-sync`）
我在分支 feat/open-notebook-sync，只在 bridge/src/adapters/ 下新增 OpenNotebook 同步适配器代码。请严格按照 docs/ai-learning-os/SPECS/30-open-notebook-sync.md，先做一个 filesystem adapter 作为 MVP（把 sources/notes 写到一个目录），保证幂等与可重试。

## 5. 同步与合并节奏（同机也按协作来）

每个窗口完成一个小可验证点后：

```bash
git add -A
git commit -m "feat: implement one small step"

# 把 main 的新变化同步到当前分支（先更新 main，再 rebase）
git fetch origin
git rebase origin/main
```

合并策略（推荐）：
- 把各分支都 PR 到 `main`（即使你是一个人，也能保留审阅与回滚能力）
- 先合并 **docs**（契约稳定后，其它模块再动）

> 如果你没有这个仓库的 push 权限：先 fork 到你自己的 GitHub，然后把 `origin` 指向你的 fork 再推送分支。

## 6. 清理 worktree（可选）

```bash
git worktree list
git worktree remove ../cce-wt-open-notebook
git branch -D feat/open-notebook-sync
```
