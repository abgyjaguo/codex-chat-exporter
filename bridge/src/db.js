const fs = require("fs");
const path = require("path");

function openBridgeDb(dbPath) {
  const dir = path.dirname(dbPath);
  fs.mkdirSync(dir, { recursive: true });

  const nodeSqlite = tryRequire("node:sqlite");
  if (nodeSqlite.ok && nodeSqlite.module && typeof nodeSqlite.module.DatabaseSync === "function") {
    return openWithNodeSqlite(dbPath, nodeSqlite.module);
  }

  const betterSqlite3 = tryRequire("better-sqlite3");
  if (betterSqlite3.ok && typeof betterSqlite3.module === "function") {
    return openWithBetterSqlite3(dbPath, betterSqlite3.module);
  }

  const details = {};
  if (!nodeSqlite.ok) details.node_sqlite_error = nodeSqlite.error?.message || String(nodeSqlite.error);
  if (!betterSqlite3.ok) details.better_sqlite3_error = betterSqlite3.error?.message || String(betterSqlite3.error);

  const err = new Error(
    "No usable SQLite driver found. Use Node >= 22 (built-in node:sqlite) or install optional dependency better-sqlite3.",
  );
  err.code = "BRIDGE_NO_SQLITE";
  err.details = details;
  throw err;
}

function openWithNodeSqlite(dbPath, sqlite) {
  const db = new sqlite.DatabaseSync(dbPath);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");

  migrate(db);

  return makeBridgeDb(db, "node:sqlite");
}

function openWithBetterSqlite3(dbPath, BetterSqlite3) {
  const db = new BetterSqlite3(dbPath);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");

  migrate(db);

  return makeBridgeDb(db, "better-sqlite3");
}

function makeBridgeDb(db, driver) {
  const statements = prepareStatements(db);
  const runTransaction = makeTransaction(db);

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

  function getProjectById(id) {
    return statements.getProjectById.get({ id }) || null;
  }

  function getSessionById(id) {
    return statements.getSessionById.get({ id }) || null;
  }

  function getLatestSourceBySessionId(session_id) {
    return statements.getLatestSourceBySessionId.get({ session_id }) || null;
  }

  function createExport({
    id,
    project_id,
    session_id,
    scope_json,
    includes_json,
    status,
    created_at,
    version,
    zip_path,
    counts_json,
    warnings_json,
    error_json,
  }) {
    statements.insertExport.run({
      id,
      project_id,
      session_id,
      scope_json,
      includes_json,
      status,
      created_at,
      version,
      zip_path,
      counts_json,
      warnings_json,
      error_json,
    });
  }

  function updateExport({ id, status, zip_path, counts_json, warnings_json, error_json }) {
    statements.updateExport.run({ id, status, zip_path, counts_json, warnings_json, error_json });
  }

  function getExportById(id) {
    return statements.getExportById.get({ id }) || null;
  }

  function listExports({ limit = 100 } = {}) {
    const lim = Number.isFinite(limit) ? Math.max(1, Math.min(500, Math.trunc(limit))) : 100;
    return statements.listExports.all({ limit: lim }) || [];
  }

  return {
    db,
    driver,
    transaction: runTransaction,
    ensureProject,
    ensureSession,
    addSource,
    getProjectById,
    getSessionById,
    getLatestSourceBySessionId,
    createExport,
    updateExport,
    getExportById,
    listExports,
    close: () => {
      if (typeof db.close === "function") db.close();
    },
  };
}

function prepareStatements(db) {
  return {
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
    getProjectById: db.prepare(
      `SELECT id, name, cwd, created_at
       FROM projects
       WHERE id = @id`,
    ),
    getSessionById: db.prepare(
      `SELECT id, project_id, name, imported_at, source_type
       FROM sessions
       WHERE id = @id`,
    ),
    getLatestSourceBySessionId: db.prepare(
      `SELECT id, session_id, exported_at, raw_jsonl, normalized_json, warnings_json, message_count, created_at
       FROM sources
       WHERE session_id = @session_id
       ORDER BY created_at DESC
       LIMIT 1`,
    ),
    insertExport: db.prepare(
      `INSERT INTO exports (
         id, project_id, session_id, scope_json, includes_json, status, created_at, version, zip_path, counts_json, warnings_json, error_json
       )
       VALUES (
         @id, @project_id, @session_id, @scope_json, @includes_json, @status, @created_at, @version, @zip_path, @counts_json, @warnings_json, @error_json
       )`,
    ),
    updateExport: db.prepare(
      `UPDATE exports
       SET status = @status,
           zip_path = @zip_path,
           counts_json = @counts_json,
           warnings_json = @warnings_json,
           error_json = @error_json
       WHERE id = @id`,
    ),
    getExportById: db.prepare(
      `SELECT id, project_id, session_id, scope_json, includes_json, status, created_at, version, zip_path, counts_json, warnings_json, error_json
       FROM exports
       WHERE id = @id`,
    ),
    listExports: db.prepare(
      `SELECT id, project_id, session_id, scope_json, includes_json, status, created_at, version, zip_path, counts_json, warnings_json, error_json
       FROM exports
       ORDER BY created_at DESC
       LIMIT @limit`,
    ),
  };
}

function makeTransaction(db) {
  if (db && typeof db.transaction === "function") {
    const tx = db.transaction((fn) => fn());
    return (fn) => tx(fn);
  }
  return (fn) => {
    db.exec("BEGIN");
    try {
      const result = fn();
      db.exec("COMMIT");
      return result;
    } catch (err) {
      try {
        db.exec("ROLLBACK");
      } catch {}
      throw err;
    }
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

    CREATE TABLE IF NOT EXISTS exports (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      session_id TEXT,
      scope_json TEXT NOT NULL,
      includes_json TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      version TEXT NOT NULL,
      zip_path TEXT,
      counts_json TEXT NOT NULL,
      warnings_json TEXT NOT NULL,
      error_json TEXT,
      FOREIGN KEY(project_id) REFERENCES projects(id),
      FOREIGN KEY(session_id) REFERENCES sessions(id)
    );

    CREATE INDEX IF NOT EXISTS exports_project_idx ON exports(project_id);
    CREATE INDEX IF NOT EXISTS exports_created_at_idx ON exports(created_at);
  `);
}

function tryRequire(specifier) {
  try {
    // eslint-disable-next-line import/no-dynamic-require, global-require
    return { ok: true, module: require(specifier), error: null };
  } catch (err) {
    return { ok: false, module: null, error: err };
  }
}

module.exports = { openBridgeDb };
