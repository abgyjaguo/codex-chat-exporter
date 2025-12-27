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

### 2.1 常见问题：终端是 PowerShell，`git status` 报 “not a git repository”

如果你在 VS Code 里看到终端是这样：

```text
PS C:\Users\GuoYW> git status -sb
fatal: not a git repository (or any of the parent directories): .git
```

说明你现在用的是「Windows PowerShell」终端，而且当前目录不是 worktree 目录。

另外一个关键点：你当前这些 worktree 是用 WSL 的 git 创建的，worktree 里的 `.git` 指向的是 WSL 路径（例如 `/mnt/d/codex-chat-exporter-main/.git/worktrees/cce-wt-docs`），Windows 的 git 读不到这个路径，所以在 PowerShell 里即使你 `cd D:\cce-wt-docs` 也会失败。

按下面步骤修复（推荐做法：用 WSL 终端）：

1) 确认 VS Code 窗口是 WSL 环境
   - 看左下角状态栏是否显示 `WSL:`（例如 `WSL: Ubuntu`）
   - 如果没有：按 `Ctrl+Shift+P`，运行 `Remote-WSL: New Window`，然后在新窗口打开文件夹 `/mnt/d/cce-wt-docs`

2) 在该窗口打开 WSL 终端（不要用 PowerShell）
   - VS Code 顶部菜单 `Terminal` → `New Terminal`
   - 如果默认还是 PowerShell：按 `Ctrl+Shift+P`，运行 `Terminal: Select Default Profile`，选择 `bash`（WSL），再执行一次 `Terminal` → `New Terminal`

3) 在新开的 bash 终端里执行（每个窗口都执行一次）

```bash
pwd
cd /mnt/d/cce-wt-docs
git status -sb
```

你应该看到输出包含：`## chore/ai-learning-os-docs`

### 2.1.1 常见问题：终端是 Git Bash（提示符包含 `MINGW64`）

如果你看到提示符类似这样：

```text
GuoYW@DESKTOP-0L7GR3N MINGW64 ~
$
```

这不是 WSL 的 bash，而是 Windows 的 Git Bash（它运行的是 Windows git）。

如果你只是执行了 `git status -sb`，并且你当前目录是 `~`（一般是 `C:\\Users\\GuoYW`），那它本来就不是仓库目录，肯定会报：

```text
fatal: not a git repository (or any of the parent directories): .git
```

但即使你 `cd` 到 `D:\\cce-wt-docs`，也依然会遇到问题，因为这些 worktree 是 WSL git 创建的（见 2.2 原理），Windows git 读不到 `.git` 里记录的 WSL 路径。

解决方法（推荐二选一）：

1) 用 WSL 的 git（推荐）
   - 直接在 Git Bash 里执行一条命令调用 WSL git：

```bash
wsl.exe bash -lc "cd /mnt/d/cce-wt-docs && git status -sb"
```

2) 让 VS Code 变成 `WSL:` 窗口（推荐）
   - 安装扩展：在 VS Code 扩展里搜索并安装 `Remote - WSL`（Microsoft）
   - 按 `Ctrl+Shift+P`，运行 `Remote-WSL: New Window`
   - 在新窗口里 `File` → `Open Folder`，选择 `/mnt/d/cce-wt-docs`
   - 打开终端后，提示符应该类似：`guoyw@DESKTOP-0L7GR3N:/mnt/d/cce-wt-docs$`（不会出现 `MINGW64`）

### 2.1.2 常见问题：已经进入 WSL，但还是 not a git repository（带 filesystem boundary 提示）

如果你在 WSL 里看到类似这样：

```text
uo@DESKTOP-0L7GR3N:/mnt/c/Users/GuoYW$ git status -sb
fatal: not a git repository (or any parent up to mount point /mnt)
Stopping at filesystem boundary (GIT_DISCOVERY_ACROSS_FILESYSTEM not set).
```

这通常只说明一件事：你当前目录是 `/mnt/c/Users/GuoYW`，它不是仓库目录，所以 `git status` 找不到 `.git`。

正确做法：先进入 worktree 目录，再执行 `git status`。

以文档窗口为例（其它窗口把路径换成对应 worktree）：

```bash
pwd
cd /mnt/d/cce-wt-docs
pwd
git status -sb
```

你应该看到输出包含：`## chore/ai-learning-os-docs`

### 2.2 原理：为什么这里建议用 WSL

你现在遇到的问题有两层：

1) 你在 PowerShell 里执行 `git status -sb` 时，当前目录是 `C:\\Users\\GuoYW`，它本来就不是仓库目录，所以会报 “not a git repository”。
2) 更关键的是：你这些 worktree 是用 WSL 的 git 创建的，worktree 目录里的 `.git` 不是一个文件夹，而是一个文本文件，内容类似这样：

```text
gitdir: /mnt/d/codex-chat-exporter-main/.git/worktrees/cce-wt-docs
```

这个 `gitdir:` 路径是 Linux/WSL 的路径格式（例如以 `/mnt/d/` 开头）。当你在 Windows PowerShell 里运行 `git status` 时，实际调用的是 Windows 的 git，它读到上面这个路径后无法找到对应目录，所以会失败。

结论：
- 只要 worktree 是 WSL git 创建的，就推荐你在 WSL 环境里用 git（最省心的方法是 VS Code 用 `WSL:` 窗口）。
- 不是“Git 必须用 WSL”，而是“你当前这套 worktree 元数据是 WSL 路径，所以 Windows git 读不懂”。

### 2.3 替代方案 1：继续用 PowerShell，但通过 `wsl.exe` 调用 WSL git

如果你暂时不想折腾 VS Code 的 `WSL:` 窗口，你可以在 PowerShell 里用 `wsl.exe` 执行 git（这样用的是 WSL 的 git，所以能识别以 `/mnt/d/` 开头的路径）。

在 PowerShell 执行：

```powershell
wsl.exe bash -lc "cd /mnt/d/cce-wt-docs && git status -sb"
```

提交示例（PowerShell 执行）：

```powershell
wsl.exe bash -lc "cd /mnt/d/cce-wt-docs && git add -A && git commit -m \"chore: update docs\""
```

注意：这种方式 VS Code 左侧 Source Control 面板可能仍然不工作，因为它默认用 Windows git；你主要用终端完成 git 操作。

### 2.4 替代方案 2：完全使用 Windows git（重新创建 worktree），就可以在 PowerShell 正常用 git

如果你希望“所有东西都在 Windows 上做”（Windows VS Code + PowerShell + Windows git），建议把 worktree 重新用 Windows git 创建一遍。

步骤 A：先在 WSL 里删除现有 worktree（释放这些分支的占用）

在 WSL 执行：

```bash
cd /mnt/d/codex-chat-exporter-main
git worktree remove /mnt/d/cce-wt-docs
git worktree remove /mnt/d/cce-wt-extension
git worktree remove /mnt/d/cce-wt-bridge
git worktree remove /mnt/d/cce-wt-open-notebook
git worktree list
```

步骤 B：在 Windows PowerShell 里用 Windows git 重新创建 worktree

在 PowerShell 执行：

```powershell
cd D:\codex-chat-exporter-main
git worktree add D:\cce-wt-docs chore/ai-learning-os-docs
git worktree add D:\cce-wt-extension feat/vscode-sync-to-bridge
git worktree add D:\cce-wt-bridge feat/bridge-service-mvp
git worktree add D:\cce-wt-open-notebook feat/open-notebook-sync
git worktree list
```

然后用 Windows VS Code 打开（PowerShell 执行）：

```powershell
code -n D:\cce-wt-docs
code -n D:\cce-wt-extension
code -n D:\cce-wt-bridge
code -n D:\cce-wt-open-notebook
```

重要原则：选定一种 git 环境后就尽量不要混用（不要一会儿用 WSL git，一会儿用 Windows git 操作同一个仓库），避免出现路径与文件锁相关的怪问题。

### 2.5 替代方案 3：不用 worktree，用多个 clone（更直观，但更占空间）

如果你觉得 worktree 太绕，也可以每个模块一个独立 clone（每个 clone 自带 `.git`，Windows/WSL 都容易理解）。

在 PowerShell 执行：

```powershell
cd D:\
git clone https://github.com/abgyjaguo/codex-chat-exporter.git D:\cce-docs
git clone https://github.com/abgyjaguo/codex-chat-exporter.git D:\cce-extension
git clone https://github.com/abgyjaguo/codex-chat-exporter.git D:\cce-bridge
git clone https://github.com/abgyjaguo/codex-chat-exporter.git D:\cce-open-notebook

cd D:\cce-docs
git checkout -b chore/ai-learning-os-docs origin/main

cd D:\cce-extension
git checkout -b feat/vscode-sync-to-bridge origin/main

cd D:\cce-bridge
git checkout -b feat/bridge-service-mvp origin/main

cd D:\cce-open-notebook
git checkout -b feat/open-notebook-sync origin/main
```

然后分别用 VS Code 打开这四个目录即可。

### 2.6 选型对比：WSL vs Windows vs 多个 clone vs Dev Containers

你的需求本质是：**同时打开多个 VS Code 窗口，每个窗口对应一个独立目录，并且每个目录在不同分支**。实现这一点并不一定要 WSL，但你必须避免 “同一个 worktree 被 Windows git 和 WSL git 混用”。

下面是按“你当前情况”给的对比与推荐：

| 方案 | 多窗口多分支 | VS Code Source Control | 适合谁 | 主要优点 | 主要缺点 |
| --- | --- | --- | --- | --- | --- |
| WSL + worktree（推荐给你现在） | 支持 | 支持（在 `WSL:` 窗口里） | 你已经用 WSL 创建 worktree，并且愿意用 `WSL:` 窗口 | 你现有 worktree 直接可用；bash 命令一致；后续做 Bridge（Node/SQLite）更像服务器环境 | 需要安装 Remote - WSL；如果代码在 `/mnt/d`，大量文件读写会比放在 WSL 的 `~/` 慢 |
| Windows + worktree | 支持 | 支持（Windows 窗口） | 你只想用 Windows VS Code + PowerShell | 全部在 Windows 里操作；不用 WSL；终端与路径统一 | 需要删除现有 WSL worktree 并用 Windows git 重新创建；脚本与命令更偏 Windows 风格 |
| 多个 clone（Windows 或 WSL 都行） | 支持 | 支持 | 你觉得 worktree 概念太绕，想要最直观 | 每个目录自带 `.git`，不容易遇到 “gitdir 路径看不懂” 的问题 | 更占空间；需要在多个目录里分别 pull/rebase；容易忘了同步 |
| Dev Containers（Docker） | 支持 | 支持 | 你想把开发环境固定下来，不想污染系统 | 环境一致、可复用、易分享；适合后续 Bridge 服务 | 初次配置成本高；需要 Docker；调试链路更复杂 |

为什么我推荐你先用 WSL：
- 你现在这些 worktree 本来就是 WSL git 创建的，最少改动就能用起来。
- 你接下来要做的 Bridge 服务更像“本地跑一个小服务”，在 Linux/bash 里跑 Node、SQLite、脚本通常更顺手。
- 你要多窗口并行时，统一用 WSL（同一种 git、同一种 shell）最不容易踩坑。

如果你明确只想用 Windows（不想出现 `WSL:` 窗口），推荐你直接走「2.4 替代方案 2」或「2.5 替代方案 3」。

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
