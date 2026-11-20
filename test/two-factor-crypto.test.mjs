import test from 'node:test';
import assert from 'node:assert/strict';
import { generateTotpSecret, otpauthUrl, totpCode, verifyTotp, generateRecoveryCodes } from '../src/twofactor.mjs';

test('TOTP gera códigos de 6 dígitos determinísticos para o mesmo segredo e passo', async () => {
  const secret = generateTotpSecret();
  const now = 1_700_000_000_000;
  const a = await totpCode(secret, now);
  const b = await totpCode(secret, now);
  assert.match(a, /^\d{6}$/);
  assert.equal(a, b);
});

test('verificação aceita janela de ±1 passo e rejeita código errado', async () => {
  const secret = generateTotpSecret();
  const now = Date.now();
  const current = await totpCode(secret, now);
  const previous = await totpCode(secret, now - 30_000);
  const next = await totpCode(secret, now + 30_000);
  assert.equal(await verifyTotp(secret, current, now), true);
  assert.equal(await verifyTotp(secret, previous, now), true);
  assert.equal(await verifyTotp(secret, next, now), true);
  assert.equal(await verifyTotp(secret, '000000', now), current === '000000' ? true : false);
  assert.equal(await verifyTotp(secret, '12345', now), false);
});

test('otpauth URL contém issuer, secret e parâmetros RFC 6238', () => {
  const url = new URL(otpauthUrl('JBSWY3DPEHPK3PXP', 'user@example.com'));
  assert.equal(url.protocol, 'otpauth:');
  assert.equal(url.host, 'totp');
  assert.match(url.searchParams.get('secret'), /^[A-Z2-7]+$/);
  assert.equal(url.searchParams.get('algorithm'), 'SHA1');
  assert.equal(url.searchParams.get('digits'), '6');
  assert.equal(url.searchParams.get('period'), '30');
});

test('códigos de recuperação são 10 únicos no formato XXXX-XXXX', () => {
  const codes = generateRecoveryCodes();
  assert.equal(codes.length, 10);
  assert.equal(new Set(codes).size, 10);
  for (const code of codes) assert.match(code, /^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
});
