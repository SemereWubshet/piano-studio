# Piano Studio

A lightweight, local piano practice studio that syncs directly with local files to provide a seamless, native-desktop experience inside a web browser. Since it uses human readable ABC notation (`.abc` files), it allows musicians to manage, edit, and practice an entire multi-song repertoire using simple plain-text files. This makes transcribing, version-controlling, and learning new piano pieces as fast and lightweight.

**The Frontend:** Modern light mode and a clean dashboard layout. It uses vanilla `abcjs` via CDN for reliable SVG sheet music generation and piano Web Audio synthesis.

**The Backend:** A tiny Python server (`launcher.py`) handles local file I/O operations and port binding. It utilizes a background watchdog that shuts down and frees the port when  the browser tab is closed.

**The OS Bridge:** To achieve a true one-click launch without opening terminal windows, the application relies on a custom `piano://` URI scheme registered directly to the Linux desktop environment and whitelisted through Chromium's security policies.

---

## How to Run It

There are two ways to run the studio, depending on how deeply you want to integrate it into your system.

### Method 1: The Quick Start (Terminal)

The fastest way to test the application is to run the Python backend manually.

1. Open a terminal in the project directory.
2. Run the following command:
```bash
python launcher.py

```

3. Open a browser and navigate to `http://localhost:8000`.

*Note: If you want the script to spawn the browser tab for you automatically, open `launcher.py`, locate the `webbrowser.open('http://localhost:8000')` command, and uncomment it.*

---

### Method 2: Seamless Desktop Integration (The Zero-Terminal Experience)

For daily practice, this setup allows you to launch the local studio instantly from a browser bookmark with zero terminal windows and zero security popups.

**1. Register the Custom Protocol to Linux**<br>
Create a desktop entry so your operating system recognizes the `piano://` link and knows to launch the Python script in the background.

* Create a file at `~/.local/share/applications/piano-studio.desktop` and add the following:
```
[Desktop Entry]
Name=Piano Launcher
Exec=/usr/bin/python3 /path/to/launcher.py %u
Type=Application
Terminal=false
MimeType=x-scheme-handler/piano;
```
* Next, run the following commands to rebuild the desktop database and register the handler:
```
update-desktop-database ~/.local/share/applications/
xdg-mime default piano-studio.desktop x-scheme-handler/piano
```

**2. Whitelist the Protocol in Chromium/Brave**<br>
To prevent the browser from showing a security warning every time you launch the app, create a mandatory OS-level policy for Chromium-based browsers.

* Create a JSON policy file at `/etc/brave/policies/managed/piano_policy.json` (or the equivalent Chrome path).
* Paste the following JSON to explicitly whitelist the `piano` protocol:
```
{
  "AutoLaunchProtocolsFromOrigins": [
    {
      "allowed_origins": [ "*" ],
      "protocol": "piano"
    }
  ]
}
```
* Explicitly whitelist the `piano` protocol using the `AutoLaunchProtocolsFromOrigins` policy so the browser automatically trusts the local request.

**3. Clear the cache**<br>
Browsers cache registered protocol handlers and policies at startup. Type `brave://restart` (or `chrome://restart`) in your URL bar and press Enter to apply the changes.

**4. Launch via `launcher.html`**<br>
Because modern browsers strip origin contexts from bookmarks and New Tab pages, the protocol must be fired from a valid local file to satisfy the policy engine.

* Add the absolute path to your `launcher.html` (e.g., `file:///home/user/my-piano-app/launcher.html`) as a browser bookmark.
* The HTML file uses a microscopic `iframe` to silently fire the `piano://start` protocol to the OS, instantly waking the Python server.
* A high-speed `requestAnimationFrame` loop pings the local port and uses `window.location.replace()` to swap the current tab to the active studio the exact millisecond Python is ready.

---

## Adding Your Sheet Music (The Scores Folder)

This application is designed to act as a local dashboard for your plain-text sheet music. It reads from the `scores/` directory in the root folder.

1. Navigate to the `scores/` folder in the project directory (pre-loaded with `sample.abc` to help you get started).
2. Create or drop your `.abc` files directly into this folder.
3. The dashboard will automatically read them and populate your sidebar.

**Note on Git Tracking:** The `.gitignore` is configured to track the `scores/` directory and the `sample.abc` template, but it will intentionally ignore any new personal sheet music files you add. Your local practice repertoire remains entirely private to your machine.