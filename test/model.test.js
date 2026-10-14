// -----------------------------------------------------------------------------
// The parsers against real answers: recorded on Paperless-ngx 3.3.1 and
// 2.20.6, and published by the Home Assistant integration (Apache-2.0) and
// pypaperless (MIT), see test/fixtures/paperless/README.md.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseDocument,
  parseRemoteVersion,
  parseStatistics,
  parseStatus,
  parseTask,
  versionParts,
} from '../src/paperless/model.js';
import { fixture } from './helpers/fakePaperless.js';

test('statistics of both generations and of the published fixtures', () => {
  assert.deepEqual(parseStatistics(fixture('real-3.3.1/statistics').body), {
    documents: 3,
    inbox: 3,
    inboxTags: [1],
    correspondents: 2,
    documentTypes: 2,
    tags: 3,
  });
  assert.equal(parseStatistics(fixture('real-2.20.6/statistics').body).documents, 2);
  assert.deepEqual(parseStatistics(fixture('home-assistant/test_data_statistic')), {
    documents: 999,
    inbox: 9,
    inboxTags: [9],
    correspondents: 99,
    documentTypes: 99,
    tags: 99,
  });
  assert.equal(parseStatistics(fixture('pypaperless/statistics')).documents, 1337);
});

test('no inbox tag: an inbox of 0, not unknown', () => {
  const stats = parseStatistics({
    documents_total: 0,
    documents_inbox: null,
    inbox_tag: null,
    inbox_tags: null,
    tag_count: 0,
    correspondent_count: 0,
    document_type_count: 0,
  });
  assert.equal(stats.inbox, 0);
  assert.deepEqual(stats.inboxTags, []);
});

test('status: storage and version', () => {
  assert.deepEqual(parseStatus(fixture('real-3.3.1/status').body), {
    version: '3.3.1',
    storageFree: 25519181824,
    storageTotal: 270553174016,
  });
  assert.equal(parseStatus(fixture('home-assistant/test_data_status')).storageFree, 25376927744);
  assert.equal(parseStatus(fixture('pypaperless/status')).version, '2.6.1');
  assert.deepEqual(parseStatus({}), { version: null, storageFree: null, storageTotal: null });
});

test('remote version: newer, same, unknown (0.0.0)', () => {
  assert.deepEqual(
    parseRemoteVersion(fixture('home-assistant/test_data_remote_version'), '2.15.3'),
    {
      latest: '2.3.0',
      updateAvailable: false,
    },
  );
  assert.deepEqual(parseRemoteVersion({ version: 'v3.4.0', update_available: true }, '3.3.1'), {
    latest: '3.4.0',
    updateAvailable: true,
  });
  assert.equal(parseRemoteVersion(fixture('real-3.3.1/remote_version').body, '3.3.1'), null);
  assert.equal(
    parseRemoteVersion(fixture('home-assistant/test_data_remote_version_unavailable'), '2.15.3'),
    null,
  );
  assert.deepEqual(versionParts('v2.15.3'), [2, 15, 3]);
  assert.equal(versionParts('main'), null);
});

test('documents of both generations', () => {
  const [newest] = fixture('real-3.3.1/documents_recent').body.results.map(parseDocument);
  assert.deepEqual(newest, {
    id: 3,
    title: 'doc2',
    correspondent: null,
    documentType: null,
    tags: [1, 3],
    added: '2026-10-14T19:24:10.718444Z',
    created: '2026-10-14',
  });
  const [legacy] = fixture('real-2.20.6/documents_recent').body.results.map(parseDocument);
  assert.equal(legacy.title, 'Facture EDF novembre');
  assert.equal(legacy.correspondent, 1);
  const docs = fixture('pypaperless/documents').results.map(parseDocument);
  assert.deepEqual(docs[1].tags, [1]);
  assert.equal(parseDocument({ title: 'no id' }), null);
});

test('failed tasks of both generations read the same', () => {
  const [modern] = fixture('real-3.3.1/tasks_failed').body.results.map(parseTask);
  const [legacy] = fixture('real-2.20.6/tasks_failed').body.map(parseTask);
  for (const task of [modern, legacy]) {
    assert.equal(task.status, 'failure');
    assert.equal(task.type, 'consume_file');
    assert.match(task.fileName, /^broken2?\.pdf$/);
    assert.match(task.error, /Error occurred while consuming document/);
    assert.ok(!task.error.includes('Traceback') && !task.error.includes('\n'));
    assert.ok(Date.parse(task.doneAt) > 0);
  }
  const tasks = fixture('pypaperless/tasks').results.map(parseTask);
  assert.deepEqual(
    tasks.map((task) => [task.status, task.fileName]),
    [
      ['started', 'a.png'],
      ['success', 'b.png'],
      ['success', null],
    ],
  );
  assert.equal(parseTask({ id: 1 }), null);
});
