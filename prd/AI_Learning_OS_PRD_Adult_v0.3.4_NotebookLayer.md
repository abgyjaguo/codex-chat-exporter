# AI Learning OS（成人学习版）PRD（MVP）v0.3.4
日期：2025-12-30

> 本版本核心：引入 **双层架构（System of Record + Knowledge Surface）**：
> - AI Learning OS 是权威数据源（证据/验证/状态/规则引擎）
> - OpenNotebook/Obsidian 是知识呈现与编辑层（可插拔），采用 **单向发布（One-way publish）** 为主
>
> 更新（2026-01-03）：在 v0.3.4 基础上补齐 **Sync OpenNotebook 闭环**（对接开源项目 OpenNotebook），并将“证据回跳”统一指向 **Replay UI**。

---

## 0. 一句话定位
成人版：通过“跟 AI 学习”更了解 AI 在做什么、更会使用 AI、更会管理 AI；将会话中的关键技术点做 **可验证（Verified）+可复现（Practice）+可资产化（Tech Card/Playbook）**，并可发布到个人知识库长期沉淀。

## 1. OpenNotebook 是否必须
不必须：P0 闭环可以只做 Export Markdown ZIP（离线/零集成）。  
但为了形成“导出 → 归档 → 可检索追问”的闭环，增加 **Sync OpenNotebook（P1）**：将 Sources/Notes 发布到 OpenNotebook，并保持证据链接可回跳到 Replay UI。

## 2. 用在哪里（最合适）
- **P0：Export Markdown ZIP**（零集成，导入 OpenNotebook/Obsidian）
- **P1：Sync OpenNotebook（Publish）**（API 直连/一键发布/可重试幂等）
- **P2：知识可视化/图谱**（优先由 Notebook 承担）
- **不建议：P2 之前做双向同步**（一致性/冲突成本巨大）

## 3. 信息架构（新增）
- Projects / Inbox / Replay / Practice / Knowledge / Library
- **Export Center（P0）**
- **Notebook Settings（P1 可隐藏）**

## 4. P0 功能（新增）
### 4.1 Export Center
- 范围：项目/会话/时间窗
- 内容：TechCards/Playbooks/Practices/Sessions
- 导出：ZIP（版本化 export-001…）
- 历史：可下载、可复用配置

### 4.2 Markdown 契约（必填）
- frontmatter：learn_status / verification / interaction_mode / evidence_links / ids
- backlinks：Open in Replay + Source Item

## 5. 成功指标（新增）
- 导出使用率（exports / WAU）
- 资产化率（Verified 的 TechCard/Playbook）
- Practice 转化（To learn → Practiced → Mastered）

## 6. Sync OpenNotebook（新增闭环，P1）
目标：让用户在 OpenNotebook 中“长期沉淀/检索/追问”，同时每条结论仍可一键回到 Replay UI 查看原始证据。

- OpenNotebook：对接开源项目 <https://github.com/lfnovo/open-notebook>。
- **数据对象**：Project → Notebook；Session/Source → Sources；Summary/Study Pack/Milestones 等 → Notes（或作为 Assets 发布）。
- **幂等与可重试**：相同 project/session 多次 sync 不重复创建 Notebook/Source/Note；失败可重试，且能定位到失败原因。
- **证据回跳（最终形态）**：Notes/Assets 中的 `evidence_links` 与 `Open in Replay` 统一指向 Replay UI（而不是 OpenNotebook 内部的临时链接）。
- **Replay deep link**：发布到 OpenNotebook/ZIP 的链接必须是绝对 URL，因此需要可配置的 `BRIDGE_PUBLIC_BASE_URL`。
- **隐私与合规**：默认不上传 tool outputs / environment context；进入 LLM 与发布到 Notebook 前做脱敏（token/密钥/私钥/个人信息）。
- **LLM Provider（当前）**：OpenAI（后续可插拔）。

> Replay UI 的信息结构与交互可参考：<https://github.com/simonw/claude-code-transcripts>。
