# Project Context

## Purpose
This repo contains:

- A VS Code extension (`codex-chat-exporter`) that exports Codex (OpenAI) VS Code chat logs from local `~/.codex`.
- A local Bridge service (`bridge/`) that ingests sanitized Codex exports, stores them in SQLite, and exposes downstream APIs for export/replay/sync.

The broader product goal (AI Learning OS v0.3.4) is to support:

- P0: Export Markdown ZIP + Replay deep-links (evidence jump)
- P1: One-way publish to OpenNotebook + OpenAI-based generation (with privacy-safe defaults)

## Tech Stack
- VS Code Extension: JavaScript (Node), `extension.js`, manifest in `package.json`
- Bridge: Node.js + Express, SQLite (prefers `node:sqlite`), local filesystem
- (Optional / future) Frontend: React + Vite (`frontend/`)

## Project Conventions

### Code Style
- Prefer small, explicit functions and stable contracts over clever abstractions.
- Public API paths are namespaced under `/bridge/v1/...` (avoid mixed legacy paths).
- Default posture is privacy-safe: do not sync tool outputs or `<environment_context>` unless explicitly enabled.

### Architecture Patterns
- “Extension -> Bridge -> (Export/Replay/OpenNotebook)” separation:
  - The extension only reads local Codex logs and uploads sanitized payloads to Bridge.
  - Bridge owns normalization, storage, and downstream derivations (export/replay/sync).
- Evidence deep-linking is anchored to stable message indices/ids and must remain stable once published.

### Testing Strategy
- Prefer API-level tests for Bridge endpoints and pure unit tests for text/markdown utilities.
- Keep test fixtures small and deterministic (short JSONL samples).

### Git Workflow
- Use one module per branch/worktree (see `docs/ai-learning-os/WORKTREES.md`).
- Keep PRs scoped to a single capability/change-id.
- Prefer `feat/...` for features and `chore/...` for docs/tooling.

## Domain Context
- “Replay” means viewing a session transcript with stable anchors (evidence jump targets).
- “OpenNotebook” is an external notebook system; we publish one-way and never “round-trip edit” back into Bridge.

## Important Constraints
- Privacy-safe by default: do not leak secrets to third parties.
- Bridge runs locally by default; no cloud persistence assumed.
- Keep contracts stable; breaking changes require an OpenSpec change proposal.

## External Dependencies
- Codex local logs: `~/.codex/sessions/**/*.jsonl`
- OpenNotebook (optional): filesystem or HTTP API adapter (future)
