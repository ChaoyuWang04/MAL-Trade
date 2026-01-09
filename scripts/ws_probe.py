import socket
import ssl
import sys
import time

PROXY = ("127.0.0.1", 7890)  # Clash default (HTTP CONNECT)
TARGET_HOST = "stream.binance.com"
TARGET_PORT = 9443


def probe():
    print(f"[*] Connecting to proxy {PROXY[0]}:{PROXY[1]} ...")
    with socket.create_connection(PROXY, timeout=10) as sock:
        connect_req = (
            f"CONNECT {TARGET_HOST}:{TARGET_PORT} HTTP/1.1\r\n"
            f"Host: {TARGET_HOST}:{TARGET_PORT}\r\n"
            "Proxy-Connection: Keep-Alive\r\n"
            "\r\n"
        )
        sock.sendall(connect_req.encode("ascii"))
        resp = sock.recv(4096)
        if b"200" not in resp.split(b"\r\n", 1)[0]:
            print(f"[!] Proxy CONNECT failed: {resp!r}")
            return
        print("[*] CONNECT 200 OK; starting TLS...")
        ctx = ssl.create_default_context()
        tls = ctx.wrap_socket(sock, server_hostname=TARGET_HOST)
        tls.settimeout(10)
        tls.do_handshake()
        print("[+] TLS handshake to stream.binance.com:9443 succeeded via proxy")
        tls.close()


if __name__ == "__main__":
    try:
        probe()
    except Exception as e:
        print(f"[!] Probe failed: {e}")
        sys.exit(1)
