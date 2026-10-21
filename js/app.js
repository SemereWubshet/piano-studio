/**
 * Piano Studio - Application Orchestrator
 *
 * Bootstraps modules, coordinates state changes, and configures event lifecycles.
 */

import { state, setActiveFile } from './state.js';
import { fetchScoreList, fetchScoreContent, sendShutdownSignal, checkHeartbeat, startHeartbeatMonitor } from './api.js';
import { renderMusicScore } from './music-engine.js';
import { renderSidebar, initSidebarControls } from './sidebar.js';
import { updateEditorContent, initEditorControls } from './editor.js';
import { initFocusAndZoomControls, centerSheetMusic } from './focus-controls.js';
import { initCountdownUI } from './countdown.js';
import { initPianoKeyboard } from './piano-keyboard.js';
import { initMidiEngine, showStudioToast } from './midi-engine.js';
import { initWaitMode } from './wait-mode.js';
import { initMidiShortcuts } from './midi-shortcuts.js';
import { initMidiRecorder } from './midi-recorder.js';
import { getCurrentVoiceId, setPianoVoice, getIsSustainEnabled, toggleSustainPedal } from './piano-synth.js';

class PianoStudioApp {
    async init() {
        this.setupSystemLifecycle();
        initSidebarControls();
        initEditorControls(() => this.onScoreModified());
        initFocusAndZoomControls();
        initCountdownUI();
        initPianoKeyboard();
        this.initVoiceSelector();
        this.initSustainToggle();
        initWaitMode();
        initMidiShortcuts();
        initMidiRecorder();
        initMidiEngine();

        await this.loadAllScores();
        startHeartbeatMonitor(() => this.loadAllScores());
        checkHeartbeat(); // Cancel immediate shutdown timer
    }

    initVoiceSelector() {
        const selectEl = document.getElementById('select-piano-voice');
        if (selectEl) {
            selectEl.value = getCurrentVoiceId();
            selectEl.addEventListener('change', (e) => {
                setPianoVoice(e.target.value);
                const chosenOption = selectEl.options[selectEl.selectedIndex];
                showStudioToast(`Tone: ${chosenOption ? chosenOption.text : e.target.value}`);
            });
        }
    }

    initSustainToggle() {
        const sustainBtn = document.getElementById('btn-toggle-sustain');
        if (sustainBtn) {
            const updateUI = () => {
                const isEnabled = getIsSustainEnabled();
                sustainBtn.classList.toggle('active', isEnabled);
                sustainBtn.innerHTML = `<span class="sustain-pedal-icon">🦶</span> <span>Sustain: ${isEnabled ? 'ON' : 'OFF'}</span>`;
            };
            updateUI();

            sustainBtn.addEventListener('click', () => {
                const nowEnabled = toggleSustainPedal();
                updateUI();
                showStudioToast(nowEnabled ? '🦶 Sustain Pedal: ON' : '🦶 Sustain Pedal: OFF');
            });
        }
    }

    async loadAllScores() {
        try {
            state.scoreFiles = await fetchScoreList();

            for (const file of state.scoreFiles) {
                state.fileContents[file] = await fetchScoreContent(file);
            }

            if (state.scoreFiles.length > 0 && !state.activeFileName) {
                this.selectTune(state.scoreFiles[0], 0);
            } else {
                renderSidebar((fileName, tuneIndex) => this.selectTune(fileName, tuneIndex));
            }
        } catch (error) {
            console.error("Could not load scores.", error);
        }
    }

    selectTune(fileName, tuneIndex = 0) {
        setActiveFile(fileName, tuneIndex);

        const titleEl = document.getElementById('active-score-title');
        if (titleEl) {
            titleEl.textContent = fileName.replace('.abc', '').replace(/[-_]/g, ' ');
        }

        renderSidebar((f, idx) => this.selectTune(f, idx));
        const activeTuneCode = renderMusicScore('paper');
        updateEditorContent(activeTuneCode);
        centerSheetMusic();
    }

    onScoreModified() {
        renderSidebar((f, idx) => this.selectTune(f, idx));
        const activeTuneCode = renderMusicScore('paper');
        updateEditorContent(activeTuneCode);
        centerSheetMusic();
    }

    setupSystemLifecycle() {
        // Quit button
        document.getElementById("btn-quit")?.addEventListener("click", () => {
            sendShutdownSignal();
            window.close();
            setTimeout(() => {
                document.body.innerHTML = `
                    <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100vh; background:#f8fafc; font-family:sans-serif;">
                        <h1 style="color:#0f172a; margin-bottom: 8px;">🎹 Studio Offline</h1>
                        <p style="color:#64748b;">The local server has been cleanly shut down.</p>
                        <p style="color:#64748b;">You can safely close this tab.</p>
                    </div>
                `;
            }, 150);
        });

        // Tab unload signal
        window.addEventListener("pagehide", () => sendShutdownSignal());

        // Audio unlock on user interaction
        const unlockAudio = () => {
            if (window.AudioContext || window.webkitAudioContext) {
                const ctx = new (window.AudioContext || window.webkitAudioContext)();
                if (ctx.state === "suspended") ctx.resume();
            }
            document.removeEventListener("click", unlockAudio);
        };
        document.addEventListener("click", unlockAudio, { once: true });
    }
}

window.addEventListener("DOMContentLoaded", () => {
    new PianoStudioApp().init();
});

