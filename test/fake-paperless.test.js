// -----------------------------------------------------------------------------
// The fake Paperless-ngx answers in the shape of the real ones: every key a
// real 3.3.1 or 2.20.6 server sent (test/fixtures/paperless/real-*), at every
// level, is in the fake's answer, with the same type — and the fake invents
// no key the real server does not send. Otherwise the tests would prove the
// integration against a server that does not exist.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TOKEN, createClock, seededServer } from './helpers/world.js';
import { fixture } from './helpers/fakePaperless.js';

const kind = (value) => (value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value);

/** Differences of shape between a real answer and the fake's. */
function shapeDiff(real, fake, path = '') {
  if (kind(real) === 'null' || kind(fake) === 'null') {
    return []; // a value that may be absent
  }
  if (kind(real) !== kind(fake)) {
    return [`${path}: ${kind(real)} on the real server, ${kind(fake)} in the fake`];
  }
  if (kind(real) === 'array') {
    return real.length && fake.length ? shapeDiff(real[0], fake[0], `${path}[0]`) : [];
  }
  if (kind(real) !== 'object') {
    return [];
  }
  const found = [];
  for (const key of new Set([...Object.keys(real), ...Object.keys(fake)])) {
    if (!(key in fake)) {
      found.push(`${path}.${key}: missing in the fake`);
    } else if (!(key in real)) {
      found.push(`${path}.${key}: not sent by the real server`);
    } else if (!['input_data', 'result_data', 'database', 'tasks'].includes(key)) {
      found.push(...shapeDiff(real[key], fake[key], `${path}.${key}`));
    }
  }
  return found;
}

for (const generation of [3, 2]) {
  const version = generation === 3 ? '3.3.1' : '2.20.6';

  test(`the fake answers like a real Paperless-ngx ${version}`, async () => {
    const server = seededServer(createClock(), { generation });
    const names = [
      'statistics',
      'status',
      'remote_version',
      'documents_recent',
      'documents_inbox',
      'tasks_failed',
      'tasks_running',
      'correspondents',
      'document_types',
      'tags',
    ];
    for (const name of names) {
      const real = fixture(`real-${version}/${name}`);
      const answer = await server.handle(`http://paperless.example:8000${real.request}`, {
        headers: { authorization: `Token ${TOKEN}` },
      });
      assert.equal(answer.status, 200, `${name}: HTTP ${answer.status}`);
      assert.equal(answer.headers['x-api-version'], real.headers['x-api-version'], name);
      assert.equal(answer.headers['x-version'], real.headers['x-version'], name);
      assert.deepEqual(shapeDiff(real.body, JSON.parse(answer.body)), [], name);
    }
  });
}

test('a 3.x server refuses the 2.x task statuses, and the reverse', async () => {
  const modern = seededServer(createClock(), { generation: 3 });
  const legacy = seededServer(createClock(), { generation: 2 });
  const auth = { headers: { authorization: `Token ${TOKEN}` } };
  const base = 'http://paperless.example:8000/api/tasks/';
  assert.equal((await modern.handle(`${base}?status=FAILURE`, auth)).status, 400);
  assert.equal((await legacy.handle(`${base}?status=failure`, auth)).status, 400);
});
