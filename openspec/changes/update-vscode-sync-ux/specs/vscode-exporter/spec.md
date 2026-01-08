## MODIFIED Requirements

### Requirement: Sync to Bridge
The extension SHALL provide commands to sync one or more sessions to Bridge using `POST /bridge/v1/import/codex-chat`.

#### Scenario: Sync without sensitive data by default
- **WHEN** the user runs `Codex: 同步最近一次聊天记录到 Bridge`
- **THEN** the payload excludes tool output entries and `<environment_context>` by default
- **AND** the user can opt-in via settings to include them

#### Scenario: User can open Replay after sync
- **WHEN** sync succeeds and Bridge responds with `project_id` and `session_id`
- **THEN** the extension offers a one-click action to open Replay for that session

