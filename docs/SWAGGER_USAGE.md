# Swagger Usage - Current Project

Swagger is enabled when NODE_ENV is not production.

## URLs

- UI: http://localhost:3000/api/docs
- JSON: http://localhost:3000/api/docs-json

## API base prefix

All REST routes are under:

- /api/v1

## Auth in Swagger

Protected endpoints require JWT bearer token via Authorize button.

## Recommendation

Use Swagger as the source of truth for request/response shapes and RBAC-protected endpoints.
