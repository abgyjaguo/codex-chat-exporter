## MODIFIED Requirements

### Requirement: Replay session route
The system SHALL provide a Replay session page at `/replay/projects/{project_id}/sessions/{session_id}` with basic transcript navigation tools.

#### Scenario: Session transcript is viewable
- **WHEN** the user opens a session Replay URL
- **THEN** the transcript is displayed as an ordered list of messages

#### Scenario: Search and filter transcript
- **WHEN** the user uses the search/filter controls on the session page
- **THEN** the UI filters messages without changing message ids/anchors
- **AND** opening a URL with `#m-000123` still scrolls to and highlights that message

## ADDED Requirements

### Requirement: Copy deep links
Replay SHALL provide a one-click way to copy a deep link to a specific message.

#### Scenario: Copy message URL
- **WHEN** the user clicks “Copy link” for message `m-000123`
- **THEN** the clipboard contains a URL ending with `#m-000123`

### Requirement: Copy message text
Replay SHALL provide a one-click way to copy message text.

#### Scenario: Copy message content
- **WHEN** the user clicks “Copy text” for a message
- **THEN** the message body text is copied to clipboard

