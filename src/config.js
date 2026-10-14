// -----------------------------------------------------------------------------
// Integration configuration: defaults (they mirror the `default` values of the
// manifest `config_schema`, see test/manifest.test.js) and normalization, so
// the rest of the code never deals with strings, blanks or `undefined`.
//
// One Paperless-ngx instance: its address and an API token.
// -----------------------------------------------------------------------------

export const LANGUAGES = ['en', 'fr', 'de', 'es'];

// Refresh intervals offered in the configuration, in seconds.
export const POLL_INTERVALS = ['30', '60', '120', '300'];

export const DEFAULT_CONFIG = {
  url: '',
  token: '',
  allow_self_signed: false,
  poll_interval: '60',
  check_updates: true,
  language: 'fr',
};

/**
 * Parse the address typed by the user into a base URL: a bare host or IP
 * (`192.0.2.10:8000`), or the URL copied from the browser
 * (`https://paperless.example/dashboard`). HTTP by default. A sub-path is
 * kept (Paperless-ngx can be served under one, PAPERLESS_FORCE_SCRIPT_NAME),
 * but the page the user was on (`/dashboard`, `/documents/…`, `/api/…`) is
 * dropped.
 * @param {unknown} raw
 * @returns {string|null} `http(s)://host[:port][/path]`, without a trailing slash; null when unusable
 */
export function parseServerUrl(raw) {
  if (typeof raw !== 'string') {
    return null;
  }
  const text = raw.trim();
  if (!text) {
    return null;
  }
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `http://${text}`;
  let url;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) {
    return null;
  }
  // Credentials in the address would end up in the logs and the device params.
  if (url.username || url.password) {
    return null;
  }
  const path = url.pathname
    .replace(/\/(dashboard|documents|api|view|tags|tasks|settings)(\/.*)?$/, '')
    .replace(/\/+$/, '');
  return `${url.origin}${path}`;
}

/** Host part shown to the user (no scheme). */
export const hostOf = (url) => url.replace(/^https?:\/\//, '');

/**
 * @param {Record<string, unknown>} raw the configuration returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const text = (key) => (typeof source[key] === 'string' ? source[key].trim() : '');
  const pick = (key, list) => {
    const value = source[key] === undefined || source[key] === null ? '' : String(source[key]);
    return list.includes(value) ? value : DEFAULT_CONFIG[key];
  };
  const flag = (key) =>
    source[key] === undefined || source[key] === null || source[key] === ''
      ? DEFAULT_CONFIG[key]
      : source[key] === true || source[key] === 'true';

  const typedUrl = text('url');
  const url = parseServerUrl(typedUrl);
  // A token copied with "Token " in front (as in the API documentation) still works.
  const token = text('token').replace(/^token\s+/i, '');

  return {
    url,
    invalidUrl: typedUrl !== '' && url === null,
    token,
    allowSelfSigned: flag('allow_self_signed'),
    pollIntervalMs: Number(pick('poll_interval', POLL_INTERVALS)) * 1000,
    checkUpdates: flag('check_updates'),
    language: LANGUAGES.includes(source.language) ? source.language : DEFAULT_CONFIG.language,
  };
}
