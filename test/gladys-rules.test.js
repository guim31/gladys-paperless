// -----------------------------------------------------------------------------
// Conformity with the Gladys core, on the device discovered from realistic
// servers (shapes recorded on real Paperless-ngx 3.3.1 and 2.20.6): both API
// generations, administrator token or not, before and after a first reading,
// in every feature-name language.
//
// The table (test/fixtures/gladys-feature-table.json) is extracted from the
// core code: a category/type couple missing there shows as "undefined" or
// without icon in Gladys, a poll frequency outside its list is a 400 on
// discovery, a feature without min/max is a 422 on "Add to Gladys".
// Do not loosen this test to make it pass: fix the integration.
// (Adapted from guim31/gladys-wled.)
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createClock, createWorld, defaultConfig, seededServer } from './helpers/world.js';

const table = JSON.parse(
  await readFile(new URL('./fixtures/gladys-feature-table.json', import.meta.url), 'utf8'),
);

const scenarios = [
  { label: 'Paperless-ngx 3.x', generation: 3, config: defaultConfig() },
  { label: 'Paperless-ngx 2.x', generation: 2, config: defaultConfig() },
  { label: 'not an administrator', generation: 3, admin: false, config: defaultConfig() },
  { label: 'unreachable', generation: 3, offline: true, config: defaultConfig() },
  { label: 'French names', generation: 3, config: defaultConfig({ language: 'fr' }) },
  { label: 'German names', generation: 2, config: defaultConfig({ language: 'de' }) },
  { label: 'Spanish names', generation: 3, config: defaultConfig({ language: 'es' }) },
];

for (const scenario of scenarios) {
  test(`every discovered device follows the Gladys rules (${scenario.label})`, async () => {
    const clock = createClock();
    const server = seededServer(clock, {
      generation: scenario.generation,
      admin: scenario.admin ?? true,
    });
    server.remoteVersion = '9.9.9';
    server.online = !scenario.offline;
    const { gladys, app } = await createWorld({ clock, server, config: scenario.config });
    try {
      const devices = gladys.fake.discoveredDevices;
      assert.equal(devices.length, 1, 'one device per instance');

      for (const device of devices) {
        const where = device.name;

        // should_poll: true if and only if poll_frequency is provided, in ms.
        if (device.poll_frequency === undefined) {
          assert.notEqual(device.should_poll, true, `${where}: should_poll without poll_frequency`);
        } else {
          assert.equal(device.should_poll, true, `${where}: poll_frequency without should_poll`);
          assert.ok(
            table.poll_frequencies_ms.includes(device.poll_frequency),
            `${where}: poll_frequency ${device.poll_frequency} is not one of ${table.poll_frequencies_ms}`,
          );
        }

        assert.ok(device.features.length > 0, `${where}: no feature`);
        const externalIds = new Set();
        const names = new Set();
        for (const feature of device.features) {
          const at = `${where} / ${feature.name}`;
          const pair = table.pairs[`${feature.category}/${feature.type}`];
          assert.ok(
            pair,
            `${at}: ${feature.category}/${feature.type} is not a couple Gladys knows`,
          );
          assert.ok(
            pair.label_en && pair.label_fr && pair.icon,
            `${at}: couple without label or icon`,
          );

          assert.equal(typeof feature.min, 'number', `${at}: min must be a number`);
          assert.equal(typeof feature.max, 'number', `${at}: max must be a number`);
          assert.ok(
            Number.isFinite(feature.min) && Number.isFinite(feature.max),
            `${at}: finite min/max`,
          );
          assert.ok(feature.min <= feature.max, `${at}: min > max`);
          assert.equal(typeof feature.read_only, 'boolean', `${at}: read_only must be a boolean`);
          assert.equal(
            typeof feature.has_feedback,
            'boolean',
            `${at}: has_feedback must be a boolean`,
          );
          if (feature.unit !== undefined) {
            assert.ok(table.units.includes(feature.unit), `${at}: unknown unit ${feature.unit}`);
          }

          assert.ok(!externalIds.has(feature.external_id), `${at}: duplicate external_id`);
          externalIds.add(feature.external_id);
          assert.ok(!names.has(feature.name), `${at}: duplicate feature name on the device`);
          names.add(feature.name);

          // The value read from the server fits the declared bounds.
          const value = gladys.fake.lastState(feature.external_id);
          if (value === undefined) {
            continue; // nothing known (offline, storage without admin token)
          }
          if (feature.category === 'text') {
            assert.equal(typeof value, 'string', `${at}: a text feature publishes a text`);
            assert.ok(value.length > 0, `${at}: an empty text is ignored by Gladys`);
            continue;
          }
          assert.equal(typeof value, 'number', `${at}: ${value} is not a number`);
          assert.ok(value >= feature.min && value <= feature.max, `${at}: ${value} out of bounds`);
          if (feature.type === 'integer' || feature.type === 'binary') {
            assert.ok(Number.isInteger(value), `${at}: ${value} is not an integer`);
          }
        }
      }
    } finally {
      await app.stop();
    }
  });
}
