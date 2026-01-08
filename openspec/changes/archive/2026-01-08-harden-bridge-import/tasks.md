## 1. Implementation
- [x] Update `POST /bridge/v1/import/codex-chat` to accept `codex.markdown_text` (at least one of jsonl_text/markdown_text required)
- [x] Add stable `message_id` to normalized messages (format `m-000001`)
- [x] Ensure default behavior excludes tool outputs and `<environment_context>` from normalized messages and downstream artifacts unless explicitly opted-in

## 2. Validation
- [x] Add fixture JSONL and verify `message_id` stability
- [x] Add API-level tests for import payload validation (jsonl-only, markdown-only, both)

## 3. Documentation
- [x] Document the import payload contract and privacy defaults in the spec delta

