# 不会变的契约清单（给其它模块）

本清单用于跨模块协作，任何变更需先更新文档并同步到其它分支。

## API
- Base path：`/bridge/v1`
- 接口与契约：
  - `POST /bridge/v1/import/codex-chat`，见 `docs/ai-learning-os/SPECS/20-bridge-service-mvp.md`
  - `POST /bridge/v1/projects/{project_id}/generate`，见 `docs/ai-learning-os/SPECS/21-bridge-generation.md`
  - `POST /bridge/v1/projects/{project_id}/sync/open-notebook`，见 `docs/ai-learning-os/SPECS/30-open-notebook-sync.md`
- Error 响应格式：见 `docs/ai-learning-os/SPECS/20-bridge-service-mvp.md` 的通用约定

## 目录结构
- `docs/ai-learning-os/`：成人版文档与 specs
- `bridge/`：Bridge 服务根目录
- `bridge/src/`：Bridge 业务代码
- `bridge/src/adapters/`：OpenNotebook 同步适配器
- `bridge/data/`：SQLite 与缓存（应在 gitignore）
- 仓库根目录的 `extension.js` 与 `package.json`：VS Code 扩展入口

## 文件命名
- Filesystem adapter（默认）：
  - Sources：`{BRIDGE_OPEN_NOTEBOOK_ROOT}/sources/{source_id}.md`
  - 可选 Raw JSONL：`{BRIDGE_OPEN_NOTEBOOK_ROOT}/sources/{source_id}.jsonl`
  - Notes：`{BRIDGE_OPEN_NOTEBOOK_ROOT}/notes/summary_{session_id}.md`
  - Notes：`{BRIDGE_OPEN_NOTEBOOK_ROOT}/notes/study_pack_{session_id}.md`
  - Notes：`{BRIDGE_OPEN_NOTEBOOK_ROOT}/notes/milestones_{session_id}.md`
- 生成输出的 Markdown 文件名固定为：`Summary.md`、`StudyPack.md`、`Milestones.md`

## 端口
- Bridge HTTP 默认端口：`7331`
- 默认 base URL：`http://127.0.0.1:7331`

## 环境变量
- `BRIDGE_HOST`：默认 `127.0.0.1`
- `BRIDGE_PORT`：默认 `7331`
- `BRIDGE_DATA_DIR`：默认 `bridge/data`
- `BRIDGE_OPEN_NOTEBOOK_PROVIDER`：`filesystem` 或 `http`
- `BRIDGE_OPEN_NOTEBOOK_ROOT`：filesystem adapter 输出根目录
- `BRIDGE_OPEN_NOTEBOOK_BASE_URL`：http adapter 的 base URL
