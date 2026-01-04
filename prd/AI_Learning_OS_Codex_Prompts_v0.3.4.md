# Codex 提示词（新增 Export Center）v0.3.4
日期：2025-12-30

## P0：Export Markdown ZIP
实现 /exports（create/list/download），生成 Markdown ZIP：00_Index + TechCards/Playbooks/Practices/Sessions。
必须写入 frontmatter（learn_status/verification/interaction_mode/evidence_links）与 backlinks（Open in Replay）。

## P1：Publish Connector（占位）
前端加入 Publish/Sync modal；后端 endpoint 可先返回 501（提示 P1 才开启）。

## P1：Sync OpenNotebook（闭环）
对接开源项目 OpenNotebook（lfnovo/open-notebook：<https://github.com/lfnovo/open-notebook>），实现一键发布到 Notebook（Sources + Notes），并确保所有 evidence_links / backlinks 可回跳到 Replay UI（最终证据入口）。

## Replay UI（参考）
Replay UI 可参考 simonw/claude-code-transcripts（<https://github.com/simonw/claude-code-transcripts>）的信息结构与交互：索引页 + 会话页（可分页）+ 稳定锚点（`#m-000123`）+ 可分享导出（后续）。
