# Piano Studio

A lightweight, local piano practice studio that syncs directly with your local files to provide a seamless, native-desktop experience inside a web browser. Powered by human-readable ABC notation (`.abc` files), it allows musicians to manage, edit, and practice an entire multi-song repertoire using simple plain-text files. This makes transcribing, version-controlling, and learning new piano pieces as fast and accessible as possible.

- **The Frontend:** Built with native browser ES modules, modular CSS, and vanilla `abcjs` via CDN for crisp SVG sheet music rendering and Web Audio MIDI synthesis.
- **The Backend:** A tiny Python server (`launcher.py`) handles local file I/O operations, heartbeat tracking, and automatic port cleanup when tabs are closed.
- **The OS Bridge:** A custom `piano://` protocol registered with Linux and whitelisted in Chromium allows a true one-click, zero-terminal launch directly from a browser bookmark.

---

## ✨ Features

- 🎼 **Live ABC Sheet Music Rendering:** Automatically renders multi-tune ABC files into clean, interactive musical scores.
- 🔊 **Integrated Web Audio Playback:** Synth playback with real-time note highlighting, looping, lead-in countdown, and tempo warp.
- 🎹 **Interactive Light-Up Piano & USB MIDI Mirror:** A full-width bottom piano tray (C2-C7) with velocity-sensitive acoustic sound synthesis, multiple selectable piano voices (Concert Grand, Warm Upright, Rhodes EP, CP80, Synth Keyboard), toggleable Sustain Pedal, and live USB MIDI hardware mirroring.
- 🎯 **"Wait-For-Me" Practice Mode:** Interactive sheet follower that pauses on each note or polyphonic chord until you play the exact keys on your USB MIDI keyboard (highlighting target notes in gold, correct notes in emerald, and wrong notes in crimson).
- 🔴 **Live MIDI-to-ABC Recorder:** Play melodies or chords on your physical MIDI keyboard to transcribe them directly into clean ABC notation with automatic barlines and live sheet music preview.
- ✏️ **In-Browser ABC Editor:** Slide out a side drawer to edit ABC code on the fly and save changes straight back to disk with automatic file reloads (<kbd>Ctrl</kbd> + <kbd>Enter</kbd>).
- 🛑 **Smart Auto-Shutdown:** Tab-close watchdog automatically terminates the background server and frees port 8000 when you are done practicing.

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| <kbd>Ctrl</kbd> + <kbd>Enter</kbd> | Save changes in ABC Code Editor |
| <kbd>P</kbd> | Play / Pause Audio Playback |
| <kbd>R</kbd> | Toggle Repeat / Loop Playback |
| <kbd>W</kbd> | Toggle "Wait-For-Me" Interactive Practice Mode |
| <kbd>K</kbd> | Toggle Light-Up Piano Tray |
| <kbd>F</kbd> | Toggle Focus Mode (maximize sheet music) |
| <kbd>Esc</kbd> | Exit Focus Mode |
| <kbd>+</kbd> or <kbd>=</kbd> | Zoom In |
| <kbd>-</kbd> or <kbd>_</kbd> | Zoom Out |
| <kbd>0</kbd> | Reset Zoom to 100% |
| <kbd>Ctrl</kbd> + Mouse Wheel | Zoom in/out smoothly over sheet music |
| <kbd>Ctrl</kbd> + <kbd>R</kbd> | Reload browser page (standard browser behavior preserved) |

*(Keyboard shortcuts are automatically suppressed while typing in the ABC editor, except <kbd>Ctrl</kbd> + <kbd>Enter</kbd> to save.)*

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
│   ├── editor.css         # ABC raw code drawer, MIDI status pill, recorder UI
│   ├── focus-mode.css     # Focus mode layout overrides & floating glass controls
│   └── piano-keyboard.css # Bottom light-up piano dock, keys, and MIDI states
├── js/
│   ├── state.js           # Central state store (active file, zoom, tunes, modes)
│   ├── api.js             # HTTP communication (scores, save, heartbeat, shutdown)
│   ├── music-engine.js    # ABCJS score rendering & synth audio controller
│   ├── countdown.js       # Lead-in timer controller, audio metronome ticks
│   ├── piano-keyboard.js  # 61-key piano DOM, note lighting, and tray resizing
│   ├── piano-synth.js     # Velocity-sensitive acoustic piano Web Audio synth
│   ├── midi-engine.js     # Web MIDI API connection, hot-plugging, event bus
│   ├── wait-mode.js       # Interactive "Wait-For-Me" note/chord practice engine
│   ├── midi-shortcuts.js  # Hands-free sustain pedal and edge-key controls
│   ├── midi-recorder.js   # Live MIDI-to-ABC notation transcriber
│   ├── sidebar.js         # Tree accordion rendering & sidebar drag resizing
│   ├── editor.js          # Code drawer toggling, resizing, and save logic
│   ├── focus-controls.js  # Focus mode toggles, 60fps smooth zoom math, centering
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
* Bookmark `launcher.html` using its absolute Linux file path (e.g. `file:///home/semere/Desktop/sources/piano-studio/launcher.html`).
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