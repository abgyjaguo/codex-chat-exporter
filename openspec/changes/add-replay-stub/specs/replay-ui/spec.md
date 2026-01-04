## ADDED Requirements

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

