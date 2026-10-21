/**
 * Piano Studio - Bottom Piano Keyboard Component
 *
 * Full-width 61-key piano keyboard (C2 to C7 / MIDI 36 to 96),
 * draggable height resizing, and duration-accurate chord lighting.
 */

import { playAcousticPianoSound } from './piano-synth.js';

const STORAGE_OPEN_KEY = 'piano_studio_keyboard_open';
const STORAGE_HEIGHT_KEY = 'piano_studio_keyboard_height';
const START_MIDI = 36; // C2
const END_MIDI = 96;   // C7 (61 keys total: 36 white, 25 black)

// Offsets in semitones: 0=C, 1=C#, 2=D, 3=D#, 4=E, 5=F, 6=F#, 7=G, 8=G#, 9=A, 10=A#, 11=B
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

        // Click interaction with acoustic piano synthesis
        keyEl.addEventListener('mousedown', () => {
            triggerKeyAnimation(keyEl);
            playAcousticPianoSound(midi);
        });
        keyEl.addEventListener('mouseup', () => keyEl.classList.remove('active', 're-strike'));
        keyEl.addEventListener('mouseleave', () => keyEl.classList.remove('active', 're-strike'));
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
    void keyEl.offsetWidth; // Force layout reflow
    keyEl.classList.add('active', 're-strike');
}

export function lightUpKeys(pitchArray, timingInfo = null) {
    if (!pitchArray || pitchArray.length === 0) {
        clearLitKeys();
        return;
    }

    const newPitchesMap = new Map(); // midiNum -> calculatedDurationMs

    const msPerMeasure = (timingInfo && timingInfo.msPerMeasure) ? timingInfo.msPerMeasure : 2000;
    const fallbackMs = (timingInfo && timingInfo.eventDurationMs) ? timingInfo.eventDurationMs : null;

    pitchArray.forEach(p => {
        const midiNum = typeof p === 'object' ? (p.pitch ?? p.midi) : p;
        if (midiNum === undefined) return;

        let noteDurationMs = null;
        if (typeof p === 'object' && p.durationInMeasures) {
            noteDurationMs = p.durationInMeasures * msPerMeasure;
        } else if (typeof p === 'object' && p.duration) {
            noteDurationMs = p.duration * 1000;
        } else if (fallbackMs) {
            noteDurationMs = fallbackMs;
        }

        newPitchesMap.set(midiNum, noteDurationMs);
    });

    // 1. Clear ONLY pitches that have expired or are explicitly not part of the active polyphony
    // In multi-voice piano music, a bass chord should continue ringing while the treble plays faster notes!
    // Therefore, do NOT abruptly kill bass notes just because a treble event arrived.
    
    // 2. Light up and strike the active keys in this event
    newPitchesMap.forEach((durationMs, midiNum) => {
        const keyEl = document.querySelector(`.piano-key[data-midi="${midiNum}"]`);
        if (!keyEl) return;

        triggerKeyAnimation(keyEl);
        activeKeyPitches.add(keyEl);

        // Clear any previous timeout for this specific key
        if (activeKeyTimeouts.has(midiNum)) {
            clearTimeout(activeKeyTimeouts.get(midiNum));
            activeKeyTimeouts.delete(midiNum);
        }

        // Schedule key release strictly when its musical duration ends
        if (durationMs && durationMs > 0) {
            const timeoutId = setTimeout(() => {
                keyEl.classList.remove('active', 're-strike');
                activeKeyPitches.delete(keyEl);
                activeKeyTimeouts.delete(midiNum);
            }, Math.max(60, durationMs - 35)); // 35ms release cushion
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

    // Draggable Top Border Resizing
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

    window.addEventListener('resize', () => {
        if (isTrayOpen) updateBlackKeyPositions();
    });

    window.addEventListener('keydown', (e) => {
        if (e.target && (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT')) return;
        if (e.key === 'k' || e.key === 'K') {
            e.preventDefault();
            togglePianoTray();
        }
    });
}
