import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

function migratedDatabase() {
  const database = new DatabaseSync(':memory:');
  for (const migration of readdirSync(resolve('migrations')).filter((file) => file.endsWith('.sql')).sort()) {
    database.exec(readFileSync(resolve('migrations', migration), 'utf8'));
  }
  return database;
}

function seedSql() {
  const result = spawnSync(process.execPath, ['scripts/seed-demo.mjs', '--sql'], {
    encoding: 'utf8',
    env: {
      ...process.env,
      DEMO_CLIENT_PASSWORD: 'SenhaDemo123',
      DEMO_PHOTOGRAPHER_PASSWORD: 'SenhaDemo456'
    }
  });
  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(result.stdout, /SenhaDemo/);
  return result.stdout;
}

test('seed de demonstração é idempotente e cobre os fluxos do app', () => {
  const database = migratedDatabase();
  const sql = seedSql();

  database.exec(sql);
  database.exec(sql); // reexecução não duplica dados

  assert.equal(database.prepare('SELECT COUNT(*) AS total FROM users').get().total, 2);
  assert.equal(database.prepare("SELECT is_published FROM professional_profiles WHERE slug = 'demo-fotografo'").get().is_published, 1);
  assert.equal(database.prepare('SELECT COUNT(*) AS total FROM budget_requests').get().total, 2);
  assert.equal(database.prepare("SELECT COUNT(*) AS total FROM proposals WHERE price_cents = 180000").get().total, 1);
  assert.equal(database.prepare("SELECT COUNT(*) AS total FROM review_requests WHERE status = 'confirmed'").get().total, 1);
  assert.equal(database.prepare('SELECT COUNT(*) AS total FROM conversations').get().total, 1);
  assert.equal(database.prepare('SELECT COUNT(*) AS total FROM messages').get().total, 2);
  assert.equal(database.prepare('SELECT COUNT(*) AS total FROM favorites').get().total, 1);

  const client = database.prepare('SELECT password_hash FROM users WHERE email = ?').get('demo.cliente@lensclick.local');
  assert.match(client.password_hash, /^pbkdf2-sha256\$100000\$[A-Za-z0-9_-]+\$[A-Za-z0-9_-]+$/);
  database.close();
});
