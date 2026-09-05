"""
Piano Studio Backend Server

Provides HTTP server and file management for Piano Studio web application.
Serves static files (HTML, CSS, JS), handles file edits, and monitors score file changes.

Usage:
    python launcher.py

Server runs on http://localhost:8000 by default.
Edit PORT constant below to change the port.
"""

import http.server
import socketserver
import socket
import sys
import webbrowser
import threading
import time
import os
import subprocess
import urllib.parse

SHUTDOWN_TIMER = None
PORT = 8000
LAST_HEARTBEAT = time.time()
TIMEOUT = 600 # Seconds before notifying the user that the tab is inactive

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

def cancel_pending_shutdown():
    global SHUTDOWN_TIMER
    if SHUTDOWN_TIMER is not None:
        SHUTDOWN_TIMER.cancel()
        SHUTDOWN_TIMER = None

def execute_shutdown(server):
    print("\n🛑 Tab closed and grace period expired. Server shutting down.")
    threading.Thread(target=server.shutdown).start()
    server.server_close()
    try:
        httpd.server_close()
    except Exception:
        pass
    return

class PianoHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def do_GET(self):
        global LAST_HEARTBEAT
        if self.path == '/heartbeat':
            cancel_pending_shutdown() # Cancel shutdown if tab is still active
            LAST_HEARTBEAT = time.time() # Update the tab-closing timer

            self.send_response(200)
            self.send_header('Content-type', 'text/plain')
            self.end_headers()
            self.wfile.write(str(get_latest_mtime()).encode())
        else:
            super().do_GET()

    def do_POST(self):

        # Handle shutdown request from the web UI
        global SHUTDOWN_TIMER
        if self.path == '/shutdown':
            self.send_response(200)
            self.send_header('Content-Type', 'text/plain')
            self.end_headers()
            self.wfile.write(b"grace_period_started")

            # Start a 3-second countdown before actually dying
            cancel_pending_shutdown()
            SHUTDOWN_TIMER = threading.Timer(3.0, execute_shutdown, [self.server])
            SHUTDOWN_TIMER.start()
            return

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

def send_linux_notification(title, message):
    try:
        # Standard freedesktop notification on GNOME, KDE, XFCE, etc.
        subprocess.run(["notify-send", title, message], check=False)
    except Exception:
        # Fallback if notify-send is unavailable
        print(f"[{title}] {message}")

def monitor_heartbeat(server):
    global LAST_HEARTBEAT
    notified = False

    while True:
        time.sleep(5)
        elapsed = time.time() - LAST_HEARTBEAT

        if elapsed > TIMEOUT and not notified:
            notification_msg = "Piano Studio tab inactive/closed. Server is still running on port 8000."
            print(f"\n[ALERT] {notification_msg}")

            # Send desktop notification
            send_linux_notification("Piano Studio", notification_msg)

            # Mark notified so it doesn't spam every 5 seconds
            # notified = True

        elif elapsed <= TIMEOUT:
            # Reset flag once the browser reconnects and sends a fresh heartbeat
            notified = False

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
# Uncomment the following 3 lines to automatically open the browser (requires Brave browser installed)
# try:
#     webbrowser.get("brave-browser %s").open(f"http://localhost:{PORT}")
# except webbrowser.Error:
#     webbrowser.open(f"http://localhost:{PORT}", new=0)

# Keep the server running, but watch for Ctrl+C
try:
    httpd.serve_forever()
except KeyboardInterrupt:
    print("\n🛑 Ctrl+C detected! Killing ghosts and closing the piano...")
    httpd.server_close()  # This forces the port to be freed instantly!
    print("Goodbye!")