#!/usr/bin/env python3
"""Tiny HTTP wrapper around board_ocr.py so the Worker can call it (set BOARD_OCR_URL on the Worker).

    BOARD_OCR_KEY=<long random string> python serve.py [--host 127.0.0.1] [--port 8788] [--roster clubs.txt]

    GET  /health                       -> {"ok": true}
    POST /scan   (raw image bytes, or JSON {"image": "data:image/jpeg;base64,..."})
                 Authorization: Bearer <BOARD_OCR_KEY>   ->  the board_ocr JSON (HTTP 422 {"error"} when unreadable)

It binds to localhost by default. Reaching it from Cloudflare needs a tunnel or a host you run (your choice, not set up here).
One scan at a time: OCR uses the CPU and the models load once.
"""
import argparse, base64, hmac, json, os, re, sys, threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import board_ocr

MAX_BYTES = 8 * 1024 * 1024
LOCK = threading.Lock()


def make_handler(key, roster):
    class H(BaseHTTPRequestHandler):
        server_version = "board-ocr"

        def _send(self, code, obj):
            body = json.dumps(obj, ensure_ascii=False).encode()
            self.send_response(code)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, *a):
            pass

        def do_GET(self):
            self._send(200, {"ok": True}) if self.path == "/health" else self._send(404, {"error": "not found"})

        def do_POST(self):
            if self.path != "/scan":
                return self._send(404, {"error": "not found"})
            given = self.headers.get("Authorization", "")
            if not hmac.compare_digest(given.encode(), f"Bearer {key}".encode()):
                return self._send(401, {"error": "unauthorised"})
            n = int(self.headers.get("Content-Length") or 0)
            if n <= 0 or n > MAX_BYTES:
                return self._send(413, {"error": "image missing or over 8 MB"})
            raw = self.rfile.read(n)
            if self.headers.get("Content-Type", "").startswith("application/json"):
                try:
                    m = re.match(r"^data:image/[a-z]+;base64,(.+)$", json.loads(raw)["image"], re.S)
                    raw = base64.b64decode(m.group(1))
                except Exception:
                    return self._send(400, {"error": "expected {\"image\": \"data:image/...;base64,...\"}"})
            try:
                with LOCK:
                    self._send(200, board_ocr.read_bytes(raw, roster))
            except board_ocr.BoardError as e:
                self._send(422, {"error": str(e)})
            except Exception as e:                      # never leak a stack trace to the caller
                print("scan failed:", repr(e), file=sys.stderr)
                self._send(500, {"error": "the reader failed on that image"})
    return H


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=8788)
    ap.add_argument("--roster")
    a = ap.parse_args()
    key = os.environ.get("BOARD_OCR_KEY", "")
    if len(key) < 16:
        sys.exit("Set BOARD_OCR_KEY to a random string of at least 16 characters.")
    board_ocr.engine()                                  # load the models before the first request
    print(f"board-ocr listening on http://{a.host}:{a.port}", file=sys.stderr)
    ThreadingHTTPServer((a.host, a.port), make_handler(key, board_ocr.load_roster(a.roster))).serve_forever()


if __name__ == "__main__":
    main()
