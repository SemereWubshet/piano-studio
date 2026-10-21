/**
 * Piano Studio - Live MIDI-to-ABC Notation Recorder
 *
 * Captures physical USB MIDI (or virtual piano) notes and chords,
 * converts MIDI pitches and hold durations into standard ABC notation,
 * inserts barlines automatically, and live-renders the sheet music.
 */

import { state } from './state.js';
import { subscribeMidiEvents, showStudioToast } from './midi-engine.js';
import { toggleEditor } from './editor.js';
import { togglePianoTray } from './piano-keyboard.js';

const UPPER_NAMES = ['C', '^C', 'D', '^D', 'E', 'F', '^F', 'G', '^G', 'A', '^A', 'B'];
const LOWER_NAMES = ['c', '^c', 'd', '^d', 'e', 'f', '^f', 'g', '^g', 'a', '^a', 'b'];

let currentCluster = null;
let beatsInMeasure = 0;
let measuresInLine = 0;

/**
 * Converts a MIDI pitch integer (21-108) into standard ABC pitch notation.
 */
export function midiToAbcPitch(midi) {
    const octave = Math.floor(midi / 12) - 1;
    const semitone = ((midi % 12) + 12) % 12;

    if (octave <= 4) {
        const commas = ','.repeat(Math.max(0, 4 - octave));
        return `${UPPER_NAMES[semitone]}${commas}`;
    } else {
        const apostrophes = "'".repeat(Math.max(0, octave - 5));
        return `${LOWER_NAMES[semitone]}${apostrophes}`;
    }
}

/**
 * Quantizes held duration in milliseconds into an ABC length suffix & beat count.
 */
function quantizeDuration(heldMs) {
    if (heldMs < 300) return { suffix: '/', beats: 0.5 };
    if (heldMs < 850) return { suffix: '', beats: 1.0 };
    if (heldMs < 1500) return { suffix: '2', beats: 2.0 };
    if (heldMs < 2100) return { suffix: '3', beats: 3.0 };
    return { suffix: '4', beats: 4.0 };
}

function commitCluster(cluster) {
    if (!cluster || cluster.pitches.size === 0) return;

    const heldMs = Math.max(80, performance.now() - cluster.startTime);
    const { suffix, beats } = quantizeDuration(heldMs);

    const sortedPitches = Array.from(cluster.pitches).sort((a, b) => a - b);
    const abcNotes = sortedPitches.map(midiToAbcPitch);

    const token = abcNotes.length === 1
        ? `${abcNotes[0]}${suffix}`
        : `[${abcNotes.join('')}]${suffix}`;

    appendAbcToken(token, beats);
}

function appendAbcToken(token, beats) {
    const textarea = document.getElementById('abc-source');
    if (!textarea) return;

    let currentText = textarea.value;
    if (currentText.length > 0 && !currentText.endsWith(' ') && !currentText.endsWith('\n')) {
        currentText += ' ';
    }

    currentText += `${token} `;
    beatsInMeasure += beats;

    if (beatsInMeasure >= 4.0) {
        currentText += '| ';
        beatsInMeasure = 0;
        measuresInLine++;
        if (measuresInLine >= 4) {
            currentText = currentText.trimEnd() + '\n';
            measuresInLine = 0;
        }
    }

    textarea.value = currentText;
    textarea.scrollTop = textarea.scrollHeight;

    // Live-render the updated ABC code on the sheet music canvas
    if (window.ABCJS) {
        ABCJS.renderAbc('paper', currentText, {
            responsive: 'resize',
            add_classes: true,
            staffwidth: 760
        });
    }
}

function handleRecorderNoteOn(midi) {
    if (!state.isRecordingMidi) return;

    const now = performance.now();

    // If a cluster was started within 75ms, group into a chord
    if (currentCluster && (now - currentCluster.startTime) <= 75) {
        currentCluster.pitches.add(midi);
        currentCluster.activePitches.add(midi);
        return;
    }

    // If a previous cluster was still open (legato playing), commit it first
    if (currentCluster) {
        commitCluster(currentCluster);
    }

    currentCluster = {
        startTime: now,
        pitches: new Set([midi]),
        activePitches: new Set([midi])
    };
}

function handleRecorderNoteOff(midi) {
    if (!state.isRecordingMidi || !currentCluster) return;

    currentCluster.activePitches.delete(midi);
    if (currentCluster.activePitches.size === 0) {
        commitCluster(currentCluster);
        currentCluster = null;
    }
}

export function toggleMidiRecording(forceState) {
    state.isRecordingMidi = (typeof forceState === 'boolean') ? forceState : !state.isRecordingMidi;

    const recBtn = document.getElementById('btn-record-midi');
    if (recBtn) {
        recBtn.classList.toggle('recording', state.isRecordingMidi);
        recBtn.textContent = state.isRecordingMidi ? '⏹ Stop Rec' : '🔴 Record MIDI';
    }

    if (state.isRecordingMidi) {
        if (state.synthControl) state.synthControl.pause();
        toggleEditor(true);
        togglePianoTray(true);
        currentCluster = null;
        beatsInMeasure = 0;
        measuresInLine = 0;
        showStudioToast('🔴 Recording MIDI to ABC Editor: Play notes or chords on your piano!');
    } else {
        if (currentCluster) {
            commitCluster(currentCluster);
            currentCluster = null;
        }
        showStudioToast('⏹ MIDI Recording Stopped (Click "Save Changes" to persist to disk)');
    }
}

export function initMidiRecorder() {
    document.getElementById('btn-record-midi')?.addEventListener('click', () => {
        toggleMidiRecording();
    });

    subscribeMidiEvents({
        onNoteOn: handleRecorderNoteOn,
        onNoteOff: handleRecorderNoteOff
    });
}

