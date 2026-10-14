// -----------------------------------------------------------------------------
// Paperless-ngx REST API client, read only (docs.paperless-ngx.com/api).
//
// Authentication: an API token (Profile → API Auth Token in the web
// interface), sent as `Authorization: Token <token>`. Nothing is ever written:
// every request is a GET.
//
// Two generations of the API, told apart by the `X-Api-Version` header of
// every answer (checked on real servers, 2.20.6 and 3.3.1):
//   - Paperless-ngx 2.x serves version 9 by default (1 to 9 accepted): the task
//     list is a plain array, statuses in capitals (FAILURE, STARTED…);
//   - Paperless-ngx 3.x serves version 10 by default (9 and 10 accepted): the
//     task list is paginated, statuses in lower case, new field names
//     (task_type, input_data, result_data), and a v9 request filtering
//     `status=FAILURE` is refused (400): the filters take the v10 values.
// The client asks for the server's default version and reads both shapes
// (src/paperless/model.js).
//
// What a non-admin token sees: the statistics and the documents it may view,
// its own tasks and the unowned ones; /api/status/ (storage) answers 403.
// -----------------------------------------------------------------------------

import { httpRequest } from './http.js';

export const ERROR_KINDS = Object.freeze({
  UNREACHABLE: 'unreachable', // no answer: down, wrong address, firewall
  TLS: 'tls', // the certificate does not verify (self-signed without the option)
  AUTH: 'auth', // token missing, wrong or of a disabled user (401)
  FORBIDDEN: 'forbidden', // the token's user may not read the statistics (403)
  REDIRECT: 'redirect', // the address redirects: HTTP to HTTPS, or a login portal
  NOT_PAPERLESS: 'not_paperless', // something answers, not the Paperless-ngx API
  HTTP: 'http', // any other HTTP error (5xx: Paperless-ngx itself is in trouble)
});

export class PaperlessError extends Error {
  /**
   * @param {string} kind one of ERROR_KINDS
   * @param {string} message English, for the logs (never contains a secret)
   * @param {object} [extra] { status, location }
   */
  constructor(kind, message, extra = {}) {
    super(message);
    this.name = 'PaperlessError';
    this.kind = kind;
    Object.assign(this, extra);
  }
}

const TLS_CODES = new Set([
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'CERT_HAS_EXPIRED',
  'ERR_TLS_CERT_ALTNAME_INVALID',
]);

function networkError(err) {
  if (TLS_CODES.has(err.code)) {
    return new PaperlessError(ERROR_KINDS.TLS, `Certificate refused (${err.code})`);
  }
  return new PaperlessError(ERROR_KINDS.UNREACHABLE, err.code ? `${err.code}` : err.message);
}

/** A redirect target fit for the logs: no user, password or query string. */
export function safeLocation(location) {
  if (typeof location !== 'string' || location === '') {
    return '?';
  }
  try {
    const url = new URL(location, 'http://relative.invalid');
    return url.host === 'relative.invalid' ? url.pathname : `${url.origin}${url.pathname}`;
  } catch {
    return '?';
  }
}

const header = (headers, name) => {
  const value = headers?.[name];
  return Array.isArray(value) ? value[0] : value;
};

/** Query string from an object; arrays repeat the key (`status=a&status=b`). */
export function queryString(query = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    for (const item of Array.isArray(value) ? value : [value]) {
      if (item !== undefined && item !== null) {
        params.append(key, String(item));
      }
    }
  }
  const text = params.toString();
  return text ? `?${text}` : '';
}

// The fields read from a document: the list stays small (no OCR content).
export const DOCUMENT_FIELDS = 'id,title,correspondent,document_type,tags,created,added';

export class PaperlessClient {
  /**
   * @param {object} options
   * @param {string} options.url base URL, `http(s)://host[:port][/path]`
   * @param {string} options.token API token
   * @param {boolean} [options.insecure] accept a self-signed certificate
   * @param {typeof httpRequest} [options.request] test seam
   * @param {number} [options.timeoutMs]
   */
  constructor({ url, token, insecure = false, request = httpRequest, timeoutMs = 15_000 }) {
    this.url = url;
    this.token = token;
    this.insecure = insecure;
    this.request = request;
    this.timeoutMs = timeoutMs;
    /** API version of the last answer (9 for 2.x, 10 for 3.x), null before. */
    this.apiVersion = null;
    /** Paperless-ngx version of the last answer (`X-Version`), null before. */
    this.version = null;
  }

  /**
   * GET one API path, answer its JSON body.
   * @param {string} path below /api/, with its trailing slash
   * @param {object} [query]
   * @returns {Promise<unknown>}
   */
  async get(path, query) {
    let response;
    try {
      response = await this.request(`${this.url}/api/${path}${queryString(query)}`, {
        headers: {
          accept: 'application/json',
          ...(this.token ? { authorization: `Token ${this.token}` } : {}),
        },
        insecure: this.insecure,
        timeoutMs: this.timeoutMs,
      });
    } catch (err) {
      throw networkError(err);
    }
    const { status } = response;
    if (status === 401) {
      throw new PaperlessError(ERROR_KINDS.AUTH, 'API token refused (HTTP 401)', { status });
    }
    if (status === 403) {
      throw new PaperlessError(ERROR_KINDS.FORBIDDEN, `/api/${path} forbidden (HTTP 403)`, {
        status,
      });
    }
    if (status >= 300 && status < 400) {
      const location = safeLocation(header(response.headers, 'location'));
      throw new PaperlessError(ERROR_KINDS.REDIRECT, `Redirected to ${location}`, {
        status,
        location,
      });
    }
    if (status === 404) {
      throw new PaperlessError(ERROR_KINDS.NOT_PAPERLESS, `No /api/${path} (HTTP 404)`, {
        status,
      });
    }
    if (status < 200 || status >= 300) {
      throw new PaperlessError(ERROR_KINDS.HTTP, `/api/${path} answered HTTP ${status}`, {
        status,
      });
    }
    let body;
    try {
      body = JSON.parse(response.body);
    } catch {
      throw new PaperlessError(ERROR_KINDS.NOT_PAPERLESS, `/api/${path} did not answer JSON`, {
        status,
      });
    }
    const apiVersion = Number(header(response.headers, 'x-api-version'));
    if (Number.isInteger(apiVersion) && apiVersion > 0) {
      this.apiVersion = apiVersion;
    }
    const version = header(response.headers, 'x-version');
    if (typeof version === 'string' && /^[0-9][0-9A-Za-z.+-]{0,30}$/.test(version)) {
      this.version = version;
    }
    return body;
  }

  /** Version 10 and later: paginated tasks, lower-case statuses. */
  get modernTasks() {
    return (this.apiVersion ?? 0) >= 10;
  }

  /** Document counts, inbox, tags, correspondents, types. Every token may read it. */
  async getStatistics() {
    const body = await this.get('statistics/');
    if (!body || typeof body !== 'object' || typeof body.documents_total !== 'number') {
      throw new PaperlessError(ERROR_KINDS.NOT_PAPERLESS, 'No document statistics in the answer');
    }
    return body;
  }

  /** System status (storage, database, task queue): administrators only. */
  getStatus() {
    return this.get('status/');
  }

  /** Latest release, as the server sees it from GitHub (0.0.0 when unknown). */
  getRemoteVersion() {
    return this.get('remote_version/');
  }

  /**
   * Documents added since an instant, newest first.
   * @param {Date} since
   * @param {number} pageSize
   * @returns {Promise<{ count: number, results: object[] }>}
   */
  async documentsAddedSince(since, pageSize) {
    return this.documents({
      added__gte: since.toISOString(),
      ordering: '-id',
      page_size: pageSize,
    });
  }

  /**
   * Documents carrying one of the inbox tags, most recently added first.
   * @param {number[]} tagIds
   * @param {number} pageSize
   */
  async inboxDocuments(tagIds, pageSize) {
    return this.documents({
      tags__id__in: tagIds.join(','),
      ordering: '-added',
      page_size: pageSize,
    });
  }

  async documents(query) {
    const body = await this.get('documents/', { ...query, fields: DOCUMENT_FIELDS });
    if (!body || typeof body.count !== 'number' || !Array.isArray(body.results)) {
      throw new PaperlessError(ERROR_KINDS.NOT_PAPERLESS, 'No document list in the answer');
    }
    return { count: body.count, results: body.results };
  }

  /**
   * Tasks with one of the statuses, newest first. A 2.x server takes one exact
   * status per request and answers every match; a 3.x server several, paginated.
   * @param {Array<'pending'|'started'|'failure'>} statuses
   * @param {object} [options]
   * @param {boolean} [options.unacknowledged] only the ones not dismissed in Paperless
   * @param {number} [options.pageSize] (3.x) results per request
   * @returns {Promise<{ count: number, results: object[] }>}
   */
  async tasks(statuses, { unacknowledged = false, pageSize = 25 } = {}) {
    const acknowledged = unacknowledged ? 'false' : undefined;
    if (this.apiVersion === null) {
      await this.getStatistics(); // learns the API version
    }
    if (this.modernTasks) {
      const body = await this.get('tasks/', {
        status: statuses,
        acknowledged,
        ordering: '-date_created',
        page_size: pageSize,
      });
      if (!body || typeof body.count !== 'number' || !Array.isArray(body.results)) {
        throw new PaperlessError(ERROR_KINDS.NOT_PAPERLESS, 'No task list in the answer');
      }
      return { count: body.count, results: body.results };
    }
    const lists = await Promise.all(
      statuses.map((status) => this.get('tasks/', { status: status.toUpperCase(), acknowledged })),
    );
    if (!lists.every(Array.isArray)) {
      throw new PaperlessError(ERROR_KINDS.NOT_PAPERLESS, 'No task list in the answer');
    }
    const results = lists.flat();
    return { count: results.length, results };
  }

  /**
   * Names of correspondents, document types or tags, by id.
   * @param {'correspondents'|'document_types'|'tags'} kind
   * @param {number[]} ids
   * @returns {Promise<Map<number, string>>}
   */
  async names(kind, ids) {
    const names = new Map();
    if (ids.length === 0) {
      return names;
    }
    const body = await this.get(`${kind}/`, { id__in: ids.join(','), page_size: ids.length });
    for (const item of Array.isArray(body?.results) ? body.results : []) {
      if (Number.isInteger(item?.id) && typeof item.name === 'string') {
        names.set(item.id, item.name);
      }
    }
    return names;
  }
}
