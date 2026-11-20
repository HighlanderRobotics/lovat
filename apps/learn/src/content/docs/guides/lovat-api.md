---
title: Getting Started with the Lovat API
description: Authenticate and make your first read request to the Lovat API.
---

Use the Lovat API to look up teams and tournaments from a script or integration. The examples below use the production API at `https://api.lovat.app`.

## Authenticate

Send your credential in the `Authorization` header as a bearer token. Use an `lvt-` API key for scripts that support key authentication. The [API reference](https://api.lovat.app/v1/doc/) lists the authentication, parameters, and permissions for each operation.

If you need a key, use the **Create a new API key** operation under **Manager - API Keys** in the reference. Creating a key requires an Auth0 access token for a signed-in account on a verified Lovat team. Enter a name that identifies the integration. Save the returned `apiKey` in your integration's secret store. The list operation returns metadata, so copy the key when you create it. Revoke it in the reference if it is exposed.

## Look up a team

Set `LOVAT_API_KEY` in your shell from your secret store, then run this request. It searches by team-number prefix and limits the response to five teams.

```sh
curl --silent --show-error --fail-with-body \
  --header "Authorization: Bearer ${LOVAT_API_KEY:?Set LOVAT_API_KEY}" \
  --header 'X-Lovat-Error-Format: json-v1' \
  'https://api.lovat.app/v1/manager/teams?filter=8033&take=5'
```

On success, the response has a `teams` array and a `count` field. If the search has no matches, the array is empty.

## Handle errors

`X-Lovat-Error-Format: json-v1` requests structured errors. Use the HTTP status and `code` for decisions and `message` for readable feedback.

| Status | What to check                                                                                                  |
| ------ | -------------------------------------------------------------------------------------------------------------- |
| `400`  | Check the endpoint's parameters and any field names listed in `invalidFields`.                                 |
| `401`  | Check the bearer header and whether the credential is still valid.                                             |
| `403`  | Check the account's permissions and whether the operation requires an Auth0 access token.                      |
| `429`  | Wait for `Retry-After` or `retryAfterSeconds` when provided. Space API-key requests by at least three seconds. |

For other endpoints and their response schemas, see the [interactive API reference](https://api.lovat.app/v1/doc/) or the [OpenAPI JSON specification](https://api.lovat.app/v1/doc.json).
