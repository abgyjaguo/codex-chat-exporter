## 1. Implementation
- [ ] Update `POST /bridge/v1/import/codex-chat` to accept `codex.markdown_text` (at least one of jsonl_text/markdown_text required)
- [ ] Add stable `message_id` to normalized messages (format `m-000001`)
- [ ] Ensure default behavior excludes tool outputs and `<environment_context>` from normalized messages and downstream artifacts unless explicitly opted-in

## 2. Validation
- [ ] Add fixture JSONL and verify `message_id` stability
- [ ] Add API-level tests for import payload validation (jsonl-only, markdown-only, both)

## 3. Documentation
- [ ] Document the import payload contract and privacy defaults in the spec delta

