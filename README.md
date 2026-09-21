# Piano Studio

A lightweight, local piano practice studio that syncs directly with your local files to provide a seamless, native-desktop experience inside a web browser. Powered by human-readable ABC notation (`.abc` files), it allows musicians to manage, edit, and practice an entire multi-song repertoire using simple plain-text files. This makes transcribing, version-controlling, and learning new piano pieces as fast and accessible as possible.

- **The Frontend:** Built with native browser ES modules, modular CSS, and vanilla `abcjs` via CDN for crisp SVG sheet music rendering and Web Audio MIDI synthesis.
- **The Backend:** A tiny Python server (`launcher.py`) handles local file I/O operations, heartbeat tracking, and automatic port cleanup when tabs are closed.
- **The OS Bridge:** A custom `piano://` protocol registered with Linux and whitelisted in Chromium allows a true one-click, zero-terminal launch directly from a browser bookmark.

---

## ✨ Features

- 🎼 **Live ABC Sheet Music Rendering:** Automatically renders multi-tune ABC files into clean, interactive musical scores.
- 🎹 **Integrated Web Audio Playback:** Synth playback with real-time note highlighting, looping, tempo warp, and a custom audio scrubber.
- 🔍 **Focus Mode (Split-Screen Friendly):** Hide the sidebar, top bars, and audio player with a single click or keypress to maximize sheet visibility when practicing alongside video tutorials.
- 🔎 **Fluid Zooming:** Smoothly scale sheet music using keyboard shortcuts, toolbar buttons, or <kbd>Ctrl</kbd> + Mouse Wheel.
- ✏️ **In-Browser ABC Editor:** Slide out a side drawer to edit ABC code on the fly and save changes straight back to disk with automatic file reloads.
- 📐 **Draggable Layout:** Drag sidebar and editor borders to customize your screen layout to your preference.
- 🎨 **Modular CSS Themes:** Centralized color and sizing variables in `css/variables.css` (featuring a velvety midnight navy and warm gold theme).
- 🛑 **Smart Auto-Shutdown:** Tab-close watchdog automatically terminates the background server and frees port 8000 when you are done practicing.

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| <kbd>F</kbd> | Toggle Focus Mode (maximize sheet music) |
| <kbd>Esc</kbd> | Exit Focus Mode |
| <kbd>+</kbd> or <kbd>=</kbd> | Zoom In |
| <kbd>-</kbd> or <kbd>_</kbd> | Zoom Out |
| <kbd>0</kbd> | Reset Zoom to 100% |
| <kbd>Ctrl</kbd> + Mouse Wheel | Zoom in/out smoothly over sheet music |

*(Keyboard shortcuts are automatically suppressed while typing in the ABC editor.)*

---

## 📂 Project Structure

Piano Studio is architected into clean, single-responsibility modules with zero build steps or bundlers required:

```
piano-studio/
├── css/
│   ├── variables.css      # Design tokens, theme colors (navy/gold), sizing
│   ├── layout.css         # Main app shell, stage, and paper canvas
│   ├── sidebar.css        # Tree navigation, folders, and tunes list
│   ├── audio-bar.css      # Custom player bar styling, buttons, seeker track
│   ├── editor.css         # ABC raw code drawer and save controls
│   └── focus-mode.css     # Focus mode layout overrides & floating glass controls
├── js/
│   ├── state.js           # Central state store (active file, zoom, tunes)
│   ├── api.js             # HTTP communication (scores, save, heartbeat, shutdown)
│   ├── music-engine.js    # ABCJS score rendering & synth audio controller
│   ├── sidebar.js         # Tree accordion rendering & sidebar drag resizing
│   ├── editor.js          # Code drawer toggling, resizing, and save logic
│   ├── focus-controls.js  # Focus mode toggles, zoom math, and shortcuts
│   └── app.js             # Main entry point and orchestrator
├── scores/
│   └── sample.abc         # Starter repertoire file
├── launcher.py            # Local HTTP server, watchdog, and save endpoints
├── launcher.html          # Lightweight trigger page for OS protocol launch
├── index.html             # Main application shell
└── style.css              # Master stylesheet importing css/ modules
```

---

## 🚀 How to Run It

### Method 1: The Quick Start (Terminal)

The fastest way to run the studio is via Python:

1. Open a terminal in the project directory.
2. Start the launcher:
   ```bash
   python launcher.py
   ```
3. Open your browser and go to `http://localhost:8000`.

---

### Method 2: Seamless Desktop Integration (Zero-Terminal Experience)

For daily practice, you can launch Piano Studio directly from a browser bookmark with zero open terminals:

#### 1. Register the Custom Protocol in Linux
Create a desktop entry so Linux recognizes the `piano://` protocol:

* Create `~/.local/share/applications/piano-studio.desktop` with:
  ```ini
  [Desktop Entry]
  Name=Piano Launcher
  Exec=/usr/bin/python3 /path/to/launcher.py %u
  Type=Application
  Terminal=false
  MimeType=x-scheme-handler/piano;
  ```
* Update your desktop database and register the protocol handler:
  ```bash
  update-desktop-database ~/.local/share/applications/
  xdg-mime default piano-studio.desktop x-scheme-handler/piano
  ```

#### 2. Whitelist the Protocol in Chromium / Brave
To suppress the browser security confirmation popup:

* Create `/etc/brave/policies/managed/piano_policy.json` (or `/etc/opt/chrome/policies/managed/piano_policy.json`):
  ```json
  {
    "AutoLaunchProtocolsFromOrigins": [
      {
        "allowed_origins": [ "*" ],
        "protocol": "piano"
      }
    ]
  }
  ```

#### 3. Restart Browser & Bookmark `launcher.html`
* Restart your browser (`brave://restart` or `chrome://restart`) to load policies.
* Bookmark `launcher.html` using its absolute path (e.g. `file:///home/user/piano-studio/launcher.html`).
* Clicking the bookmark triggers the `piano://start` protocol in an invisible frame, instantly wakes `launcher.py`, and seamlessly redirects you to `http://localhost:8000` the millisecond Python is ready.

---

## 🎼 Adding Sheet Music (`scores/`)

1. Drop `.abc` files directly into the `scores/` directory.
2. Multi-tune files (using standard ABC `X:1`, `X:2` tune headers) are automatically parsed into expandable folders in the sidebar.
3. Edits made outside the app (e.g. in VS Code) or inside the built-in drawer sync automatically through the background watcher.

> **Note on Git Tracking:** `.gitignore` tracks the `scores/` folder and `sample.abc` template, but ignores personal score files so your practice library stays private.

---

## 🎨 Customizing Themes

Colors and dimensions are cleanly isolated in [`css/variables.css`](css/variables.css). To adjust the theme (e.g. player colors, seeker bar, highlights), simply edit the variables under `:root`:

```css
--player-bg: #0f172a;        /* Velvet midnight navy pill */
--seeker-fill-color: #fbbf24;/* Warm luminous gold progress bar */
--accent: #1d4ed8;           /* Royal navy accent */
```