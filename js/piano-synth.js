/**
 * Piano Studio - Acoustic Piano Sound Synthesizer
 *
 * Multi-string detune chorus with wooden body acoustic lowpass filter and envelope.
 */

let audioCtx = null;

function getAudioContext() {
    if (!audioCtx && (window.AudioContext || window.webkitAudioContext)) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    return audioCtx;
}

export function midiToFrequency(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
}

/**
 * Realistic acoustic piano synthesis (harmonics + multi-string chorus + wooden body filter + decay)
 */
export function playAcousticPianoSound(midi) {
    try {
        const ctx = getAudioContext();
        if (!ctx) return;
        if (ctx.state === 'suspended') ctx.resume();

        const freq = midiToFrequency(midi);
        const now = ctx.currentTime;

        const masterGain = ctx.createGain();
        masterGain.connect(ctx.destination);

        // Fast hammer attack transient + natural piano string decay
        masterGain.gain.setValueAtTime(0, now);
        masterGain.gain.linearRampToValueAtTime(0.28, now + 0.015);
        masterGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.8);

        // Lowpass filter to simulate wooden piano soundboard resonance
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(Math.min(freq * 3.5, 8000), now);
        filter.Q.setValueAtTime(2.0, now);
        filter.connect(masterGain);

        // Multi-string detune chorus (-3, 0, +3 cents)
        const detunes = [-3, 0, 3];
        detunes.forEach(detuneVal => {
            const osc = ctx.createOscillator();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(freq, now);
            osc.detune.setValueAtTime(detuneVal, now);
            osc.connect(filter);
            osc.start(now);
            osc.stop(now + 1.85);
        });
    } catch (e) {
        // Fallback gracefully
    }
}

