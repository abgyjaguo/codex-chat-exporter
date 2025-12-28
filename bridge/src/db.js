const fs = require("fs");
const path = require("path");

const Database = require("better-sqlite3");

function openBridgeDb(dbPath) {
  const dir = path.dirname(dbPath);
  fs.mkdirSync(dir, { recursive: true });

  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  migrate(db);

  const statements = {
    upsertProject: db.prepare(
      `INSERT INTO projects (id, name, cwd, created_at)
       VALUES (@id, @name, @cwd, @created_at)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         cwd = excluded.cwd`,
    ),
    upsertSession: db.prepare(
      `INSERT INTO sessions (id, project_id, name, imported_at, source_type)
       VALUES (@id, @project_id, @name, @imported_at, @source_type)
       ON CONFLICT(id) DO UPDATE SET
         imported_at = excluded.imported_at`,
    ),
    insertSource: db.prepare(
      `INSERT INTO sources (
         id, session_id, exported_at, raw_jsonl, normalized_json, warnings_json, message_count, created_at
       )
       VALUES (
         @id, @session_id, @exported_at, @raw_jsonl, @normalized_json, @warnings_json, @message_count, @created_at
       )`,
    ),
  };

  function ensureProject({ id, name, cwd, created_at }) {
    statements.upsertProject.run({ id, name, cwd, created_at });
  }

  function ensureSession({ id, project_id, name, imported_at, source_type }) {
    statements.upsertSession.run({ id, project_id, name, imported_at, source_type });
  }

  function addSource({
    id,
    session_id,
    exported_at,
    raw_jsonl,
    normalized_json,
    warnings_json,
    message_count,
    created_at,
  }) {
    statements.insertSource.run({
      id,
      session_id,
      exported_at,
      raw_jsonl,
      normalized_json,
      warnings_json,
      message_count,
      created_at,
    });
  }

  return {
    db,
    ensureProject,
    ensureSession,
    addSource,
  };
}

function migrate(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      cwd TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      name TEXT NOT NULL,
      imported_at TEXT NOT NULL,
      source_type TEXT NOT NULL,
      FOREIGN KEY(project_id) REFERENCES projects(id)
    );

    CREATE TABLE IF NOT EXISTS sources (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      exported_at TEXT,
      raw_jsonl TEXT NOT NULL,
      normalized_json TEXT NOT NULL,
      warnings_json TEXT NOT NULL,
      message_count INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(session_id) REFERENCES sessions(id)
    );

    CREATE UNIQUE INDEX IF NOT EXISTS projects_cwd_idx ON projects(cwd);
    CREATE UNIQUE INDEX IF NOT EXISTS sessions_project_name_idx ON sessions(project_id, name);
    CREATE INDEX IF NOT EXISTS sources_session_idx ON sources(session_id);
  `);
}

module.exports = { openBridgeDb };

