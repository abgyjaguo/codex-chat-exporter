# bridge-json-api (delta)

## ADDED Requirements

### Requirement: CORS for Bridge JSON API
Bridge SHALL allow browser-based clients to call `/bridge/v1/*` endpoints from local development origins.

#### Scenario: Browser calls Bridge JSON endpoint
- **WHEN** a browser client calls `GET /bridge/v1/projects`
- **THEN** the response includes `Access-Control-Allow-Origin: *`

### Requirement: List projects
Bridge SHALL expose `GET /bridge/v1/projects` to list known projects.

#### Scenario: Client lists projects
- **WHEN** the client calls `GET /bridge/v1/projects`
- **THEN** the response is JSON `{ "projects": [...] }`
- **AND** each project includes `project_id`, `name`, and `cwd`

### Requirement: List sessions for a project
Bridge SHALL expose `GET /bridge/v1/projects/{project_id}/sessions` to list sessions for a project.

#### Scenario: Client lists project sessions
- **WHEN** the client calls `GET /bridge/v1/projects/{project_id}/sessions`
- **THEN** the response is JSON `{ "sessions": [...] }`
- **AND** each session includes `session_id`, `name`, `imported_at`, and `source_type`

### Requirement: List recent sessions
Bridge SHALL expose `GET /bridge/v1/sessions/recent` to list recent sessions (across projects).

#### Scenario: Client lists recent sessions
- **WHEN** the client calls `GET /bridge/v1/sessions/recent?limit=50`
- **THEN** the response is JSON `{ "sessions": [...] }`
- **AND** each entry includes `project_id`, `project_name`, `session_id`, `session_name`, `imported_at`, `source_type`, and `message_count`

### Requirement: Fetch normalized messages
Bridge SHALL expose `GET /bridge/v1/projects/{project_id}/sessions/{session_id}/messages` to fetch normalized messages for the latest imported source.

#### Scenario: Client fetches messages
- **WHEN** the client calls `GET /bridge/v1/projects/{project_id}/sessions/{session_id}/messages`
- **THEN** the response is JSON `{ "messages": [...] }`
- **AND** each message includes `message_id`, `role`, `text`, and optionally `timestamp`

