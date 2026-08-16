import http.server
import socketserver
import webbrowser
import sys

PORT = 8000

# Try to force the Brave browser specifically (Linux command)
try:
    brave_path = "brave-browser %s"
    webbrowser.get(brave_path).open(f"http://localhost:{PORT}")
except webbrowser.Error:
    # Fallback to the system's default browser if Brave isn't found exactly
    webbrowser.open(f"http://localhost:{PORT}")

print(f"🎹 Piano Studio is live at http://localhost:{PORT}")
print("Press Ctrl+C in this terminal to shut down the studio when you're done practicing.")

# Start the local web server
Handler = http.server.SimpleHTTPRequestHandler
with socketserver.TCPServer(("", PORT), Handler) as httpd:
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nClosing the piano lid... Goodbye!")