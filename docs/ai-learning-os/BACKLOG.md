# AI Learning OS（成人版 v0.2.2）MVP Backlog

> 目标：先打通 MVP-1 闭环（导入→生成→同步 OpenNotebook），再做可视化与练习增强。

## MVP-1：闭环打通（P0）

### 10-vscode-extension（见 `docs/ai-learning-os/SPECS/10-vscode-extension-sync.md`）
- [ ] 增加命令：`Sync to Bridge…`（可选多会话，后台进度条）
- [ ] 增加配置：Bridge base URL、默认 project/session 命名、同步开关
- [ ] 同步时附带最小元信息：project_name、session_name、cwd、Done 标准（可选）

### 20-bridge-service（见 `docs/ai-learning-os/SPECS/20-bridge-service-mvp.md`）
- [ ] `POST /bridge/v1/import/codex-chat`：接收 JSONL/MD（至少支持 JSONL）
- [ ] SQLite：记录 project/session/source 映射与导入状态
- [ ] 规范化：JSONL → `Message[]`（包含时间戳/role/text）

### 21-bridge-generation（见 `docs/ai-learning-os/SPECS/21-bridge-generation.md`）
- [ ] `POST /bridge/v1/projects/{project_id}/generate`：输出 Summary + Study Pack + Milestones
- [ ] 证据链：≥95% claims 带 evidence_links；其余必须返回 warning
- [ ] 里程碑：自动 3–8 个；支持手动调整（先做 API 支持，UI 后补）

### 30-open-notebook-sync（见 `docs/ai-learning-os/SPECS/30-open-notebook-sync.md`）
- [ ] `POST /bridge/v1/projects/{project_id}/sync/open-notebook`：写入 sources + notes
- [ ] project↔notebook 映射：可重复 sync，不生成重复 notebook
- [ ] Notes 至少包含：Summary / Study Pack / Milestones & Evidence Map

### 40-privacy-redaction（见 `docs/ai-learning-os/SPECS/40-privacy-redaction.md`）
- [ ] 脱敏规则库（API Key/token/private key/email 等）
- [ ] 默认策略：同步前 & 生成前都脱敏（防止 secrets 进入 LLM / OpenNotebook）

## MVP-2：可视化增强（P1）
- [ ] Storyboard（4–8 格）生成并作为 Artifact 写回
- [ ] Diagram（Mermaid/Graphviz）写回 Notes

## MVP-3：练习与迁移（P1）
- [ ] Explain & Fix（从真实问题生成可迁移练习）
- [ ] Constraint Remix（约束重混练习）
- [ ] Prompt/Checklist/Playbook 抽取与收藏

