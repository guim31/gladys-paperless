# Security policy

## Reporting a vulnerability

Please do **not** report a security problem in a public issue, pull request or
forum post.

Report it privately through GitHub instead: open the **Security** tab of this
repository, then **Report a vulnerability**.

No such button? Private reporting is not enabled yet: open an issue that only
asks the maintainers for a private contact, without any detail of the problem,
and send the report there.

Include, when you can:

- the version of the integration and of Gladys;
- what an attacker can do, and the steps to reproduce it;
- the log lines that help (remove tokens, passwords and addresses first).

The fix ships as a new version of the integration, and the advisory is
published once users can update.

## Supported versions

Only the latest release receives security fixes: update the integration from
Gladys before reporting a problem.

## Scope

In scope: the code of this repository and the Docker image it publishes.

What the integration handles:

- **Secrets**: the Paperless-ngx API token lives in the Gladys configuration
  of the integration (a `secret` field). It is sent only to the configured
  Paperless-ngx address, in the `Authorization` header, and never written to
  the logs, to `/data` or to a device parameter.
- **`/data`**: one file, `paperless-state.json`, with the address of the
  instance, the highest document id seen and the ids of the failed tasks
  already announced. No token, no document title or content.
- **Network**: `GET` requests to the configured Paperless-ngx only, over HTTP
  or HTTPS. Certificates are verified unless the user ticks _Accept
  self-signed certificates_. Paperless-ngx itself asks GitHub for its latest
  release when the update check is on; the integration never reaches the
  internet.
- **Data sent to Gladys**: counts, the version, and for the scene triggers
  and the widget the title, correspondent, type and tags of new documents and
  of the inbox, the file name and first error line of failed tasks.

Out of scope: Gladys Assistant itself (see its
[security policy](https://github.com/GladysAssistant/Gladys/security/policy)),
and Paperless-ngx, which the integration talks to.
