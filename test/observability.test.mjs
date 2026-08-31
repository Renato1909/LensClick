import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import worker from '../src/worker.mjs';
import {
  buildOperationalErrorEvent,
  buildRequestCompletedEvent,
  classifyHttpStatus,
  completeRequest,
  createRequestContext,
  normalizeRoute,
  responseWithRequestId
} from '../src/observability.mjs';
import { MockD1, MockR2 } from '../test-support/worker-fixture.mjs';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REQUEST_FIELDS = [
  'duration_ms', 'event', 'level', 'method', 'outcome', 'request_id', 'route', 'schema_version', 'status'
];

test('contexto gera UUID seguro no servidor e mede duracao com relogio injetado', () => {
  const instants = [10, 25.1234];
  const context = createRequestContext(
    new Request('https://lensclick.test/api/auth/me?token=QUERY_SECRET', {
      headers: { 'X-Request-ID': 'CLIENT_CONTROLLED_ID' }
    }),
    { clock: () => instants.shift() }
  );
  const event = buildRequestCompletedEvent(context, 200);

  assert.match(context.requestId, UUID_PATTERN);
  assert.notEqual(context.requestId, 'CLIENT_CONTROLLED_ID');
  assert.equal(event.request_id, context.requestId);
  assert.equal(event.duration_ms, 15.123);
  assert.equal(event.route, '/api/auth/me');
  assert.equal(JSON.stringify(event).includes('QUERY_SECRET'), false);
});

test('classificacao HTTP usa somente info, warn e error com outcomes estaveis', () => {
  assert.deepEqual(classifyHttpStatus(204), { level: 'info', outcome: 'success' });
  assert.deepEqual(classifyHttpStatus(302), { level: 'info', outcome: 'success' });
  assert.deepEqual(classifyHttpStatus(404), { level: 'warn', outcome: 'client_error' });
  assert.deepEqual(classifyHttpStatus(503), { level: 'error', outcome: 'server_error' });
});

test('rotas dinamicas e desconhecidas sao normalizadas com baixa cardinalidade', () => {
  assert.equal(normalizeRoute('https://lensclick.test/api/photographers/ana-silva-72?email=secret@example.test'), '/api/photographers/:slug');
  assert.equal(normalizeRoute('/api/photographers/ana-silva-72/portfolio/918'), '/api/photographers/:slug/portfolio/:id');
  assert.equal(normalizeRoute('/api/photographers/ana-silva-72/reviews'), '/api/photographers/:slug/reviews');
  assert.equal(normalizeRoute('/api/photographers/ana-silva-72/review-requests'), '/api/photographers/:slug/review-requests');
  assert.equal(normalizeRoute('/api/account/review-requests/42/review'), '/api/account/review-requests/:id/review');
  assert.equal(normalizeRoute('/api/account/reviews/42'), '/api/account/reviews/:id');
  assert.equal(normalizeRoute('/api/account/portfolio/918/image'), '/api/account/portfolio/:id/image');
  assert.equal(normalizeRoute('/api/profile-picture/12345'), '/api/profile-picture/:id');
  assert.equal(normalizeRoute('/api/private/TOKEN_SECRET'), '/api/unknown');
  assert.equal(normalizeRoute('/private/PERSONAL_SLUG'), '/unknown');
  assert.equal(normalizeRoute('https://lensclick.test/redefinir-senha.html?token=RESET_SECRET'), '/redefinir-senha.html');
});

test('eventos possuem allowlist fechada e ignoram Error e campos livres', () => {
  const context = createRequestContext(new Request('https://lensclick.test/api/auth/me'), {
    clock: (() => {
      const instants = [1, 2];
      return () => instants.shift();
    })(),
    requestIdFactory: () => '00000000-0000-4000-8000-000000000001',
    sink: () => {}
  });
  const event = buildRequestCompletedEvent(context, 500, {
    errorCategory: 'unexpected_error',
    error: new Error('ERROR_MESSAGE_SECRET'),
    message: 'MESSAGE_SECRET',
    stack: 'STACK_SECRET',
    cause: 'CAUSE_SECRET',
    email: 'person@example.test'
  });
  assert.deepEqual(Object.keys(event).sort(), [...REQUEST_FIELDS, 'error_category'].sort());
  assert.equal(event.error_category, 'unexpected_error');

  const operational = buildOperationalErrorEvent(
    context,
    'email.password_reset.delivery_failed',
    'email_delivery_error'
  );
  assert.deepEqual(Object.keys(operational).sort(), [
    'error_category', 'event', 'level', 'request_id', 'schema_version'
  ]);
  assert.equal(buildOperationalErrorEvent(context, 'arbitrary.event', 'unexpected_error'), null);
  assert.doesNotMatch(JSON.stringify([event, operational]), /ERROR_MESSAGE_SECRET|MESSAGE_SECRET|STACK_SECRET|CAUSE_SECRET|person@example\.test/);
});

test('emissao e best-effort e nunca propaga falha do destino', () => {
  const context = createRequestContext(new Request('https://lensclick.test/'), {
    sink: () => {
      throw new Error('LOGGER_FAILURE');
    }
  });
  assert.doesNotThrow(() => completeRequest(context, 200));
});

test('Worker preserva a resposta, ignora request ID do cliente e emite um evento de conclusao', async () => {
  const events = [];
  const clientRequestId = 'CLIENT_REQUEST_ID_SECRET';
  const env = {
    ASSETS: {
      fetch: async () => new Response('asset-body', {
        status: 200,
        headers: { 'Cache-Control': 'public, max-age=60', 'X-Existing-Header': 'preserved' }
      })
    },
    OBSERVABILITY_LOG_SINK: (level, event) => events.push({ level, event })
  };
  const response = await worker.fetch(new Request('https://lensclick.test/?token=URL_SECRET', {
    headers: { 'X-Request-ID': clientRequestId }
  }), env);

  assert.equal(response.status, 200);
  assert.equal(await response.text(), 'asset-body');
  assert.equal(response.headers.get('X-Existing-Header'), 'preserved');
  assert.equal(response.headers.get('Cache-Control'), 'public, max-age=60');
  assert.match(response.headers.get('X-Request-ID'), UUID_PATTERN);
  assert.notEqual(response.headers.get('X-Request-ID'), clientRequestId);
  assert.equal(events.length, 1);
  assert.equal(events[0].event.event, 'http.request.completed');
  assert.equal(events[0].event.request_id, response.headers.get('X-Request-ID'));
  assert.equal(events[0].event.route, '/');
});

test('response wrapping preserva redirect, cookies, metadados, stream e resposta 304', async () => {
  const original = new Response('stream-body', {
    status: 307,
    statusText: 'Temporary Redirect',
    headers: {
      Location: '/destino',
      'Set-Cookie': 'lensclick_session=test; Path=/; HttpOnly',
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'private, max-age=60'
    }
  });
  const wrapped = responseWithRequestId(original, '00000000-0000-4000-8000-000000000002');

  assert.equal(original.bodyUsed, false);
  assert.equal(wrapped.status, 307);
  assert.equal(wrapped.statusText, 'Temporary Redirect');
  assert.equal(wrapped.headers.get('Location'), '/destino');
  assert.equal(wrapped.headers.get('Set-Cookie'), 'lensclick_session=test; Path=/; HttpOnly');
  assert.equal(wrapped.headers.get('Content-Type'), 'text/plain; charset=utf-8');
  assert.equal(wrapped.headers.get('Cache-Control'), 'private, max-age=60');
  assert.equal(wrapped.headers.get('X-Request-ID'), '00000000-0000-4000-8000-000000000002');
  assert.equal(await wrapped.text(), 'stream-body');

  const notModified = responseWithRequestId(
    new Response(null, { status: 304, statusText: 'Not Modified', headers: { ETag: '"asset-etag"' } }),
    '00000000-0000-4000-8000-000000000003'
  );
  assert.equal(notModified.status, 304);
  assert.equal(notModified.statusText, 'Not Modified');
  assert.equal(notModified.headers.get('ETag'), '"asset-etag"');
  assert.equal(notModified.body, null);
});

test('falha global retorna resposta generica e log sanitizado com o mesmo request ID', async () => {
  const events = [];
  const databaseFailure = new Error('DATABASE_PASSWORD_TOKEN_STACK_CANARY');
  databaseFailure.stack = 'DATABASE_STACK_CANARY';
  databaseFailure.cause = 'DATABASE_CAUSE_CANARY';
  const env = {
    DB: { prepare: () => { throw databaseFailure; } },
    OBSERVABILITY_LOG_SINK: (level, event) => events.push({ level, event })
  };
  const response = await worker.fetch(new Request('https://lensclick.test/api/auth/me', {
    headers: {
      Cookie: 'lensclick_session=COOKIE_SECRET',
      Authorization: 'Bearer AUTHORIZATION_SECRET'
    }
  }), env);
  const body = await response.json();

  assert.equal(response.status, 500);
  assert.equal(body.error, 'Nao foi possivel concluir a operacao.');
  assert.equal(events.length, 1);
  assert.equal(events[0].event.level, 'error');
  assert.equal(events[0].event.outcome, 'server_error');
  assert.equal(events[0].event.error_category, 'unexpected_error');
  assert.equal(events[0].event.request_id, response.headers.get('X-Request-ID'));
  assert.doesNotMatch(JSON.stringify(events), /DATABASE_PASSWORD_TOKEN_STACK_CANARY|DATABASE_STACK_CANARY|DATABASE_CAUSE_CANARY|COOKIE_SECRET|AUTHORIZATION_SECRET/);
});

test('falha do Brevo mantem correlacao e nao registra destinatario, token ou erro bruto', async (t) => {
  const DB = new MockD1();
  const events = [];
  const pending = [];
  t.after(() => DB.close());
  DB.prepare(`
    INSERT INTO users (name, email, phone, password_hash)
    VALUES (?, ?, ?, ?)
  `).bind('EMAIL_NAME_CANARY', 'email-canary@example.test', '11999999999', 'not-used').run();
  const env = {
    DB,
    PROFILE_IMAGES: new MockR2(),
    BREVO_API_KEY: 'BREVO_API_KEY_CANARY',
    BREVO_SENDER_EMAIL: 'sender@example.test',
    BREVO_FETCH: async () => { throw new Error('BREVO_RESPONSE_SECRET'); },
    OBSERVABILITY_LOG_SINK: (level, event) => events.push({ level, event })
  };
  const response = await worker.fetch(new Request('https://lensclick.test/api/auth/password-reset/request', {
    method: 'POST',
    headers: {
      Origin: 'https://lensclick.test',
      'Content-Type': 'application/json',
      Cookie: 'lensclick_session=COOKIE_CANARY',
      Authorization: 'Bearer AUTH_CANARY'
    },
    body: JSON.stringify({
      email: 'email-canary@example.test',
      password: 'PASSWORD_CANARY',
      token: 'RESET_TOKEN_CANARY'
    })
  }), env, { waitUntil: (promise) => pending.push(promise) });
  await Promise.all(pending);

  const completed = events.find(({ event }) => event.event === 'http.request.completed')?.event;
  const deliveryFailure = events.find(({ event }) => event.event === 'email.password_reset.delivery_failed')?.event;
  assert.equal(response.status, 202);
  assert.ok(completed);
  assert.ok(deliveryFailure);
  assert.equal(deliveryFailure.request_id, completed.request_id);
  assert.equal(completed.request_id, response.headers.get('X-Request-ID'));
  assert.equal(deliveryFailure.error_category, 'email_delivery_error');
  assert.doesNotMatch(JSON.stringify(events), /EMAIL_NAME_CANARY|email-canary@example\.test|BREVO_API_KEY_CANARY|BREVO_RESPONSE_SECRET|PASSWORD_CANARY|RESET_TOKEN_CANARY|COOKIE_CANARY|AUTH_CANARY/);
});

test('falha de limpeza no R2 mantem correlacao sem registrar chave ou erro bruto', async (t) => {
  const DB = new MockD1();
  const PROFILE_IMAGES = new MockR2();
  const events = [];
  const origin = 'https://lensclick.test';
  const env = {
    DB,
    PROFILE_IMAGES,
    OBSERVABILITY_LOG_SINK: (level, event) => events.push({ level, event })
  };
  t.after(() => DB.close());

  const registration = await worker.fetch(new Request(origin + '/api/auth/register', {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'R2 Name Canary', email: 'r2-canary@example.test', phone: '11999999999', password: 'Password123'
    })
  }), env);
  const cookie = registration.headers.get('Set-Cookie').split(';')[0];
  const user = (await registration.json()).user;
  const onePixelPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

  const firstUpdate = await worker.fetch(new Request(origin + '/api/profile', {
    method: 'PUT',
    headers: { Origin: origin, 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ ...user, role: 'client', age: 30, gender: 'other', profilePic: onePixelPng })
  }), env);
  assert.equal(firstUpdate.status, 200);
  const oldKey = [...PROFILE_IMAGES.objects.keys()][0];
  PROFILE_IMAGES.failDeleteKey = oldKey;
  events.length = 0;

  const secondUpdate = await worker.fetch(new Request(origin + '/api/profile', {
    method: 'PUT',
    headers: { Origin: origin, 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ ...user, role: 'client', age: 30, gender: 'other', profilePic: onePixelPng })
  }), env);
  const completed = events.find(({ event }) => event.event === 'http.request.completed')?.event;
  const cleanupFailure = events.find(({ event }) => event.event === 'storage.profile_picture.cleanup_failed')?.event;

  assert.equal(secondUpdate.status, 200);
  assert.ok(completed);
  assert.ok(cleanupFailure);
  assert.equal(cleanupFailure.request_id, completed.request_id);
  assert.equal(completed.request_id, secondUpdate.headers.get('X-Request-ID'));
  assert.equal(cleanupFailure.error_category, 'storage_error');
  assert.equal(JSON.stringify(events).includes(oldKey), false);
  assert.equal(JSON.stringify(events).includes('R2_STACK_SECRET_CANARY'), false);
});

test('teste canario confirma que dados sensiveis nao aparecem em nenhum evento', async () => {
  const events = [];
  const canaries = [
    'PASSWORD_CANARY',
    'COOKIE_CANARY',
    'RESET_TOKEN_CANARY',
    'AUTHORIZATION_CANARY',
    'person-canary@example.test',
    'BODY_MESSAGE_CANARY',
    'URL_QUERY_CANARY',
    'CLIENT_REQUEST_ID_CANARY'
  ];
  const response = await worker.fetch(new Request(
    'https://lensclick.test/api/unknown/person-canary@example.test?token=URL_QUERY_CANARY',
    {
      method: 'POST',
      headers: {
        Origin: 'https://lensclick.test',
        'Content-Type': 'application/json',
        Cookie: 'lensclick_session=COOKIE_CANARY',
        Authorization: 'Bearer AUTHORIZATION_CANARY',
        'X-Request-ID': 'CLIENT_REQUEST_ID_CANARY'
      },
      body: JSON.stringify({
        password: 'PASSWORD_CANARY',
        token: 'RESET_TOKEN_CANARY',
        email: 'person-canary@example.test',
        message: 'BODY_MESSAGE_CANARY'
      })
    }
  ), { OBSERVABILITY_LOG_SINK: (level, event) => events.push({ level, event }) });

  assert.equal(response.status, 404);
  assert.equal(events.length, 1);
  assert.deepEqual(Object.keys(events[0].event).sort(), REQUEST_FIELDS);
  const serialized = JSON.stringify(events);
  for (const canary of canaries) assert.equal(serialized.includes(canary), false, canary);
});

test('Wrangler habilita Workers Logs sem invocation logs, tracing ou servicos adicionais', () => {
  const configuration = JSON.parse(readFileSync(resolve('wrangler.jsonc'), 'utf8'));
  assert.equal(configuration.observability.enabled, true);
  assert.equal(configuration.observability.logs.enabled, true);
  assert.equal(configuration.observability.logs.invocation_logs, false);
  assert.equal(configuration.observability.logs.head_sampling_rate, 1);
  assert.equal('traces' in configuration.observability, false);
  assert.equal('analytics_engine_datasets' in configuration, false);
  assert.equal('logpush' in configuration, false);
});
