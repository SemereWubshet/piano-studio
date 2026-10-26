/**
 * Piano Studio - Live Timing Coach & Engraved Ink Marks
 *
 * Works in two seamless ways when Timing Mode (T) is ON:
 * 1. With Audio Playback (P): Play along while the audio player runs.
 * 2. Silent Tempo Auto-Start (No audio needed): Simply strike the first note on your
 *    MIDI keyboard (or on-screen piano) and the silent tempo playhead automatically
 *    starts moving the amber note highlight across the score at the current BPM while
 *    recording your timing marks on the staff!
 *
 * Marks:
 *   - On-time + right note: Soft botanical sage filled dot (#4a7856)
 *   - Drifting (early/late) + right note: Dusty ochre filled dot (#9c6b30)
 *   - Wrong note: Muted brick hollow ring (#a8463b) at the played pitch's staff height
 *
 * Zero interference with ABCJS rendering, synth playback, or Wait Mode.
 */

import { state } from './state.js';
import { subscribeMidiEvents, showStudioToast } from './midi-engine.js';

const STORAGE_TIMING_COACH_KEY = 'piano_studio_timing_coach_enabled';
const SVG_NS = 'http://www.w3.org/2000/svg';

// Diatonic scale step within an octave for each semitone (C=0, C#=0, D=1, ..., B=6)
const SEMITONE_TO_DIATONIC = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6];

let timelineSteps = [];
let staffBands = [];
let placedMarks = [];
let baseBeatMs = 500;

let isPlayingAudio = false;
let completedLastRun = false;
let lastAnchorScoreMs = 0;
let lastAnchorWallMs = 0;

// Silent tempo runner state (when user plays without turning on computer synth audio)
let isSilentRunnerActive = false;
let silentRunnerStartWallMs = 0;
let silentRunnerStartScoreMs = 0;
let silentRunnerTimers = [];

function midiToDiatonicStep(midi) {
    const octave = Math.floor(midi / 12) - 1;
    const semitone = ((midi % 12) + 12) % 12;
    return octave * 7 + SEMITONE_TO_DIATONIC[semitone];
}

function getActiveSpeedMultiplier() {
    const warpInput = document.querySelector('.abcjs-midi-tempo');
    const warpPercent = warpInput ? (parseFloat(warpInput.value) || 100) : 100;
    return Math.max(0.1, warpPercent / 100);
}

function isSynthCurrentlyPlaying() {
    if (state.isWaitMode || state.isSeeking) return false;
    const playBtn = document.querySelector('.abcjs-midi-start');
    if (playBtn && playBtn.classList.contains('abcjs-pushed')) return true;
    return isPlayingAudio;
}

function stopSilentTempoRunner(clearHighlight = true) {
    isSilentRunnerActive = false;
    silentRunnerTimers.forEach(t => clearTimeout(t));
    silentRunnerTimers = [];
    if (clearHighlight && !isSynthCurrentlyPlaying()) {
        document.querySelectorAll('.abcjs-note_selected').forEach(el => {
            el.classList.remove('abcjs-note_selected');
        });
    }
}

/**
 * Starts a silent tempo playhead from `startStepIndex` so the student can see the
 * amber note guide moving at exact BPM even without turning on synth audio playback.
 */
function startSilentTempoRunner(startStepIndex = 0) {
    stopSilentTempoRunner(false);
    if (timelineSteps.length === 0) return;

    const startStep = timelineSteps[startStepIndex] || timelineSteps[0];
    const speedMultiplier = getActiveSpeedMultiplier();

    isSilentRunnerActive = true;
    completedLastRun = false;
    silentRunnerStartWallMs = performance.now();
    silentRunnerStartScoreMs = startStep.timeMs;
    lastAnchorScoreMs = startStep.timeMs;
    lastAnchorWallMs = silentRunnerStartWallMs;

    for (let i = startStepIndex; i < timelineSteps.length; i++) {
        const step = timelineSteps[i];
        const delayWallMs = Math.max(0, (step.timeMs - startStep.timeMs) / speedMultiplier);

        const timerId = setTimeout(() => {
            if (!isSilentRunnerActive || isSynthCurrentlyPlaying() || !state.isTimingCoach) return;

            lastAnchorScoreMs = step.timeMs;
            lastAnchorWallMs = performance.now();

            document.querySelectorAll('.abcjs-note_selected').forEach(el => {
                el.classList.remove('abcjs-note_selected');
            });
            if (step.elements) {
                step.elements.forEach(noteArray => {
                    if (Array.isArray(noteArray)) {
                        noteArray.forEach(svgNode => svgNode.classList.add('abcjs-note_selected'));
                    }
                });
            }
        }, delayWallMs);

        silentRunnerTimers.push(timerId);
    }

    // Schedule end-of-score completion
    const lastStep = timelineSteps[timelineSteps.length - 1];
    const totalWallMs = Math.max(400, (lastStep.timeMs - startStep.timeMs + baseBeatMs * 2) / speedMultiplier);
    const endTimerId = setTimeout(() => {
        if (!isSilentRunnerActive) return;
        isSilentRunnerActive = false;
        completedLastRun = true;
        document.querySelectorAll('.abcjs-note_selected').forEach(el => {
            el.classList.remove('abcjs-note_selected');
        });
    }, totalWallMs);
    silentRunnerTimers.push(endTimerId);
}

/**
 * Ensures a dedicated, non-interactive SVG <g> layer exists at the top of #paper svg.
 */
function getOrCreateOverlayLayer() {
    const svg = document.querySelector('#paper svg');
    if (!svg) return null;

    let layer = svg.querySelector('#timing-overlay-layer');
    if (!layer) {
        layer = document.createElementNS(SVG_NS, 'g');
        layer.setAttribute('id', 'timing-overlay-layer');
        svg.appendChild(layer);
    }
    return layer;
}

/**
 * Clears all timing ink marks from the current sheet music SVG.
 */
export function clearTimingMarks() {
    placedMarks = [];
    timelineSteps.forEach(step => {
        if (step.matchedPitches) step.matchedPitches.clear();
    });
    const layer = document.querySelector('#paper svg #timing-overlay-layer');
    if (layer) {
        layer.innerHTML = '';
    }
}

/**
 * Converts a DOM element's screen bounding rect into the root <svg>'s viewBox coordinate space.
 */
function getElementBoxInSvgSpace(el, svg) {
    if (!el || !svg) return null;
    try {
        const elRect = el.getBoundingClientRect();
        const svgRect = svg.getBoundingClientRect();
        if (elRect.width > 0 && elRect.height > 0 && svgRect.width > 0 && svgRect.height > 0) {
            const vb = (svg.viewBox && svg.viewBox.baseVal && svg.viewBox.baseVal.width > 0)
                ? svg.viewBox.baseVal
                : { x: 0, y: 0, width: svgRect.width, height: svgRect.height };

            const scaleX = vb.width / svgRect.width;
            const scaleY = vb.height / svgRect.height;

            const x = vb.x + (elRect.left - svgRect.left) * scaleX;
            const y = vb.y + (elRect.top - svgRect.top) * scaleY;
            const width = elRect.width * scaleX;
            const height = elRect.height * scaleY;

            return {
                x,
                y,
                width,
                height,
                cx: x + width / 2,
                cy: y + height / 2
            };
        }
    } catch (e) {}

    try {
        if (typeof el.getBBox === 'function') {
            const b = el.getBBox();
            if (b && b.width > 0 && b.height > 0) {
                return {
                    x: b.x,
                    y: b.y,
                    width: b.width,
                    height: b.height,
                    cx: b.x + b.width / 2,
                    cy: b.y + b.height / 2
                };
            }
        }
    } catch (e) {}

    return null;
}

/**
 * Scans the rendered #paper svg for 5-line musical staves (.abcjs-staff)
 * so marks can be strictly contained inside the staff band (away from Roman numerals & lyrics).
 */
function extractStaffBandsFromSVG(svg) {
    const bands = [];
    if (!svg) return bands;

    const staffEls = svg.querySelectorAll('.abcjs-staff, .abcjs-staff-wrapper');
    staffEls.forEach((el, idx) => {
        const box = getElementBoxInSvgSpace(el, svg);
        if (box && box.width > 30 && box.height > 6) {
            bands.push({
                index: idx,
                leftX: box.x,
                rightX: box.x + box.width,
                topY: box.y,
                bottomY: box.y + box.height,
                centerY: box.cy,
                height: box.height,
                stepSize: box.height / 8, // 5 lines = 4 spaces = 8 diatonic steps
                refMidi: null,
                refDiatonic: null,
                refY: null
            });
        }
    });

    bands.sort((a, b) => a.topY - b.topY);
    return bands;
}

function findNearestStaffBand(y, bands) {
    if (!bands || bands.length === 0) return null;
    let best = bands[0];
    let bestDist = Infinity;

    for (const b of bands) {
        let dist = 0;
        if (y < b.topY) dist = b.topY - y;
        else if (y > b.bottomY) dist = y - b.bottomY;
        if (dist < bestDist) {
            bestDist = dist;
            best = b;
        }
    }
    return best;
}

/**
 * Extracts notehead bounding boxes from an ABCJS note/chord SVG group.
 */
function extractNoteheadBoxes(svgNodes, svg) {
    const boxes = [];
    if (!svgNodes || !svg) return boxes;

    svgNodes.forEach(groupArr => {
        if (!Array.isArray(groupArr)) return;
        groupArr.forEach(svgNode => {
            if (!svgNode) return;
            // Prefer individual notehead paths (excluding stems, flags, beams)
            const headPaths = svgNode.querySelectorAll(
                'path[data-name="note"], path.abcjs-notehead, g[data-name="note"]'
            );
            if (headPaths && headPaths.length > 0) {
                headPaths.forEach(p => {
                    const box = getElementBoxInSvgSpace(p, svg);
                    if (box) boxes.push(box);
                });
            } else {
                const box = getElementBoxInSvgSpace(svgNode, svg);
                if (box) {
                    boxes.push({
                        ...box,
                        cx: box.x + Math.min(box.width / 2, 5.5)
                    });
                }
            }
        });
    });

    return boxes;
}

/**
 * Prepares the timing coach timeline from the newly rendered ABCJS visualObj.
 */
export function setupTimingCoachForScore(visualObj) {
    stopSilentTempoRunner(true);
    clearTimingMarks();
    timelineSteps = [];
    staffBands = [];
    isPlayingAudio = false;
    completedLastRun = false;
    lastAnchorScoreMs = 0;
    lastAnchorWallMs = 0;

    if (!visualObj) return;

    // 1. Compute base beat duration (at 100% tempo)
    const baseMsPerMeasure = (typeof visualObj.millisecondsPerMeasure === 'function')
        ? visualObj.millisecondsPerMeasure()
        : 2000;
    const beatsPerMeasure = (typeof visualObj.getBeatsPerMeasure === 'function')
        ? (visualObj.getBeatsPerMeasure() || 4)
        : 4;
    baseBeatMs = Math.max(120, baseMsPerMeasure / beatsPerMeasure);

    // 2. Extract staff bands from rendered SVG
    const svg = document.querySelector('#paper svg');
    staffBands = extractStaffBandsFromSVG(svg);

    // 3. Extract chronological note events
    let rawTimings = visualObj.noteTimings;
    if ((!rawTimings || rawTimings.length === 0) && window.ABCJS && ABCJS.TimingCallbacks) {
        try {
            const tc = new ABCJS.TimingCallbacks(visualObj, { eventCallback: () => {} });
            rawTimings = tc.noteTimings;
        } catch (e) {
            console.warn('Could not build TimingCallbacks for Timing Coach:', e);
        }
    }

    if (!rawTimings || rawTimings.length === 0) return;

    rawTimings.forEach(ev => {
        if (!ev || !ev.midiPitches || ev.midiPitches.length === 0) return;

        const pitches = [];
        ev.midiPitches.forEach(p => {
            const midiNum = typeof p === 'object' ? (p.pitch ?? p.midi) : p;
            if (typeof midiNum === 'number') pitches.push(midiNum);
        });
        if (pitches.length === 0) return;

        const sortedPitches = [...pitches].sort((a, b) => a - b);
        const headBoxes = extractNoteheadBoxes(ev.elements, svg);
        // Sort boxes from bottom of staff (larger Y) to top of staff (smaller Y) to match ascending MIDI pitches
        headBoxes.sort((a, b) => b.cy - a.cy);

        const fallbackX = (typeof ev.left === 'number') ? (ev.left + (ev.width ? Math.min(ev.width / 2, 5.5) : 4.5)) : null;
        const fallbackY = (typeof ev.top === 'number' && typeof ev.height === 'number') ? (ev.top + ev.height / 2) : null;

        const stepX = headBoxes.length > 0
            ? headBoxes.reduce((sum, b) => sum + b.cx, 0) / headBoxes.length
            : fallbackX;
        const avgY = headBoxes.length > 0
            ? headBoxes.reduce((sum, b) => sum + b.cy, 0) / headBoxes.length
            : fallbackY;

        if (stepX === null || avgY === null) return;

        const band = findNearestStaffBand(avgY, staffBands);
        const pitchMap = new Map();

        sortedPitches.forEach((midi, idx) => {
            const box = headBoxes[Math.min(idx, headBoxes.length - 1)];
            const rawY = box ? box.cy : avgY;
            const noteBand = findNearestStaffBand(rawY, staffBands) || band;

            // Calibrate the staff band's diatonic reference from real rendered noteheads
            if (noteBand && noteBand.refMidi === null && box) {
                noteBand.refMidi = midi;
                noteBand.refDiatonic = midiToDiatonicStep(midi);
                noteBand.refY = box.cy;
            }

            pitchMap.set(midi, {
                x: box ? box.cx : stepX,
                y: clampYToStaffBand(rawY, noteBand),
                band: noteBand
            });
        });

        const timeMs = ev.milliseconds ?? 0;
        const lastStep = timelineSteps[timelineSteps.length - 1];

        // Merge simultaneous multi-voice events (within 15ms)
        if (lastStep && Math.abs(lastStep.timeMs - timeMs) <= 15) {
            pitchMap.forEach((val, key) => lastStep.pitchMap.set(key, val));
            lastStep.x = (lastStep.x + stepX) / 2;
            if (ev.elements) {
                ev.elements.forEach(arr => lastStep.elements.push(arr));
            }
        } else {
            timelineSteps.push({
                timeMs,
                x: stepX,
                y: avgY,
                band,
                pitchMap,
                elements: ev.elements ? [...ev.elements] : [],
                matchedPitches: new Set(),
                pxPerBeat: 34
            });
        }
    });

    // Compute local horizontal velocity (pxPerBeat) for smooth edge interpolation
    for (let i = 0; i < timelineSteps.length; i++) {
        const curr = timelineSteps[i];
        const next = timelineSteps[i + 1];
        if (next && curr.band === next.band && next.timeMs > curr.timeMs && next.x > curr.x) {
            const beatsDelta = (next.timeMs - curr.timeMs) / baseBeatMs;
            if (beatsDelta > 0.05) {
                curr.pxPerBeat = Math.max(14, Math.min(75, (next.x - curr.x) / beatsDelta));
            }
        } else if (i > 0 && timelineSteps[i - 1].band === curr.band) {
            curr.pxPerBeat = timelineSteps[i - 1].pxPerBeat;
        }
    }
}

/**
 * Clamps a vertical Y coordinate strictly inside a 5-line staff band
 * so marks never collide with Roman numerals/chords above or lyrics below.
 */
function clampYToStaffBand(y, band) {
    if (!band) return y;
    const pad = Math.min(4.5, band.stepSize * 1.15);
    return Math.max(band.topY - pad, Math.min(band.bottomY + pad, y));
}

/**
 * Computes the vertical staff Y coordinate for any played MIDI pitch (including wrong notes).
 */
function computePitchYInStaff(midi, referenceStep) {
    let band = referenceStep ? referenceStep.band : (staffBands[0] || null);
    if (!band) return referenceStep ? referenceStep.y : 50;

    // Check if there is a companion staff in the same system (e.g. Treble & Bass pair)
    const systemBands = staffBands.filter(b => Math.abs(b.leftX - band.leftX) < 35 && Math.abs(b.topY - band.topY) < 130);
    if (systemBands.length >= 2) {
        systemBands.sort((a, b) => a.topY - b.topY);
        band = (midi >= 60) ? systemBands[0] : systemBands[systemBands.length - 1];
    }

    const diatonic = midiToDiatonicStep(midi);
    const stepSize = band.stepSize || 3.5;

    let rawY;
    if (band.refDiatonic !== null && band.refY !== null) {
        rawY = band.refY - (diatonic - band.refDiatonic) * stepSize;
    } else {
        const bottomLineStep = (midi >= 58) ? 30 : 18;
        rawY = band.bottomY - (diatonic - bottomLineStep) * stepSize;
    }

    return clampYToStaffBand(rawY, band);
}

/**
 * Called by music-engine when playback starts from the beginning or resumes.
 */
export function notifyTimingPlaybackStart() {
    stopSilentTempoRunner(false);
    if (completedLastRun) {
        clearTimingMarks();
        lastAnchorScoreMs = 0;
        completedLastRun = false;
    }
    isPlayingAudio = true;
    lastAnchorWallMs = performance.now();
}

/**
 * Called by music-engine on every ABCJS cursorControl.onEvent(ev).
 */
export function notifyTimingPlaybackEvent(ev) {
    if (!ev) return;
    if (isSilentRunnerActive) stopSilentTempoRunner(false);
    isPlayingAudio = true;
    completedLastRun = false;
    if (typeof ev.milliseconds === 'number') {
        if (ev.milliseconds < 100 && lastAnchorScoreMs > 800) {
            clearTimingMarks();
        }
        lastAnchorScoreMs = ev.milliseconds;
        lastAnchorWallMs = performance.now();
    }
}

/**
 * Called by music-engine when playback finishes or is stopped/rewound.
 */
export function notifyTimingPlaybackStop(clearMarks = false) {
    stopSilentTempoRunner(clearMarks);
    isPlayingAudio = false;
    if (clearMarks) {
        clearTimingMarks();
        lastAnchorScoreMs = 0;
        completedLastRun = false;
    } else {
        completedLastRun = true;
    }
}

/**
 * Interpolates the exact horizontal X coordinate of the invisible timing playhead at `scoreMs`.
 */
function interpolatePlayhead(scoreMs) {
    if (timelineSteps.length === 0) return null;

    if (scoreMs <= timelineSteps[0].timeMs) {
        const first = timelineSteps[0];
        const beatDiff = (scoreMs - first.timeMs) / baseBeatMs;
        return {
            x: first.x + Math.max(-18, beatDiff * first.pxPerBeat),
            refStep: first
        };
    }

    const last = timelineSteps[timelineSteps.length - 1];
    if (scoreMs >= last.timeMs) {
        const beatDiff = (scoreMs - last.timeMs) / baseBeatMs;
        return {
            x: last.x + Math.min(22, beatDiff * last.pxPerBeat),
            refStep: last
        };
    }

    for (let i = 0; i < timelineSteps.length - 1; i++) {
        const a = timelineSteps[i];
        const b = timelineSteps[i + 1];
        if (scoreMs >= a.timeMs && scoreMs <= b.timeMs) {
            const ratio = (scoreMs - a.timeMs) / Math.max(1, b.timeMs - a.timeMs);
            const closerStep = (ratio < 0.5) ? a : b;

            if (a.band && b.band && Math.abs(a.band.topY - b.band.topY) < 95 && b.x >= a.x) {
                return {
                    x: a.x + ratio * (b.x - a.x),
                    refStep: closerStep
                };
            }

            const beatDiff = (scoreMs - closerStep.timeMs) / baseBeatMs;
            return {
                x: closerStep.x + Math.max(-18, Math.min(18, beatDiff * closerStep.pxPerBeat)),
                refStep: closerStep
            };
        }
    }

    return { x: timelineSteps[0].x, refStep: timelineSteps[0] };
}

/**
 * Nudges simultaneous or overlapping marks slightly apart so two-hand chords never form a single blob.
 */
function resolveMarkCollision(x, y, band) {
    let finalX = x;
    let finalY = y;
    const minDist = 6.2;

    const offsets = [
        [0, 0],
        [4.8, 0],
        [-4.8, 0],
        [0, -4.2],
        [0, 4.2],
        [5.5, -3.5],
        [-5.5, 3.5],
        [8.5, 0]
    ];

    for (const [dx, dy] of offsets) {
        const testX = x + dx;
        const testY = clampYToStaffBand(y + dy, band);
        const collides = placedMarks.some(m => {
            const dist = Math.hypot(testX - m.x, testY - m.y);
            return dist < minDist;
        });
        if (!collides) {
            finalX = testX;
            finalY = testY;
            break;
        }
    }

    placedMarks.push({ x: finalX, y: finalY });
    return { x: finalX, y: finalY };
}

/**
 * Handles a live physical MIDI (or virtual piano) key strike.
 */
function handleTimingCoachNoteOn(midi) {
    if (!state.isTimingCoach) return;
    if (state.isWaitMode || state.isRecordingMidi || state.isSeeking) return;

    if (timelineSteps.length === 0 && state.currentVisualObj) {
        setupTimingCoachForScore(state.currentVisualObj);
    }
    if (timelineSteps.length === 0) return;

    // If neither synth audio playback nor the silent tempo runner is active yet,
    // auto-start the silent tempo runner right from the first note of the score!
    if (!isSynthCurrentlyPlaying() && !isSilentRunnerActive) {
        if (completedLastRun) {
            clearTimingMarks();
            completedLastRun = false;
        }
        startSilentTempoRunner(0);
    }

    const now = performance.now();
    const speedMultiplier = getActiveSpeedMultiplier();
    const currentScoreMs = lastAnchorScoreMs + Math.max(0, (now - lastAnchorWallMs)) * speedMultiplier;

    // Tempo-scaled beat thresholds (in real wall-clock milliseconds)
    const realBeatMs = baseBeatMs / speedMultiplier;
    const onTimeWindowMs = Math.max(42, Math.min(135, 0.18 * realBeatMs));  // ±18% of a beat
    const driftWindowMs = Math.max(115, Math.min(340, 0.52 * realBeatMs));  // ±52% of a beat

    // Search for the closest unmatched note event with this MIDI pitch within driftWindowMs
    let bestStep = null;
    let bestRealDeltaMs = Infinity;
    let bestSignedScoreDelta = 0;

    for (const step of timelineSteps) {
        const signedScoreDelta = currentScoreMs - step.timeMs;
        const realDeltaMs = Math.abs(signedScoreDelta) / speedMultiplier;

        if (realDeltaMs <= driftWindowMs && step.pitchMap.has(midi) && !step.matchedPitches.has(midi)) {
            if (realDeltaMs < bestRealDeltaMs) {
                bestRealDeltaMs = realDeltaMs;
                bestStep = step;
                bestSignedScoreDelta = signedScoreDelta;
            }
        }
    }

    const playhead = interpolatePlayhead(currentScoreMs);
    if (!playhead) return;

    let markX = playhead.x;
    let markY;
    let markBand;
    let grade; // 'on-time' | 'drift' | 'wrong'

    if (bestStep) {
        bestStep.matchedPitches.add(midi);
        const noteInfo = bestStep.pitchMap.get(midi);
        markBand = noteInfo.band || bestStep.band;
        markY = noteInfo.y;

        if (bestRealDeltaMs <= onTimeWindowMs) {
            grade = 'on-time';
            markX = noteInfo.x + (playhead.x - noteInfo.x) * 0.45;
        } else {
            grade = 'drift';
            const beatOffset = bestSignedScoreDelta / baseBeatMs;
            const minVisualShift = bestSignedScoreDelta < 0 ? -5.0 : 5.0;
            const rawShift = beatOffset * (bestStep.pxPerBeat || 32);
            const clampedShift = bestSignedScoreDelta < 0
                ? Math.min(minVisualShift, Math.max(-20, rawShift))
                : Math.max(minVisualShift, Math.min(20, rawShift));
            markX = noteInfo.x + clampedShift;
        }
    } else {
        grade = 'wrong';
        const refStep = playhead.refStep;
        markBand = refStep ? refStep.band : (staffBands[0] || null);
        markY = computePitchYInStaff(midi, refStep);
    }

    const pos = resolveMarkCollision(markX, markY, markBand);
    drawInkMark(pos.x, pos.y, grade);
}

/**
 * Renders an engraved ink dot (or hollow ring for wrong pitch) onto the SVG overlay layer.
 */
function drawInkMark(x, y, grade) {
    const layer = getOrCreateOverlayLayer();
    if (!layer) return;

    const circle = document.createElementNS(SVG_NS, 'circle');
    circle.setAttribute('cx', x.toFixed(2));
    circle.setAttribute('cy', y.toFixed(2));

    if (grade === 'wrong') {
        circle.setAttribute('r', '3.6');
        circle.setAttribute('class', 'timing-mark timing-mark-wrong');
    } else if (grade === 'drift') {
        circle.setAttribute('r', '3.3');
        circle.setAttribute('class', 'timing-mark timing-mark-drift');
    } else {
        circle.setAttribute('r', '3.2');
        circle.setAttribute('class', 'timing-mark timing-mark-on-time');
    }

    layer.appendChild(circle);
}

/**
 * Toggles the Timing Coach overlay feature on or off.
 */
export function toggleTimingCoach(forceState) {
    state.isTimingCoach = (typeof forceState === 'boolean') ? forceState : !state.isTimingCoach;

    try {
        localStorage.setItem(STORAGE_TIMING_COACH_KEY, state.isTimingCoach ? 'true' : 'false');
    } catch (e) {}

    if (state.isTimingCoach) {
        if (timelineSteps.length === 0 && state.currentVisualObj) {
            setupTimingCoachForScore(state.currentVisualObj);
        }
        showStudioToast('Timing Mode on');
    } else {
        stopSilentTempoRunner(true);
        clearTimingMarks();
        showStudioToast('Timing Mode off');
    }
}

export function initTimingCoach() {
    try {
        const saved = localStorage.getItem(STORAGE_TIMING_COACH_KEY);
        if (saved !== null) {
            state.isTimingCoach = saved === 'true';
        } else {
            state.isTimingCoach = false; // Off by default
        }
    } catch (e) {
        state.isTimingCoach = false;
    }

    subscribeMidiEvents({
        onNoteOn: (midi) => handleTimingCoachNoteOn(midi)
    });

    window.addEventListener('keydown', (e) => {
        if (e.target && (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT')) return;
        if ((e.key === 't' || e.key === 'T') && !e.ctrlKey && !e.metaKey && !e.altKey) {
            e.preventDefault();
            toggleTimingCoach();
        }
    });
}
