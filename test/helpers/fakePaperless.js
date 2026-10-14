// -----------------------------------------------------------------------------
// An in-memory Paperless-ngx behind the `request` seam of the client
// (src/paperless/http.js). It answers the endpoints the integration reads, in
// the shape of either API generation — 3.x (version 10) or 2.x (version 9) —
// as recorded on real servers (test/fixtures/paperless/real-*), and
// test/fake-paperless.test.js keeps both shapes in step with those
// recordings. Token, administrator rights, an offline server and a server
// that answers HTML are part of it.
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';

export const fixture = (path) =>
  JSON.parse(readFileSync(new URL(`../fixtures/paperless/${path}.json`, import.meta.url), 'utf8'));

export const TOKEN = 'test-token-0123456789abcdef';

const json = (status, body, headers = {}) => ({
  status,
  headers: { 'content-type': 'application/json', ...headers },
  body: JSON.stringify(body),
});

const V2_STATUS = {
  pending: 'PENDING',
  started: 'STARTED',
  success: 'SUCCESS',
  failure: 'FAILURE',
};

export class FakePaperless {
  /**
   * @param {object} [options]
   * @param {2|3} [options.generation] 3: API version 10, 2: API version 9
   * @param {string} [options.token]
   * @param {boolean} [options.admin] whether the token may read /api/status/
   * @param {() => number} [options.now]
   */
  constructor({ generation = 3, token = TOKEN, admin = true, now = () => Date.now() } = {}) {
    this.generation = generation;
    this.version = generation === 3 ? '3.3.1' : '2.20.6';
    this.apiVersion = generation === 3 ? 10 : 9;
    this.token = token;
    this.admin = admin;
    this.now = now;
    this.online = true;
    this.html = false; // a web page answers instead of the API
    this.failNext = null; // an HTTP status for the next request
    this.remoteVersion = '0.0.0';
    this.storage = { total: 270553174016, available: 25520160768 };
    this.correspondents = [
      { id: 1, name: 'EDF' },
      { id: 2, name: 'Banque Exemple' },
    ];
    this.documentTypes = [
      { id: 1, name: 'Facture' },
      { id: 2, name: 'Relevé' },
    ];
    this.tags = [
      { id: 1, name: 'Inbox', is_inbox_tag: true },
      { id: 2, name: 'Urgent', is_inbox_tag: false },
      { id: 3, name: 'Maison', is_inbox_tag: false },
    ];
    this.documents = [];
    this.tasks = [];
    this.requests = [];
  }

  // --- What happens in Paperless-ngx --------------------------------------------

  /** A document is consumed: it gets the inbox tags, like Paperless-ngx does. */
  addDocument({ title, correspondent = null, documentType = null, tags = [], added } = {}) {
    const id = (this.documents.at(-1)?.id ?? 0) + 1;
    const inbox = this.tags.filter((tag) => tag.is_inbox_tag).map((tag) => tag.id);
    const at = new Date(added ?? this.now()).toISOString();
    this.documents.push({
      id,
      correspondent,
      document_type: documentType,
      title: title ?? `scan-${id}`,
      tags: [...new Set([...inbox, ...tags])].sort((a, b) => a - b),
      created: at.slice(0, 10),
      added: at,
    });
    this.addTask({ status: 'success', fileName: `scan-${id}.pdf`, documentId: id });
    return id;
  }

  /** A task: `failure` with an error, `started`, `pending` or `success`. */
  addTask({
    status,
    fileName = 'scan.pdf',
    error = null,
    documentId = null,
    type = 'consume_file',
  }) {
    const id = (this.tasks.at(-1)?.id ?? 0) + 1;
    const at = new Date(this.now()).toISOString();
    this.tasks.push({
      id,
      status,
      type,
      fileName,
      error,
      documentId,
      acknowledged: false,
      created: at,
      done: ['success', 'failure'].includes(status) ? at : null,
    });
    return id;
  }

  failConsumption(fileName = 'broken.pdf') {
    return this.addTask({
      status: 'failure',
      fileName,
      error: `${fileName}: Error occurred while consuming document ${fileName}: InputFileError: `,
    });
  }

  /** The user dismisses the task in the Paperless-ngx interface. */
  acknowledge(taskId) {
    this.tasks.find((task) => task.id === taskId).acknowledged = true;
  }

  // --- HTTP ---------------------------------------------------------------------------

  /** The `request` seam: (url, options) → { status, headers, body }. */
  async handle(url, options = {}) {
    const target = new URL(url);
    this.requests.push({ path: target.pathname, query: target.searchParams, options });
    if (!this.online) {
      const error = new Error('connect ECONNREFUSED');
      error.code = 'ECONNREFUSED';
      throw error;
    }
    if (this.html) {
      return { status: 200, headers: { 'content-type': 'text/html' }, body: '<html></html>' };
    }
    if (this.failNext) {
      const status = this.failNext;
      this.failNext = null;
      return json(status, { detail: 'error' });
    }
    const path = target.pathname.replace(/^.*\/api\//, '');
    const auth = options.headers?.authorization;
    if (auth !== `Token ${this.token}`) {
      return json(401, {
        detail: auth ? 'Invalid token.' : 'Authentication credentials were not provided.',
      });
    }
    const headers = { 'x-api-version': String(this.apiVersion), 'x-version': this.version };
    const answer = this.route(path, target.searchParams);
    return answer.status
      ? { ...answer, headers: { ...answer.headers, ...headers } }
      : json(200, answer, headers);
  }

  route(path, query) {
    switch (path) {
      case 'statistics/':
        return this.statistics();
      case 'status/':
        return this.admin
          ? this.status()
          : {
              status: 403,
              headers: { 'content-type': 'text/html' },
              body: 'Insufficient permissions',
            };
      case 'remote_version/':
        return {
          version: this.remoteVersion,
          update_available: this.remoteVersion !== '0.0.0' && this.remoteVersion > this.version,
        };
      case 'documents/':
        return this.documentList(query);
      case 'tasks/':
        return this.taskList(query);
      case 'correspondents/':
        return this.named(this.correspondents, query);
      case 'document_types/':
        return this.named(this.documentTypes, query);
      case 'tags/':
        return this.named(this.tags, query);
      default:
        return json(404, { detail: 'Not found.' });
    }
  }

  statistics() {
    const inboxTags = this.tags.filter((tag) => tag.is_inbox_tag).map((tag) => tag.id);
    return {
      documents_total: this.documents.length,
      documents_inbox: inboxTags.length
        ? this.documents.filter((doc) => doc.tags.some((id) => inboxTags.includes(id))).length
        : null,
      inbox_tag: inboxTags[0] ?? null,
      inbox_tags: inboxTags.length ? inboxTags : null,
      document_file_type_counts: this.documents.length
        ? [{ mime_type: 'application/pdf', mime_type_count: this.documents.length }]
        : [],
      character_count: this.documents.length * 40,
      tag_count: this.tags.length,
      correspondent_count: this.correspondents.length,
      document_type_count: this.documentTypes.length,
      storage_path_count: 0,
      current_asn: 0,
    };
  }

  status() {
    const body = structuredClone(fixture(`real-${this.version}/status`).body);
    body.pngx_version = this.version;
    body.storage = { ...this.storage };
    return body;
  }

  /** A page of results, the 2.x way (with every id in `all`) or the 3.x way. */
  page(items, query, extra = {}) {
    const size = Number(query.get('page_size') ?? 25);
    const results = items.slice(0, size);
    return {
      count: items.length,
      next: items.length > size ? 'http://paperless.example:8000/api/…&page=2' : null,
      previous: null,
      ...(this.generation === 2 ? { all: items.map((item) => item.id) } : {}),
      ...extra,
      results,
    };
  }

  documentList(query) {
    let docs = [...this.documents];
    const since = query.get('added__gte');
    if (since) {
      docs = docs.filter((doc) => Date.parse(doc.added) >= Date.parse(since));
    }
    const tagIds = query.get('tags__id__in');
    if (tagIds) {
      const wanted = tagIds.split(',').map(Number);
      docs = docs.filter((doc) => doc.tags.some((id) => wanted.includes(id)));
    }
    const ordering = query.get('ordering');
    if (ordering === '-id') {
      docs.sort((a, b) => b.id - a.id);
    } else if (ordering === '-added') {
      // Same instant: the newest id first (a real database orders ties at random).
      docs.sort((a, b) => Date.parse(b.added) - Date.parse(a.added) || b.id - a.id);
    }
    const fields = query.get('fields')?.split(',');
    const shaped = docs.map((doc) =>
      fields ? Object.fromEntries(fields.filter((f) => f in doc).map((f) => [f, doc[f]])) : doc,
    );
    return this.page(shaped, query);
  }

  taskList(query) {
    const statuses = query.getAll('status');
    const acknowledged = query.get('acknowledged');
    let tasks = [...this.tasks].reverse(); // newest first
    if (acknowledged !== null) {
      tasks = tasks.filter((task) => String(task.acknowledged) === acknowledged);
    }
    if (this.generation === 3) {
      const bad = statuses.find((status) => !Object.keys(V2_STATUS).includes(status));
      if (bad) {
        return json(400, {
          status: [`Select a valid choice. ${bad} is not one of the available choices.`],
        });
      }
      if (statuses.length) {
        tasks = tasks.filter((task) => statuses.includes(task.status));
      }
      return this.page(
        tasks.map((task) => this.v10Task(task)),
        query,
      );
    }
    if (statuses.length > 1) {
      tasks = []; // an exact filter: the last value wins in Django, never two
    }
    const [status] = statuses;
    if (status) {
      if (!Object.values(V2_STATUS).includes(status)) {
        return json(400, {
          status: [`Select a valid choice. ${status} is not one of the available choices.`],
        });
      }
      tasks = tasks.filter((task) => V2_STATUS[task.status] === status);
    }
    return tasks.map((task) => this.v9Task(task));
  }

  v10Task(task) {
    return {
      id: task.id,
      task_id: `00000000-0000-4000-8000-${String(task.id).padStart(12, '0')}`,
      task_type: task.type,
      task_type_display: 'Consume File',
      trigger_source: 'api_upload',
      trigger_source_display: 'API Upload',
      status: task.status,
      status_display: task.status[0].toUpperCase() + task.status.slice(1),
      date_created: task.created,
      date_started: task.created,
      date_done: task.done,
      duration_seconds: task.done ? 0.5 : null,
      wait_time_seconds: 0.4,
      input_data: { filename: task.fileName, mime_type: 'application/pdf', overrides: {} },
      result_data:
        task.status === 'failure'
          ? { error_type: 'ConsumerError', error_message: task.error, traceback: '  File …\n' }
          : task.documentId
            ? { document_id: task.documentId }
            : null,
      related_document_ids: task.documentId ? [task.documentId] : [],
      acknowledged: task.acknowledged,
      owner: 3,
    };
  }

  v9Task(task) {
    return {
      id: task.id,
      task_id: `00000000-0000-4000-8000-${String(task.id).padStart(12, '0')}`,
      task_name: task.type,
      task_file_name: task.fileName,
      date_created: task.created,
      date_done: task.done,
      type: 'auto_task',
      status: V2_STATUS[task.status],
      result:
        task.status === 'failure'
          ? task.error
          : task.documentId
            ? `Success. New document id ${task.documentId} created`
            : null,
      acknowledged: task.acknowledged,
      related_document: task.documentId ? String(task.documentId) : null,
      owner: 3,
    };
  }

  named(items, query) {
    const ids = query.get('id__in')?.split(',').map(Number);
    const found = ids ? items.filter((item) => ids.includes(item.id)) : items;
    const isTag = items === this.tags;
    return this.page(
      found.map((item) => ({
        id: item.id,
        slug: item.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        name: item.name,
        match: '',
        matching_algorithm: 1,
        is_insensitive: true,
        ...(isTag
          ? { color: '#a6cee3', text_color: '#000000', is_inbox_tag: item.is_inbox_tag }
          : {}),
        document_count: this.documents.filter((doc) =>
          [doc.correspondent, doc.document_type, ...doc.tags].includes(item.id),
        ).length,
        owner: 3,
        user_can_change: true,
        ...(isTag ? { parent: null, children: [] } : {}),
      })),
      query,
      // 3.x counts the tags shown in the tree.
      isTag && this.generation === 3 ? { display_count: found.length } : {},
    );
  }
}

/** The `request` seam bound to one fake server, whatever the address. */
export const requestTo = (server) => (url, options) => server.handle(url, options);
