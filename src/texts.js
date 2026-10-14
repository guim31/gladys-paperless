// -----------------------------------------------------------------------------
// Texts the integration sends to Gladys outside the widget (src/widgets.js):
// connection status, errors, the "Test the connection" report. Four
// languages, the four of the Gladys interface; German says "du", Spanish
// "usted". test/i18n.test.js checks every table.
// -----------------------------------------------------------------------------

import { ERROR_KINDS } from './paperless/client.js';

export const INIT_FAILED = {
  en: 'Initialization failed, check the integration logs.',
  fr: "L'initialisation a échoué, consultez les logs de l'intégration.",
  de: 'Initialisierung fehlgeschlagen, sieh dir die Protokolle der Integration an.',
  es: 'La inicialización ha fallado, consulte los registros de la integración.',
};

export const CONNECTION_TEXT = {
  noServer: {
    en: 'Enter the address of Paperless-ngx and an API token in the configuration.',
    fr: "Saisissez l'adresse de Paperless-ngx et un jeton d'API dans la configuration.",
    de: 'Gib die Adresse von Paperless-ngx und ein API-Token in der Konfiguration ein.',
    es: 'Introduzca la dirección de Paperless-ngx y un token de API en la configuración.',
  },
  noToken: {
    en: 'Enter an API token: Paperless-ngx → My profile → API Auth Token.',
    fr: "Saisissez un jeton d'API : Paperless-ngx → Mon profil → Jeton d'authentification d'API.",
    de: 'Gib ein API-Token ein: Paperless-ngx → Mein Profil → API-Authentifizierungstoken.',
    es: 'Introduzca un token de API: Paperless-ngx → Mi Perfil → Token de autenticación de la API.',
  },
  invalidUrl: {
    en: 'Address not understood, e.g. http://192.168.1.2:8000',
    fr: 'Adresse incomprise, ex. http://192.168.1.2:8000',
    de: 'Adresse nicht verstanden, z. B. http://192.168.1.2:8000',
    es: 'Dirección no válida, p. ej. http://192.168.1.2:8000',
  },
};

// One short explanation per error kind (src/paperless/client.js).
export const ERROR_TEXT = {
  [ERROR_KINDS.UNREACHABLE]: {
    en: 'Paperless-ngx does not answer',
    fr: 'Paperless-ngx ne répond pas',
    de: 'Paperless-ngx antwortet nicht',
    es: 'Paperless-ngx no responde',
  },
  [ERROR_KINDS.TLS]: {
    en: 'certificate refused: tick "Accept self-signed certificates"',
    fr: 'certificat refusé : cochez « Accepter les certificats auto-signés »',
    de: 'Zertifikat abgelehnt: Aktiviere „Selbstsignierte Zertifikate akzeptieren“',
    es: 'certificado rechazado: marque «Aceptar certificados autofirmados»',
  },
  [ERROR_KINDS.AUTH]: {
    en: 'API token refused: copy it again from your profile',
    fr: "jeton d'API refusé : recopiez-le depuis votre profil",
    de: 'API-Token abgelehnt: Kopiere es erneut aus deinem Profil',
    es: 'token de API rechazado: cópielo de nuevo desde su perfil',
  },
  [ERROR_KINDS.FORBIDDEN]: {
    en: 'this user may not read the statistics of Paperless-ngx',
    fr: "cet utilisateur n'a pas le droit de lire les statistiques de Paperless-ngx",
    de: 'dieser Benutzer darf die Statistiken von Paperless-ngx nicht lesen',
    es: 'este usuario no tiene permiso para leer las estadísticas de Paperless-ngx',
  },
  [ERROR_KINDS.REDIRECT]: {
    en: 'the address redirects: enter the https:// address, without a login portal',
    fr: "l'adresse redirige : saisissez l'adresse en https://, sans portail de connexion",
    de: 'die Adresse leitet um: Gib die https://-Adresse ein, ohne Anmeldeportal',
    es: 'la dirección redirige: introduzca la dirección https://, sin portal de acceso',
  },
  [ERROR_KINDS.NOT_PAPERLESS]: {
    en: 'no Paperless-ngx API at this address',
    fr: 'aucune API Paperless-ngx à cette adresse',
    de: 'keine Paperless-ngx-API unter dieser Adresse',
    es: 'no hay ninguna API de Paperless-ngx en esta dirección',
  },
  [ERROR_KINDS.HTTP]: {
    en: 'Paperless-ngx answers with an error, see its logs',
    fr: 'Paperless-ngx répond par une erreur, voir ses logs',
    de: 'Paperless-ngx antwortet mit einem Fehler, sieh in seinen Protokollen nach',
    es: 'Paperless-ngx responde con un error, consulte sus registros',
  },
};

// The "Test the connection" report.
export const REPORT_TEXT = {
  en: {
    ok: (version) => `Connected to Paperless-ngx ${version}.`,
    documents: (total, inbox) => `${total} document(s), ${inbox} in the inbox.`,
    tasks: (running, failed) => `Tasks: ${running} in progress, ${failed} failed.`,
    noStatus: 'Storage unknown: the token is not an administrator one.',
    update: (latest) => `Version ${latest} is available.`,
  },
  fr: {
    ok: (version) => `Connecté à Paperless-ngx ${version}.`,
    documents: (total, inbox) => `${total} document(s), dont ${inbox} dans la boîte de réception.`,
    tasks: (running, failed) => `Tâches : ${running} en cours, ${failed} en échec.`,
    noStatus: "Stockage inconnu : le jeton n'est pas celui d'un administrateur.",
    update: (latest) => `La version ${latest} est disponible.`,
  },
  de: {
    ok: (version) => `Mit Paperless-ngx ${version} verbunden.`,
    documents: (total, inbox) => `${total} Dokument(e), davon ${inbox} im Posteingang.`,
    tasks: (running, failed) => `Aufgaben: ${running} laufend, ${failed} fehlgeschlagen.`,
    noStatus: 'Speicher unbekannt: Das Token gehört keinem Administrator.',
    update: (latest) => `Version ${latest} ist verfügbar.`,
  },
  es: {
    ok: (version) => `Conectado a Paperless-ngx ${version}.`,
    documents: (total, inbox) => `${total} documento(s), ${inbox} en la bandeja de entrada.`,
    tasks: (running, failed) => `Tareas: ${running} en curso, ${failed} con error.`,
    noStatus: 'Almacenamiento desconocido: el token no es de un administrador.',
    update: (latest) => `La versión ${latest} está disponible.`,
  },
};

export const LANGUAGE_FALLBACK = 'en';

/** "Name: text", with the space French puts before a colon. */
export const labelled = (name, text, language) =>
  `${name}${language === 'fr' ? ' : ' : ': '}${text}`;
export const pick = (text, language) => text[language] ?? text[LANGUAGE_FALLBACK];
