# Backlog（OpenNotebook 双层架构）v0.3.4

| Milestone   | Area        | Title                                    | Owner   | Priority   | Acceptance Criteria                                        | Dependencies   |   Estimate (pts) |
|:------------|:------------|:-----------------------------------------|:--------|:-----------|:-----------------------------------------------------------|:---------------|-----------------:|
| M1          | DATA        | ExportBundle schema + migrations         | Shared  | P0         | ExportBundle 记录 scope/includes/counts/version/zip_url    |                |                8 |
| M1          | BE          | Export builder: generate Markdown ZIP    | BE      | P0         | POST /exports 生成 zip；frontmatter/backlinks 单测覆盖     | ExportBundle   |               13 |
| M1          | BE          | Export list + download endpoints         | BE      | P0         | GET /exports 列表；download 可用                           | Export builder |                8 |
| M1          | FE-Adult    | Export Center page (/export)             | FE      | P0         | 创建导出 + 历史下载                                        | Export APIs    |                8 |
| M1          | FE-Adult    | Asset pages: Export Markdown (single)    | FE      | P0         | 单条导出 TechCard/Playbook md                              | Export builder |                5 |
| M1          | FE/BE-Youth | Portfolio safe export (MD/PDF optional)  | FE/BE   | P0         | 安全导出作品集：Explain+Evidence+Reflection；隐藏 raw chat |                |               13 |
| M2          | DOC         | OpenNotebook integration doc + contract  | Shared  | P0         | 双层架构 + one-way publish 方案与契约                      |                |                3 |
| M2          | BE          | Replay deep links + replay stub routes   | BE      | P0         | 生成稳定 replay URL；提供可打开的 /replay 页面（先占位）   |                |                5 |
| M2          | FE-Adult    | Publish modal + Notebook settings (stub) | FE      | P1         | Publish UI 完整；settings 持久化；调用 stub                |                |                8 |
| M2          | BE          | Sync OpenNotebook endpoint stub (501)    | BE      | P1         | 提供 endpoint；未开启返回清晰错误                          |                |                5 |
| M3          | BE          | Sync OpenNotebook connector (OpenNotebook) | BE    | P1         | 对接 OpenNotebook API：notebook/source/note 幂等 upsert     | Notebook API   |               13 |
| M3          | BE          | Generator: OpenAI notes (Summary/Study Pack/Milestones) | BE | P1 | 生成结构化 notes；evidence_links 完整；脱敏后调用 OpenAI | Import+Replay |               13 |
| M3          | FE-Adult    | Replay UI (session transcript viewer)   | FE      | P1         | 能打开 Session/Message 深链；体验参考 claude-code-transcripts | Replay routes |               13 |
| M3          | FE/BE-Youth | Teacher approval for publish             | FE/BE   | P1         | 教师审批后允许发布 Portfolio（安全版）                     |                |               13 |
