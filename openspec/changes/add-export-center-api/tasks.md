## 1. Implementation
- [ ] Add DB table(s) for exports (id, project_id, scope, includes, status, created_at, zip_path/url, counts, version)
- [ ] Implement `POST /bridge/v1/exports` (create export)
- [ ] Implement `GET /bridge/v1/exports` (list exports)
- [ ] Implement `GET /bridge/v1/exports/{export_id}/download` (download ZIP)
- [ ] Implement ZIP builder with stable layout + `manifest.json`
- [ ] Add minimal validation and consistent error responses

## 2. Validation
- [ ] Add unit tests for ZIP layout + manifest generation
- [ ] Add API-level tests for create/list/download happy path

## 3. Documentation
- [ ] Update the existing repo docs to reference the OpenSpec capability as the source of truth

