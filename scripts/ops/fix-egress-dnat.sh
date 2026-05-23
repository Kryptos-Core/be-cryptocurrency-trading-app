#!/usr/bin/env bash
set -euo pipefail

# Remove stale/bad DNAT rules that hijack outbound HTTP/HTTPS from Docker containers
# back to the host public IP. These rules break external TLS (e.g. Binance) by
# presenting the local API certificate instead of the upstream certificate.
iptables -t nat -D PREROUTING -p tcp --dport 80 \
  -j DNAT --to-destination 192.168.122.80:80 2>/dev/null || true
iptables -t nat -D PREROUTING -p tcp --dport 443 \
  -j DNAT --to-destination 192.168.122.80:443 2>/dev/null || true
