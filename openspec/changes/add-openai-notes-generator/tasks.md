## 1. Implementation
- [x] Add notes generator module (provider: placeholder/openai)
- [x] Add `POST /bridge/v1/projects/{project_id}/sessions/{session_id}/notes/generate`
- [x] Default behavior: placeholder notes (no network)
- [x] OpenAI behavior: explicit opt-in + requires `OPENAI_API_KEY`
- [x] Apply redaction to OpenAI prompt inputs
- [x] Update OpenNotebook sync to publish generated notes when requested

## 2. Validation
- [x] Add tests: placeholder generation works; OpenAI provider without key returns clear 400
- [x] Ensure generated notes include stable evidence links (source anchors + “Open in Replay” when configured)

## 3. Documentation
- [x] Document env vars (`OPENAI_API_KEY`, model selection) and request schema
