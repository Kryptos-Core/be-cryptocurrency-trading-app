import socket
import threading

LISTEN_HOST = '172.20.0.1'
LISTEN_PORT = 19095
TARGET_HOST = '127.0.0.1'
TARGET_PORT = 9095


def pipe(src, dst):
    try:
        while True:
            data = src.recv(65536)
            if not data:
                break
            dst.sendall(data)
    except Exception:
        pass
    finally:
        try:
            dst.shutdown(socket.SHUT_WR)
        except Exception:
            pass


def handle(client):
    upstream = socket.create_connection((TARGET_HOST, TARGET_PORT))
    t1 = threading.Thread(target=pipe, args=(client, upstream), daemon=True)
    t2 = threading.Thread(target=pipe, args=(upstream, client), daemon=True)
    t1.start(); t2.start()
    t1.join(); t2.join()
    client.close()
    upstream.close()


sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
sock.bind((LISTEN_HOST, LISTEN_PORT))
sock.listen(100)
print(f'tcp_forward_listening {LISTEN_HOST}:{LISTEN_PORT} -> {TARGET_HOST}:{TARGET_PORT}', flush=True)
while True:
    client, _ = sock.accept()
    threading.Thread(target=handle, args=(client,), daemon=True).start()
