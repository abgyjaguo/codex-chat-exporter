## ADDED Requirements

### Requirement: Create export bundles
Bridge SHALL provide `POST /bridge/v1/exports` to create a Markdown ZIP export for a given scope and includes list.

#### Scenario: Create an export for a project
- **WHEN** the client posts a valid export request (scope/includes/version)
- **THEN** Bridge creates an export record and produces a ZIP artifact
- **AND** the response includes an `export_id` and a `download_url`

### Requirement: List exports
Bridge SHALL provide `GET /bridge/v1/exports` to list prior exports with status and download link.

#### Scenario: List returns newest first
- **WHEN** the client requests the export list
- **THEN** Bridge returns a list ordered by most recent first

### Requirement: Download ZIP
Bridge SHALL provide `GET /bridge/v1/exports/{export_id}/download` to download the ZIP for a completed export.

#### Scenario: Download completed export
- **WHEN** the export exists and is completed
- **THEN** Bridge returns the ZIP bytes with appropriate content type

### Requirement: Stable ZIP layout
The ZIP artifact SHALL have a stable directory layout and include a machine-readable `manifest.json`.

#### Scenario: ZIP contains required files
- **WHEN** a ZIP is downloaded
- **THEN** it contains `00_Index.md` and `manifest.json` at the root

