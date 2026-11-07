import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

function nowIso() {
  return new Date().toISOString();
}

function toJson(value) {
  return value === null || value === undefined ? null : JSON.stringify(value);
}

function fromJson(value) {
  return value === null || value === undefined ? null : JSON.parse(value);
}

export function createSqliteStore({ file }) {
  if (!file) {
    throw new Error("SQLite 存储需要 file 路径");
  }
  mkdirSync(dirname(file), { recursive: true });

  const db = new DatabaseSync(file);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA busy_timeout = 5000");
  db.exec(`
    CREATE TABLE IF NOT EXISTS analysis_cache (
      key TEXT PRIMARY KEY,
      protocol_version TEXT,
      model TEXT,
      prompt_fingerprint TEXT,
      resume_hash TEXT,
      job_hash TEXT,
      result_json TEXT NOT NULL,
      usage_json TEXT,
      rubric_cached INTEGER NOT NULL DEFAULT 0,
      hit_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS job_rubric_cache (
      key TEXT PRIMARY KEY,
      protocol_version TEXT,
      model TEXT,
      prompt_fingerprint TEXT,
      job_hash TEXT,
      rubric_json TEXT NOT NULL,
      hit_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS llm_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cache_key TEXT,
      stage TEXT NOT NULL,
      model TEXT,
      request_hash TEXT,
      raw_response TEXT,
      usage_json TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_llm_runs_created_at ON llm_runs(created_at);
  `);

  const statements = {
    getAnalysis: db.prepare(
      "SELECT * FROM analysis_cache WHERE key = ?",
    ),
    setAnalysis: db.prepare(`
      INSERT INTO analysis_cache (
        key, protocol_version, model, prompt_fingerprint, resume_hash, job_hash,
        result_json, usage_json, rubric_cached, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET
        protocol_version = excluded.protocol_version,
        model = excluded.model,
        prompt_fingerprint = excluded.prompt_fingerprint,
        resume_hash = excluded.resume_hash,
        job_hash = excluded.job_hash,
        result_json = excluded.result_json,
        usage_json = excluded.usage_json,
        rubric_cached = excluded.rubric_cached,
        created_at = excluded.created_at
    `),
    getRubric: db.prepare("SELECT * FROM job_rubric_cache WHERE key = ?"),
    setRubric: db.prepare(`
      INSERT INTO job_rubric_cache (
        key, protocol_version, model, prompt_fingerprint, job_hash,
        rubric_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET
        protocol_version = excluded.protocol_version,
        model = excluded.model,
        prompt_fingerprint = excluded.prompt_fingerprint,
        job_hash = excluded.job_hash,
        rubric_json = excluded.rubric_json,
        created_at = excluded.created_at
    `),
    hitAnalysis: db.prepare(
      "UPDATE analysis_cache SET hit_count = hit_count + 1 WHERE key = ?",
    ),
    hitRubric: db.prepare(
      "UPDATE job_rubric_cache SET hit_count = hit_count + 1 WHERE key = ?",
    ),
    logRun: db.prepare(`
      INSERT INTO llm_runs (
        cache_key, stage, model, request_hash, raw_response, usage_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `),
    countRuns: db.prepare("SELECT COUNT(*) AS count FROM llm_runs"),
    deleteAnalysis: db.prepare("DELETE FROM analysis_cache WHERE key = ?"),
    deleteRunsByCacheKey: db.prepare(
      "DELETE FROM llm_runs WHERE cache_key = ?",
    ),
    purgeAnalysisBefore: db.prepare(
      "DELETE FROM analysis_cache WHERE created_at < ?",
    ),
    purgeRunsBefore: db.prepare("DELETE FROM llm_runs WHERE created_at < ?"),
  };

  return {
    file,

    getAnalysis(key) {
      const row = statements.getAnalysis.get(key);
      if (!row) return null;
      return {
        analysis: fromJson(row.result_json),
        usage: fromJson(row.usage_json),
        rubricCached: Boolean(row.rubric_cached),
        hitCount: row.hit_count,
        createdAt: row.created_at,
      };
    },

    setAnalysis(key, value, meta = {}) {
      statements.setAnalysis.run(
        key,
        meta.protocolVersion ?? null,
        meta.model ?? null,
        meta.promptFingerprint ?? null,
        meta.resumeHash ?? null,
        meta.jobHash ?? null,
        JSON.stringify(value.analysis ?? null),
        toJson(value.usage),
        value.rubricCached ? 1 : 0,
        nowIso(),
      );
    },

    getRubric(key) {
      const row = statements.getRubric.get(key);
      return row ? fromJson(row.rubric_json) : null;
    },

    setRubric(key, rubric, meta = {}) {
      statements.setRubric.run(
        key,
        meta.protocolVersion ?? null,
        meta.model ?? null,
        meta.promptFingerprint ?? null,
        meta.jobHash ?? null,
        JSON.stringify(rubric),
        nowIso(),
      );
    },

    recordHit(kind, key) {
      if (kind === "rubric") {
        statements.hitRubric.run(key);
      } else {
        statements.hitAnalysis.run(key);
      }
    },

    logRun({
      cacheKey = null,
      stage,
      model = null,
      requestHash = null,
      rawResponse = null,
      usage = null,
    }) {
      statements.logRun.run(
        cacheKey,
        String(stage || "unknown"),
        model,
        requestHash,
        typeof rawResponse === "string" ? rawResponse : toJson(rawResponse),
        toJson(usage),
        nowIso(),
      );
    },

    countRuns() {
      return Number(statements.countRuns.get().count);
    },

    deleteAnalysis(key) {
      const removed = Number(statements.deleteAnalysis.run(key).changes) > 0;
      statements.deleteRunsByCacheKey.run(key);
      return removed;
    },

    purgeOlderThan(days) {
      const safeDays = Number.isFinite(days) && days >= 0 ? days : 30;
      const cutoff = new Date(
        Date.now() - safeDays * 24 * 60 * 60 * 1000,
      ).toISOString();
      const removed = statements.purgeAnalysisBefore.run(cutoff);
      statements.purgeRunsBefore.run(cutoff);
      return Number(removed.changes);
    },

    close() {
      db.close();
    },
  };
}
