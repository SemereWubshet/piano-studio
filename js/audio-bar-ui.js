/**
 * Piano Studio - Audio Bar UI Decorations
 *
 * Adds decorative elements around ABCJS audio controls WITHOUT moving
 * or re-parenting any core DOM nodes:
 *   - "♩ = 100" BPM pill that syncs with ABCJS's tempo engine
 *   - Total duration formatting on the clock ("0:08 / 0:32")
 */

import { state } from './state.js';

function formatTime(totalSeconds) {
    const s = Math.max(0, Math.round(totalSeconds || 0));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Base BPM at 100% warp, computed like ABCJS does internally. */
function getBaseBpm(visualObj) {
    try {
        const msPerMeasure = visualObj.millisecondsPerMeasure();
        const beats = visualObj.getBeatsPerMeasure();
        if (msPerMeasure > 0 && beats > 0) return (beats / msPerMeasure) * 60000;
    } catch (e) { /* fall through */ }
    return 100;
}

/** Writes the total playback length onto the clock element dataset. */
export function refreshClockTotal() {
    const clock = document.querySelector('.abcjs-midi-clock');
    if (!clock) return;
    if (!clock.textContent.trim()) clock.textContent = '0:00';
    const duration = state.synthControl?.midiBuffer?.duration;
    if (duration) {
        clock.dataset.total = formatTime(duration);
    }
}

function buildBpmPill(inline, visualObj) {
    if (inline.querySelector('.bpm-pill')) return;
    const warpInput = inline.querySelector('.abcjs-midi-tempo');
    if (!warpInput) return;

    const baseBpm = getBaseBpm(visualObj);
    const pill = document.createElement('label');
    pill.className = 'bpm-pill';
    pill.title = 'Tempo';
    pill.innerHTML = `<span class="bpm-note">♩ =</span><input type="number" min="10" max="400" step="1" aria-label="Tempo in BPM">`;
    const bpmInput = pill.querySelector('input');

    const syncFromWarp = () => {
        const warp = parseFloat(warpInput.value) || 100;
        bpmInput.value = Math.round(baseBpm * warp / 100);
    };

    bpmInput.addEventListener('change', () => {
        const bpm = parseFloat(bpmInput.value);
        if (!(bpm > 0)) { syncFromWarp(); return; }
        const warp = Math.max(1, Math.min(300, Math.round((bpm / baseBpm) * 100)));
        if (String(warp) !== String(warpInput.value)) {
            warpInput.value = warp;
            warpInput.dispatchEvent(new Event('change'));
            setTimeout(refreshClockTotal, 500);
            setTimeout(refreshClockTotal, 2000);
        }
        syncFromWarp();
    });

    bpmInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') bpmInput.blur();
    });

    warpInput.addEventListener('input', syncFromWarp);
    warpInput.addEventListener('change', syncFromWarp);

    syncFromWarp();
    // Insert at the very beginning of the audio controls so BPM is at the far left
    if (inline.firstChild) {
        inline.insertBefore(pill, inline.firstChild);
    } else {
        inline.appendChild(pill);
    }
}

/**
 * Enables smooth and precise click & drag scrubbing on the progress bar.
 */
export function initProgressBarScrubber(container) {
    const track = container?.querySelector('.abcjs-midi-progress-background');
    if (!track || track.dataset.scrubberAttached) return;
    track.dataset.scrubberAttached = 'true';

    let isDragging = false;
    let seekEndTimer = null;

    const endSeeking = () => {
        isDragging = false;
        clearTimeout(seekEndTimer);
        // Retain isSeeking flag briefly so trailing animation callbacks do not trigger ghost strikes
        seekEndTimer = setTimeout(() => {
            state.isSeeking = false;
        }, 180);
    };

    const seekToPosition = (clientX) => {
        if (!state.synthControl) return;
        state.isSeeking = true;
        clearTimeout(seekEndTimer);

        const rect = track.getBoundingClientRect();
        if (rect.width <= 0) return;
        const fraction = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));

        // Immediately update visual indicator to eliminate any lag or jitter
        const indicator = track.querySelector('.abcjs-midi-progress-indicator');
        if (indicator) {
            indicator.style.left = `${(fraction * 100).toFixed(2)}%`;
        }

        try {
            state.synthControl.seek(fraction, 'percent');
        } catch (err) {
            try { state.synthControl.seek(fraction); } catch (e2) {}
        }
    };

    // Use capture phase and stopPropagation so ABCJS's internal listener doesn't conflict
    track.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        isDragging = true;
        seekToPosition(e.clientX);
    }, true);

    track.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
    }, true);

    window.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        seekToPosition(e.clientX);
    });

    window.addEventListener('mouseup', () => {
        if (isDragging) endSeeking();
    });

    track.addEventListener('touchstart', (e) => {
        if (e.touches.length > 0) {
            e.stopPropagation();
            isDragging = true;
            seekToPosition(e.touches[0].clientX);
        }
    }, { passive: false, capture: true });

    window.addEventListener('touchmove', (e) => {
        if (!isDragging || e.touches.length === 0) return;
        seekToPosition(e.touches[0].clientX);
    }, { passive: true });

    window.addEventListener('touchend', () => {
        if (isDragging) endSeeking();
    });
}

/**
 * Decorates a freshly loaded ABCJS audio control safely.
 */
export function decorateAudioBar(container, visualObj) {
    const inline = container?.querySelector('.abcjs-inline-audio');
    if (!inline) return;

    buildBpmPill(inline, visualObj);
    initProgressBarScrubber(container);
    refreshClockTotal();

    // Ensure play button is always radiant amber
    const playBtn = container.querySelector('.abcjs-midi-start');
    if (playBtn) {
        playBtn.style.setProperty('background-color', '#f2b84b', 'important');
    }
}
