# Redis Usage - Current Project

Redis is used for cache and operational support in backend modules.

## Required env

```env
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0
```

## Start local Redis

```bash
docker compose -f docker-compose.infrastructure.yml up -d redis
```

## Typical usage

- cache hot query data
- get-or-set pattern for expensive reads
- publish/subscribe internal events when needed

## Notes

- Always set TTL for transient cache keys.
- Invalidate cache on write paths that affect cached read models.
