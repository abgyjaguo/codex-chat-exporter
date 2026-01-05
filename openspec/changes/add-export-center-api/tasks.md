## 1. Implementation
- [x] Add DB table(s) for exports (id, project_id, scope, includes, status, created_at, zip_path/url, counts, version)
- [x] Implement `POST /bridge/v1/exports` (create export)
- [x] Implement `GET /bridge/v1/exports` (list exports)
- [x] Implement `GET /bridge/v1/exports/{export_id}/download` (download ZIP)
- [x] Implement ZIP builder with stable layout + `manifest.json`
- [x] Add minimal validation and consistent error responses

## 2. Validation
- [x] Add unit tests for ZIP layout + manifest generation
- [x] Add API-level tests for create/list/download happy path

## 3. Documentation
- [x] Update the existing repo docs to reference the OpenSpec capability as the source of truth

