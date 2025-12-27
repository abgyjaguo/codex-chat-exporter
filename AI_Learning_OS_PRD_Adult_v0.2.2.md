# AI Learning OS（成人学习版）PRD（MVP）
版本：v0.2.2-adult  
日期：2025-12-26  
作者：aaa sss  

> 目标：把“人类与 AI 协作完成项目的全过程”自动沉淀为可复盘、可视化、可练习的学习资产，帮助成年人更了解 AI、并更高效地使用 AI（自我成长/职业成长）。

---

## 1. 背景与定位

### 1.1 背景
你已完成一个 **VS Code 插件**，用于导出 **Codex 聊天记录**。下一步希望结合 **OpenNotebook**（多模态知识工作台），把一次次 AI 协作开发的“过程”转成“可迁移学习”。

### 1.2 产品定位
- **产品名（暂定）**：AI Learning OS（Learning Replay × OpenNotebook）
- **定位**：面向成年人自我成长的「AI 协作复盘 + 学习资产化」系统
- **形态**：
  - VS Code 插件：采集入口（导出/同步）
  - Bridge 服务：解析/结构化/生成/同步
  - OpenNotebook：Sources/Notes/Chat（基于来源追问与长期知识库）

### 1.3 解决的核心问题
- 用户能用 AI “做事”，但做完后 **很难把过程变成能力**。
- AI 产出真假难辨、经验不可复用：需要 **证据链（claim → evidence）** 来提高可信度与可迁移性。

---

## 2. 市场与竞品（成人版视角）

### 2.1 赛道与趋势
- AI 已进入开发环境：IDE 正在从“补全”演进为“可执行任务的 Agent”。
- 用户缺口：**会话复盘、知识资产沉淀、可迁移练习** 仍是空白。

### 2.2 竞品分层（与本产品的差异）
- **AI Coding / Agentic IDE**：强在完成任务（Copilot Chat / Cursor / Claude Code…），弱在学习沉淀与证据化复盘。
- **Notebook/知识工作台**：强在资料导入与基于来源问答（NotebookLM / OpenNotebook…），弱在 IDE 过程采集与项目化复盘。
- **个人知识管理/复盘工具**：强在记录与结构化，弱在“自动从 AI 协作过程生成学习包”。

### 2.3 成人版差异化
- **真实过程即教材**：从 VS Code + Codex 会话自动生成复盘与练习。
- **证据链机制**：每条结论必须能回跳到原始对话片段。
- **学习资产化**：prompt 模板、debug playbook、checklist、可复用策略库。

---

## 3. 用户画像与典型场景

### 3.1 目标用户
- 开发者：想提高调试、架构决策、测试与质量保证能力
- 产品/创业者：做 MVP 的同时沉淀可复用的方法
- 研究/写作者：把 AI 协作过程证据化并形成长期知识库

### 3.2 典型用户旅程（MVP）
1. 在 VS Code 与 Codex 多轮对话完成一个功能
2. 插件一键导出/同步会话到 Bridge
3. Bridge 生成：
   - Summary（复盘报告）
   - Study Pack（学习包：练习+反思）
   - Milestones（关键里程碑）
4. Bridge 写入 OpenNotebook：Sources（原始对话）+ Notes（复盘/学习包/索引）
5. 用户在 OpenNotebook 追问/检索/复用资产到下一个项目

---

## 4. 核心概念与数据对象（成人版）

### 4.1 数据对象（最小集）
- Project：一个项目
- Session：一次协作会话
- Message：聊天消息（证据材料）
- Milestone：关键节点（把过程变成结构）
- Claim：复盘结论/策略
- EvidenceLink：证据链接（可回跳）
- Artifact：产物（图解/导出/作品集）
- Practice：练习（可迁移训练任务）

### 4.2 证据链最低要求
- 任意 Claim 必须携带 evidence_links（至少 1 条），支持回到对应 message 段落。

---

## 5. 关键闭环（成人版核心体验）

1. **Capture**：从 VS Code 导出 Codex 对话（MVP 必须）
2. **Structure**：切分段落 + 里程碑识别 + 学习点抽取
3. **Visualize**：生成图解（故事板/结构图/概念卡）
4. **Practice**：生成可迁移练习（Explain & Fix、Constraint Remix…）
5. **Review**：OpenNotebook 中检索/追问/复用，形成长期成长

---

## 6. 功能需求（成人版）

### 6.1 P0（MVP 必须）
- **导入**：接收插件导出的聊天记录（JSON/MD）
- **生成**：自动产出 Summary + Study Pack（每条结论带证据链）
- **里程碑**：自动识别 3–8 个关键节点（可手动调整/确认）
- **同步**：写入 OpenNotebook（创建 notebook、写 sources、写 notes）
- **追问**：在 OpenNotebook 基于 sources 追问，要求输出带引用/来源

### 6.2 P1（MVP+）
- 可视化 Studio：生成 1–2 种可视化产物并写回 OpenNotebook
- 资产沉淀：抽取可复用 prompt/清单/代码片段（可复制/收藏）
- 多会话汇总：按项目聚合多个 session，输出项目级总结
- 项目作品集导出：Markdown/HTML/PDF

---

## 7. 可视化与生图（成人版 Visual Studio）

### 7.1 MVP 产物优先级
- **Storyboard（故事板）**：4–8 格串联里程碑（教学友好）
- **Diagram（结构图）**：Mermaid/Graphviz（工程友好，可渲染 SVG/PNG）
- **Concept Card（概念卡）**：关键知识点卡片（定义/例子/常见坑/验证方式）

### 7.2 触发规则（MVP）
- Summary 生成完成后：自动生成 1 份故事板（默认开）
- 识别“失败→成功”转折：可选生成 Debug 流程图或三格漫画（默认关）

### 7.3 生图方案（可插拔 Provider）
> 生图不依赖 OpenNotebook 本体能力；由 Visual Studio 调用 provider 生成图片，再以 Artifact 写回 OpenNotebook。

- 云端（验证快）：OpenAI（DALL·E 3 / GPT Image）、Google/Microsoft 生图等
- 本地（控成本/隐私）：Stable Diffusion 等开源方案

Artifact 需要绑定：milestone_id + evidence_links（保证可追溯）。

---

## 8. 交互与信息架构（成人版）

### 8.1 VS Code 插件侧（升级方向）
- Export Codex Chat（已有）
- Sync to OpenNotebook（新增）
- 元信息：project/session 名、目标（Done 标准）
- 手动标记：关键决策/关键错误/关键学习点（提高里程碑准确性）

### 8.2 OpenNotebook 侧（工作台）
- Notebook：每个 Project 一个 notebook
- Sources：原始聊天全文（可选：压缩时间线摘要）
- Notes：Summary / Study Pack / Milestones & Evidence Map / 可视化图解
- Chat：基于 sources 追问（强制引用来源）

> 可选增强：若需更强“时间线回放 + diff + 可视化编辑”，后续新增自有 Web Replay UI。

---

## 9. 技术方案（成人版 MVP）

### 9.1 组件
- VS Code 插件（采集与同步）
- Bridge 服务（建议本地优先）：解析、生成、同步；SQLite 记录 project ↔ notebook 映射
- OpenNotebook：承载 sources/notes 与基于来源问答

### 9.2 Bridge 接口（建议）
- `POST /bridge/v1/import/codex-chat`
- `POST /bridge/v1/projects/{project_id}/generate`
- `POST /bridge/v1/projects/{project_id}/sync/open-notebook`

---

## 10. 安全与隐私（成人版）
- 数据最小化：MVP 仅导入聊天记录
- 脱敏：token/密钥/个人信息规则脱敏（如 `sk-****`）
- 审计：所有 Claim 必须可回跳 evidence_links

---

## 11. 指标（成人版 MVP）

### 11.1 北极星指标
- **可迁移学习发生率**：用户在后续项目复用了历史资产并成功解决问题

### 11.2 漏斗
- 导入 → 生成 Summary → 同步 OpenNotebook → 阅读 → 检索/复用

### 11.3 质量指标
- Evidence 完整率：≥ 95% 的 claim 有 evidence_links
- 可用性：500 条消息处理 ≤ 30 秒（视本地配置）

---

## 12. 路线图（成人版）
- **MVP-1**：闭环打通（导入→生成→同步 OpenNotebook）
- **MVP-2**：可视化增强（Storyboard/结构图写回）
- **MVP-3**：练习与迁移（Explain&Fix、Constraint Remix、Prompt Challenge）
