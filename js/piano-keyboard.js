/**
 * Piano Studio - Bottom Piano Keyboard Component
 *
 * Full-width 61-key piano keyboard (C2 to C7 / MIDI 36 to 96),
 * draggable height resizing, duration-accurate chord lighting,
 * and physical USB MIDI mirror + Wait Mode target/error states.
 */

import { playAcousticPianoSound, stopAcousticPianoSound } from './piano-synth.js';
import { dispatchMidiNote } from './midi-engine.js';

const STORAGE_OPEN_KEY = 'piano_studio_keyboard_open';
const STORAGE_HEIGHT_KEY = 'piano_studio_keyboard_height';
const START_MIDI = 36; // C2
const END_MIDI = 96;   // C7 (61 keys total: 36 white, 25 black)

const BLACK_KEY_OFFSETS = [1, 3, 6, 8, 10];

let isTrayOpen = localStorage.getItem(STORAGE_OPEN_KEY) === 'true';
let activeKeyPitches = new Set();
let activeKeyTimeouts = new Map(); // midi -> timeoutId

export function buildPianoDOM() {
    const keyboardEl = document.getElementById('piano-keyboard');
    if (!keyboardEl) return;
    keyboardEl.innerHTML = '';

    for (let midi = START_MIDI; midi <= END_MIDI; midi++) {
        const semitone = midi % 12;
        const isBlack = BLACK_KEY_OFFSETS.includes(semitone);

        const keyEl = document.createElement('div');
        keyEl.dataset.midi = midi;
        keyEl.className = `piano-key ${isBlack ? 'black-key' : 'white-key'}`;

        keyboardEl.appendChild(keyEl);

        // Mouse click interaction triggers acoustic synth + dispatches to MIDI bus
        keyEl.addEventListener('mousedown', (e) => {
            e.preventDefault();
            triggerKeyAnimation(keyEl);
            playAcousticPianoSound(midi, 95);
            dispatchMidiNote(midi, 95, true, 'mouse');
        });
        const releaseMouseKey = () => {
            if (keyEl.classList.contains('midi-user-active') || keyEl.classList.contains('active')) {
                keyEl.classList.remove('active', 're-strike');
                stopAcousticPianoSound(midi);
                dispatchMidiNote(midi, 0, false, 'mouse');
            }
        };
        keyEl.addEventListener('mouseup', releaseMouseKey);
        keyEl.addEventListener('mouseleave', releaseMouseKey);
    }

    updateBlackKeyPositions();
}

export function updateBlackKeyPositions() {
    const keyboardEl = document.getElementById('piano-keyboard');
    if (!keyboardEl) return;

    const whiteKeys = keyboardEl.querySelectorAll('.white-key');
    if (whiteKeys.length === 0) return;

    let whiteIdx = 0;
    for (let midi = START_MIDI; midi <= END_MIDI; midi++) {
        const semitone = midi % 12;
        const isBlack = BLACK_KEY_OFFSETS.includes(semitone);

        if (!isBlack) {
            whiteIdx++;
        } else {
            const blackKeyEl = keyboardEl.querySelector(`.black-key[data-midi="${midi}"]`);
            if (blackKeyEl && whiteKeys[whiteIdx]) {
                const currWhite = whiteKeys[whiteIdx];
                const centerPoint = currWhite.offsetLeft;
                const blackWidth = currWhite.offsetWidth * 0.62;
                blackKeyEl.style.width = `${blackWidth}px`;
                blackKeyEl.style.left = `${centerPoint - (blackWidth / 2)}px`;
            }
        }
    }
}

function triggerKeyAnimation(keyEl) {
    keyEl.classList.remove('re-strike', 'active');
    void keyEl.offsetWidth;
    keyEl.classList.add('active', 're-strike');
}

/**
 * Mirrors physical USB MIDI (or mouse) key presses onto the virtual keyboard.
 */
export function setUserMidiKeyVisual(midi, isPressed) {
    const keyEl = document.querySelector(`.piano-key[data-midi="${midi}"]`);
    if (!keyEl) return;
    if (isPressed) {
        keyEl.classList.remove('re-strike');
        void keyEl.offsetWidth;
        keyEl.classList.add('midi-user-active', 're-strike');
    } else {
        keyEl.classList.remove('midi-user-active', 'midi-wrong', 're-strike');
    }
}

/**
 * Highlights Wait-For-Me target keys and already-satisfied chord keys.
 */
export function renderWaitModeKeyTargets(targetPitches = [], satisfiedPitches = new Set()) {
    document.querySelectorAll('.piano-key.wait-target, .piano-key.midi-correct').forEach(el => {
        el.classList.remove('wait-target', 'midi-correct');
    });

    targetPitches.forEach(midi => {
        const keyEl = document.querySelector(`.piano-key[data-midi="${midi}"]`);
        if (!keyEl) return;
        if (satisfiedPitches.has(midi)) {
            keyEl.classList.add('midi-correct');
        } else {
            keyEl.classList.add('wait-target');
        }
    });
}

export function flashWrongMidiKey(midi) {
    const keyEl = document.querySelector(`.piano-key[data-midi="${midi}"]`);
    if (!keyEl) return;
    keyEl.classList.add('midi-wrong');
    setTimeout(() => keyEl.classList.remove('midi-wrong'), 450);
}

export function lightUpKeys(pitchArray, timingInfo = null) {
    if (!pitchArray || pitchArray.length === 0) {
        clearLitKeys();
        return;
    }

    const newPitchesMap = new Map();
    const msPerMeasure = (timingInfo && timingInfo.msPerMeasure) ? timingInfo.msPerMeasure : 2000;
    const fallbackMs = (timingInfo && timingInfo.eventDurationMs) ? timingInfo.eventDurationMs : null;

    pitchArray.forEach(p => {
        const midiNum = typeof p === 'object' ? (p.pitch ?? p.midi) : p;
        if (midiNum === undefined) return;

        let noteDurationMs = null;
        if (typeof p === 'object' && typeof p.durationInMeasures === 'number') {
            noteDurationMs = p.durationInMeasures * msPerMeasure;
        } else if (typeof p === 'object' && typeof p.duration === 'number') {
            // If duration <= 4.0, it is represented in whole-note fractions (1.0 = whole note)
            noteDurationMs = (p.duration <= 4.0) ? p.duration * msPerMeasure : p.duration;
        } else if (fallbackMs) {
            noteDurationMs = fallbackMs;
        }
        newPitchesMap.set(midiNum, noteDurationMs);
    });

    newPitchesMap.forEach((durationMs, midiNum) => {
        const keyEl = document.querySelector(`.piano-key[data-midi="${midiNum}"]`);
        if (!keyEl) return;

        triggerKeyAnimation(keyEl);
        activeKeyPitches.add(keyEl);

        if (activeKeyTimeouts.has(midiNum)) {
            clearTimeout(activeKeyTimeouts.get(midiNum));
            activeKeyTimeouts.delete(midiNum);
        }

        if (durationMs && durationMs > 0) {
            const timeoutId = setTimeout(() => {
                keyEl.classList.remove('active', 're-strike');
                activeKeyPitches.delete(keyEl);
                activeKeyTimeouts.delete(midiNum);
            }, Math.max(60, durationMs - 15)); // Minimal 15ms release cushion for crisp legato/re-strike
            activeKeyTimeouts.set(midiNum, timeoutId);
        }
    });
}

export function clearLitKeys() {
    activeKeyTimeouts.forEach(tId => clearTimeout(tId));
    activeKeyTimeouts.clear();
    activeKeyPitches.forEach(k => k.classList.remove('active', 're-strike'));
    activeKeyPitches.clear();
}

export function togglePianoTray(forceState) {
    const dockEl = document.getElementById('piano-dock');
    const toggleBtn = document.getElementById('btn-toggle-keyboard');

    isTrayOpen = (typeof forceState === 'boolean') ? forceState : !isTrayOpen;

    if (dockEl) {
        dockEl.classList.toggle('open', isTrayOpen);
        if (isTrayOpen) requestAnimationFrame(() => updateBlackKeyPositions());
    }
    if (toggleBtn) toggleBtn.classList.toggle('active', isTrayOpen);
    const focusBtn = document.getElementById('btn-focus-keys');
    if (focusBtn) focusBtn.classList.toggle('active', isTrayOpen);

    localStorage.setItem(STORAGE_OPEN_KEY, isTrayOpen ? 'true' : 'false');
}

export function initPianoKeyboard() {
    buildPianoDOM();

    const savedHeight = localStorage.getItem(STORAGE_HEIGHT_KEY);
    const dockEl = document.getElementById('piano-dock');
    if (dockEl && savedHeight) {
        dockEl.style.setProperty('--piano-h', `${savedHeight}px`);
        dockEl.style.height = `${savedHeight}px`;
    }

    togglePianoTray(isTrayOpen);

    const handleEl = document.getElementById('piano-resize-handle');
    if (handleEl && dockEl) {
        handleEl.addEventListener('mousedown', (e) => {
            e.preventDefault();
            document.body.style.cursor = 'row-resize';
            document.body.style.userSelect = 'none';

            const startY = e.clientY;
            const startH = dockEl.offsetHeight;

            const onMove = (moveEvt) => {
                const deltaY = startY - moveEvt.clientY;
                const newHeight = Math.max(90, Math.min(380, startH + deltaY));
                dockEl.style.setProperty('--piano-h', `${newHeight}px`);
                dockEl.style.height = `${newHeight}px`;
                updateBlackKeyPositions();
            };

            const onUp = () => {
                document.body.style.cursor = '';
                document.body.style.userSelect = '';
                localStorage.setItem(STORAGE_HEIGHT_KEY, dockEl.offsetHeight.toString());
                window.removeEventListener('mousemove', onMove);
                window.removeEventListener('mouseup', onUp);
            };

            window.addEventListener('mousemove', onMove);
            window.addEventListener('mouseup', onUp);
        });
    }

    document.getElementById('btn-toggle-keyboard')?.addEventListener('click', () => togglePianoTray());
    window.addEventListener('resize', () => { if (isTrayOpen) updateBlackKeyPositions(); });

    // Automatically reposition black keys whenever #piano-keyboard width changes
    // (e.g. sidebar collapse/expand animation, sidebar drag resize, editor drawer toggle)
    const keyboardEl = document.getElementById('piano-keyboard');
    if (keyboardEl && window.ResizeObserver) {
        const ro = new ResizeObserver(() => {
            if (isTrayOpen) updateBlackKeyPositions();
        });
        ro.observe(keyboardEl);
    }

    window.addEventListener('keydown', (e) => {
        if (e.target && (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT')) return;
        if (e.key === 'k' || e.key === 'K') {
            e.preventDefault();
            togglePianoTray();
        }
    });
}
