# 21 - Bridge 生成：Summary / Study Pack / Milestones（MVP）

## 1. 目标
- 从一份 Session（规范化 Message 列表 + 原始 sources）生成：
  - **Summary（复盘报告）**
  - **Study Pack（学习包：练习 + 反思）**
  - **Milestones（3–8 个关键节点，可确认/调整）**
- 硬约束：任何 **Claim** 必须带 `evidence_links`（至少 1 条）。

## 2. 输入（MVP）
- `session_id`
- `Message[]`（role/timestamp/text/tool）
- 可选：project/session 元信息（Done 标准、用户手动标记）

## 3. 输出（建议 JSON + Markdown 两份）

### 3.1 结构化 JSON（建议）
```json
{
  "milestones": [
    {
      "id": "ms_001",
      "title": "string",
      "summary": "string",
      "evidence_links": [
        { "message_id": "m-000123", "quote": "..." }
      ]
    }
  ],
  "claims": [
    {
      "id": "c_001",
      "text": "string",
      "type": "decision|debug|pattern|lesson",
      "evidence_links": [{ "message_id": "m-000456", "quote": "..." }]
    }
  ],
  "study_pack": {
    "practices": [
      { "id": "p_001", "title": "Explain & Fix", "prompt": "string", "evidence_links": [] }
    ],
    "checklists": [],
    "reflection_questions": []
  },
  "warnings": []
}
```

### 3.2 可读 Markdown（建议）
- `Summary.md`
- `StudyPack.md`
- `Milestones.md`（含 Evidence Map：claim → message anchor）

> 证据引用建议统一写成：`[m-000123]` 并链接到 sources 的锚点（由 Syncer 写入 OpenNotebook 时保留）。

## 4. 生成策略（MVP 建议）

### 4.1 两段式生成（降低跑偏）
1) LLM 输出 **结构化 JSON**（严格 schema，便于校验 evidence_links）
2) Bridge 把 JSON 渲染成 Markdown（统一格式、统一引用）

### 4.2 证据链校验
- 生成后做校验：
  - `evidence_links.length >= 1`
  - `message_id` 必须存在于本 session 的 message 索引
- 不通过：
  - 尝试自动修复（再问一次 LLM “补齐证据”）
  - 或返回 warning + 降级输出（但不得把无证据的 claim 当结论）

## 5. 验收标准（MVP）
- [ ] milestones 数量 3–8（不足/过多需给 warning）
- [ ] ≥95% claims 带 evidence_links（目标；低于则 warning）
- [ ] 500 条消息处理时间 ≤ 30s（目标；以本地配置为准）

