// -----------------------------------------------------------------------------
// The Paperless-ngx hub: reads the instance on a timer of the container (the
// interval chosen in the configuration), publishes its states to Gladys when
// they change, and fires the scene events: a new document, a document with a
// given tag, a processing that failed.
//
// Gladys never polls this device (should_poll: false): the core does not poll
// external devices reliably (GladysAssistant/Gladys#3198, not fixed in 5.2.1),
// and the scene events must fire even when the device was not added. The
// core's onPoll stays as a fallback: it reads only when the timer has not
// read for half an interval.
//
// Read only: every request is a GET (src/paperless/client.js).
// -----------------------------------------------------------------------------

import { DEVICE_TRANSPORTS, createLogger } from '@gladysassistant/integration-sdk';
import { hostOf } from './config.js';
import { buildDevice, deviceIds, featureStates, isOurDevice } from './devices.js';
import { createIssueLog } from './issues.js';
import { ERROR_KINDS, PaperlessClient } from './paperless/client.js';
import {
  parseDocument,
  parseRemoteVersion,
  parseStatistics,
  parseStatus,
  parseTask,
} from './paperless/model.js';
import { CONNECTION_TEXT, ERROR_TEXT, REPORT_TEXT, pick } from './texts.js';

const logger = createLogger({ name: 'paperless-hub' });

export const WIDGET_KEY = 'inbox';

// Scene trigger keys (manifest `scene_triggers`): permanent once published.
export const TRIGGERS = Object.freeze({
  DOCUMENT_ADDED: 'document_added',
  DOCUMENT_TAGGED: 'document_tagged',
  PROCESSING_FAILED: 'processing_failed',
});

export const HUB_TIMINGS = {
  // /api/status/ asks the database, Redis and Celery: read it less often.
  statusMs: 10 * 60_000,
  // /api/remote_version/ makes Paperless-ngx ask GitHub (cached 15 min there).
  remoteVersionMs: 6 * 3600_000,
  // Names of correspondents, document types and tags are cached this long.
  namesMs: 3600_000,
  // A reading that fails is tried again this soon, to tell a blip from an outage.
  retryMs: 15_000,
  // Failures in a row before Paperless-ngx counts as offline.
  downAfterFailures: 2,
  // An unchanged value is published again this often (Gladys shows "no recent
  // value" past 48 h).
  heartbeatMs: 12 * 3600_000,
  // Documents and failures older than this are not announced to the scenes
  // (after a long stop of the integration, say), and new documents are
  // looked for among the ones added within it.
  announceWindowMs: 24 * 3600_000,
};

// Newest documents read per cycle to find the new ones.
export const NEW_DOCUMENTS_PAGE = 25;
// Scene events per cycle at most, per trigger: a bulk import does not start
// a scene a hundred times.
export const MAX_EVENTS_PER_CYCLE = 10;
// Failed tasks remembered as already announced.
const MAX_ANNOUNCED_FAILURES = 200;
// Inbox documents read for the widget, at most.
export const INBOX_PAGE = 8;

const UNREACHABLE_KINDS = new Set([
  ERROR_KINDS.UNREACHABLE,
  ERROR_KINDS.TLS,
  ERROR_KINDS.REDIRECT,
  ERROR_KINDS.NOT_PAPERLESS,
  ERROR_KINDS.HTTP,
]);

const emptySnapshot = () => ({
  reachable: null,
  statistics: null,
  addedToday: null,
  tasksRunning: null,
  tasksFailed: null,
  status: null,
  remote: null,
  version: null,
});

/** Local midnight of the day of `now` (the supervisor sets TZ to Gladys' zone). */
export function startOfDay(now) {
  const day = new Date(now);
  day.setHours(0, 0, 0, 0);
  return day;
}

const signature = (config) => JSON.stringify([config.url, config.token, config.allowSelfSigned]);

export class PaperlessHub {
  /**
   * @param {object} options
   * @param {object} options.gladys GladysIntegration (or the SDK's fake Gladys)
   * @param {object} options.store persistence (src/store.js)
   * @param {Function} [options.request] HTTP seam (src/paperless/http.js)
   * @param {boolean} [options.timers] periodic timers (off in tests)
   * @param {object} [options.timings] HUB_TIMINGS overrides
   * @param {() => number} [options.now]
   */
  constructor({ gladys, store, request, timers = true, timings, now }) {
    this.gladys = gladys;
    this.store = store;
    this.request = request;
    this.timersEnabled = timers;
    this.timings = { ...HUB_TIMINGS, ...timings };
    this.now = now ?? (() => Date.now());
    this.issues = createIssueLog(logger);
    this.config = null;
    this.client = null;
    this.signature = null;
    this.resetInstance();
    this.saved = { url: null, lastDocumentId: null, announcedFailures: null };
    this.transport = null;
    this.connection = null;
    this.pollTimer = null;
    this.retryTimer = null;
    this.polling = null;
    this.lastPollAt = null;
    this.stopped = false;
  }

  /** Everything learnt from the instance: forgotten when another one is configured. */
  resetInstance() {
    this.snapshot = emptySnapshot();
    this.error = null;
    this.failures = 0;
    this.downSince = null;
    this.everConnected = false;
    this.statusAt = 0;
    this.statusForbidden = false;
    this.remoteAt = 0;
    this.names = { at: 0, correspondents: new Map(), document_types: new Map(), tags: new Map() };
    this.inbox = null;
  }

  // --- Lifecycle -------------------------------------------------------------

  async start(config) {
    const saved = await this.store.load();
    this.saved = {
      url: typeof saved.url === 'string' ? saved.url : null,
      lastDocumentId: Number.isInteger(saved.lastDocumentId) ? saved.lastDocumentId : null,
      announcedFailures: Array.isArray(saved.announcedFailures)
        ? saved.announcedFailures.filter(Number.isInteger)
        : null,
    };
    await this.reconfigure(config);
  }

  /** Gladys reconnected (it restarted): send everything again. */
  async resync(config) {
    this.gladys.forgetPublishedStates();
    this.transport = null;
    this.connection = null;
    await this.reconfigure(config);
  }

  async reconfigure(config) {
    this.config = config;
    const next = config.url && config.token ? signature(config) : null;
    if (next !== this.signature) {
      this.signature = next;
      this.client = next
        ? new PaperlessClient({
            url: config.url,
            token: config.token,
            insecure: config.allowSelfSigned,
            request: this.request,
          })
        : null;
      this.resetInstance();
      this.gladys.forgetPublishedStates();
      this.transport = null;
      if (config.url && this.saved.url !== config.url) {
        // Another instance: its documents and tasks are not the ones announced.
        this.saved = { url: config.url, lastDocumentId: null, announcedFailures: null };
      }
    }
    await this.publishDevices();
    if (this.client) {
      await this.pollNow();
    } else {
      await this.publishConnectionStatus();
    }
    this.schedulePoll();
  }

  async stop() {
    this.stopped = true;
    clearTimeout(this.pollTimer);
    clearTimeout(this.retryTimer);
    await this.polling?.catch(() => {});
    await this.store.flush();
  }

  schedulePoll() {
    clearTimeout(this.pollTimer);
    this.pollTimer = null;
    if (!this.timersEnabled || this.stopped || !this.client) {
      return;
    }
    this.pollTimer = setTimeout(async () => {
      this.pollTimer = null;
      try {
        await this.pollNow();
        this.issues.ok('poll', 'Reading cycle works again');
      } catch (err) {
        this.issues.fail('poll', `Reading cycle failed (${err.message})`);
      }
      this.schedulePoll();
    }, this.config.pollIntervalMs);
  }

  scheduleRetry() {
    clearTimeout(this.retryTimer);
    if (!this.timersEnabled || this.stopped) {
      return;
    }
    this.retryTimer = setTimeout(() => {
      this.pollNow().catch((err) => this.issues.fail('retry', `Retry failed (${err.message})`));
    }, this.timings.retryMs);
    this.retryTimer.unref?.();
  }

  // --- Devices -----------------------------------------------------------------

  async publishDevices() {
    // Even an empty list: the Discovery tab then shows no stale instance.
    const devices = this.config.url
      ? [buildDevice(this.gladys, this.config.url, this.config.language)]
      : [];
    await this.gladys.publishDiscoveredDevices(devices);
  }

  /** "Search" in the Discovery tab: publish the device again, read the instance. */
  async rediscover() {
    await this.publishDevices();
    if (this.client) {
      await this.pollNow();
    }
  }

  /** The user added the device: the SDK forgot its states, send them all now. */
  async onDeviceCreated(device) {
    if (!isOurDevice(this.gladys, device.external_id)) {
      return;
    }
    await this.publishStates();
    this.gladys.requestWidgetRefresh(WIDGET_KEY);
  }

  /** Gladys asks for a refresh (onPoll): read now, unless the timer just did. */
  async pollDevice(device) {
    if (!isOurDevice(this.gladys, device.external_id) || !this.client) {
      return;
    }
    if (this.lastPollAt !== null && this.now() - this.lastPollAt < this.config.pollIntervalMs / 2) {
      logger.debug('onPoll skipped: read less than half an interval ago');
      return;
    }
    await this.pollNow();
  }

  // --- Reading ---------------------------------------------------------------------

  /** Read the instance now and apply what changed. Concurrent calls share the read. */
  pollNow() {
    if (!this.client) {
      return Promise.resolve();
    }
    // A reading of a previous configuration is not shared: its result is
    // dropped (see cycle), the new instance is read now.
    if (this.polling?.client !== this.client) {
      const promise = this.cycle().finally(() => {
        if (this.polling === promise) {
          this.polling = null;
        }
      });
      promise.client = this.client;
      this.polling = promise;
    }
    return this.polling;
  }

  async cycle() {
    const client = this.client;
    this.lastPollAt = this.now();
    let reading;
    try {
      reading = await this.read(client);
    } catch (err) {
      if (!err.kind) {
        throw err;
      }
      if (client === this.client) {
        await this.applyFailure(err);
      }
      return;
    }
    if (client === this.client) {
      await this.applySuccess(reading);
    }
  }

  async read(client) {
    const now = this.now();
    const statistics = parseStatistics(await client.getStatistics());
    const statusDue = !this.statusForbidden && now - this.statusAt >= this.timings.statusMs;
    const remoteDue =
      this.config.checkUpdates && now - this.remoteAt >= this.timings.remoteVersionMs;
    const [today, recent, running, failed, status, remote] = await Promise.all([
      client.documentsAddedSince(startOfDay(now), 1),
      client.documentsAddedSince(new Date(now - this.timings.announceWindowMs), NEW_DOCUMENTS_PAGE),
      client.tasks(['pending', 'started'], { pageSize: 1 }),
      client.tasks(['failure'], { unacknowledged: true, pageSize: NEW_DOCUMENTS_PAGE }),
      statusDue ? this.readStatus(client) : undefined,
      remoteDue ? this.readRemoteVersion(client) : undefined,
    ]);
    return {
      statistics,
      addedToday: today.count,
      recent: recent.results.map(parseDocument).filter(Boolean),
      tasksRunning: running.count,
      tasksFailed: failed.count,
      failures: failed.results.map(parseTask).filter((task) => task && task.status === 'failure'),
      status,
      remote,
      version: client.version,
    };
  }

  /** Storage: administrators only. A 403 is remembered, not retried every cycle. */
  async readStatus(client) {
    this.statusAt = this.now();
    try {
      const status = parseStatus(await client.getStatus());
      this.issues.ok('status', 'System status readable again');
      return status;
    } catch (err) {
      if (err.kind === ERROR_KINDS.FORBIDDEN) {
        this.statusForbidden = true;
        logger.info('The API token is not an administrator one: free storage left out');
        return null;
      }
      if (!err.kind) {
        throw err;
      }
      this.issues.fail('status', `System status unreadable (${err.message})`);
      return undefined;
    }
  }

  async readRemoteVersion(client) {
    this.remoteAt = this.now();
    try {
      return await client.getRemoteVersion();
    } catch (err) {
      if (!err.kind) {
        throw err;
      }
      this.issues.fail('remote-version', `Update check failed (${err.message})`);
      return undefined;
    }
  }

  async applySuccess(reading) {
    const previous = this.snapshot;
    if (this.downSince !== null && this.snapshot.reachable === false) {
      const minutes = Math.round((this.now() - this.downSince) / 60_000);
      logger.info(`Paperless-ngx answers again after ${minutes} min`);
    } else if (this.error) {
      logger.info('Paperless-ngx: connection restored');
    } else if (!this.everConnected) {
      logger.info(
        `Connected to Paperless-ngx ${reading.version ?? '?'} at ${hostOf(this.config.url)}`,
      );
    }
    if (previous.version && reading.version && previous.version !== reading.version) {
      logger.info(`Paperless-ngx updated from ${previous.version} to ${reading.version}`);
    }
    this.everConnected = true;
    this.error = null;
    this.failures = 0;
    this.downSince = null;
    clearTimeout(this.retryTimer);

    const version = reading.version ?? reading.status?.version ?? previous.version;
    let remote = previous.remote;
    if (reading.remote !== undefined) {
      remote = parseRemoteVersion(reading.remote, version);
      if (remote) {
        this.issues.ok('remote-version', 'Update check works again');
      } else {
        // 0.0.0: the server could not reach GitHub (or the check is blocked).
        logger.debug('Latest Paperless-ngx release unknown to the server');
      }
    } else if (!this.config.checkUpdates) {
      remote = null;
    }
    if (remote?.updateAvailable && remote.latest !== previous.remote?.latest) {
      logger.info(`Paperless-ngx ${remote.latest} is available`);
    }

    this.snapshot = {
      reachable: true,
      statistics: reading.statistics,
      addedToday: reading.addedToday,
      tasksRunning: reading.tasksRunning,
      tasksFailed: reading.tasksFailed,
      status:
        reading.status === undefined
          ? previous.status
          : reading.status === null
            ? null
            : reading.status,
      remote,
      version,
    };

    const announced = await this.announceDocuments(reading.recent);
    const failed = await this.announceFailures(reading.failures);
    await this.publishStates();
    await this.publishTransport();
    await this.publishConnectionStatus();

    const widgetChanged =
      previous.reachable !== true ||
      previous.statistics?.inbox !== reading.statistics.inbox ||
      previous.addedToday !== reading.addedToday ||
      previous.tasksFailed !== reading.tasksFailed ||
      previous.tasksRunning !== reading.tasksRunning ||
      announced > 0 ||
      failed > 0;
    if (widgetChanged) {
      this.inbox = null;
      this.gladys.requestWidgetRefresh(WIDGET_KEY);
    }
  }

  async applyFailure(err) {
    const previousKind = this.error?.kind;
    this.error = { kind: err.kind, message: err.message };
    // One warning when the problem starts (or changes), not one per reading.
    if (previousKind !== err.kind) {
      logger.warn(`Paperless-ngx at ${hostOf(this.config.url)}: ${err.message}`);
    } else {
      logger.debug(`Paperless-ngx: ${err.message} (again)`);
    }
    if (UNREACHABLE_KINDS.has(err.kind)) {
      this.failures += 1;
      if (this.failures === 1) {
        this.downSince = this.now();
        this.scheduleRetry();
      }
      if (this.failures >= this.timings.downAfterFailures) {
        this.snapshot = { ...this.snapshot, reachable: false };
      }
    } else {
      // A refused token is a configuration problem: Paperless-ngx answers.
      this.failures = 0;
      this.downSince = null;
    }
    await this.publishStates();
    await this.publishTransport();
    await this.publishConnectionStatus();
    if (previousKind !== err.kind) {
      this.gladys.requestWidgetRefresh(WIDGET_KEY);
    }
  }

  // --- Scene events ------------------------------------------------------------------

  /** The documents never seen before; the first reading only sets the baseline. */
  async announceDocuments(documents) {
    const newest = documents.reduce((max, doc) => Math.max(max, doc.id), 0);
    const { lastDocumentId } = this.saved;
    if (lastDocumentId === null) {
      this.saved.lastDocumentId = newest;
      this.saveState();
      logger.debug(`New documents counted from id ${newest}`);
      return 0;
    }
    const fresh = documents
      .filter((doc) => doc.id > lastDocumentId && this.isRecent(doc.added))
      .sort((a, b) => a.id - b.id)
      .slice(-MAX_EVENTS_PER_CYCLE);
    if (newest <= lastDocumentId) {
      return 0;
    }
    if (fresh.length > 0) {
      try {
        await this.resolveNames(fresh);
      } catch (err) {
        if (!err.kind) {
          throw err;
        }
        // Without the names, a scene filtering on a correspondent would miss
        // the event: try again at the next reading.
        this.issues.fail('names', `Names of the new documents unreadable (${err.message})`);
        return 0;
      }
      this.issues.ok('names', 'Names of the new documents readable again');
      for (const doc of fresh) {
        await this.fireDocument(doc);
      }
    }
    this.saved.lastDocumentId = newest;
    this.saveState();
    return fresh.length;
  }

  async announceFailures(failures) {
    const ids = failures.map((task) => task.id);
    if (this.saved.announcedFailures === null) {
      this.saved.announcedFailures = ids.slice(0, MAX_ANNOUNCED_FAILURES);
      this.saveState();
      return 0;
    }
    const known = new Set(this.saved.announcedFailures);
    const fresh = failures
      .filter((task) => !known.has(task.id) && this.isRecent(task.doneAt ?? task.createdAt))
      .sort((a, b) => a.id - b.id)
      .slice(-MAX_EVENTS_PER_CYCLE);
    const unseen = ids.filter((id) => !known.has(id));
    if (unseen.length === 0) {
      return 0;
    }
    for (const task of fresh) {
      await this.fire(TRIGGERS.PROCESSING_FAILED, {
        file_name: task.fileName ?? '',
        error: task.error ?? '',
      });
      logger.debug(`Processing failed: task ${task.id}`);
    }
    this.saved.announcedFailures = [...unseen, ...this.saved.announcedFailures].slice(
      0,
      MAX_ANNOUNCED_FAILURES,
    );
    this.saveState();
    return fresh.length;
  }

  isRecent(isoDate) {
    const at = Date.parse(isoDate ?? '');
    return Number.isFinite(at) && this.now() - at <= this.timings.announceWindowMs;
  }

  saveState() {
    this.store.save(this.saved);
  }

  /** Fetch the names the documents refer to and the cache does not hold. */
  async resolveNames(documents) {
    if (this.now() - this.names.at >= this.timings.namesMs) {
      this.names = {
        at: this.now(),
        correspondents: new Map(),
        document_types: new Map(),
        tags: new Map(),
      };
    }
    const wanted = {
      correspondents: documents.map((doc) => doc.correspondent),
      document_types: documents.map((doc) => doc.documentType),
      tags: documents.flatMap((doc) => doc.tags),
    };
    await Promise.all(
      Object.entries(wanted).map(async ([kind, ids]) => {
        const missing = [...new Set(ids.filter((id) => id !== null && !this.names[kind].has(id)))];
        const found = await this.client.names(kind, missing);
        for (const id of missing) {
          // A name the token may not read stays unknown, and is not asked again.
          this.names[kind].set(id, found.get(id) ?? null);
        }
      }),
    );
  }

  nameOf(kind, id) {
    return id === null ? null : (this.names[kind].get(id) ?? null);
  }

  /** Link to a document in the Paperless-ngx web interface. */
  documentUrl(id) {
    return `${this.config.url}/documents/${id}/details`;
  }

  async fireDocument(doc) {
    const tags = doc.tags.map((id) => this.nameOf('tags', id)).filter(Boolean);
    const data = {
      title: doc.title ?? `#${doc.id}`,
      correspondent: this.nameOf('correspondents', doc.correspondent),
      document_type: this.nameOf('document_types', doc.documentType),
      tags: tags.join(', '),
      document_id: doc.id,
      url: this.documentUrl(doc.id),
    };
    logger.debug(`New document ${doc.id}`);
    await this.fire(TRIGGERS.DOCUMENT_ADDED, data);
    for (const tag of tags) {
      await this.fire(TRIGGERS.DOCUMENT_TAGGED, { ...data, tag });
    }
  }

  async fire(key, data) {
    try {
      await this.gladys.publishSceneEvent(key, data);
      this.issues.ok('scene-event', 'Scene events accepted again');
    } catch (err) {
      this.issues.fail('scene-event', `Scene event ${key} refused (${err.message})`);
    }
  }

  // --- Publishing to Gladys ----------------------------------------------------------

  async publishStates() {
    const states = featureStates(this.gladys, this.snapshot);
    if (states.length === 0) {
      return;
    }
    try {
      // Only what changed (300 states a minute at most, and every state
      // re-evaluates the scenes), plus every value once per heartbeat.
      await this.gladys.publishChangedStates(states, { heartbeat: this.timings.heartbeatMs });
      this.issues.ok('states', 'States accepted again');
    } catch (err) {
      this.issues.fail('states', `States refused (${err.message})`);
    }
  }

  async publishTransport() {
    const { reachable } = this.snapshot;
    if (reachable === null) {
      return;
    }
    const transport = reachable ? DEVICE_TRANSPORTS.LOCAL : DEVICE_TRANSPORTS.UNREACHABLE;
    if (this.transport === transport) {
      return;
    }
    try {
      await this.gladys.publishTransports([
        { external_id: deviceIds(this.gladys).device, transport },
      ]);
      this.transport = transport;
      this.issues.ok('transports', 'Transports accepted again');
    } catch (err) {
      this.issues.fail('transports', `Transports refused (${err.message})`);
    }
  }

  /** The status under the integration name. */
  connectionStatus() {
    const { url, token, invalidUrl } = this.config;
    if (invalidUrl) {
      return { connected: false, message: CONNECTION_TEXT.invalidUrl };
    }
    if (!url) {
      return { connected: false, message: CONNECTION_TEXT.noServer };
    }
    if (!token) {
      return { connected: false, message: CONNECTION_TEXT.noToken };
    }
    if (this.error) {
      return { connected: false, message: ERROR_TEXT[this.error.kind] };
    }
    return { connected: this.everConnected };
  }

  async publishConnectionStatus() {
    const status = this.connectionStatus();
    const key = JSON.stringify(status);
    if (key === this.connection) {
      return;
    }
    try {
      await this.gladys.setConnectionStatus(status.connected, status.message);
      this.connection = key;
      this.issues.ok('connection-status', 'Connection status accepted again');
    } catch (err) {
      this.issues.fail('connection-status', `Connection status refused (${err.message})`);
    }
  }

  // --- Reports and widget ---------------------------------------------------------------

  /** "Test the connection": read now, answer a short report in every language. */
  async testConnection() {
    logger.info('Connection test requested');
    await this.pollNow();
    const status = this.connectionStatus();
    const message = {};
    for (const [language, text] of Object.entries(REPORT_TEXT)) {
      if (!status.connected) {
        message[language] = pick(status.message, language);
        continue;
      }
      const {
        statistics,
        tasksRunning,
        tasksFailed,
        status: system,
        remote,
        version,
      } = this.snapshot;
      const lines = [
        text.ok(version ?? '?'),
        text.documents(statistics.documents, statistics.inbox),
        text.tasks(tasksRunning, tasksFailed),
      ];
      if (system === null) {
        lines.push(text.noStatus);
      }
      if (remote?.updateAvailable) {
        lines.push(text.update(remote.latest));
      }
      message[language] = lines.join('\n');
    }
    return message;
  }

  /**
   * What the inbox widget shows: the figures of the last reading, and the
   * newest documents of the inbox (read on demand, cached until the next
   * change or half an interval).
   * @param {number} limit documents wanted
   */
  async inboxView(limit) {
    const { statistics } = this.snapshot;
    const view = {
      configured: Boolean(this.client),
      error: this.error,
      reachable: this.snapshot.reachable,
      statistics,
      addedToday: this.snapshot.addedToday,
      tasksFailed: this.snapshot.tasksFailed,
      tasksRunning: this.snapshot.tasksRunning,
      documents: null,
      url: this.config?.url ?? null,
    };
    if (!this.client || !statistics || this.error) {
      return view;
    }
    if (statistics.inboxTags.length === 0 || statistics.inbox === 0) {
      view.documents = [];
      return view;
    }
    const fresh =
      this.inbox && this.now() - this.inbox.at < this.config.pollIntervalMs / 2
        ? this.inbox.documents
        : null;
    if (fresh) {
      view.documents = fresh.slice(0, limit);
      return view;
    }
    try {
      const { results } = await this.client.inboxDocuments(statistics.inboxTags, INBOX_PAGE);
      const documents = results.map(parseDocument).filter(Boolean);
      await this.resolveNames(documents);
      this.inbox = {
        at: this.now(),
        documents: documents.map((doc) => ({
          ...doc,
          correspondentName: this.nameOf('correspondents', doc.correspondent),
          documentTypeName: this.nameOf('document_types', doc.documentType),
        })),
      };
      this.issues.ok('inbox', 'Inbox readable again');
      view.documents = this.inbox.documents.slice(0, limit);
    } catch (err) {
      if (!err.kind) {
        throw err;
      }
      this.issues.fail('inbox', `Inbox unreadable (${err.message})`);
    }
    return view;
  }
}
