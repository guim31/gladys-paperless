// -----------------------------------------------------------------------------
// Optional test against a REAL Paperless-ngx (`npm run test:real`), skipped
// unless PAPERLESS_TEST_URL and PAPERLESS_TEST_TOKEN are set — so the CI,
// which has none, skips it. Read only: it never changes anything in
// Paperless-ngx. Run against 3.3.1 and 2.20.6 (official Docker images) while
// this integration was written:
//
//   PAPERLESS_TEST_URL=http://localhost:8000 PAPERLESS_TEST_TOKEN=… npm run test:real
//
// It drives the integration as Gladys would (the SDK's fake Gladys), against
// the real server, and checks what reaches Gladys. Nothing it prints holds the
// token.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { registerHandlers } from '../../src/app.js';
import { FEATURE_KEYS } from '../../src/devices.js';
import { PaperlessClient } from '../../src/paperless/client.js';
import { Store } from '../../src/store.js';

const url = process.env.PAPERLESS_TEST_URL;
const token = process.env.PAPERLESS_TEST_TOKEN;
const skip = !url || !token ? 'set PAPERLESS_TEST_URL and PAPERLESS_TEST_TOKEN' : false;

process.env.LOG_LEVEL ??= 'silent';

test('the integration reads a real Paperless-ngx', { skip }, async (t) => {
  const gladys = createFakeGladys({ config: { url, token, language: 'en' } });
  const app = registerHandlers(gladys, {
    store: new Store(mkdtempSync(join(tmpdir(), 'gladys-paperless-real-'))),
    timers: false,
  });
  t.after(() => app.stop());
  await gladys.connect();
  await app.ready;

  assert.deepEqual(gladys.fake.connectionStatus, { connected: true });
  const ids = gladys.externalIds('paperless', '1');
  const value = (key) => gladys.fake.lastState(ids.feature(key));
  assert.equal(value(FEATURE_KEYS.ONLINE), 1);
  for (const key of [
    FEATURE_KEYS.DOCUMENTS,
    FEATURE_KEYS.INBOX,
    FEATURE_KEYS.ADDED_TODAY,
    FEATURE_KEYS.TASKS_RUNNING,
    FEATURE_KEYS.TASKS_FAILED,
    FEATURE_KEYS.CORRESPONDENTS,
    FEATURE_KEYS.DOCUMENT_TYPES,
    FEATURE_KEYS.TAGS,
  ]) {
    assert.ok(Number.isInteger(value(key)) && value(key) >= 0, `${key}: ${value(key)}`);
  }
  assert.match(value(FEATURE_KEYS.VERSION), /^\d+\.\d+\.\d+/);

  const report = await gladys.fake.action('test_connection', {});
  assert.equal(report.success, true, report.error);
  assert.match(report.data.message.en, /^Connected to Paperless-ngx/);

  const widget = await gladys.fake.widgetGet('inbox', { settings: {}, language: 'fr' });
  assert.equal(widget.success, true, widget.error);
  assert.deepEqual(validateWidgetContent(widget.data.content), []);
  t.diagnostic(
    `Paperless-ngx ${value(FEATURE_KEYS.VERSION)}: ${value(FEATURE_KEYS.DOCUMENTS)} documents`,
  );
});

test('every request of a reading is a GET', { skip }, async () => {
  const methods = [];
  const client = new PaperlessClient({
    url,
    token,
    request: async (target, options) => {
      methods.push(options.method ?? 'GET');
      const { httpRequest } = await import('../../src/paperless/http.js');
      return httpRequest(target, options);
    },
  });
  await client.getStatistics();
  await client.tasks(['failure'], { unacknowledged: true });
  await client.documentsAddedSince(new Date(Date.now() - 86_400_000), 25);
  assert.ok(methods.length >= 3);
  assert.ok(methods.every((method) => method === 'GET'));
});
