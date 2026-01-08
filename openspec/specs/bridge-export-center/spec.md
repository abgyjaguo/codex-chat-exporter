# bridge-export-center Specification

## Purpose
TBD - created by archiving change add-export-center-api. Update Purpose after archive.
## Requirements
### Requirement: Create export bundles
Bridge SHALL provide `POST /bridge/v1/exports` to create a Markdown ZIP export for a given scope and includes list.

#### Scenario: Create an export for a session
- **WHEN** the client posts a valid export request with `scope.project_id` and `scope.session_id`
- **AND** `includes` is omitted or an object of boolean flags
- **THEN** Bridge creates an export record and produces a ZIP artifact
- **AND** the response includes an `export_id`, `status`, `created_at`, and a `download_url`

### Requirement: List exports
Bridge SHALL provide `GET /bridge/v1/exports` to list prior exports with status and download link.

#### Scenario: List returns newest first
- **WHEN** the client requests the export list
- **THEN** Bridge returns a list ordered by most recent first
- **AND** each item includes `export_id`, `status`, `created_at`, `scope`, and a `download_url` when ready

### Requirement: Download ZIP
Bridge SHALL provide `GET /bridge/v1/exports/{export_id}/download` to download the ZIP for a completed export.

#### Scenario: Download completed export
- **WHEN** the export exists and is `ready`
- **THEN** Bridge returns the ZIP bytes with `Content-Type: application/zip`

### Requirement: Stable ZIP layout
The ZIP artifact SHALL have a stable directory layout and include a machine-readable `manifest.json`.

#### Scenario: ZIP contains required files
- **WHEN** a ZIP is downloaded
- **THEN** it contains `00_Index.md` and `manifest.json` at the root
- **AND** it includes top-level folders: `Sessions/`, `TechCards/`, `Playbooks/`, and `Practices/`
- **AND** `manifest.json` includes `version`, `export_id`, `created_at`, `scope`, and `counts`

