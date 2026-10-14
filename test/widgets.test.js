// -----------------------------------------------------------------------------
// The inbox widget: content accepted as is by the core (validateWidgetContent
// of the SDK finds nothing to drop), the budget, the https-only links, the
// empty and degraded states, and the refresh nudges.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { WIDGET_KEY } from '../src/hub.js';
import { TEXT } from '../src/widgets.js';
import {
  FakePaperless,
  createClock,
  createWorld,
  defaultConfig,
  seededServer,
} from './helpers/world.js';

async function world(t, options = {}) {
  const clock = createClock();
  const server = options.server ?? seededServer(clock);
  const w = await createWorld({ clock, server, ...options });
  t.after(() => w.app.stop());
  return w;
}

async function content(w, settings = {}, language = 'en') {
  const ack = await w.fake.widgetGet(WIDGET_KEY, { settings, language });
  assert.equal(ack.success, true, ack.error);
  const { content: body } = ack.data;
  assert.deepEqual(validateWidgetContent(body), [], 'rendered exactly as sent');
  return body;
}

const ofType = (body, type) => body.components.filter((c) => c.type === type);

test('three tiles and the newest inbox documents, newest first', async (t) => {
  const w = await world(t);
  const body = await content(w);
  assert.deepEqual(
    ofType(body, 'value').map((tile) => [tile.label, tile.value]),
    [
      ['Inbox', 3],
      ['Added today', 3],
      ['Failed', 1],
    ],
  );
  const [list] = ofType(body, 'card-list');
  assert.deepEqual(
    list.items.map((item) => [item.title, item.subtitle]),
    [
      ['Note', undefined],
      ['Relevé septembre', 'Banque Exemple · Relevé'],
      ['Facture EDF octobre 2026', 'EDF · Facture'],
    ],
  );
  assert.ok(list.items[0].date, 'no correspondent: the date instead');
  assert.equal(list.items[0].links, undefined, 'http: no link (Gladys allows https only)');
  assert.equal(ofType(body, 'button').length, 0);
});

test('an https address adds the links to the documents and to Paperless-ngx', async (t) => {
  const w = await world(t, { config: defaultConfig({ url: 'https://paperless.example' }) });
  const body = await content(w, {}, 'fr');
  const [list] = ofType(body, 'card-list');
  assert.deepEqual(list.items[2].links, [
    { url: 'https://paperless.example/documents/1/details', label: 'Ouvrir dans Paperless' },
  ]);
  const [button] = ofType(body, 'button');
  assert.deepEqual(button.link, {
    url: 'https://paperless.example/dashboard',
    label: 'Ouvrir Paperless',
  });
});

test('the number of documents follows the widget setting', async (t) => {
  const clock = createClock();
  const server = seededServer(clock);
  for (let i = 0; i < 10; i += 1) {
    server.addDocument({ title: `Scan ${i}` });
  }
  const w = await world(t, { clock, server });
  for (const [count, expected] of [
    ['3', 3],
    ['8', 8],
    [undefined, 5],
    ['42', 5],
  ]) {
    const [list] = ofType(await content(w, { count }), 'card-list');
    assert.equal(list.items.length, expected, `count ${count}`);
  }
  // One reading for all of them: the inbox is cached.
  assert.equal(server.requests.filter((r) => r.query.get('tags__id__in')).length, 1);
});

test('an empty inbox, and no inbox tag at all', async (t) => {
  const clock = createClock();
  const server = new FakePaperless({ now: clock.now });
  const w = await world(t, { clock, server });
  let body = await content(w);
  assert.deepEqual(
    ofType(body, 'text').map((c) => c.text),
    [TEXT.empty.en],
  );

  server.tags = server.tags.filter((tag) => !tag.is_inbox_tag);
  w.clock.advance(60_000);
  await w.hub.pollNow();
  body = await content(w, {}, 'de');
  assert.deepEqual(
    ofType(body, 'text').map((c) => c.text),
    [TEXT.noInboxTag.de],
  );
});

test('every length fits the core bounds, long titles included', async (t) => {
  const clock = createClock();
  const server = seededServer(clock);
  server.correspondents[0].name = 'Électricité de France, service clients particuliers, agence';
  server.addDocument({ title: 'x'.repeat(200), correspondent: 1, documentType: 1 });
  const w = await world(t, { clock, server });
  for (const language of ['en', 'fr', 'de', 'es']) {
    const body = await content(w, { count: '8' }, language);
    const [list] = ofType(body, 'card-list');
    assert.equal(list.items[0].title.length, 60);
    assert.ok(list.items[0].subtitle.length <= 60);
  }
});

test('not configured, unreachable, refused token: a sentence instead', async (t) => {
  const empty = await world(t, { config: {} });
  assert.deepEqual(ofType(await content(empty), 'text')[0].text, TEXT.configure.en);

  const clock = createClock();
  const server = seededServer(clock);
  const w = await world(t, { clock, server });
  server.online = false;
  await w.hub.pollNow();
  assert.match(ofType(await content(w, {}, 'es'), 'text')[0].text, /no responde/);

  const refused = await world(t, { config: defaultConfig({ token: 'nope' }) });
  assert.match(ofType(await content(refused), 'text')[0].text, /token refused/);
});

test('the widget is nudged when the inbox changes, not at every reading', async (t) => {
  const w = await world(t);
  const nudges = () => w.fake.widgetRefreshes.length;
  const before = nudges();
  await w.hub.pollNow();
  assert.equal(nudges(), before);
  w.server.addDocument({ title: 'New scan' });
  await w.hub.pollNow();
  assert.equal(nudges(), before + 1);
  const [list] = ofType(await content(w), 'card-list');
  assert.equal(list.items[0].title, 'New scan', 'the cache was dropped');
});
