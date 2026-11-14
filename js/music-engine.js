/**
 * Piano Studio - Music Engine
 *
 * Integrates with ABCJS to render visual sheet music notation and configure audio synthesis.
 */

import { state } from './state.js';
import { getLeadInSeconds, startCountdown, cancelCountdown, getIsCountingDown } from './countdown.js';
import { lightUpKeys, clearLitKeys } from './piano-keyboard.js';
import { refreshWaitModeForNewScore, resetWaitModeToStart, toggleWaitMode } from './wait-mode.js';
import { decorateAudioBar, refreshClockTotal, initProgressBarScrubber } from './audio-bar-ui.js';
import { setupTimingCoachForScore, notifyTimingPlaybackStart, notifyTimingPlaybackEvent, notifyTimingPlaybackStop } from './timing-coach.js';

export function parseTunes(abcText) {
    if (!abcText) return [];
    return abcText.split(/(?=^X:\s*\d+)/m).filter(t => t.trim().length > 0);
}

export function renderMusicScore(paperElementId = 'paper') {
    cancelCountdown();
    clearLitKeys();

    if (state.synthControl) {
        try {
            state.synthControl.pause();
            if (typeof state.synthControl.disable === 'function') {
                state.synthControl.disable(true);
            }
        } catch (e) {
            // Ignore cleanup errors
        }
        state.synthControl = null;
    }

    const paperEl = document.getElementById(paperElementId);
    if (paperEl) paperEl.innerHTML = '';

    const allTunes = parseTunes(state.fileContents[state.activeFileName] || "");
    const currentTuneAbc = allTunes[state.activeTuneIndex] || "";

    const visualObjs = ABCJS.renderAbc(paperElementId, currentTuneAbc, {
        responsive: "resize",
        add_classes: true,
        staffwidth: 760
    });

    state.currentVisualObj = visualObjs[0] || null;

    if (ABCJS.synth.supportsAudio() && visualObjs.length > 0) {
        setupAudioController(visualObjs[0]);
    } else {
        refreshWaitModeForNewScore(state.currentVisualObj);
        setupTimingCoachForScore(state.currentVisualObj);
    }

    return currentTuneAbc;
}

export function setupAudioController(visualObj) {
    const audioControlsEl = document.getElementById('midi-audio-controls');
    if (!audioControlsEl) return;
    audioControlsEl.innerHTML = '';

    state.synthControl = new ABCJS.synth.SynthController();

    const cursorControl = {
        onStart: () => {
            notifyTimingPlaybackStart();
        },
        onEvent: (ev) => {
            notifyTimingPlaybackEvent(ev);
            document.querySelectorAll('.abcjs-note_selected').forEach(el => el.classList.remove('abcjs-note_selected'));
            if (ev && ev.elements) {
                ev.elements.forEach(noteArray => {
                    noteArray.forEach(svgNode => svgNode.classList.add('abcjs-note_selected'));
                });
            }

            // Suppress intermediate key strikes while user is seeking/scrubbing
            if (state.isSeeking) {
                clearLitKeys();
                return;
            }

            // Light up piano keys with duration, warp (speed %), and re-strike support
            if (ev && ev.midiPitches && ev.midiPitches.length > 0) {
                // Read the active tempo warp percentage (e.g. 50%, 100%, 150%)
                const warpInput = document.querySelector('.abcjs-midi-tempo');
                const warpPercent = warpInput ? (parseFloat(warpInput.value) || 100) : 100;
                const speedMultiplier = Math.max(0.1, warpPercent / 100);

                const baseMsPerMeasure = (visualObj && typeof visualObj.millisecondsPerMeasure === 'function') 
                    ? visualObj.millisecondsPerMeasure() 
                    : 2000;
                
                // When speed is 50%, notes last TWICE as long (/ 0.5). When 200%, HALF as long (/ 2.0).
                const msPerMeasure = baseMsPerMeasure / speedMultiplier;
                
                let eventDurationMs = null;
                if (typeof ev.duration === 'number') {
                    if (ev.duration > 0 && ev.duration <= 4.0) {
                        eventDurationMs = ev.duration * msPerMeasure;
                    } else if (ev.duration > 4.0) {
                        eventDurationMs = ev.duration / speedMultiplier;
                    }
                }

                lightUpKeys(ev.midiPitches, {
                    msPerMeasure,
                    eventDurationMs
                });
            } else {
                clearLitKeys();
            }
        },
        onFinished: () => {
            notifyTimingPlaybackStop(false);
            document.querySelectorAll('.abcjs-note_selected').forEach(el => el.classList.remove('abcjs-note_selected'));
            clearLitKeys();
        }
    };

    state.synthControl.load("#midi-audio-controls", cursorControl, {
        displayLoop: true,
        displayRestart: true,
        displayPlay: true,
        displayProgress: true,
        displayWarp: true,
        chordsOff: true
    });

    // Add keyboard shortcut tooltips to the ABCJS generated buttons
    const playBtn = audioControlsEl.querySelector('.abcjs-midi-start');
    if (playBtn) playBtn.title = "Play / Pause (P)";
    const loopBtn = audioControlsEl.querySelector('.abcjs-midi-loop');
    if (loopBtn) loopBtn.title = "Toggle Loop / Repeat (R)";
    
    // Rewind button: Rewinds to start AND pauses playback so it waits at beginning
    const resetBtn = audioControlsEl.querySelector('.abcjs-midi-reset');
    if (resetBtn && !resetBtn.dataset.rewindHooked) {
        resetBtn.dataset.rewindHooked = "true";
        resetBtn.title = "Rewind";
        resetBtn.addEventListener('click', (e) => {
            // Prevent ABCJS default restart which loops/continues playback if currently playing
            e.preventDefault();
            e.stopImmediatePropagation();

            cancelCountdown();
            notifyTimingPlaybackStop(true);

            if (state.synthControl) {
                try { state.synthControl.pause(); } catch (err) {}
                try { state.synthControl.seek(0, 'percent'); } catch (err) {
                    try { state.synthControl.seek(0); } catch (err2) {}
                }
            }

            clearLitKeys();
            document.querySelectorAll('.abcjs-note_selected').forEach(el => el.classList.remove('abcjs-note_selected'));

            const playBtnEl = audioControlsEl.querySelector('.abcjs-midi-start');
            if (playBtnEl) playBtnEl.classList.remove('abcjs-pushed');

            const clock = document.querySelector('.abcjs-midi-clock');
            if (clock) clock.textContent = '0:00';

            const indicator = document.querySelector('.abcjs-midi-progress-indicator');
            if (indicator) indicator.style.left = '0%';

            if (state.isWaitMode) {
                resetWaitModeToStart();
            }
        }, true); // Capture phase intercepts before ABCJS's default handler
    }

    // Cosmetic extras (BPM pill, lead-in placement, total time) - no ABCJS nodes are moved
    decorateAudioBar(audioControlsEl, visualObj);

    // Load tune into SynthController with chordsOff: true so no phantom chord tracks play
    state.synthControl.setTune(visualObj, false, { chordsOff: true, program: 0 }).then(() => {
        attachPlayLeadInHook(audioControlsEl);
        initProgressBarScrubber(audioControlsEl);
        refreshWaitModeForNewScore(visualObj);
        setupTimingCoachForScore(visualObj);
        refreshClockTotal();
    }).catch(err => {
        console.warn('Synth setTune warning:', err);
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
        // Exit Wait Mode if the user hits automated Play
        if (state.isWaitMode) {
            toggleWaitMode(false);
        }

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
}

