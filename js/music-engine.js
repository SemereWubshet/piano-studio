/**
 * Piano Studio - Music Engine
 *
 * Integrates with ABCJS to render visual sheet music notation and configure audio synthesis.
 */

import { state } from './state.js';
import { getLeadInSeconds, startCountdown, cancelCountdown, getIsCountingDown } from './countdown.js';
import { lightUpKeys, clearLitKeys } from './piano-keyboard.js';

export function parseTunes(abcText) {
    if (!abcText) return [];
    return abcText.split(/(?=^X:\s*\d+)/m).filter(t => t.trim().length > 0);
}

export function renderMusicScore(paperElementId = 'paper') {
    cancelCountdown();
    clearLitKeys();

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

            // Light up piano keys with duration and re-strike support
            if (ev && ev.midiPitches && ev.midiPitches.length > 0) {
                const msPerMeasure = (visualObj && typeof visualObj.millisecondsPerMeasure === 'function') 
                    ? visualObj.millisecondsPerMeasure() 
                    : 2000;
                lightUpKeys(ev.midiPitches, {
                    msPerMeasure,
                    eventDurationMs: ev.duration
                });
            } else {
                clearLitKeys();
            }
        },
        onFinished: () => {
            document.querySelectorAll('.abcjs-note_selected').forEach(el => el.classList.remove('abcjs-note_selected'));
            clearLitKeys();
        }
    };

    state.synthControl.load("#midi-audio-controls", cursorControl, {
        displayLoop: true,
        displayRestart: true,
        displayPlay: true,
        displayProgress: true,
        displayWarp: true
    });

    // Add keyboard shortcut tooltips to the ABCJS generated buttons
    const playBtn = audioControlsEl.querySelector('.abcjs-midi-start');
    if (playBtn) playBtn.title = "Play / Pause (P)";
    const loopBtn = audioControlsEl.querySelector('.abcjs-midi-loop');
    if (loopBtn) loopBtn.title = "Toggle Loop / Repeat (R)";
    const resetBtn = audioControlsEl.querySelector('.abcjs-midi-reset');
    if (resetBtn) resetBtn.title = "Reset to Start";

    const createSynth = new ABCJS.synth.CreateSynth();
    createSynth.init({ visualObj }).then(() => {
        state.synthControl.setTune(visualObj, true, { program: 0 }).then(() => {
            attachPlayLeadInHook(audioControlsEl);
        });
    });
}

/**
 * Intercepts the ABCJS Play button click to trigger the lead-in countdown.
 */
function attachPlayLeadInHook(container) {
    const playBtn = container.querySelector('.abcjs-midi-start');
    if (!playBtn || playBtn.dataset.leadinAttached) return;

    playBtn.dataset.leadinAttached = "true";

    playBtn.addEventListener('click', (event) => {
        // If clicking while counting down, cancel it
        if (getIsCountingDown()) {
            event.preventDefault();
            event.stopImmediatePropagation();
            cancelCountdown();
            return;
        }

        const leadIn = getLeadInSeconds();
        // Only trigger countdown if the synthesizer is not currently playing and countdown > 0
        const isCurrentlyPlaying = playBtn.classList.contains('abcjs-pushed');
        if (leadIn > 0 && !isCurrentlyPlaying) {
            // Prevent immediate play
            event.preventDefault();
            event.stopImmediatePropagation();

            startCountdown(() => {
                if (state.synthControl) {
                    state.synthControl.play();
                }
            });
        }
    }, true); // Use capture phase so we intercept before ABCJS internal listener

    // Also cancel countdown if user clicks the reset button
    const resetBtn = container.querySelector('.abcjs-midi-reset');
    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            cancelCountdown();
        });
    }
}

