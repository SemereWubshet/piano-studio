/**
 * Piano Studio - MIDI Shortcuts & Controller Routing
 *
 * Dedicated controller router. Physical sustain pedal (CC 64) operates
 * strictly as a real musical damper pedal, and all artificial edge-key
 * and pedal shortcut triggers have been removed.
 */

import { subscribeMidiEvents } from './midi-engine.js';
import { setSustainEnabled } from './piano-synth.js';

function handleControlChange(cc, value) {
    // CC 64 operates strictly as a physical sustain / damper pedal
    if (cc === 64) {
        const isPedalPressed = value >= 64;
        setSustainEnabled(isPedalPressed);

        const sustainBtn = document.getElementById('btn-toggle-sustain');
        if (sustainBtn) {
            sustainBtn.classList.toggle('active', isPedalPressed);
            sustainBtn.innerHTML = `<span class="sustain-pedal-icon">🦶</span> <span>Sustain: ${isPedalPressed ? 'ON' : 'OFF'}</span>`;
        }
    }
}

export function initMidiShortcuts() {
    subscribeMidiEvents({
        onCC: handleControlChange
    });
}
