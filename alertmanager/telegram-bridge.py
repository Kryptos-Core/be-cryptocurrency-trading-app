from http.server import BaseHTTPRequestHandler, HTTPServer
import json
import os
import subprocess
import sys
from datetime import datetime, timezone

HOST = os.environ.get('TELEGRAM_BRIDGE_HOST', '127.0.0.1')
PORT = int(os.environ.get('TELEGRAM_BRIDGE_PORT', '9095'))
BOT_TOKEN = os.environ.get('TELEGRAM_BOT_TOKEN')
CHAT_ID = os.environ.get('TELEGRAM_CHAT_ID')

if not BOT_TOKEN:
    print('Missing TELEGRAM_BOT_TOKEN', file=sys.stderr)
    sys.exit(1)
if not CHAT_ID:
    print('Missing TELEGRAM_CHAT_ID', file=sys.stderr)
    sys.exit(1)


def esc(value):
    return (str(value)
        .replace('&', '&amp;')
        .replace('<', '&lt;')
        .replace('>', '&gt;')
        .replace('"', '&quot;'))

def fmt_time(value):
    if not value:
        return 'n/a'
    try:
        normalized = str(value).replace('Z', '+00:00')
        dt = datetime.fromisoformat(normalized)
        return dt.astimezone(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')
    except Exception:
        return esc(value)

def pick_labels(labels):
    keys = ['environment', 'cluster', 'service', 'job', 'instance', 'container', 'severity']
    return ' '.join(
        f"{esc(k)}={esc(labels[k])}"
        for k in keys
        if labels.get(k)
    )


def summarize_alert(alert):
    labels = alert.get('labels', {})
    annotations = alert.get('annotations', {})
    status = esc(alert.get('status', 'firing'))
    name = esc(labels.get('alertname', 'Alert'))
    severity = esc(labels.get('severity', 'unknown'))
    starts_at = esc(fmt_time(alert.get('startsAt')))
    ends_at = esc(fmt_time(alert.get('endsAt')))
    summary = f"\n<b>Summary:</b> {esc(annotations['summary'])}" if annotations.get('summary') else ''
    description = f"\n<b>Description:</b> {esc(annotations['description'])}" if annotations.get('description') else ''
    impact = f"\n<b>Impact:</b> {esc(annotations['impact'])}" if annotations.get('impact') else ''
    action = f"\n<b>Action:</b> {esc(annotations['action'])}" if annotations.get('action') else ''
    value = f"\n<b>Value:</b> {esc(alert['value'])}" if alert.get('value') else ''
    generator = f"\n<b>Source:</b> {esc(alert['generatorURL'])}" if alert.get('generatorURL') else ''
    labels_text = pick_labels(labels)
    label_block = f"\n<b>Labels:</b> {labels_text}" if labels_text else ''
    resolved_at = f"\n<b>Resolved at:</b> {ends_at}" if status == 'resolved' else ''
    return (
        f"• <b>{name}</b>\n<b>Status:</b> {status}\n<b>Severity:</b> {severity}"
        f"\n<b>Started at:</b> {starts_at}{resolved_at}{summary}{description}"
        f"{impact}{action}{value}{label_block}{generator}"
    )


def build_message(payload):
    status = esc(payload.get('status', 'firing'))
    alerts = payload.get('alerts', []) or []
    common = payload.get('commonLabels', {}) or {}
    first = alerts[0] if alerts else {}
    first_labels = first.get('labels', {})
    group_name = esc(common.get('alertname') or first_labels.get('alertname') or 'Alert')
    severity = esc(common.get('severity') or first_labels.get('severity') or 'unknown')
    prefix = '✅' if status == 'resolved' else '🚨' if severity == 'critical' else '⚠️' if severity == 'warning' else '🔔'
    body = '\n\n'.join(summarize_alert(a) for a in alerts[:10])
    truncated = f"\n\n…and {len(alerts) - 10} more alerts" if len(alerts) > 10 else ''
    env = esc(common.get('environment', 'unknown'))
    cluster = esc(common.get('cluster', 'unknown'))
    return (
        f"{prefix} <b>{group_name}</b>\n<b>Group status:</b> {status}"
        f"\n<b>Severity:</b> {severity}\n<b>Environment:</b> {env}"
        f"\n<b>Cluster:</b> {cluster}\n<b>Alert count:</b> {len(alerts)}"
    ) + (f"\n\n{body}" if body else '') + truncated


def send_telegram(message):
    payload = json.dumps({
        'chat_id': CHAT_ID,
        'text': message,
        'parse_mode': 'HTML',
        'disable_web_page_preview': True,
    })
    result = subprocess.run([
        'curl', '--silent', '--show-error', '--fail', '--max-time', '20',
        '-H', 'Content-Type: application/json',
        '-d', payload,
        f'https://api.telegram.org/bot{BOT_TOKEN}/sendMessage'
    ], capture_output=True, text=True)
    if result.returncode == 0:
        print('telegram_send_ok', result.stdout.strip() or '200', flush=True)
        return True
    print('telegram_send_failed', result.returncode, result.stderr.strip() or result.stdout.strip(), flush=True)
    return False


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == '/health':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(b'{"ok":true}')
            return
        if self.path == '/metrics':
            self.send_response(200)
            self.send_header('Content-Type', 'text/plain; version=0.0.4')
            self.end_headers()
            self.wfile.write(b'telegram_bridge_up 1\n')
            return
        self.send_response(404)
        self.end_headers()

    def do_POST(self):
        if self.path != '/alert':
            self.send_response(404)
            self.end_headers()
            return
        length = int(self.headers.get('Content-Length', '0'))
        raw = self.rfile.read(length)
        try:
            payload = json.loads(raw.decode('utf-8') if raw else '{}')
        except Exception:
            self.send_response(400)
            self.end_headers()
            self.wfile.write(b'invalid json')
            return
        print('webhook_received', json.dumps({
            'status': payload.get('status'),
            'alertCount': len(payload.get('alerts', []) or []),
            'groupLabels': payload.get('groupLabels', {}),
            'commonLabels': payload.get('commonLabels', {}),
        }), flush=True)
        send_telegram(build_message(payload))
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(b'{"ok":true}')

    def log_message(self, format, *args):
        return


if __name__ == '__main__':
    print(f'telegram_bridge_listening {HOST}:{PORT}', flush=True)
    HTTPServer((HOST, PORT), Handler).serve_forever()
