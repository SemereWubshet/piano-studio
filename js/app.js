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
import { initTimingCoach } from './timing-coach.js';
import { initMidiShortcuts } from './midi-shortcuts.js';
import { initMidiRecorder } from './midi-recorder.js';
import { getCurrentVoiceId, setPianoVoice, getIsSustainEnabled, toggleSustainPedal } from './piano-synth.js';

const STORAGE_LAST_SCORE_KEY = 'piano_studio_last_score_file';
const STORAGE_LAST_TUNE_KEY = 'piano_studio_last_tune_index';

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
        initTimingCoach();
        initMidiShortcuts();
        initMidiRecorder();
        initMidiEngine();

        await this.loadAllScores();
        startHeartbeatMonitor(() => this.loadAllScores());
        checkHeartbeat(); // Cancel immediate shutdown timer
    }

    initVoiceSelector() {
        const selectEl = document.getElementById('select-piano-voice');
        const triggerBtn = document.getElementById('btn-piano-voice');
        const menuEl = document.getElementById('voice-dropdown-menu');
        const labelEl = document.getElementById('current-voice-label');
        const voiceOptions = document.querySelectorAll('.voice-option');

        const currentVoice = getCurrentVoiceId();
        if (selectEl) selectEl.value = currentVoice;

        const updateActiveVisual = (voiceId) => {
            voiceOptions.forEach(opt => {
                const isActive = opt.dataset.value === voiceId;
                opt.classList.toggle('active', isActive);
                if (isActive && labelEl) {
                    labelEl.textContent = opt.querySelector('span')?.textContent || opt.textContent.trim();
                }
            });
        };
        updateActiveVisual(currentVoice);

        const closeMenu = () => {
            if (menuEl) menuEl.classList.add('hidden');
            if (triggerBtn) triggerBtn.setAttribute('aria-expanded', 'false');
        };

        if (triggerBtn && menuEl) {
            triggerBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const isOpen = !menuEl.classList.contains('hidden');
                if (isOpen) {
                    closeMenu();
                } else {
                    menuEl.classList.remove('hidden');
                    triggerBtn.setAttribute('aria-expanded', 'true');
                }
            });

            voiceOptions.forEach(opt => {
                opt.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const val = opt.dataset.value;
                    if (val) {
                        setPianoVoice(val);
                        if (selectEl) selectEl.value = val;
                        updateActiveVisual(val);
                        const optText = opt.querySelector('span')?.textContent || val;
                        showStudioToast(`Tone: ${optText}`);
                    }
                    closeMenu();
                });
            });

            document.addEventListener('click', (e) => {
                if (!menuEl.classList.contains('hidden') && !menuEl.contains(e.target) && e.target !== triggerBtn) {
                    closeMenu();
                }
            });

            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && !menuEl.classList.contains('hidden')) {
                    closeMenu();
                }
            });
        }

        if (selectEl) {
            selectEl.addEventListener('change', (e) => {
                setPianoVoice(e.target.value);
                updateActiveVisual(e.target.value);
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
                const titleText = isEnabled ? 'Sustain on' : 'Sustain off';
                sustainBtn.title = titleText;
                sustainBtn.setAttribute('aria-label', titleText + '. Click to toggle sustain');
            };
            updateUI();

            sustainBtn.addEventListener('click', () => {
                const nowEnabled = toggleSustainPedal();
                updateUI();
                showStudioToast(nowEnabled ? 'Sustain: ON' : 'Sustain: OFF');
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
                const savedScore = localStorage.getItem(STORAGE_LAST_SCORE_KEY);
                const savedTune = parseInt(localStorage.getItem(STORAGE_LAST_TUNE_KEY) || '0', 10);

                let targetFile = state.scoreFiles[0];
                let targetTuneIndex = 0;

                if (savedScore && state.scoreFiles.includes(savedScore)) {
                    targetFile = savedScore;
                    targetTuneIndex = isNaN(savedTune) ? 0 : Math.max(0, savedTune);
                }

                state.expandedFiles.add(targetFile);
                this.selectTune(targetFile, targetTuneIndex);
            } else {
                renderSidebar((fileName, tuneIndex) => this.selectTune(fileName, tuneIndex));
            }
        } catch (error) {
            console.error("Could not load scores.", error);
        }
    }

    selectTune(fileName, tuneIndex = 0) {
        setActiveFile(fileName, tuneIndex);

        try {
            localStorage.setItem(STORAGE_LAST_SCORE_KEY, fileName);
            localStorage.setItem(STORAGE_LAST_TUNE_KEY, String(tuneIndex));
        } catch (e) {
            // Ignore potential localStorage quota or private browsing issues
        }

        renderSidebar((f, idx) => this.selectTune(f, idx));
        const activeTuneCode = renderMusicScore('paper');
        updateEditorContent(activeTuneCode);
        centerSheetMusic();

        const titleEl = document.getElementById('active-score-title');
        const composerEl = document.getElementById('active-score-composer');

        let displayTitle = fileName.replace('.abc', '').replace(/[-_]/g, ' ');
        let displayComposer = '';

        if (activeTuneCode) {
            const titleMatch = activeTuneCode.match(/^T:\s*(.+)$/m);
            const composerMatch = activeTuneCode.match(/^C:\s*(.+)$/m);
            if (titleMatch && titleMatch[1]) displayTitle = titleMatch[1].trim();
            if (composerMatch && composerMatch[1]) displayComposer = composerMatch[1].trim();
        }

        if (titleEl) titleEl.textContent = displayTitle;
        if (composerEl) {
            composerEl.textContent = displayComposer;
            composerEl.style.display = displayComposer ? 'block' : 'none';
        }
    }

    onScoreModified() {
        renderSidebar((f, idx) => this.selectTune(f, idx));
        const activeTuneCode = renderMusicScore('paper');
        updateEditorContent(activeTuneCode);
        centerSheetMusic();
    }

    setupSystemLifecycle() {
        // Tab unload signal (notifies server when tab is closed)
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

