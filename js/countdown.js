/**
 * Piano Studio - Lead-in Play Countdown Timer
 *
 * Provides a customizable countdown lead-in timer before audio playback begins.
 * Includes visual pulse overlay and optional Web Audio metronome ticks.
 */

const STORAGE_KEY = 'piano_studio_lead_in_seconds';
let leadInSeconds = parseInt(localStorage.getItem(STORAGE_KEY) || '3', 10);
let countdownInterval = null;
let isCountingDown = false;
let audioCtx = null;

function getAudioContext() {
    if (!audioCtx && (window.AudioContext || window.webkitAudioContext)) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
    return audioCtx;
}

/**
 * Plays a short subtle metronome beep for rhythmic audio cueing.
 */
function playMetronomeTick(isFinal = false) {
    try {
        const ctx = getAudioContext();
        if (!ctx) return;

        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        // Higher pitch for the final 'GO' beat (880Hz vs 440Hz)
        osc.frequency.setValueAtTime(isFinal ? 880 : 440, ctx.currentTime);

        gain.gain.setValueAtTime(0.12, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start();
        osc.stop(ctx.currentTime + 0.09);
    } catch (e) {
        // Audio tick is a progressive enhancement, fail silently
    }
}

export function getLeadInSeconds() {
    return isNaN(leadInSeconds) ? 0 : Math.max(0, leadInSeconds);
}

export function setLeadInSeconds(seconds) {
    leadInSeconds = Math.max(0, Math.min(30, parseInt(seconds, 10) || 0));
    localStorage.setItem(STORAGE_KEY, leadInSeconds.toString());
}

export function getIsCountingDown() {
    return isCountingDown;
}

/**
 * Starts the lead-in countdown and invokes onComplete when it reaches 0.
 */
export function startCountdown(onComplete) {
    cancelCountdown();

    const totalSeconds = getLeadInSeconds();
    if (totalSeconds <= 0) {
        onComplete();
        return;
    }

    isCountingDown = true;
    let remaining = totalSeconds;

    const container = document.getElementById('lead-in-container');
    const input = document.getElementById('lead-in-input');
    const badge = document.getElementById('lead-in-badge');

    if (container) container.classList.add('is-counting');
    if (input) input.style.display = 'none';
    if (badge) {
        badge.textContent = remaining;
        badge.classList.remove('hidden');
        badge.style.animation = 'none';
        void badge.offsetWidth;
        badge.style.animation = '';
    }

    playMetronomeTick(false);

    countdownInterval = setInterval(() => {
        remaining--;
        if (remaining > 0) {
            if (badge) {
                badge.textContent = remaining;
                badge.style.animation = 'none';
                void badge.offsetWidth;
                badge.style.animation = '';
            }
            playMetronomeTick(false);
        } else {
            // Reached zero: play final high tick, restore input, and start playback
            playMetronomeTick(true);
            cancelCountdown();
            onComplete();
        }
    }, 1000);
}

/**
 * Stops any active countdown immediately and restores the inline UI.
 */
export function cancelCountdown() {
    if (countdownInterval) {
        clearInterval(countdownInterval);
        countdownInterval = null;
    }
    isCountingDown = false;

    const container = document.getElementById('lead-in-container');
    const input = document.getElementById('lead-in-input');
    const badge = document.getElementById('lead-in-badge');

    if (container) container.classList.remove('is-counting');
    if (input) input.style.display = '';
    if (badge) badge.classList.add('hidden');
}

/**
 * Initializes the lead-in UI input and binds event handlers.
 */
export function initCountdownUI() {
    const input = document.getElementById('lead-in-input');
    if (input) {
        input.value = getLeadInSeconds();
        input.addEventListener('change', (e) => {
            setLeadInSeconds(e.target.value);
            input.value = getLeadInSeconds();
        });
        input.addEventListener('input', (e) => {
            setLeadInSeconds(e.target.value);
        });
    }

    // Clicking the countdown badge cancels it
    const badge = document.getElementById('lead-in-badge');
    if (badge) {
        badge.addEventListener('click', () => {
            cancelCountdown();
        });
    }
}

