import http.server
import socketserver
import os

PORT = 8080
WEB_DIR = 'public'

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=WEB_DIR, **kwargs)

with socketserver.TCPServer(("", PORT), Handler) as httpd:
    print(f"Serving files from '{WEB_DIR}' at http://localhost:{PORT}")
    httpd.serve_forever()
