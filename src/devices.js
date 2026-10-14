// -----------------------------------------------------------------------------
// One Gladys device per Paperless-ngx instance.
//
// Identity: the configuration slot (always 1 today), not the address:
// switching from an IP to a host name, or from HTTP to HTTPS, keeps the device
// and its history. Paperless-ngx exposes no stable instance id to use instead.
//
// Features (category/type couples of the core table, see
// test/gladys-rules.test.js):
//   - online: input/binary, 1 when Paperless-ngx answers;
//   - documents, inbox, added today, correspondents, document types, tags,
//     tasks in progress, failed tasks: counter-sensor/integer;
//   - free storage: data/size in gigabytes (administrator token only);
//   - update available: input/binary, published only when the server knows
//     its latest release (it asks GitHub; nothing when that check fails);
//   - version: text/text.
//
// Published with should_poll: false: the integration reads Paperless-ngx on its
// own timer (src/hub.js), at the interval chosen in the configuration.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES,
  DEVICE_FEATURE_TYPES,
  DEVICE_FEATURE_UNITS,
} from '@gladysassistant/integration-sdk';

export const DEVICE_TYPE = 'paperless';
export const URL_PARAM = 'PAPERLESS_URL';
export const DEVICE_NAME = 'Paperless-ngx';

// The configuration holds one instance; its slot is part of the external ids.
export const SLOT = 1;

// Suffixes of the feature external ids: permanent once published.
export const FEATURE_KEYS = Object.freeze({
  ONLINE: 'online',
  DOCUMENTS: 'documents_total',
  INBOX: 'documents_inbox',
  ADDED_TODAY: 'documents_added_today',
  TASKS_RUNNING: 'tasks_in_progress',
  TASKS_FAILED: 'tasks_failed',
  CORRESPONDENTS: 'correspondents',
  DOCUMENT_TYPES: 'document_types',
  TAGS: 'tags',
  STORAGE_FREE: 'storage_free',
  UPDATE: 'update_available',
  VERSION: 'version',
});

// Feature names, in the language chosen in the configuration (Gladys does not
// tell a device integration the user's language). Frozen at creation in
// Gladys. The words are those of the Paperless-ngx interface in each language.
export const NAMES = {
  en: {
    [FEATURE_KEYS.ONLINE]: 'Online',
    [FEATURE_KEYS.DOCUMENTS]: 'Total documents',
    [FEATURE_KEYS.INBOX]: 'Documents in inbox',
    [FEATURE_KEYS.ADDED_TODAY]: 'Documents added today',
    [FEATURE_KEYS.TASKS_RUNNING]: 'Tasks in progress',
    [FEATURE_KEYS.TASKS_FAILED]: 'Failed tasks',
    [FEATURE_KEYS.CORRESPONDENTS]: 'Correspondents',
    [FEATURE_KEYS.DOCUMENT_TYPES]: 'Document types',
    [FEATURE_KEYS.TAGS]: 'Tags',
    [FEATURE_KEYS.STORAGE_FREE]: 'Free storage',
    [FEATURE_KEYS.UPDATE]: 'Update available',
    [FEATURE_KEYS.VERSION]: 'Version',
  },
  fr: {
    [FEATURE_KEYS.ONLINE]: 'En ligne',
    [FEATURE_KEYS.DOCUMENTS]: 'Nombre total de documents',
    [FEATURE_KEYS.INBOX]: 'Documents dans la boîte de réception',
    [FEATURE_KEYS.ADDED_TODAY]: "Documents ajoutés aujourd'hui",
    [FEATURE_KEYS.TASKS_RUNNING]: 'Tâches en cours',
    [FEATURE_KEYS.TASKS_FAILED]: 'Tâches en échec',
    [FEATURE_KEYS.CORRESPONDENTS]: 'Correspondants',
    [FEATURE_KEYS.DOCUMENT_TYPES]: 'Types de document',
    [FEATURE_KEYS.TAGS]: 'Étiquettes',
    [FEATURE_KEYS.STORAGE_FREE]: 'Stockage libre',
    [FEATURE_KEYS.UPDATE]: 'Mise à jour disponible',
    [FEATURE_KEYS.VERSION]: 'Version',
  },
  de: {
    [FEATURE_KEYS.ONLINE]: 'Online',
    [FEATURE_KEYS.DOCUMENTS]: 'Dokumente insgesamt',
    [FEATURE_KEYS.INBOX]: 'Dokumente im Posteingang',
    [FEATURE_KEYS.ADDED_TODAY]: 'Heute hinzugefügte Dokumente',
    [FEATURE_KEYS.TASKS_RUNNING]: 'Laufende Aufgaben',
    [FEATURE_KEYS.TASKS_FAILED]: 'Fehlgeschlagene Aufgaben',
    [FEATURE_KEYS.CORRESPONDENTS]: 'Korrespondenten',
    [FEATURE_KEYS.DOCUMENT_TYPES]: 'Dokumenttypen',
    [FEATURE_KEYS.TAGS]: 'Tags',
    [FEATURE_KEYS.STORAGE_FREE]: 'Freier Speicher',
    [FEATURE_KEYS.UPDATE]: 'Update verfügbar',
    [FEATURE_KEYS.VERSION]: 'Version',
  },
  es: {
    [FEATURE_KEYS.ONLINE]: 'En línea',
    [FEATURE_KEYS.DOCUMENTS]: 'Total de documentos',
    [FEATURE_KEYS.INBOX]: 'Documentos en la bandeja de entrada',
    [FEATURE_KEYS.ADDED_TODAY]: 'Documentos añadidos hoy',
    [FEATURE_KEYS.TASKS_RUNNING]: 'Tareas en curso',
    [FEATURE_KEYS.TASKS_FAILED]: 'Tareas con error',
    [FEATURE_KEYS.CORRESPONDENTS]: 'Interlocutores',
    [FEATURE_KEYS.DOCUMENT_TYPES]: 'Tipos de documento',
    [FEATURE_KEYS.TAGS]: 'Etiquetas',
    [FEATURE_KEYS.STORAGE_FREE]: 'Almacenamiento libre',
    [FEATURE_KEYS.UPDATE]: 'Actualización disponible',
    [FEATURE_KEYS.VERSION]: 'Versión',
  },
};

// Display bounds (the core never applies them on write).
export const BOUNDS = Object.freeze({
  DOCUMENTS_MAX: 10_000_000,
  ITEMS_MAX: 100_000,
  TASKS_MAX: 10_000,
  STORAGE_MAX_GB: 1_000_000,
});

const BYTES_PER_GB = 1e9;

const READ_ONLY = { read_only: true, has_feedback: false };

const binary = () => ({
  category: DEVICE_FEATURE_CATEGORIES.INPUT,
  type: DEVICE_FEATURE_TYPES.SENSOR.BINARY,
  ...READ_ONLY,
  keep_history: true,
  min: 0,
  max: 1,
});

const counter = (max) => ({
  category: DEVICE_FEATURE_CATEGORIES.COUNTER_SENSOR,
  type: DEVICE_FEATURE_TYPES.SENSOR.INTEGER,
  ...READ_ONLY,
  keep_history: true,
  min: 0,
  max,
});

const binaryOf = (value) => (value === true ? 1 : value === false ? 0 : null);

/**
 * Order = display order in Gladys. `value(snapshot)` answers a number, a
 * `{ text }` for a text feature, or null (nothing to publish).
 */
const FEATURES = [
  {
    key: FEATURE_KEYS.ONLINE,
    definition: binary(),
    value: (s) => binaryOf(s.reachable),
  },
  {
    key: FEATURE_KEYS.DOCUMENTS,
    definition: counter(BOUNDS.DOCUMENTS_MAX),
    value: (s) => s.statistics?.documents ?? null,
  },
  {
    key: FEATURE_KEYS.INBOX,
    definition: counter(BOUNDS.DOCUMENTS_MAX),
    value: (s) => s.statistics?.inbox ?? null,
  },
  {
    key: FEATURE_KEYS.ADDED_TODAY,
    definition: counter(BOUNDS.DOCUMENTS_MAX),
    value: (s) => s.addedToday ?? null,
  },
  {
    key: FEATURE_KEYS.TASKS_RUNNING,
    definition: counter(BOUNDS.TASKS_MAX),
    value: (s) => s.tasksRunning ?? null,
  },
  {
    key: FEATURE_KEYS.TASKS_FAILED,
    definition: counter(BOUNDS.TASKS_MAX),
    value: (s) => s.tasksFailed ?? null,
  },
  {
    key: FEATURE_KEYS.CORRESPONDENTS,
    definition: counter(BOUNDS.ITEMS_MAX),
    value: (s) => s.statistics?.correspondents ?? null,
  },
  {
    key: FEATURE_KEYS.DOCUMENT_TYPES,
    definition: counter(BOUNDS.ITEMS_MAX),
    value: (s) => s.statistics?.documentTypes ?? null,
  },
  {
    key: FEATURE_KEYS.TAGS,
    definition: counter(BOUNDS.ITEMS_MAX),
    value: (s) => s.statistics?.tags ?? null,
  },
  {
    key: FEATURE_KEYS.STORAGE_FREE,
    definition: {
      category: DEVICE_FEATURE_CATEGORIES.DATA,
      type: DEVICE_FEATURE_TYPES.DATA.SIZE,
      unit: DEVICE_FEATURE_UNITS.GIGABYTE,
      ...READ_ONLY,
      keep_history: true,
      min: 0,
      max: BOUNDS.STORAGE_MAX_GB,
    },
    value: (s) => {
      const bytes = s.status?.storageFree;
      return typeof bytes === 'number' ? Math.round((bytes / BYTES_PER_GB) * 100) / 100 : null;
    },
  },
  {
    key: FEATURE_KEYS.UPDATE,
    definition: binary(),
    value: (s) => binaryOf(s.remote?.updateAvailable),
  },
  {
    key: FEATURE_KEYS.VERSION,
    // min/max are NOT NULL in Gladys, text features included.
    definition: {
      category: DEVICE_FEATURE_CATEGORIES.TEXT,
      type: DEVICE_FEATURE_TYPES.TEXT.TEXT,
      ...READ_ONLY,
      keep_history: false,
      min: 0,
      max: 0,
    },
    value: (s) => (s.version ? { text: s.version } : null),
  },
];

/** External ids of the instance's device and features. */
export const deviceIds = (gladys, slot = SLOT) => gladys.externalIds(DEVICE_TYPE, String(slot));

/** Whether a device external id is ours. */
export const isOurDevice = (gladys, externalId) => deviceIds(gladys).device === externalId;

/**
 * The discovery payload of the instance.
 * @param {object} gladys SDK client
 * @param {string} url base URL of Paperless-ngx
 * @param {string} language feature names language
 */
export function buildDevice(gladys, url, language = 'en') {
  const ids = deviceIds(gladys);
  const names = NAMES[language] ?? NAMES.en;
  return {
    name: DEVICE_NAME,
    external_id: ids.device,
    should_poll: false,
    params: [{ name: URL_PARAM, value: url }],
    features: FEATURES.map(({ key, definition }) => ({
      ...definition,
      name: names[key],
      external_id: ids.feature(key),
    })),
  };
}

/**
 * The states of every feature for a snapshot, in the publishStates format;
 * the features with nothing to say are left out.
 */
export function featureStates(gladys, snapshot) {
  const ids = deviceIds(gladys);
  const states = [];
  for (const { key, value } of FEATURES) {
    const result = value(snapshot);
    if (result === null || result === undefined) {
      continue;
    }
    states.push(
      typeof result === 'object'
        ? { device_feature_external_id: ids.feature(key), text: result.text }
        : { device_feature_external_id: ids.feature(key), state: result },
    );
  }
  return states;
}
