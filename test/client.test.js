// -----------------------------------------------------------------------------
// The API client: the requests it sends (GET only, token header, filters of
// each generation) and the errors it tells apart.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ERROR_KINDS,
  PaperlessClient,
  queryString,
  safeLocation,
} from '../src/paperless/client.js';
import { TOKEN, createClock, seededServer } from './helpers/world.js';
import { requestTo } from './helpers/fakePaperless.js';

const BASE = 'http://192.0.2.10:8000';

function clientFor(server, options = {}) {
  return new PaperlessClient({ url: BASE, token: TOKEN, request: requestTo(server), ...options });
}

/** A client whose transport answers `response` (or throws it). */
function clientAnswering(response) {
  return new PaperlessClient({
    url: BASE,
    token: TOKEN,
    request: async () => {
      if (response instanceof Error) {
        throw response;
      }
      return { headers: {}, body: '', ...response };
    },
  });
}

test('every request is a GET with the token, under /api/', async () => {
  const server = seededServer(createClock());
  const client = clientFor(server);
  await client.getStatistics();
  await client.tasks(['failure'], { unacknowledged: true });
  await client.names('tags', [1, 2]);
  for (const { path, options } of server.requests) {
    assert.match(path, /^\/api\/[a-z_]+\/$/);
    assert.equal(options.method, undefined, 'GET, the default');
    assert.equal(options.headers.authorization, `Token ${TOKEN}`);
  }
});

test('the API generation is learnt from the answers', async () => {
  for (const [generation, apiVersion, version] of [
    [3, 10, '3.3.1'],
    [2, 9, '2.20.6'],
  ]) {
    const client = clientFor(seededServer(createClock(), { generation }));
    await client.getStatistics();
    assert.equal(client.apiVersion, apiVersion);
    assert.equal(client.version, version);
  }
});

test('the task filters of each generation', async () => {
  const modern = seededServer(createClock(), { generation: 3 });
  modern.addTask({ status: 'started' });
  modern.addTask({ status: 'pending' });
  const running = await clientFor(modern).tasks(['pending', 'started'], { pageSize: 1 });
  assert.equal(running.count, 2);
  const query = modern.requests.at(-1).query;
  assert.deepEqual(query.getAll('status'), ['pending', 'started']);
  assert.equal(query.get('page_size'), '1');

  const legacy = seededServer(createClock(), { generation: 2 });
  legacy.addTask({ status: 'started' });
  legacy.addTask({ status: 'pending' });
  const old = await clientFor(legacy).tasks(['pending', 'started']);
  assert.equal(old.count, 2);
  const statuses = legacy.requests
    .filter((r) => r.path.endsWith('/tasks/'))
    .map((r) => r.query.get('status'));
  assert.deepEqual(statuses.sort(), ['PENDING', 'STARTED'], 'one exact status per request');
});

test('the errors are told apart', async () => {
  const refused = Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' });
  const selfSigned = Object.assign(new Error('self-signed'), {
    code: 'DEPTH_ZERO_SELF_SIGNED_CERT',
  });
  const cases = [
    [refused, ERROR_KINDS.UNREACHABLE],
    [selfSigned, ERROR_KINDS.TLS],
    [{ status: 401, body: '{"detail":"Invalid token."}' }, ERROR_KINDS.AUTH],
    [{ status: 403, body: 'Insufficient permissions' }, ERROR_KINDS.FORBIDDEN],
    [{ status: 302, headers: { location: 'https://sso.example/?rd=x' } }, ERROR_KINDS.REDIRECT],
    [{ status: 404, body: 'Not found' }, ERROR_KINDS.NOT_PAPERLESS],
    [{ status: 200, body: '<html></html>' }, ERROR_KINDS.NOT_PAPERLESS],
    [{ status: 200, body: '{"hello":"world"}' }, ERROR_KINDS.NOT_PAPERLESS],
    [{ status: 502, body: 'Bad gateway' }, ERROR_KINDS.HTTP],
  ];
  for (const [response, kind] of cases) {
    await assert.rejects(clientAnswering(response).getStatistics(), (err) => {
      assert.equal(err.kind, kind, `${response.status ?? response.code}`);
      return true;
    });
  }
});

test('helpers: query strings and redirect targets fit for the logs', () => {
  assert.equal(queryString({ a: 1, b: ['x', 'y'], c: undefined }), '?a=1&b=x&b=y');
  assert.equal(queryString({}), '');
  assert.equal(
    safeLocation('https://user:pw@sso.example/login?token=1'),
    'https://sso.example/login',
  );
  assert.equal(safeLocation('/accounts/login/?next=/'), '/accounts/login/');
  assert.equal(safeLocation(undefined), '?');
});
