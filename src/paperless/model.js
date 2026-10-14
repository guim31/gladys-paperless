// -----------------------------------------------------------------------------
// From the Paperless-ngx answers to plain snapshots. Both API generations
// (2.x: version 9, 3.x: version 10, see client.js) end up in the same shapes,
// so nothing else in the integration knows about them.
//
// Field names checked on real servers (2.20.6 and 3.3.1) and on the fixtures
// of pypaperless (MIT) and of the Home Assistant integration (Apache-2.0).
// -----------------------------------------------------------------------------

const count = (value) => (Number.isInteger(value) && value >= 0 ? value : null);

/**
 * GET /api/statistics/
 * `documents_inbox` is null when no inbox tag exists: no inbox, nothing in it.
 */
export function parseStatistics(body) {
  const inboxTags = Array.isArray(body.inbox_tags)
    ? body.inbox_tags.filter(Number.isInteger)
    : Number.isInteger(body.inbox_tag)
      ? [body.inbox_tag]
      : [];
  return {
    documents: count(body.documents_total),
    inbox: inboxTags.length === 0 ? 0 : (count(body.documents_inbox) ?? 0),
    inboxTags,
    correspondents: count(body.correspondent_count),
    documentTypes: count(body.document_type_count),
    tags: count(body.tag_count),
  };
}

/** GET /api/status/ (administrators): free and total storage, in bytes. */
export function parseStatus(body) {
  const bytes = (value) => (Number.isFinite(value) && value >= 0 ? value : null);
  return {
    version: typeof body?.pngx_version === 'string' ? body.pngx_version : null,
    storageFree: bytes(body?.storage?.available),
    storageTotal: bytes(body?.storage?.total),
  };
}

/** Numeric parts of a version, `v2.15.3` → [2, 15, 3]; null when not one. */
export function versionParts(text) {
  const match = typeof text === 'string' ? text.trim().match(/^v?(\d+)\.(\d+)\.(\d+)/) : null;
  return match ? match.slice(1).map(Number) : null;
}

function isNewer(candidate, current) {
  for (let i = 0; i < 3; i += 1) {
    if (candidate[i] !== current[i]) {
      return candidate[i] > current[i];
    }
  }
  return false;
}

/**
 * GET /api/remote_version/ — `0.0.0` when the server could not ask GitHub
 * (update check failed or blocked): unknown, not "up to date".
 * @param {object} body
 * @param {string|null} installed the version the server runs
 * @returns {{ latest: string, updateAvailable: boolean }|null}
 */
export function parseRemoteVersion(body, installed) {
  const latest = versionParts(body?.version);
  if (!latest || latest.every((part) => part === 0)) {
    return null;
  }
  const current = versionParts(installed);
  return {
    latest: latest.join('.'),
    updateAvailable: current ? isNewer(latest, current) : body.update_available === true,
  };
}

/** One document of GET /api/documents/?fields=… */
export function parseDocument(body) {
  if (!Number.isInteger(body?.id)) {
    return null;
  }
  const id = (value) => (Number.isInteger(value) ? value : null);
  return {
    id: body.id,
    title: typeof body.title === 'string' && body.title.trim() ? body.title.trim() : null,
    correspondent: id(body.correspondent),
    documentType: id(body.document_type),
    tags: Array.isArray(body.tags) ? body.tags.filter(Number.isInteger) : [],
    added: typeof body.added === 'string' ? body.added : null,
    created: typeof body.created === 'string' ? body.created : null,
  };
}

// The traceback 3.x adds to a failure never leaves the integration; the
// message keeps its first line.
const firstLine = (text) =>
  typeof text === 'string' && text.trim() ? text.trim().split('\n')[0].slice(0, 300) : null;

/**
 * One task of GET /api/tasks/, either generation.
 * v10: { id, task_type, status: 'failure', input_data: { filename }, result_data: { error_message } }
 * v9:  { id, task_name, status: 'FAILURE', task_file_name, result }
 */
export function parseTask(body) {
  if (!Number.isInteger(body?.id) || typeof body.status !== 'string') {
    return null;
  }
  const modern = 'task_type' in body || 'input_data' in body;
  const error = modern
    ? firstLine(body.result_data?.error_message ?? body.result_data?.reason)
    : firstLine(body.result);
  const fileName = modern ? body.input_data?.filename : body.task_file_name;
  return {
    id: body.id,
    status: body.status.toLowerCase(),
    type: (modern ? body.task_type : body.task_name) ?? null,
    fileName: typeof fileName === 'string' && fileName ? fileName : null,
    error,
    createdAt: typeof body.date_created === 'string' ? body.date_created : null,
    doneAt: typeof body.date_done === 'string' ? body.date_done : null,
  };
}
