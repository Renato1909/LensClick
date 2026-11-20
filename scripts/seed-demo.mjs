// Seed de contas e dados mínimos para a demo da feira do LensClickApp.
// Nenhuma credencial é versionada: senhas vêm de variáveis de ambiente e
// apenas seus hashes PBKDF2 (mesmo formato do Worker) aparecem no SQL gerado.
// Uso: npm run seed:demo  (ou com -- --dry-run para inspecionar o SQL)
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const env = (name) => String(process.env[name] || '').trim();
const dryRun = process.argv.includes('--dry-run');

const demo = {
  clientEmail: env('DEMO_CLIENT_EMAIL') || 'demo.cliente@lensclick.local',
  clientPassword: env('DEMO_CLIENT_PASSWORD'),
  clientName: env('DEMO_CLIENT_NAME') || 'Cliente Demo',
  photographerEmail: env('DEMO_PHOTOGRAPHER_EMAIL') || 'demo.fotografo@lensclick.local',
  photographerPassword: env('DEMO_PHOTOGRAPHER_PASSWORD'),
  photographerName: env('DEMO_PHOTOGRAPHER_NAME') || 'Fotografo Demo'
};

for (const key of ['clientPassword', 'photographerPassword']) {
  if (demo[key].length < 8) {
    console.error(`Defina ${key === 'clientPassword' ? 'DEMO_CLIENT_PASSWORD' : 'DEMO_PHOTOGRAPHER_PASSWORD'} com ao menos 8 caracteres.`);
    process.exit(1);
  }
}

function bytesToBase64Url(bytes) {
  return Buffer.from(bytes).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 100000 },
    key, 256
  );
  return `pbkdf2-sha256$100000$${bytesToBase64Url(salt)}$${bytesToBase64Url(new Uint8Array(bits))}`;
}

function sqlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

const clientHash = await hashPassword(demo.clientPassword);
const photographerHash = await hashPassword(demo.photographerPassword);
const C = sqlString(demo.clientEmail);
const P = sqlString(demo.photographerEmail);

const sql = `-- Seed demo LensClickApp (gerado localmente; sem senhas em claro)
PRAGMA foreign_keys = ON;

INSERT OR IGNORE INTO users (name, email, phone, password_hash, role, email_verified_at)
VALUES (${sqlString(demo.clientName)}, ${C}, '(11) 99999-9999', ${sqlString(clientHash)}, 'client', CURRENT_TIMESTAMP);

INSERT OR IGNORE INTO users (name, email, phone, password_hash, role, email_verified_at)
VALUES (${sqlString(demo.photographerName)}, ${P}, '(11) 98888-8888', ${sqlString(photographerHash)}, 'photographer', CURRENT_TIMESTAMP);

INSERT OR IGNORE INTO professional_profiles
  (user_id, slug, bio, specialties, city, state, service_radius_km, starting_price_cents, availability, is_published)
SELECT id, 'demo-fotografo', 'Fotografo de casamentos e eventos para a demonstracao da plataforma.',
  '["wedding","events"]', 'Campinas', 'SP', 80, 150000, 'available', 1
FROM users WHERE email = ${P};

INSERT OR IGNORE INTO budget_requests
  (client_user_id, photographer_user_id, event_type, event_date, place, duration, description, status)
SELECT c.id, p.id, 'Casamento', '2026-12-12', 'Campinas, SP', '6 horas',
  'Cerimonia e festa de casamento com 80 convidados para a demonstracao.', 'cancelled'
FROM users c, users p WHERE c.email = ${C} AND p.email = ${P}
AND NOT EXISTS (SELECT 1 FROM budget_requests b WHERE b.client_user_id = c.id AND b.photographer_user_id = p.id AND b.event_type = 'Casamento');

-- Histórico: pedido cancelado acima (não ocupa o índice de pedido ativo).
-- Solicitação com proposta pendente (cliente demonstra aceite/rejeição)
INSERT OR IGNORE INTO budget_requests
  (client_user_id, photographer_user_id, event_type, event_date, place, duration, description)
SELECT c.id, p.id, 'Evento corporativo', '2026-11-30', 'Sao Paulo, SP', '4 horas',
  'Evento de fim de ano da empresa para a demonstracao do aplicativo.'
FROM users c, users p WHERE c.email = ${C} AND p.email = ${P}
AND NOT EXISTS (SELECT 1 FROM budget_requests b WHERE b.client_user_id = c.id AND b.photographer_user_id = p.id AND b.event_type = 'Evento corporativo');

INSERT OR IGNORE INTO proposals (request_id, photographer_user_id, price_cents, conditions)
SELECT b.id, p.id, 180000, 'Inclui ensaio de 2 horas e 300 fotos editadas.'
FROM budget_requests b JOIN users p ON p.email = ${P}
JOIN users c ON c.id = b.client_user_id
WHERE c.email = ${C} AND b.event_type = 'Evento corporativo' AND b.status = 'pending';

UPDATE budget_requests SET status = 'proposed', updated_at = CURRENT_TIMESTAMP
WHERE id IN (SELECT r.id FROM budget_requests r JOIN proposals pr ON pr.request_id = r.id AND pr.status = 'pending' WHERE r.status = 'pending');

-- Contato confirmado: habilita a avaliação direta consumida pelo app
INSERT INTO review_requests (client_user_id, photographer_user_id, message, status, confirmed_at)
SELECT c.id, p.id, 'Contato de demonstracao ja confirmado para avaliacao.', 'confirmed', CURRENT_TIMESTAMP
FROM users c, users p WHERE c.email = ${C} AND p.email = ${P}
AND NOT EXISTS (SELECT 1 FROM review_requests q WHERE q.client_user_id = c.id AND q.photographer_user_id = p.id);

-- Conversa com duas mensagens (inbox e leitura no app)
INSERT OR IGNORE INTO conversations (client_user_id, photographer_user_id)
SELECT c.id, p.id FROM users c, users p WHERE c.email = ${C} AND p.email = ${P};

INSERT INTO messages (conversation_id, sender_user_id, body)
SELECT cv.id, c.id, 'Ola! Gostaria de ver disponibilidade para o evento de demonstracao.'
FROM conversations cv JOIN users c ON c.email = ${C} JOIN users p ON p.email = ${P}
WHERE cv.client_user_id = c.id AND cv.photographer_user_id = p.id
AND NOT EXISTS (SELECT 1 FROM messages m WHERE m.conversation_id = cv.id AND m.body = 'Ola! Gostaria de ver disponibilidade para o evento de demonstracao.');

INSERT INTO messages (conversation_id, sender_user_id, body)
SELECT cv.id, p.id, 'Claro! Confira a proposta enviada no app.'
FROM conversations cv JOIN users c ON c.email = ${C} JOIN users p ON p.email = ${P}
WHERE cv.client_user_id = c.id AND cv.photographer_user_id = p.id
AND NOT EXISTS (SELECT 1 FROM messages m WHERE m.conversation_id = cv.id AND m.body = 'Claro! Confira a proposta enviada no app.');

UPDATE conversations SET last_message_at = CURRENT_TIMESTAMP WHERE client_user_id = (SELECT id FROM users WHERE email = ${C}) AND photographer_user_id = (SELECT id FROM users WHERE email = ${P});

-- Favorito do cliente (botão de favoritar no app)
INSERT OR IGNORE INTO favorites (client_user_id, photographer_user_id)
SELECT c.id, p.id FROM users c, users p WHERE c.email = ${C} AND p.email = ${P};
`;

if (process.argv.includes('--sql')) {
  // Saída para validação local do SQL (contém apenas hashes das senhas).
  console.log(sql);
  process.exit(0);
}

if (dryRun) {
  // Não imprime hashes nem credenciais: apenas confirma que o SQL foi gerado.
  console.log(`SQL de demo gerado (${sql.length} bytes). Use --dry-run apenas para validar a geração.`);
  process.exit(0);
}

const directory = mkdtempSync(join(tmpdir(), 'lensclick-demo-'));
const file = join(directory, 'seed.sql');
try {
  writeFileSync(file, sql, { mode: 0o600 });
  const result = spawnSync('npx', ['wrangler', 'd1', 'execute', 'lensclick-db', '--remote', `--file=${file}`], {
    stdio: 'inherit',
    shell: process.platform === 'win32'
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
  console.log('Seed de demonstração aplicado no D1 remoto.');
  console.log(`Contas: ${demo.clientEmail} (cliente) e ${demo.photographerEmail} (fotógrafo).`);
  console.log('Compartilhe as credenciais apenas pelo canal seguro acordado e remova as contas após a feira.');
} finally {
  rmSync(directory, { recursive: true, force: true });
}
