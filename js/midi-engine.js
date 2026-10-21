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

function updateMidiStatusUI() {
    const badgeEl = document.getElementById('midi-device-status');
    const dotEl = document.getElementById('midi-status-dot');
    const soundBtn = document.getElementById('btn-midi-sound');

    if (soundBtn) {
        soundBtn.textContent = muteMidiSynth ? '🔇' : '🔊';
        soundBtn.title = muteMidiSynth
            ? 'MIDI Synth Muted (Using hardware piano speakers). Click to unmute.'
            : 'MIDI Synth Active (Web Audio plays when pressing USB keys). Click to mute.';
        soundBtn.classList.toggle('muted', muteMidiSynth);
    }

    if (!badgeEl || !dotEl) return;

    if (!midiAccess) {
        badgeEl.textContent = 'MIDI Unavailable';
        dotEl.className = 'midi-dot disconnected';
        return;
    }

    const inputs = Array.from(midiAccess.inputs.values()).filter(
        i => i.state === 'connected' && !/through/i.test(i.name)
    );
    // Fallback if only Midi Through is present
    const allInputs = inputs.length > 0 ? inputs : Array.from(midiAccess.inputs.values());

    if (allInputs.length > 0) {
        const primaryName = allInputs[0].name || 'USB Keyboard';
        const shortName = primaryName.length > 20 ? primaryName.slice(0, 18) + '…' : primaryName;
        badgeEl.textContent = `MIDI: ${shortName}`;
        dotEl.className = 'midi-dot connected';
    } else {
        badgeEl.textContent = 'No USB MIDI';
        dotEl.className = 'midi-dot waiting';
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
            showStudioToast(muteMidiSynth ? '🔇 USB MIDI Web Synth Muted' : '🔊 USB MIDI Web Synth Enabled');
        });
    }

    const pillEl = document.getElementById('midi-status-pill');
    if (pillEl) {
        pillEl.addEventListener('click', () => requestWebMidi());
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
            if (e.port && e.port.type === 'input') {
                const stateLabel = e.port.state === 'connected' ? 'Connected' : 'Disconnected';
                showStudioToast(`🎹 MIDI ${stateLabel}: ${e.port.name}`);
            }
        };
    } catch (err) {
        console.warn('Web MIDI access denied or unavailable:', err);
        updateMidiStatusUI();
    }
}

