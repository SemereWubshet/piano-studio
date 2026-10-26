/**
 * Piano Studio - Web MIDI Engine & Physical-to-Virtual Mirror
 *
 * Connects USB/Bluetooth MIDI keyboards via navigator.requestMIDIAccess,
 * mirrors physical keystrokes onto the bottom 61-key virtual piano,
 * and dispatches MIDI events to Wait Mode, Shortcuts, and Recorder modules.
 */

import { playAcousticPianoSound, stopAcousticPianoSound } from './piano-synth.js';
import { setUserMidiKeyVisual } from './piano-keyboard.js';

const STORAGE_MUTE_KEY = 'piano_studio_midi_mute_synth';
let midiAccess = null;
let muteMidiSynth = localStorage.getItem(STORAGE_MUTE_KEY) === 'true';
const subscribers = new Set();
const pressedPhysicalKeys = new Set();

/**
 * Registers a listener object `{ onNoteOn, onNoteOff, onCC }`.
 */
export function subscribeMidiEvents(listener) {
    subscribers.add(listener);
    return () => subscribers.delete(listener);
}

export function getPressedPhysicalKeys() {
    return pressedPhysicalKeys;
}

/**
 * Shows a sleek non-intrusive status toast in the top bar area.
 */
export function showStudioToast(message, durationMs = 2400) {
    let toast = document.getElementById('studio-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'studio-toast';
        toast.className = 'studio-toast hidden';
        document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.remove('hidden');

    if (toast._hideTimer) clearTimeout(toast._hideTimer);
    toast._hideTimer = setTimeout(() => {
        toast.classList.add('hidden');
    }, durationMs);
}

/**
 * Emits a NoteOn or NoteOff event (from either USB MIDI or Virtual Mouse Key).
 */
export function dispatchMidiNote(midi, velocity = 95, isNoteOn = true, source = 'usb') {
    if (isNoteOn) {
        pressedPhysicalKeys.add(midi);
        setUserMidiKeyVisual(midi, true);
        if (source === 'usb' && !muteMidiSynth) {
            playAcousticPianoSound(midi, velocity);
        }
        subscribers.forEach(sub => sub.onNoteOn && sub.onNoteOn(midi, velocity, source));
    } else {
        pressedPhysicalKeys.delete(midi);
        setUserMidiKeyVisual(midi, false);
        if (source === 'usb' && !muteMidiSynth) {
            stopAcousticPianoSound(midi);
        }
        subscribers.forEach(sub => sub.onNoteOff && sub.onNoteOff(midi, source));
    }
}

function handleMidiMessage(event) {
    const data = event.data;
    if (!data || data.length < 2) return;

    const status = data[0] & 0xf0;
    const data1 = data[1];
    const data2 = data.length > 2 ? data[2] : 0;

    if (status === 0x90) {
        // Note On (or Note Off if velocity === 0)
        if (data2 > 0) {
            dispatchMidiNote(data1, data2, true, 'usb');
        } else {
            dispatchMidiNote(data1, 0, false, 'usb');
        }
    } else if (status === 0x80) {
        // Note Off
        dispatchMidiNote(data1, 0, false, 'usb');
    } else if (status === 0xB0) {
        // Control Change (e.g. CC 64 Sustain Pedal)
        subscribers.forEach(sub => sub.onCC && sub.onCC(data1, data2));
    }
}

const SPEAKER_ON_SVG = `<svg width="15" height="15" viewBox="0 0 20 20" aria-hidden="true"><path d="M3 7.5h3l4-3.5v12l-4-3.5H3z" fill="currentColor"/><path d="M13 7a4 4 0 0 1 0 6M15.2 4.8a7 7 0 0 1 0 10.4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`;
const SPEAKER_OFF_SVG = `<svg width="15" height="15" viewBox="0 0 20 20" aria-hidden="true"><path d="M3 7.5h3l4-3.5v12l-4-3.5H3z" fill="currentColor"/><path d="M13.5 7.5l5 5M18.5 7.5l-5 5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`;

/** Real hardware inputs only (ignores the virtual "Midi Through" port). */
function getRealMidiInputs() {
    if (!midiAccess) return [];
    return Array.from(midiAccess.inputs.values()).filter(
        i => i && i.state === 'connected' && i.name && !/through|virtual|loop|virmidi/i.test(i.name)
    );
}

function updateMidiStatusUI() {
    const pillEl = document.getElementById('midi-status-pill');
    const badgeEl = document.getElementById('midi-device-status');
    const dotEl = document.getElementById('midi-status-dot');
    const soundBtn = document.getElementById('btn-midi-sound');

    if (soundBtn) {
        soundBtn.innerHTML = muteMidiSynth ? SPEAKER_OFF_SVG : SPEAKER_ON_SVG;
        soundBtn.title = muteMidiSynth
            ? 'Browser sound for your keyboard is muted. Click to unmute.'
            : 'Browser plays sound when you press keys on your keyboard. Click to mute.';
        soundBtn.setAttribute('aria-pressed', muteMidiSynth ? 'true' : 'false');
        soundBtn.classList.toggle('muted', muteMidiSynth);
    }

    // The pill only exists visually while a real MIDI device is connected
    const inputs = getRealMidiInputs();
    if (pillEl) {
        if (inputs.length === 0) {
            pillEl.classList.add('hidden');
            pillEl.style.display = 'none';
        } else {
            pillEl.classList.remove('hidden');
            pillEl.style.display = 'inline-flex';
            const primaryName = inputs[0].name || 'MIDI Keyboard';
            if (badgeEl) badgeEl.textContent = primaryName;
            pillEl.title = `Connected: ${primaryName}`;
            if (dotEl) {
                dotEl.className = `midi-dot connected ${state.isRecordingMidi ? 'recording' : ''}`.trim();
                dotEl.title = state.isRecordingMidi ? 'Recording MIDI... Click to stop' : 'Record MIDI';
            }
        }
    }

    // Wait Mode option only surfaces when a physical MIDI keyboard is connected
    const waitModeBtn = document.getElementById('btn-wait-mode');
    if (waitModeBtn) {
        if (inputs.length === 0) {
            waitModeBtn.classList.add('hidden');
            waitModeBtn.style.display = 'none';
        } else {
            waitModeBtn.classList.remove('hidden');
            waitModeBtn.style.display = 'inline-flex';
        }
    }
}

function bindMidiInputs() {
    if (!midiAccess) return;
    for (const input of midiAccess.inputs.values()) {
        input.onmidimessage = handleMidiMessage;
    }
    updateMidiStatusUI();
}

export async function initMidiEngine() {
    updateMidiStatusUI();

    const soundBtn = document.getElementById('btn-midi-sound');
    if (soundBtn) {
        soundBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            muteMidiSynth = !muteMidiSynth;
            localStorage.setItem(STORAGE_MUTE_KEY, muteMidiSynth ? 'true' : 'false');
            updateMidiStatusUI();
            showStudioToast(muteMidiSynth ? 'Keyboard sound muted' : 'Keyboard sound on');
        });
    }

    await requestWebMidi();
}

async function requestWebMidi() {
    if (!navigator.requestMIDIAccess) {
        updateMidiStatusUI();
        return;
    }

    try {
        midiAccess = await navigator.requestMIDIAccess({ sysex: false });
        bindMidiInputs();

        midiAccess.onstatechange = (e) => {
            bindMidiInputs();
            if (e.port && e.port.type === 'input' && !/through/i.test(e.port.name || '')) {
                const stateLabel = e.port.state === 'connected' ? 'Connected' : 'Disconnected';
                showStudioToast(`🎹 ${stateLabel}: ${e.port.name}`);
            }
        };
    } catch (err) {
        console.warn('Web MIDI access denied or unavailable:', err);
        updateMidiStatusUI();
    }
}

