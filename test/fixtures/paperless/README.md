# Paperless-ngx fixtures

- `real-3.3.1/`, `real-2.20.6/`: answers of the official Docker images
  `paperlessngx/paperless-ngx` 3.3.1 and 2.20.6, recorded on 14/10/2026 with
  an administrator token, after creating three tags (one inbox tag), two
  correspondents, two document types, uploading generated PDFs and one broken
  PDF. Each file holds the request, the `X-Api-Version` and `X-Version`
  headers, and the JSON body. Anonymized: host name, operating system, Celery
  host, traceback shortened. No token, no address of a real network.
- `home-assistant/`: the fixtures of the tests of the Home Assistant
  `paperless_ngx` integration (Apache-2.0,
  `tests/components/paperless_ngx/fixtures/`), unchanged.
- `pypaperless/`: the test data of [pypaperless](https://github.com/tb1337/paperless-api)
  (MIT, `tests/data/`: tasks, statistics, status, remote version, documents),
  converted from Python to JSON.
