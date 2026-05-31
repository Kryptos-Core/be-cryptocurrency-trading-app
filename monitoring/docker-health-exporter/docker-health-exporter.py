from http.server import BaseHTTPRequestHandler, HTTPServer
import json
import os
import subprocess
import sys

HOST = os.environ.get('DOCKER_HEALTH_EXPORTER_HOST', '0.0.0.0')
PORT = int(os.environ.get('DOCKER_HEALTH_EXPORTER_PORT', '9108'))


def esc_label(value):
    return str(value).replace('\\', '\\\\').replace('"', '\\"').replace('\n', '\\n')


def docker_json(args):
    result = subprocess.run(['docker', *args], capture_output=True, text=True, timeout=10)
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or result.stdout.strip())
    return json.loads(result.stdout or '[]')


def collect_metrics():
    raw = subprocess.run(['docker', 'ps', '-a', '--format', '{{json .}}'], capture_output=True, text=True, timeout=10)
    if raw.returncode != 0:
        raise RuntimeError(raw.stderr.strip() or raw.stdout.strip())
    containers = [json.loads(line) for line in raw.stdout.splitlines() if line.strip()]
    lines = [
        '# HELP docker_container_running Container running state from Docker inspect.',
        '# TYPE docker_container_running gauge',
        '# HELP docker_container_health_status Docker healthcheck status: healthy=1, unhealthy=0, starting=0.5, none=-1.',
        '# TYPE docker_container_health_status gauge',
        '# HELP docker_container_restart_count Docker container restart count.',
        '# TYPE docker_container_restart_count gauge',
        '# HELP docker_container_exit_code Last Docker container exit code.',
        '# TYPE docker_container_exit_code gauge',
    ]
    for row in containers:
        container_id = row.get('ID')
        if not container_id:
            continue
        info = docker_json(['inspect', container_id])[0]
        name = info.get('Name', '').lstrip('/') or row.get('Names', container_id)
        state = info.get('State', {})
        config = info.get('Config', {})
        labels = config.get('Labels') or {}
        compose_service = labels.get('com.docker.compose.service', '')
        compose_project = labels.get('com.docker.compose.project', '')
        image = config.get('Image', '')
        label = (
            f'container="{esc_label(name)}",image="{esc_label(image)}",'
            f'compose_service="{esc_label(compose_service)}",compose_project="{esc_label(compose_project)}"'
        )
        health = state.get('Health', {}).get('Status')
        if health == 'healthy':
            health_value = 1
        elif health == 'starting':
            health_value = 0.5
        elif health == 'unhealthy':
            health_value = 0
        else:
            health_value = -1
        lines.append(f'docker_container_running{{{label}}} {1 if state.get("Running") else 0}')
        lines.append(f'docker_container_health_status{{{label},health_status="{esc_label(health or "none")}"}} {health_value}')
        lines.append(f'docker_container_restart_count{{{label}}} {state.get("RestartCount", 0)}')
        lines.append(f'docker_container_exit_code{{{label}}} {state.get("ExitCode", 0)}')
    return '\n'.join(lines) + '\n'


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == '/health':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(b'{"ok":true}')
            return
        if self.path == '/metrics':
            try:
                body = collect_metrics().encode('utf-8')
                self.send_response(200)
                self.send_header('Content-Type', 'text/plain; version=0.0.4')
                self.end_headers()
                self.wfile.write(body)
            except Exception as exc:
                print(f'collect_failed {exc}', file=sys.stderr, flush=True)
                self.send_response(500)
                self.end_headers()
                self.wfile.write(str(exc).encode('utf-8'))
            return
        self.send_response(404)
        self.end_headers()

    def log_message(self, format, *args):
        return


if __name__ == '__main__':
    print(f'docker_health_exporter_listening {HOST}:{PORT}', flush=True)
    HTTPServer((HOST, PORT), Handler).serve_forever()
