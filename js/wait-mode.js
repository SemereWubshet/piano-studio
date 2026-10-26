/**
 * Piano Studio - Interactive "Wait-For-Me" Practice Mode
 *
 * Pauses automated playback and steps through the sheet music note-by-note
 * (and chord-by-chord), waiting for the user to play the correct MIDI keys
 * before advancing to the next musical event.
 */

import { state } from './state.js';
import { subscribeMidiEvents, showStudioToast } from './midi-engine.js';
import { renderWaitModeKeyTargets, flashWrongMidiKey, clearLitKeys, togglePianoTray } from './piano-keyboard.js';

let waitSteps = [];
let currentStepIndex = 0;
let satisfiedPitches = new Set();
let advanceTimer = null;
let currentStepStartTime = null;

function getActiveSpeedMultiplier() {
    const warpInput = document.querySelector('.abcjs-midi-tempo');
    const warpPercent = warpInput ? (parseFloat(warpInput.value) || 100) : 100;
    return Math.max(0.1, warpPercent / 100);
}

/**
 * Extracts chronological playable note/chord steps from the active ABCJS visualObj.
 */
export function buildWaitSteps(visualObj) {
    waitSteps = [];
    currentStepIndex = 0;
    satisfiedPitches.clear();
    currentStepStartTime = null;

    if (!visualObj) return;

    let rawTimings = visualObj.noteTimings;
    if ((!rawTimings || rawTimings.length === 0) && window.ABCJS && ABCJS.TimingCallbacks) {
        try {
            const tc = new ABCJS.TimingCallbacks(visualObj, { eventCallback: () => {} });
            rawTimings = tc.noteTimings;
        } catch (e) {
            console.warn('Could not build TimingCallbacks for Wait Mode:', e);
        }
    }

    if (!rawTimings || rawTimings.length === 0) return;

    const baseMsPerMeasure = (visualObj && typeof visualObj.millisecondsPerMeasure === 'function')
        ? visualObj.millisecondsPerMeasure()
        : 2000;

    rawTimings.forEach((ev, idx) => {
        if (!ev || !ev.midiPitches || ev.midiPitches.length === 0) return;

        const pitches = [];
        ev.midiPitches.forEach(p => {
            const midiNum = typeof p === 'object' ? (p.pitch ?? p.midi) : p;
            if (typeof midiNum === 'number') pitches.push(midiNum);
        });

        if (pitches.length === 0) return;

        const timeMs = ev.milliseconds ?? 0;
        const lastStep = waitSteps[waitSteps.length - 1];

        // Determine step duration: duration in measures or milliseconds between events
        let durationFraction = (typeof ev.duration === 'number' && ev.duration > 0) ? ev.duration : null;

        // Merge simultaneous multi-voice events (within 15ms) into one combined step
        if (lastStep && Math.abs(lastStep.timeMs - timeMs) <= 15) {
            pitches.forEach(p => lastStep.pitches.add(p));
            if (ev.elements) {
                ev.elements.forEach(arr => lastStep.elements.push(arr));
            }
            if (durationFraction && (!lastStep.durationFraction || durationFraction > lastStep.durationFraction)) {
                lastStep.durationFraction = durationFraction;
            }
        } else {
            waitSteps.push({
                timeMs,
                pitches: new Set(pitches),
                elements: ev.elements ? [...ev.elements] : [],
                durationFraction: durationFraction,
                baseMsPerMeasure
            });
        }
    });

    // Populate durationMs for each step
    for (let i = 0; i < waitSteps.length; i++) {
        const step = waitSteps[i];
        const nextStep = waitSteps[i + 1];

        let baseDuration = null;
        if (typeof step.durationFraction === 'number' && step.durationFraction > 0) {
            if (step.durationFraction <= 4.0) {
                baseDuration = step.durationFraction * step.baseMsPerMeasure;
            } else {
                baseDuration = step.durationFraction;
            }
        } else if (nextStep && typeof nextStep.timeMs === 'number' && nextStep.timeMs > step.timeMs) {
            baseDuration = nextStep.timeMs - step.timeMs;
        }

        // Clamp to sensible musical bounds (min 250ms, max 8000ms, default 500ms)
        step.baseDurationMs = Math.max(250, Math.min(8000, baseDuration || 500));
    }
}

function renderCurrentWaitStep() {
    // Clear previous sheet music highlights
    document.querySelectorAll('.abcjs-note_selected').forEach(el => {
        el.classList.remove('abcjs-note_selected');
    });

    const btnEl = document.getElementById('btn-wait-mode');
    const labelEl = document.getElementById('wait-mode-label');
    const focusWaitBtn = document.getElementById('btn-focus-wait');

    if (!state.isWaitMode) {
        if (btnEl) btnEl.classList.remove('active');
        if (focusWaitBtn) focusWaitBtn.classList.remove('active');
        if (labelEl) labelEl.textContent = 'Wait';
        renderWaitModeKeyTargets([], new Set());
        return;
    }

    if (btnEl) btnEl.classList.add('active');
    if (focusWaitBtn) focusWaitBtn.classList.add('active');

    if (waitSteps.length === 0) {
        if (labelEl) labelEl.textContent = 'Wait: No Notes';
        renderWaitModeKeyTargets([], new Set());
        return;
    }

    const step = waitSteps[currentStepIndex];
    if (labelEl) {
        labelEl.textContent = `Wait: ${currentStepIndex + 1}/${waitSteps.length}`;
    }

    // Highlight current note/chord on the SVG sheet music
    if (step && step.elements) {
        step.elements.forEach(noteArray => {
            noteArray.forEach(svgNode => svgNode.classList.add('abcjs-note_selected'));
        });
    }

    // Highlight target keys and already-pressed chord keys on the bottom piano
    if (step) {
        renderWaitModeKeyTargets(Array.from(step.pitches), satisfiedPitches);
    }
}

function handleWaitModeNoteOn(midi) {
    if (!state.isWaitMode || waitSteps.length === 0) return;
    if (advanceTimer) return; // Currently holding/transitioning between steps

    const step = waitSteps[currentStepIndex];
    if (!step) return;

    if (step.pitches.has(midi)) {
        satisfiedPitches.add(midi);
        renderCurrentWaitStep();

        // Check if all pitches in the current note/chord have been struck
        if (satisfiedPitches.size >= step.pitches.size) {
            // Calculate actual hold duration scaled by tempo/speed multiplier
            const speedMultiplier = getActiveSpeedMultiplier();
            const holdMs = Math.max(120, (step.baseDurationMs || 500) / speedMultiplier);

            advanceTimer = setTimeout(() => {
                advanceTimer = null;
                satisfiedPitches.clear();
                currentStepIndex++;

                if (currentStepIndex >= waitSteps.length) {
                    showStudioToast('Score completed');
                    currentStepIndex = 0;
                }
                renderCurrentWaitStep();
            }, holdMs);
        }
    } else {
        flashWrongMidiKey(midi);
    }
}

export function resetWaitModeToStart() {
    if (advanceTimer) {
        clearTimeout(advanceTimer);
        advanceTimer = null;
    }
    currentStepIndex = 0;
    satisfiedPitches.clear();
    currentStepStartTime = null;
    if (state.isWaitMode) {
        renderCurrentWaitStep();
    }
}

export function refreshWaitModeForNewScore(visualObj) {
    if (advanceTimer) {
        clearTimeout(advanceTimer);
        advanceTimer = null;
    }
    buildWaitSteps(visualObj);
    if (state.isWaitMode) {
        renderCurrentWaitStep();
    }
}

export function toggleWaitMode(forceState) {
    state.isWaitMode = (typeof forceState === 'boolean') ? forceState : !state.isWaitMode;

    if (state.isWaitMode) {
        if (state.synthControl) state.synthControl.pause();
        clearLitKeys();
        togglePianoTray(true); // Ensure piano keyboard is visible
        buildWaitSteps(state.currentVisualObj);
        showStudioToast('Wait Mode on');
    } else {
        showStudioToast('Wait Mode off');
    }

    renderCurrentWaitStep();
}

export function initWaitMode() {
    document.getElementById('btn-wait-mode')?.addEventListener('click', () => {
        toggleWaitMode();
    });

    subscribeMidiEvents({
        onNoteOn: (midi) => handleWaitModeNoteOn(midi)
    });

    window.addEventListener('keydown', (e) => {
        if (e.target && (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT')) return;
        if (e.key === 'w' || e.key === 'W') {
            e.preventDefault();
            toggleWaitMode();
        }
    });
}

