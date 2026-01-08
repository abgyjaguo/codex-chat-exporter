# replay-ui Specification

## Purpose
Provide a lightweight local transcript viewer for imported sessions, with stable message anchors used for evidence deep-links and downstream artifacts.
## Requirements
### Requirement: Replay index route
The system SHALL provide a Replay entry page at `/replay`.

#### Scenario: User opens replay entry
- **WHEN** the user navigates to `/replay`
- **THEN** the system renders an entry point to pick a project/session

### Requirement: Replay session route
The system SHALL provide a Replay session page at `/replay/projects/{project_id}/sessions/{session_id}`.

#### Scenario: Session transcript is viewable
- **WHEN** the user opens a session Replay URL
- **THEN** the transcript is displayed as an ordered list of messages

### Requirement: Stable message anchors
Replay SHALL expose stable anchors for messages as `#m-000001` (or equivalent stable scheme).

#### Scenario: Evidence jump
- **WHEN** a user opens a Replay URL with `#m-000123`
- **THEN** the UI scrolls to and highlights that message

### Requirement: Open in Replay deep links
The system SHALL support generating absolute `Open in Replay` links for downstream artifacts when a public base URL is configured.

#### Scenario: Published evidence includes absolute replay URL
- **WHEN** `BRIDGE_PUBLIC_BASE_URL` is configured
- **AND** an artifact renders evidence links for a given `(project_id, session_id, message_id)`
- **THEN** the evidence includes an `Open in Replay` URL like `{BRIDGE_PUBLIC_BASE_URL}/replay/projects/{project_id}/sessions/{session_id}#m-000123`
