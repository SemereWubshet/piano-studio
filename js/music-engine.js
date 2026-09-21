/**
 * Piano Studio - Music Engine
 *
 * Integrates with ABCJS to render visual sheet music notation and configure audio synthesis.
 */

import { state } from './state.js';

export function parseTunes(abcText) {
    if (!abcText) return [];
    return abcText.split(/(?=^X:\s*\d+)/m).filter(t => t.trim().length > 0);
}

export function renderMusicScore(paperElementId = 'paper') {
    if (state.synthControl) {
        state.synthControl.pause();
    }

    const allTunes = parseTunes(state.fileContents[state.activeFileName] || "");
    const currentTuneAbc = allTunes[state.activeTuneIndex] || "";

    const visualObjs = ABCJS.renderAbc(paperElementId, currentTuneAbc, {
        responsive: "resize",
        add_classes: true,
        staffwidth: 760
    });

    if (ABCJS.synth.supportsAudio() && visualObjs.length > 0) {
        setupAudioController(visualObjs[0]);
    }

    return currentTuneAbc;
}

export function setupAudioController(visualObj) {
    const audioControlsEl = document.getElementById('midi-audio-controls');
    if (!audioControlsEl) return;
    audioControlsEl.innerHTML = '';

    state.synthControl = new ABCJS.synth.SynthController();

    const cursorControl = {
        onStart: () => {},
        onEvent: (ev) => {
            document.querySelectorAll('.abcjs-note_selected').forEach(el => el.classList.remove('abcjs-note_selected'));
            if (ev && ev.elements) {
                ev.elements.forEach(noteArray => {
                    noteArray.forEach(svgNode => svgNode.classList.add('abcjs-note_selected'));
                });
            }
        },
        onFinished: () => {
            document.querySelectorAll('.abcjs-note_selected').forEach(el => el.classList.remove('abcjs-note_selected'));
        }
    };

    state.synthControl.load("#midi-audio-controls", cursorControl, {
        displayLoop: true,
        displayRestart: true,
        displayPlay: true,
        displayProgress: true,
        displayWarp: true
    });

    const createSynth = new ABCJS.synth.CreateSynth();
    createSynth.init({ visualObj }).then(() => {
        state.synthControl.setTune(visualObj, true, { program: 0 });
    });
}

