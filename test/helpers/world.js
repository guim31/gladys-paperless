// -----------------------------------------------------------------------------
// A complete test world: the SDK's fake Gladys, a fake Paperless-ngx, a
// temporary /data and a manual clock, with the integration wired on top
// through registerHandlers. No timer runs unless `timers: true` (with
// node:test mock timers): the tests read the instance with `world.hub.pollNow()`.
// -----------------------------------------------------------------------------

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { registerHandlers } from '../../src/app.js';
import { Store } from '../../src/store.js';
import { FakePaperless, TOKEN, requestTo } from './fakePaperless.js';

// The integration logs its lifecycle; keep the test output readable.
process.env.LOG_LEVEL ??= 'silent';

export const URL_1 = 'http://192.0.2.10:8000';

/** A manual clock, shared by the hub and the fake server. */
export function createClock(start = Date.UTC(2026, 9, 14, 10, 0, 0)) {
  const clock = {
    time: start,
    now: () => clock.time,
    advance(ms) {
      clock.time += ms;
    },
  };
  return clock;
}

export const defaultConfig = (extra = {}) => ({
  url: URL_1,
  token: TOKEN,
  language: 'en',
  ...extra,
});

/**
 * @param {object} [options]
 * @param {FakePaperless} [options.server]
 * @param {object} [options.config] raw integration config
 * @param {Array} [options.devices] devices already created in Gladys
 * @param {boolean} [options.connect]
 */
export async function createWorld({
  clock = createClock(),
  server,
  config = defaultConfig(),
  devices = [],
  connect = true,
  dataDir = mkdtempSync(join(tmpdir(), 'gladys-paperless-')),
  timings = {},
  timers = false,
} = {}) {
  const paperless = server ?? seededServer(clock);
  const gladys = createFakeGladys({ config, devices });
  const app = registerHandlers(gladys, {
    store: new Store(dataDir),
    request: requestTo(paperless),
    timers,
    timings,
    now: clock.now,
  });
  if (connect) {
    await gladys.connect();
    await app.ready;
  }
  return { gladys, fake: gladys.fake, app, hub: app.hub, clock, dataDir, server: paperless };
}

/** A Paperless-ngx with three documents of the day and one failed scan. */
export function seededServer(clock, options = {}) {
  const server = new FakePaperless({ now: clock.now, ...options });
  server.addDocument({
    title: 'Facture EDF octobre 2026',
    correspondent: 1,
    documentType: 1,
    tags: [2],
  });
  server.addDocument({ title: 'Relevé septembre', correspondent: 2, documentType: 2 });
  server.addDocument({ title: 'Note', tags: [3] });
  server.failConsumption('broken.pdf');
  return server;
}

/** External ids of the device and of a feature. */
export const deviceId = (gladys) => gladys.externalIds('paperless', '1').device;
export const featureId = (gladys, key) => gladys.externalIds('paperless', '1').feature(key);

/** Add the discovered device in Gladys, as the user would. */
export async function createAll(world) {
  for (const device of world.fake.discoveredDevices) {
    await world.fake.deviceCreated(device);
  }
}

export { FakePaperless, TOKEN };
