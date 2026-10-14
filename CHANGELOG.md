# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

## [1.0.1] - 2026-10-14

### Added

- A **Paperless-ngx** device, read from the local API with an API token:
  online, total documents, documents in the inbox, documents added today,
  tasks in progress, failed tasks, correspondents, document types, tags, free
  storage (administrator token), update available and version.
- Scene triggers: _New document in Paperless-ngx_ (filters on the
  correspondent and the document type), _New document with a tag_ and
  _Document processing failed_, with the title, correspondent, type, tags and
  link of the document, or the file name and error of the failure.
- A "Paperless-ngx inbox" dashboard widget: documents to sort, added today,
  failed tasks, and the latest documents of the inbox.
- A **Test the connection** button, a connection status naming the problem,
  and a transport badge.
- Paperless-ngx 2.x and 3.x, both API generations.
- English, French, German and Spanish, in the interface and in the
  documentation.

[Unreleased]: https://github.com/guim31/gladys-paperless/compare/v1.0.1...HEAD
[1.0.1]: https://github.com/guim31/gladys-paperless/releases/tag/v1.0.1
