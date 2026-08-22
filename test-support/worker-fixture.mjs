import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import worker from '../src/worker.mjs';

export const TEST_ORIGIN = 'https://lensclick.test';

export class MockD1Statement {
  constructor(database, sql) {
    this.statement = database.prepare(sql);
    this.values = [];
  }

  bind(...values) {
    this.values = values;
    return this;
  }

  first(column) {
    const row = this.statement.get(...this.values) ?? null;
    return column && row ? row[column] : row;
  }

  run() {
    const result = this.statement.run(...this.values);
    return {
      success: true,
      meta: {
        changes: result.changes,
        last_row_id: Number(result.lastInsertRowid)
      }
    };
  }

  all() {
    return { success: true, results: this.statement.all(...this.values) };
  }
}

export class MockD1 {
  constructor({ migrationsDirectory = resolve('migrations') } = {}) {
    this.database = new DatabaseSync(':memory:');
    const migrations = readdirSync(migrationsDirectory, { withFileTypes: true })
      .filter((entry) => entry.isFile() && /^\d+.*\.sql$/i.test(entry.name))
      .map((entry) => entry.name)
      .sort((left, right) => left.localeCompare(right, 'en'));

    if (!migrations.length) throw new Error('Nenhuma migration SQL foi encontrada para os testes.');
    for (const migration of migrations) {
      this.database.exec(readFileSync(resolve(migrationsDirectory, migration), 'utf8'));
    }
    this.database.exec('PRAGMA foreign_keys = ON');
    this.appliedMigrations = migrations;
  }

  prepare(sql) {
    return new MockD1Statement(this.database, sql);
  }

  batch(statements) {
    this.database.exec('BEGIN');
    try {
      const results = statements.map((statement) => statement.run());
      this.database.exec('COMMIT');
      return results;
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }

  close() {
    this.database.close();
  }
}

export class MockR2 {
  constructor() {
    this.objects = new Map();
    this.puts = [];
    this.deletes = [];
    this.failDeleteKey = '';
  }

  async put(key, value, options = {}) {
    const body = value instanceof Uint8Array ? value : new Uint8Array(value);
    const stored = {
      body,
      httpMetadata: options.httpMetadata || {},
      httpEtag: options.httpEtag || ''
    };
    this.objects.set(key, stored);
    this.puts.push(key);
  }

  async get(key) {
    const object = this.objects.get(key);
    if (!object) return null;
    return {
      ...object,
      writeHttpMetadata(headers) {
        if (object.httpMetadata.contentType) headers.set('Content-Type', object.httpMetadata.contentType);
      }
    };
  }

  async delete(key) {
    const keys = Array.isArray(key) ? key : [key];
    if (this.failDeleteKey && keys.includes(this.failDeleteKey)) {
      throw new Error('R2_STACK_SECRET_CANARY');
    }
    for (const item of keys) {
      this.objects.delete(item);
      this.deletes.push(item);
    }
  }
}

export function createExecutionContext() {
  const pending = [];
  return {
    waitUntil(promise) {
      pending.push(Promise.resolve(promise));
    },
    passThroughOnException() {},
    async settle() {
      const results = await Promise.allSettled(pending.splice(0));
      const rejected = results.find((result) => result.status === 'rejected');
      if (rejected) throw rejected.reason;
    }
  };
}

export function createTestEnvironment(overrides = {}) {
  const DB = overrides.DB || new MockD1();
  const PROFILE_IMAGES = overrides.PROFILE_IMAGES || new MockR2();
  const observabilityEvents = [];
  return {
    DB,
    PROFILE_IMAGES,
    observabilityEvents,
    env: {
      DB,
      PROFILE_IMAGES,
      OBSERVABILITY_LOG_SINK: (level, event) => observabilityEvents.push({ level, event }),
      ...overrides
    }
  };
}

export function createWorkerFixture({ enableEmail = false, env: overrides = {}, origin = TEST_ORIGIN } = {}) {
  const sentEmails = [];
  const executionContext = createExecutionContext();
  const emailEnvironment = enableEmail ? {
    BREVO_API_KEY: 'brevo_test_only',
    BREVO_SENDER_EMAIL: 'conta@lensclick.test',
    BREVO_SENDER_NAME: 'LensClick',
    BREVO_FETCH: async (url, options) => {
      sentEmails.push({ url, options, body: JSON.parse(options.body) });
      return Response.json({ messageId: `test-${sentEmails.length}` });
    }
  } : {};
  const environment = createTestEnvironment({ ...emailEnvironment, ...overrides });
  let cookie = '';

  async function request(path, {
    method = 'GET',
    json,
    body,
    headers = {},
    originHeader,
    useCookie = true
  } = {}) {
    const normalizedMethod = method.toUpperCase();
    const requestHeaders = new Headers(headers);
    if (originHeader !== null && originHeader !== false && !['GET', 'HEAD'].includes(normalizedMethod)) {
      requestHeaders.set('Origin', originHeader || origin);
    }
    if (json !== undefined) {
      requestHeaders.set('Content-Type', 'application/json');
      body = JSON.stringify(json);
    }
    if (useCookie && cookie && !requestHeaders.has('Cookie')) requestHeaders.set('Cookie', cookie);

    const response = await worker.fetch(new Request(new URL(path, origin), {
      method: normalizedMethod,
      headers: requestHeaders,
      body: ['GET', 'HEAD'].includes(normalizedMethod) ? undefined : body
    }), environment.env, executionContext);
    const setCookie = response.headers.get('set-cookie');
    if (setCookie) cookie = setCookie.includes('Max-Age=0') ? '' : setCookie.split(';')[0];
    const contentType = response.headers.get('content-type') || '';
    const responseBody = contentType.includes('json') ? await response.clone().json() : null;
    return { response, json: responseBody };
  }

  return {
    ...environment,
    executionContext,
    sentEmails,
    request,
    get cookie() {
      return cookie;
    },
    set cookie(value) {
      cookie = value;
    },
    async close() {
      await executionContext.settle();
      environment.DB.close();
    }
  };
}
