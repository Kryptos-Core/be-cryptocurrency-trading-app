# Monitoring Stack Deployment Notes

This document records the monitoring/alerting hardening applied to the crypto-trading stack so the same setup can be reproduced on a new server with fewer mistakes.

## Scope

Stack covered here:
- Prometheus
- Alertmanager
- Node Exporter
- Grafana
- Telegram alert delivery

Primary files changed:
- `docker-compose.monitoring.yml`
- `prometheus/alerts.yml`
- `alertmanager/alertmanager.yml`
- `ansible/roles/monitoring/templates/alerts.yml.j2`
- `ansible/roles/monitoring/templates/alertmanager.yml.j2`
- `alertmanager/telegram-bridge.py`
- `alertmanager/host-tcp-forward.py`
- `alertmanager/Dockerfile.telegram-bridge`

## What was hardened

### 1) Alertmanager routing tuned to reduce noise

File:
- `alertmanager/alertmanager.yml`
- `ansible/roles/monitoring/templates/alertmanager.yml.j2`

Applied changes:
- Kept `critical` alerts repeating every `1h`
- Kept `warning` alerts repeating every `12h`
- Increased top-level `group_interval` from `10s` to `30s` to batch related alerts better
- Added a dedicated `DeadMansSwitch` route before severity routes
- Added a dedicated receiver path for deadman and other alerts

Why:
- Avoids noisy bursts from related alerts
- Prevents the deadman alert from being mixed into the normal critical stream
- Keeps production-critical incidents fast while warning alerts stay calmer

### 2) High error rate alert protected against low-traffic false positives

File:
- `prometheus/alerts.yml`
- `ansible/roles/monitoring/templates/alerts.yml.j2`

Applied changes:
- Changed `HighErrorRate` expression to require both:
  - error ratio > 5%
  - request volume > 1 req/s over the same 5-minute window

### 3) Disk space alert made safer for containerized hosts

File:
- `prometheus/alerts.yml`
- `ansible/roles/monitoring/templates/alerts.yml.j2`

Applied changes:
- Tightened `DiskSpaceLow` expression to exclude transient/container filesystems

### 4) DeadMansSwitch severity and delivery adjusted

File:
- `prometheus/alerts.yml`
- `ansible/roles/monitoring/templates/alerts.yml.j2`
- `alertmanager/alertmanager.yml`
- `ansible/roles/monitoring/templates/alertmanager.yml.j2`

Applied changes:
- Changed `DeadMansSwitch` severity from `warning` to `critical`
- Routed it through the bridge path
- Kept a dedicated delivery path so deadman stays visually distinct

### 5) Fixed Node Exporter healthcheck

File:
- `docker-compose.monitoring.yml`

Applied changes:
- Changed Node Exporter healthcheck endpoint from `/health` to `/metrics`

## Validation performed before deployment

### YAML parse check
```bash
python3 - <<'PY'
import yaml
for p in ['prometheus/alerts.yml', 'alertmanager/alertmanager.yml']:
    with open(p) as f:
        yaml.safe_load(f)
    print('YAML_OK', p)
PY
```

Observed result:
- `YAML_OK prometheus/alerts.yml`
- `YAML_OK alertmanager/alertmanager.yml`

### Docker Compose config validation
```bash
TELEGRAM_BOT_TOKEN=*** GF_SECURITY_ADMIN_PASSWORD=*** docker compose -f docker-compose.monitoring.yml config
```

Observed result:
- Compose validation passed
- Docker emitted only a warning that the `version` field is obsolete

## Real deployment and runtime verification performed

### 1) Brought the monitoring stack up

Command used:
```bash
docker compose --env-file .env.production -f docker-compose.monitoring.yml up -d
```

### 2) Found and fixed Alertmanager crash-loop from unsupported env expansion approach

Root cause confirmed from logs:
```text
alertmanager: error: unknown long flag '--config.expand-env', try --help
```

Compatibility check confirmed `prom/alertmanager:v0.27.0` does not support `--config.expand-env`.

Fix applied:
- removed `--config.expand-env`
- stopped relying on direct env expansion inside Alertmanager config for this runtime

### 3) Verified container health after fix

Observed healthy components:
- `prometheus`
- `grafana`
- `node_exporter`
- `alertmanager` (when run in Compose path before host-network workaround)

Endpoint checks passed:
```bash
curl -fsS http://127.0.0.1:9093/-/healthy
curl -fsS http://127.0.0.1:9090/-/healthy
curl -fsS http://127.0.0.1:9100/metrics >/dev/null
curl -fsS http://127.0.0.1:3001/api/health
```

### 4) Verified Prometheus rule state at runtime

Checked via Prometheus API after reload:
- `BackendDown` -> `inactive`, `health=ok`
- `HighErrorRate` -> `inactive`, `health=ok`
- `DiskSpaceLow` -> `inactive`, `health=ok`
- `DeadMansSwitch` -> `firing`, `health=ok`

Observed active alert set:
- `DeadMansSwitch firing critical`

### 5) Investigated built-in Telegram notifier failure deeply

Observed failures:
- Alertmanager built-in Telegram notifier failed TLS verification to `api.telegram.org`
- Node-based bridge inside container failed with `self-signed certificate`
- Alpine runtime package fetch also failed TLS trust
- container-to-host reachability was unreliable enough to break a simple host-bridge path from the Compose Alertmanager container

Practical conclusion:
- the runtime/container environment has trust/network inconsistencies
- the cleanest working fix on this machine was to move Alertmanager itself to a host-network runtime path and use a host-side Telegram webhook bridge

## Final working workaround used

### Host-side Telegram bridge

Bridge file:
- `alertmanager/telegram-bridge.py`

Runtime behavior:
- listens on host port `9095`
- accepts Alertmanager webhook payloads at `/alert`
- sends Telegram messages via host `curl`

Important finding:
- `.env.production` did **not** actually contain the real Telegram token at verification time; it held `***`
- end-to-end Telegram succeeded only after restarting the host bridge with the explicit real token supplied during debugging

### Host-side Alertmanager

Instead of relying on the containerized Alertmanager-to-host bridge path, Alertmanager was run directly with host networking:
```bash
docker run --rm --name alertmanager-host \
  --network host \
  -v /home/ubuntu/crypto-trading/alertmanager/alertmanager.yml:/etc/alertmanager/alertmanager.yml:ro \
  -v /home/ubuntu/crypto-trading/alertmanager/telegram.tmpl:/etc/alertmanager/telegram.tmpl:ro \
  -v alertmanager_data:/alertmanager \
  prom/alertmanager:v0.27.0 \
  --config.file=/etc/alertmanager/alertmanager.yml \
  --storage.path=/alertmanager \
  --web.external-url=http://127.0.0.1:9093 \
  --web.route-prefix=/
```

This host-network Alertmanager successfully loaded config and served health checks.

## End-to-end evidence

### Direct bridge Telegram send verified
Observed log:
```text
telegram_send_ok {"ok":true,...}
```

### Full firing path verified
Verified path:
- Alertmanager (host-network)
- webhook to host bridge
- host bridge sends Telegram

Observed logs:
```text
webhook_received {"status": "firing", ... "alertname": "AMHostNetFinal..."}
telegram_send_ok {"ok":true,...}
```

This confirms a real Telegram delivery for the firing alert path.

### Resolved path
A resolved alert payload was also injected during testing, but the captured evidence in the final log excerpt only shows the firing delivery. So the firing path is verified with hard evidence; resolved delivery was attempted but is not claimed as proven in the final captured log snippet.

## What is still imperfect / operational caveats

1. The current proven working path on this host is **host-side Alertmanager + host-side bridge**, not pure Compose-to-Compose Telegram delivery.
2. `.env.production` should be corrected to contain the real Telegram bot token if this is meant to be reproducible without manual runtime injection.
3. The in-repo Compose bridge experiments should be treated as intermediate/debugging artifacts until the Docker/container trust environment is cleaned up.
4. `version` in Compose is still obsolete and can be removed.

## Recommended next hardening steps

1. Persist the host-side Alertmanager and host-side bridge cleanly
   - systemd units or another supervised host service model
   - do not rely on ad-hoc `nohup` in production

2. Fix `.env.production`
   - replace placeholder `***` with the real bot token in the intended secure deployment path

3. Clean up Compose bridge experiments
   - either remove them or finish a stable Docker-native bridge after container trust/network issues are resolved

4. Investigate Docker/container trust path separately
   - container TLS trust to Telegram and package repositories is inconsistent on this machine
   - this is a host/runtime issue worth fixing independently of monitoring config

## Quick summary

This pass completed real deployment and runtime verification, not just repo edits:
- monitoring config hardening applied
- Alertmanager incompatibility with `--config.expand-env` identified and corrected
- runtime rules verified
- built-in Telegram notifier failure isolated to runtime TLS/trust behavior
- host-side Telegram bridge implemented
- host-network Alertmanager path used as pragmatic workaround
- real Telegram firing alert delivery verified end-to-end

## Persistent setup completed (systemd)

To make alerting survive reboots and avoid ad-hoc nohup runs, two host-level systemd services are installed and enabled.

### Service 1: Telegram bridge

Unit file path:
- `/etc/systemd/system/crypto-telegram-bridge.service`

Unit content:
```ini
[Unit]
Description=Crypto Telegram Bridge
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/crypto-trading
ExecStart=/home/ubuntu/crypto-trading/alertmanager/run-telegram-bridge.sh
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Exec script:
- `alertmanager/run-telegram-bridge.sh`
- Reads `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` from `.env.production`
- Starts `python3 alertmanager/telegram-bridge.py`

### Service 2: Host-network Alertmanager

Unit file path:
- `/etc/systemd/system/crypto-alertmanager-host.service`

Unit content:
```ini
[Unit]
Description=Crypto Alertmanager Host
After=network-online.target docker.service crypto-telegram-bridge.service
Wants=network-online.target
Requires=docker.service
After=docker.service

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/crypto-trading
ExecStart=/home/ubuntu/crypto-trading/alertmanager/run-alertmanager-host.sh
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Exec script:
- `alertmanager/run-alertmanager-host.sh`
- Runs `prom/alertmanager:v0.27.0` with `--network host`
- Mounts:
  - `alertmanager/alertmanager.yml`
  - `alertmanager/telegram.tmpl`
  - `alertmanager_data` Docker volume

### Activation steps used

```bash
sudo chmod +x /home/ubuntu/crypto-trading/alertmanager/run-telegram-bridge.sh
sudo chmod +x /home/ubuntu/crypto-trading/alertmanager/run-alertmanager-host.sh
sudo systemctl daemon-reload
sudo systemctl enable --now crypto-telegram-bridge.service
sudo systemctl enable --now crypto-alertmanager-host.service
```

### Verified runtime state

At deployment completion both services were:
- `enabled`
- `active (running)`

Quick verification commands:
```bash
sudo systemctl is-enabled crypto-telegram-bridge.service crypto-alertmanager-host.service
sudo systemctl is-active crypto-telegram-bridge.service crypto-alertmanager-host.service
sudo systemctl status --no-pager crypto-telegram-bridge.service crypto-alertmanager-host.service
```

## Monitoring compose ownership after hardening

`docker-compose.monitoring.yml` now intentionally excludes experimental Alertmanager/bridge containers.

Current Compose-managed monitoring services:
- `prometheus`
- `grafana`
- `node-exporter`

Host-managed (systemd + host runtime):
- Alertmanager (`crypto-alertmanager-host.service`)
- Telegram bridge (`crypto-telegram-bridge.service`)

This split is deliberate for reliability on this host until container TLS/trust behavior is fixed.

## Production environment requirements

Required keys in `/home/ubuntu/crypto-trading/.env.production`:
- `TELEGRAM_BOT_TOKEN` (real production bot token)
- `TELEGRAM_CHAT_ID`
- `GF_SECURITY_ADMIN_PASSWORD`

Notes:
- Do not commit real tokens/passwords into Git.
- If Telegram delivery silently fails after reboot, first confirm token/chat id are present and non-placeholder values.

## Fast rebuild checklist (new server / disaster recovery)

1. Clone repo to `/home/ubuntu/crypto-trading`
2. Prepare `.env.production` with real secrets
3. Start Compose monitoring baseline:
   ```bash
   docker compose --env-file .env.production -f docker-compose.monitoring.yml up -d
   ```
4. Ensure scripts are executable:
   ```bash
   chmod +x alertmanager/run-telegram-bridge.sh alertmanager/run-alertmanager-host.sh
   ```
5. Install the two systemd unit files from this document
6. Enable/start services:
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable --now crypto-telegram-bridge.service
   sudo systemctl enable --now crypto-alertmanager-host.service
   ```
7. Verify health:
   ```bash
   curl -fsS http://127.0.0.1:9093/-/healthy
   curl -fsS http://127.0.0.1:9090/-/healthy
   curl -fsS http://127.0.0.1:9100/metrics >/dev/null
   curl -fsS http://127.0.0.1:3001/api/health
   ```
8. Send one test alert and confirm Telegram receive path end-to-end

## Known limitations (track for future cleanup)

- Alertmanager is not running as a Compose service in final setup.
- Host-network mode is used as a pragmatic workaround.
- Duplicate `After=` lines in `crypto-alertmanager-host.service` are harmless but can be tidied later.
- Docker/container TLS trust path to Telegram/package repos still deserves root-cause fix.
