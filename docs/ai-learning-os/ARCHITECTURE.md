# AI Learning OS（成人版）MVP 架构

> 目标：把一次次 “VS Code + Codex 协作完成项目的全过程” 自动沉淀为可复盘、可追溯（证据链）、可练习的学习资产，并同步到 OpenNotebook。

## 1. MVP 组件与边界

- **VS Code 扩展（本仓库现有）**：负责采集/导出/同步 Codex 会话（JSONL/MD），并收集少量元信息（project/session/Done 标准等）。
- **Bridge 服务（新增）**：负责导入 → 结构化 → 生成（Summary/Study Pack/Milestones）→ 同步 OpenNotebook；本地优先运行；用 SQLite 记录映射与缓存。
- **OpenNotebook（外部系统）**：承载 Sources/Notes/Chat；“基于来源追问”需要强制引用来源（由 OpenNotebook 能力或 Bridge 生成引用格式配合实现）。

## 2. 端到端数据流

```mermaid
flowchart LR
  VSCode[VS Code Extension\n(capture/export/sync)] -->|JSONL / MD| Bridge[Bridge Service\n(parse/generate/sync)]
  Bridge -->|Sources + Notes| OpenNotebook[OpenNotebook\n(Sources/Notes/Chat)]
  Bridge --> SQLite[(SQLite\nproject↔notebook mapping\nsessions cache)]
  Bridge --> LLM[LLM Provider\n(OpenAI/本地等)]
  Bridge --> IMG[Image Provider\n(可选/P1)]
```

## 3. 核心数据对象（最小集）

- **Project**：一个项目（通常来自 workspace/cwd + 用户命名）
- **Session**：一次协作会话（对应一份 Codex `.jsonl`）
- **Message**：会话消息（用户/assistant/工具调用/工具输出等）
- **Milestone**：关键节点（3–8 个，支持人工确认/编辑）
- **Claim**：复盘结论/策略（必须可追溯）
- **EvidenceLink**：证据链接（claim → message 的回跳点）
- **Artifact（P1）**：图解/作品集等产物
- **Practice**：可迁移练习题（Explain & Fix / Constraint Remix 等）

## 4. “证据链”最低要求（MVP）

1. Bridge 在导入时保留 **原始源数据**（JSONL/MD）并生成 **规范化 Message 列表**。
2. Bridge 生成的任何 **Claim** 必须带 `evidence_links`（至少 1 条）。
3. `evidence_links` 必须能回跳到某条 message（建议用 Bridge 生成的稳定 `message_id` + 可选 `quote`/offset）。

> 实现建议：Bridge 把 sources 写成带锚点的 Markdown（例如每条消息一个 `m-000123` 锚点），Notes 中的证据引用直接链接到该锚点。

## 5. Bridge 内部模块（建议拆分，便于并行）

- **Importer**：接收 VS Code 扩展导出的 JSONL/MD；解析 session_meta；落库与去重
- **Normalizer**：把多种 Codex 日志结构统一成 `Message[]`（role/timestamp/text/attachments/tools）
- **Redactor**：脱敏（token/密钥/个人信息）；MVP 用规则 + 正则
- **Generator**：调用 LLM，产出结构化结果（milestones/claims/practices）与可读 Markdown
- **Syncer**：通过 OpenNotebook adapter 写入 sources/notes，并维护 project↔notebook 映射

## 6. 目录规划（建议，不要求一次性做完）

```
/
  extension.js                 # VS Code 扩展（现有）
  bridge/                      # Bridge 服务（新增）
    README.md
    src/
    data/                      # sqlite/db/缓存（gitignore）
  docs/ai-learning-os/         # 本目录：成人版 specs/架构/workflow
```

## 7. 不确定项（需要尽快确认）

- **OpenNotebook 的写入方式**：HTTP API？本地文件结构？SDK？（决定 adapter 形态）
- **引用格式**：OpenNotebook “强制引用来源”支持到什么粒度（整段/行/锚点）
- **LLM Provider**：优先 OpenAI/本地？需要支持离线/隐私模式吗

