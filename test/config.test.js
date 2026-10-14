import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG, normalizeConfig, parseServerUrl } from '../src/config.js';

test('the address typed or copied from the browser becomes a base URL', () => {
  const cases = [
    ['192.0.2.10:8000', 'http://192.0.2.10:8000'],
    ['  http://192.0.2.10:8000/  ', 'http://192.0.2.10:8000'],
    ['https://paperless.example/dashboard', 'https://paperless.example'],
    ['https://paperless.example/documents/12/details', 'https://paperless.example'],
    ['https://paperless.example/api/', 'https://paperless.example'],
    ['https://nas.example/paperless/', 'https://nas.example/paperless'],
    ['https://nas.example/paperless/dashboard', 'https://nas.example/paperless'],
    ['HTTPS://Paperless.Example:8443', 'https://paperless.example:8443'],
  ];
  for (const [typed, expected] of cases) {
    assert.equal(parseServerUrl(typed), expected, typed);
  }
});

test('unusable addresses are refused, credentials included', () => {
  for (const typed of [
    '',
    '   ',
    'ftp://192.0.2.10',
    'http://',
    'http://user:pass@192.0.2.10',
    42,
  ]) {
    assert.equal(parseServerUrl(typed), null, String(typed));
  }
});

test('defaults: nothing configured, one minute, update check on, French', () => {
  assert.deepEqual(normalizeConfig(), {
    url: null,
    invalidUrl: false,
    token: '',
    allowSelfSigned: false,
    pollIntervalMs: 60_000,
    checkUpdates: true,
    language: 'fr',
  });
  assert.deepEqual(normalizeConfig(DEFAULT_CONFIG), normalizeConfig({}));
});

test('normalization of every field', () => {
  const config = normalizeConfig({
    url: 'paperless.example:8000',
    token: '  Token abcdef0123  ',
    allow_self_signed: 'true',
    poll_interval: 300,
    check_updates: false,
    language: 'de',
  });
  assert.deepEqual(config, {
    url: 'http://paperless.example:8000',
    invalidUrl: false,
    token: 'abcdef0123',
    allowSelfSigned: true,
    pollIntervalMs: 300_000,
    checkUpdates: false,
    language: 'de',
  });
  assert.equal(normalizeConfig({ poll_interval: '7' }).pollIntervalMs, 60_000);
  assert.equal(normalizeConfig({ language: 'it' }).language, 'fr');
  assert.equal(normalizeConfig({ url: 'ftp://x' }).invalidUrl, true);
});
