import http.server
import socketserver
import webbrowser
import threading
import time
import os
import urllib.parse

PORT = 8000
LAST_HEARTBEAT = time.time()
TIMEOUT = 5.0 # Seconds before auto-closing

def get_latest_mtime():
    """Checks the 'scores' folder to see if any file was recently modified."""
    scores_dir = 'scores'
    if not os.path.exists(scores_dir):
        return 0
    # Check the folder itself and all files inside
    latest = os.path.getmtime(scores_dir)
    for f in os.listdir(scores_dir):
        if f.endswith('.abc'):
            filepath = os.path.join(scores_dir, f)
            latest = max(latest, os.path.getmtime(filepath))
    return latest

class PianoHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        global LAST_HEARTBEAT
        if self.path == '/heartbeat':
            # 1. Update the tab-closing timer
            LAST_HEARTBEAT = time.time()
            self.send_response(200)
            self.send_header('Content-type', 'text/plain')
            self.end_headers()
            # 2. Send back the latest folder modification time
            self.wfile.write(str(get_latest_mtime()).encode())
        else:
            super().do_GET()

    def do_POST(self):
        # Handle saving edits from the web UI!
        if self.path.startswith('/save/'):
            filename = urllib.parse.unquote(self.path[6:])
            filepath = os.path.join('scores', filename)
            
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            
            try:
                with open(filepath, 'w', encoding='utf-8') as f:
                    f.write(post_data.decode('utf-8'))
                self.send_response(200)
                self.end_headers()
                self.wfile.write(b'Saved successfully')
            except Exception as e:
                self.send_response(500)
                self.end_headers()
                self.wfile.write(str(e).encode())

    def log_message(self, format, *args):
        # Silence the heartbeat so the terminal stays clean
        if '/heartbeat' not in format % args:
            super().log_message(format, *args)

def monitor_heartbeat(server):
    global LAST_HEARTBEAT
    while True:
        time.sleep(2)
        if time.time() - LAST_HEARTBEAT > TIMEOUT:
            print("\nTab closed. Shutting down Piano Studio...")
            server.shutdown()
            break

# Ensure we are running in the correct folder
os.chdir(os.path.dirname(os.path.abspath(__file__)))
if not os.path.exists('scores'):
    os.makedirs('scores')

class ReusableServer(socketserver.TCPServer):
    allow_reuse_address = True

httpd = ReusableServer(("", PORT), PianoHandler)
monitor = threading.Thread(target=monitor_heartbeat, args=(httpd,))
monitor.daemon = True
monitor.start()

print(f"🎹 Piano Studio is live at http://localhost:{PORT}")
try:
    webbrowser.get("brave-browser %s").open(f"http://localhost:{PORT}")
except webbrowser.Error:
    webbrowser.open(f"http://localhost:{PORT}")

# Keep the server running, but watch for Ctrl+C
try:
    httpd.serve_forever()
except KeyboardInterrupt:
    print("\n🛑 Ctrl+C detected! Killing ghosts and closing the piano...")
    httpd.server_close()  # This forces the port to be freed instantly!
    print("Goodbye!")