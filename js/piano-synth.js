/**
 * Piano Studio - Acoustic Piano Sound Synthesizer & Concert Grand Sampler
 *
 * Supports multiple selectable piano voices:
 * 1. Concert Grand (High-resolution acoustic piano samples via smplr SplendidGrandPiano)
 * 2. Warm Upright Piano (Mellow wooden felt attack with intimate acoustic body)
 * 3. Electric Grand CP80 (Classic vintage rock/pop electric grand)
 * 4. Rhodes Velvet EP (Lush bell-like electric piano with warm chorus)
 * 5. Studio Physical Model (Instant zero-latency physical modeling with multi-harmonic strings)
 */

const STORAGE_VOICE_KEY = 'piano_studio_piano_voice';
const STORAGE_SUSTAIN_KEY = 'piano_studio_sustain_enabled';

export const PIANO_VOICES = [
    { id: 'concert_grand',   name: '🎹 Concert Grand', desc: 'Sampled acoustic concert grand' },
    { id: 'upright_warm',    name: '🏛️ Warm Upright Piano', desc: 'Intimate felt piano with woody tone' },
    { id: 'ep_rhodes',       name: '⚡ Rhodes Velvet EP', desc: 'Lush, bell-like vintage electric piano' },
    { id: 'cp80_sample',     name: '🎸 Electric Grand CP80', desc: 'Dynamic vintage electric stage grand' },
    { id: 'synth_keyboard',  name: '🎛️ Synth Keyboard', desc: 'Electronic synthesizer keys' }
];

let currentVoiceId = localStorage.getItem(STORAGE_VOICE_KEY) || 'concert_grand';
// Migrate old voice id if stored
if (currentVoiceId === 'steinway_sample' || currentVoiceId === 'acoustic_model') {
    currentVoiceId = 'concert_grand';
}

// Sustain pedal toggle: false by default
let isSustainEnabled = localStorage.getItem(STORAGE_SUSTAIN_KEY) === 'true';

let audioCtx = null;
let concertGrandPiano = null;
let cp80Piano = null;
let isSamplerLoading = false;

// Active physical nodes map for releasing when sustain is off: midi -> { release(), gainNode }
const activePhysicalNotes = new Map();

export function getIsSustainEnabled() {
    return isSustainEnabled;
}

export function setSustainEnabled(enabled) {
    isSustainEnabled = !!enabled;
    localStorage.setItem(STORAGE_SUSTAIN_KEY, isSustainEnabled ? 'true' : 'false');
    if (!isSustainEnabled) {
        stopAllPhysicalNotes();
    }
}

export function toggleSustainPedal() {
    setSustainEnabled(!isSustainEnabled);
    return isSustainEnabled;
}

function getAudioContext() {
    if (!audioCtx && (window.AudioContext || window.webkitAudioContext)) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    return audioCtx;
}

export function getCurrentVoiceId() {
    return currentVoiceId;
}

export function setPianoVoice(voiceId) {
    currentVoiceId = voiceId;
    localStorage.setItem(STORAGE_VOICE_KEY, voiceId);

    // Warm up sampler in background if a sampled piano was chosen
    if (voiceId === 'concert_grand' || voiceId === 'cp80_sample') {
        preloadSamplers();
    }
}

async function preloadSamplers() {
    if (isSamplerLoading) return;
    isSamplerLoading = true;

    try {
        const ctx = getAudioContext();
        if (!ctx) return;

        // Load smplr via dynamic ESM import
        const smplr = await import('https://cdn.jsdelivr.net/npm/smplr@latest/+esm');

        if (!concertGrandPiano && smplr.SplendidGrandPiano) {
            concertGrandPiano = smplr.SplendidGrandPiano(ctx);
        }

        if (!cp80Piano && smplr.ElectricPiano) {
            cp80Piano = smplr.ElectricPiano(ctx, { instrument: 'CP80' });
        }
    } catch (err) {
        console.warn('Real piano sample bank loading notice (falling back to physical model):', err);
    } finally {
        isSamplerLoading = false;
    }
}

export function midiToFrequency(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
}

/**
 * Releases physical oscillators for a given note (dampens the string).
 */
export function stopPhysicalPianoNote(midi) {
    const noteEntry = activePhysicalNotes.get(midi);
    if (!noteEntry) return;

    const ctx = getAudioContext();
    const now = ctx ? ctx.currentTime : 0;

    try {
        // Quick 40ms dampening release
        noteEntry.masterGain.gain.cancelScheduledValues(now);
        noteEntry.masterGain.gain.setValueAtTime(noteEntry.masterGain.gain.value, now);
        noteEntry.masterGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.04);
        setTimeout(() => {
            noteEntry.oscillators.forEach(osc => {
                try { osc.stop(); } catch (e) {}
            });
        }, 50);
    } catch (e) {}

    activePhysicalNotes.delete(midi);
}

export function stopAllPhysicalNotes() {
    activePhysicalNotes.forEach((entry, midi) => {
        stopPhysicalPianoNote(midi);
    });
    activePhysicalNotes.clear();
}

/**
 * High-definition harmonic physical piano model (wooden body resonance + hammer felt transient + harmonic partials)
 */
function playPhysicalPiano(midi, velocity = 95, profile = 'concert') {
    const ctx = getAudioContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume();

    // Clean up any existing instance of this pitch
    stopPhysicalPianoNote(midi);

    const freq = midiToFrequency(midi);
    const now = ctx.currentTime;
    const velNorm = Math.max(0.1, Math.min(1.0, velocity / 127));

    const masterGain = ctx.createGain();
    masterGain.connect(ctx.destination);

    // Voice-specific tone profiles
    let attackTime = 0.008;
    let decayTime = isSustainEnabled ? 2.4 : 1.2;
    let cutoffMult = 3.6;
    let Q = 1.8;
    let peakGain = 0.08 + (velNorm * 0.28);

    if (profile === 'upright') {
        attackTime = 0.015;
        decayTime = isSustainEnabled ? 1.8 : 0.9;
        cutoffMult = 2.4;
        peakGain = 0.06 + (velNorm * 0.22);
    } else if (profile === 'rhodes') {
        attackTime = 0.01;
        decayTime = isSustainEnabled ? 2.2 : 1.1;
        cutoffMult = 4.2;
        peakGain = 0.07 + (velNorm * 0.24);
    }

    masterGain.gain.setValueAtTime(0, now);
    masterGain.gain.linearRampToValueAtTime(peakGain, now + attackTime);
    masterGain.gain.exponentialRampToValueAtTime(0.0001, now + decayTime);

    // Wooden piano body filter
    const bodyFilter = ctx.createBiquadFilter();
    bodyFilter.type = 'lowpass';
    bodyFilter.frequency.setValueAtTime(Math.min(freq * cutoffMult, 9500), now);
    bodyFilter.Q.setValueAtTime(Q, now);
    bodyFilter.connect(masterGain);

    const oscillators = [];

    // 1. Hammer felt thud (percussive transient)
    const hammer = ctx.createOscillator();
    const hammerGain = ctx.createGain();
    hammer.type = 'sine';
    hammer.frequency.setValueAtTime(freq * 1.5, now);
    hammerGain.gain.setValueAtTime(peakGain * 0.4, now);
    hammerGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.04);
    hammer.connect(hammerGain);
    hammerGain.connect(bodyFilter);
    hammer.start(now);
    hammer.stop(now + 0.05);

    // 2. Harmonic strings (fundamental, detuned unisons, 2nd & 3rd harmonic partials)
    const partials = [
        { freqRatio: 1.0, detune: -2.5, gain: 0.65, type: profile === 'rhodes' ? 'sine' : 'sawtooth' },
        { freqRatio: 1.0, detune:  0.0, gain: 0.70, type: profile === 'rhodes' ? 'triangle' : 'sawtooth' },
        { freqRatio: 1.0, detune:  2.5, gain: 0.65, type: profile === 'rhodes' ? 'sine' : 'sawtooth' },
        { freqRatio: 2.0, detune:  0.5, gain: 0.30, type: 'sine' },
        { freqRatio: 3.0, detune: -0.5, gain: 0.15, type: 'sine' }
    ];

    partials.forEach(p => {
        const osc = ctx.createOscillator();
        const pGain = ctx.createGain();

        osc.type = p.type;
        osc.frequency.setValueAtTime(freq * p.freqRatio, now);
        osc.detune.setValueAtTime(p.detune, now);

        pGain.gain.setValueAtTime(p.gain, now);
        const pDecay = p.freqRatio > 1.0 ? decayTime * 0.6 : decayTime;
        pGain.gain.exponentialRampToValueAtTime(0.0001, now + pDecay);

        osc.connect(pGain);
        pGain.connect(bodyFilter);

        osc.start(now);
        osc.stop(now + pDecay + 0.05);
        oscillators.push(osc);
    });

    activePhysicalNotes.set(midi, { masterGain, oscillators });
}

/**
 * Stops or dampens a sounding piano note (called on key release when sustain is off).
 */
export function stopAcousticPianoSound(midi) {
    if (isSustainEnabled) return; // Do not cut note if sustain pedal is enabled

    // Stop sampled concert grand
    if (currentVoiceId === 'concert_grand' && concertGrandPiano && typeof concertGrandPiano.stop === 'function') {
        try { concertGrandPiano.stop(midi); } catch (e) {}
    }
    // Stop sampled CP80
    if (currentVoiceId === 'cp80_sample' && cp80Piano && typeof cp80Piano.stop === 'function') {
        try { cp80Piano.stop(midi); } catch (e) {}
    }

    // Stop physical oscillator
    stopPhysicalPianoNote(midi);
}

/**
 * Plays the chosen piano voice with realistic velocity and timbre.
 */
export function playAcousticPianoSound(midi, velocity = 95) {
    try {
        const ctx = getAudioContext();
        if (ctx && ctx.state === 'suspended') ctx.resume();

        // 1. Concert Grand (High-resolution sample bank)
        if (currentVoiceId === 'concert_grand') {
            if (concertGrandPiano) {
                // If sustain is off, provide clean note duration or stopId
                const startOpts = { note: midi, velocity: Math.max(15, velocity) };
                if (!isSustainEnabled) {
                    startOpts.duration = 1.0;
                }
                concertGrandPiano.start(startOpts);
                return;
            } else {
                preloadSamplers();
                playPhysicalPiano(midi, velocity, 'concert');
                return;
            }
        }

        // 2. CP80 Electric Grand
        if (currentVoiceId === 'cp80_sample') {
            if (cp80Piano) {
                const startOpts = { note: midi, velocity: Math.max(15, velocity) };
                if (!isSustainEnabled) {
                    startOpts.duration = 1.0;
                }
                cp80Piano.start(startOpts);
                return;
            } else {
                preloadSamplers();
                playPhysicalPiano(midi, velocity, 'concert');
                return;
            }
        }

        // 3. Warm Upright
        if (currentVoiceId === 'upright_warm') {
            playPhysicalPiano(midi, velocity, 'upright');
            return;
        }

        // 4. Rhodes Velvet EP
        if (currentVoiceId === 'ep_rhodes') {
            playPhysicalPiano(midi, velocity, 'rhodes');
            return;
        }

        // 5. Synth Keyboard
        playPhysicalPiano(midi, velocity, 'concert');
    } catch (e) {
        // Fallback
        playPhysicalPiano(midi, velocity, 'concert');
    }
}

// Kick off sampler preload on first user interaction or idle
if (typeof window !== 'undefined') {
    if (currentVoiceId === 'concert_grand' || currentVoiceId === 'cp80_sample') {
        setTimeout(preloadSamplers, 1500);
    }
}
