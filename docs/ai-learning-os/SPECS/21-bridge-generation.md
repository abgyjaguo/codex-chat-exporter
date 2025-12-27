# 21 - Bridge 生成：Summary / Study Pack / Milestones（MVP）

## 1. 目标
- 从一份 Session（规范化 Message 列表 + 原始 sources）生成：
  - **Summary（复盘报告）**
  - **Study Pack（学习包：练习 + 反思）**
  - **Milestones（3–8 个关键节点，可确认和调整）**
- 硬约束：任何 **Claim** 必须带 `evidence_links`（至少 1 条）。

## 2. API 契约
`POST /bridge/v1/projects/{project_id}/generate`

### Request 字段
| 字段 | 类型 | 必填 | 示例值 | 说明 |
| --- | --- | --- | --- | --- |
| session_id | string | 是 | `sess_0001` | 会话 id |
| mode | string | 否 | `adult_mvp` | 生成模式，默认 `adult_mvp` |
| include_markdown | boolean | 否 | `true` | 是否返回 Markdown 字段，默认 `true` |

### Request 示例
```json
{
  "session_id": "sess_0001",
  "mode": "adult_mvp",
  "include_markdown": true
}
```

### Response 字段（200）
| 字段 | 类型 | 必填 | 示例值 | 说明 |
| --- | --- | --- | --- | --- |
| project_id | string | 是 | `proj_0001` | 项目 id |
| session_id | string | 是 | `sess_0001` | 会话 id |
| source_id | string | 是 | `src_0001` | Sources id |
| mode | string | 是 | `adult_mvp` | 生成模式 |
| generated_at | string | 是 | `2025-12-26T00:01:00Z` | 生成完成时间 |
| summary | object | 是 | - | 结构化 Summary |
| milestones | array | 是 | - | Milestone 列表 |
| claims | array | 是 | - | Claim 列表 |
| study_pack | object | 是 | - | Study Pack |
| markdown | object | 否 | - | Markdown 输出（当 include_markdown 为 true 时返回） |
| warnings | array | 否 | `[]` | Warning 列表 |

### Response 示例
```json
{
  "project_id": "proj_0001",
  "session_id": "sess_0001",
  "source_id": "src_0001",
  "mode": "adult_mvp",
  "generated_at": "2025-12-26T00:01:00Z",
  "summary": {
    "bullets": [
      {
        "id": "sum_001",
        "text": "完成导入与结构化链路",
        "evidence_links": [
          { "message_id": "m-000123", "quote": "先把导入与结构化跑通" }
        ]
      }
    ]
  },
  "milestones": [
    {
      "id": "ms_001",
      "title": "导入链路打通",
      "summary": "导入 JSONL 并完成规范化",
      "evidence_links": [
        { "message_id": "m-000123", "quote": "先把导入与结构化跑通" }
      ]
    }
  ],
  "claims": [
    {
      "id": "c_001",
      "text": "先保证 JSONL 导入稳定",
      "type": "decision",
      "evidence_links": [
        { "message_id": "m-000456", "quote": "MVP 先保证 JSONL 导入" }
      ]
    }
  ],
  "study_pack": {
    "practices": [
      {
        "id": "p_001",
        "title": "Explain and Fix",
        "prompt": "解释导入链路并给出修复步骤",
        "evidence_links": [
          { "message_id": "m-000456", "quote": "MVP 先保证 JSONL 导入" }
        ]
      }
    ],
    "checklists": [],
    "reflection_questions": []
  },
  "markdown": {
    "summary_md": "# Summary\n- 完成导入与结构化链路",
    "study_pack_md": "# Study Pack\n- Explain and Fix",
    "milestones_md": "# Milestones\n- ms_001 导入链路打通"
  },
  "warnings": []
}
```

### 错误响应
使用 `docs/ai-learning-os/SPECS/20-bridge-service-mvp.md` 的 Error 响应结构，典型为 400、404、500。

## 3. 输入（MVP）
- `session_id`
- `Message[]`（role、timestamp、text、tool）
- 可选：project 和 session 元信息（Done 标准、用户手动标记）

## 4. 输出（建议 JSON + Markdown 两份）

### 4.1 结构化 JSON（建议）
```json
{
  "summary": {
    "bullets": [
      {
        "id": "sum_001",
        "text": "完成导入与结构化链路",
        "evidence_links": [
          { "message_id": "m-000123", "quote": "先把导入与结构化跑通" }
        ]
      }
    ]
  },
  "milestones": [
    {
      "id": "ms_001",
      "title": "string",
      "summary": "string",
      "evidence_links": [
        { "message_id": "m-000123", "quote": "string" }
      ]
    }
  ],
  "claims": [
    {
      "id": "c_001",
      "text": "string",
      "type": "decision|debug|pattern|lesson",
      "evidence_links": [
        { "message_id": "m-000456", "quote": "string" }
      ]
    }
  ],
  "study_pack": {
    "practices": [
      {
        "id": "p_001",
        "title": "Explain and Fix",
        "prompt": "string",
        "evidence_links": [
          { "message_id": "m-000456", "quote": "string" }
        ]
      }
    ],
    "checklists": [],
    "reflection_questions": []
  },
  "warnings": []
}
```

### 4.2 可读 Markdown（建议）
- `Summary.md`
- `StudyPack.md`
- `Milestones.md`（含 Evidence Map：claim 到 message anchor）

## 5. 生成策略（MVP 建议）

### 5.1 两段式生成（降低跑偏）
1) LLM 输出 **结构化 JSON**（严格 schema，便于校验 evidence_links）
2) Bridge 把 JSON 渲染成 Markdown（统一格式、统一引用）

### 5.2 证据链校验
- 生成后做校验：
  - `evidence_links.length >= 1`
  - `message_id` 必须存在于本 session 的 message 索引
- 不通过：
  - 尝试自动修复（再问一次 LLM 补齐证据）
  - 或返回 warning 并降级输出（不得把无证据的 claim 当结论）

## 6. 验收标准（MVP）
- [ ] milestones 数量 3–8（不足或过多需给 warning）
- [ ] ≥95% claims 带 evidence_links（目标，低于则 warning）
- [ ] 500 条消息处理时间 ≤ 30s（目标，以本地配置为准）
