// -----------------------------------------------------------------------------
// Dashboard widget (manifest `widgets`, Gladys 5.1+): `inbox`.
//
// The use case: on the wall tablet, see at a glance whether paperwork waits
// in Paperless-ngx — how many documents still carry an inbox tag, which ones
// arrived last, and whether a scan failed. Read only, like the integration.
//
// Budget (8 components, 6 tiles, 2 texts, 1 focal, 4 buttons): three tiles
// (inbox, added today, failed tasks), the newest inbox documents as a
// `card-list` (3, 5 or 8, from the widget settings), a caption when the inbox
// is empty, and a link button to Paperless-ngx. Links are https only in
// Gladys: an http:// address shows no link at all.
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { WIDGET_KEY } from './hub.js';
import { ERROR_TEXT, pick } from './texts.js';

// Choices of the `count` setting (manifest), as strings like every select value.
export const COUNTS = ['3', '5', '8'];
export const DEFAULT_COUNT = '5';

export const TEXT = {
  configure: {
    en: 'Enter the address of Paperless-ngx and an API token in the configuration of the integration.',
    fr: "Saisissez l'adresse de Paperless-ngx et un jeton d'API dans la configuration de l'intégration.",
    de: 'Gib die Adresse von Paperless-ngx und ein API-Token in der Konfiguration der Integration ein.',
    es: 'Introduzca la dirección de Paperless-ngx y un token de API en la configuración de la integración.',
  },
  waiting: {
    en: 'Waiting for the first reading of Paperless-ngx…',
    fr: 'En attente de la première lecture de Paperless-ngx…',
    de: 'Warte auf die erste Abfrage von Paperless-ngx…',
    es: 'Esperando la primera lectura de Paperless-ngx…',
  },
  empty: {
    en: 'Inbox empty: nothing to sort',
    fr: 'Boîte de réception vide : rien à classer',
    de: 'Posteingang leer: nichts zu sortieren',
    es: 'Bandeja de entrada vacía: nada que clasificar',
  },
  noInboxTag: {
    en: 'No inbox tag in Paperless-ngx',
    fr: 'Aucune étiquette de boîte de réception dans Paperless-ngx',
    de: 'Kein Posteingangs-Tag in Paperless-ngx',
    es: 'Ninguna etiqueta de entrada en Paperless-ngx',
  },
  unreadable: {
    en: 'The inbox documents could not be read',
    fr: 'Les documents de la boîte de réception sont illisibles',
    de: 'Die Dokumente im Posteingang konnten nicht gelesen werden',
    es: 'No se han podido leer los documentos de la bandeja de entrada',
  },
  inbox: { en: 'Inbox', fr: 'À classer', de: 'Posteingang', es: 'Por clasificar' },
  today: { en: 'Added today', fr: "Ajoutés aujourd'hui", de: 'Heute neu', es: 'Añadidos hoy' },
  failed: { en: 'Failed', fr: 'En échec', de: 'Fehlgeschlagen', es: 'Con error' },
  open: {
    en: 'Open Paperless',
    fr: 'Ouvrir Paperless',
    de: 'Paperless öffnen',
    es: 'Abrir Paperless',
  },
  openDocument: {
    en: 'Open in Paperless',
    fr: 'Ouvrir dans Paperless',
    de: 'In Paperless öffnen',
    es: 'Abrir en Paperless',
  },
};

const t = (text, language) => pick(text, language);
const fit = (text, max) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

function message(text, language, ttl = 300) {
  return {
    ttl_seconds: ttl,
    components: [{ type: 'text', variant: 'body', text: t(text, language) }],
  };
}

const isHttps = (url) => typeof url === 'string' && url.startsWith('https://');

/** One row of the inbox list. */
export function inboxItem(doc, url, language) {
  const subtitle = [doc.correspondentName, doc.documentTypeName].filter(Boolean).join(' · ');
  const item = { title: fit(doc.title ?? `#${doc.id}`, 60) };
  if (subtitle) {
    item.subtitle = fit(subtitle, 60);
  } else if (doc.added) {
    item.date = doc.added;
  }
  if (isHttps(url)) {
    item.links = [
      { url: `${url}/documents/${doc.id}/details`, label: t(TEXT.openDocument, language) },
    ];
  }
  return item;
}

async function get(hub, { settings, language = 'en' }) {
  const count = Number(COUNTS.includes(String(settings?.count)) ? settings.count : DEFAULT_COUNT);
  const view = await hub.inboxView(count);
  if (!view.configured) {
    return message(TEXT.configure, language);
  }
  if (view.error) {
    return message(ERROR_TEXT[view.error.kind], language, 60);
  }
  if (!view.statistics) {
    return message(TEXT.waiting, language, 30);
  }
  const { statistics } = view;
  const components = [
    {
      type: 'value',
      value: statistics.inbox,
      label: t(TEXT.inbox, language),
      icon: 'inbox',
      color: statistics.inbox > 0 ? WIDGET_COLORS.PRIMARY : WIDGET_COLORS.NEUTRAL,
    },
    {
      type: 'value',
      value: view.addedToday ?? 0,
      label: t(TEXT.today, language),
      icon: 'file-plus',
    },
    {
      type: 'value',
      value: view.tasksFailed ?? 0,
      label: t(TEXT.failed, language),
      icon: 'alert-triangle',
      color: view.tasksFailed > 0 ? WIDGET_COLORS.DANGER : WIDGET_COLORS.SUCCESS,
    },
  ];
  if (statistics.inboxTags.length === 0) {
    components.push({ type: 'text', variant: 'caption', text: t(TEXT.noInboxTag, language) });
  } else if (view.documents === null) {
    components.push({ type: 'text', variant: 'caption', text: t(TEXT.unreadable, language) });
  } else if (view.documents.length === 0) {
    components.push({ type: 'text', variant: 'caption', text: t(TEXT.empty, language) });
  } else {
    components.push({
      type: 'card-list',
      display: 'list',
      items: view.documents.map((doc) => inboxItem(doc, view.url, language)),
    });
  }
  if (isHttps(view.url)) {
    components.push({
      type: 'button',
      label: t(TEXT.open, language),
      icon: 'external-link',
      link: { url: `${view.url}/dashboard`, label: t(TEXT.open, language) },
    });
  }
  // The hub nudges the widget on every change; the TTL is a safety net.
  return { ttl_seconds: 300, components };
}

export const WIDGETS = {
  [WIDGET_KEY]: { get },
};
