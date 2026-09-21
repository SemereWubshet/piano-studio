/**
 * Piano Studio - Focus Mode & Zoom Controller
 *
 * Handles sheet magnification (+, -, reset, wheel) and fullscreen focus mode toggling.
 */

import { state, setZoomLevel } from './state.js';

export function updateZoom(delta) {
    const newZoom = setZoomLevel(state.zoomLevel + delta);
    applyZoom(newZoom);
}

export function resetZoom() {
    const newZoom = setZoomLevel(1.0);
    applyZoom(newZoom);
}

function applyZoom(zoom) {
    const paperEl = document.getElementById('paper');
    if (paperEl) {
        paperEl.style.transform = `scale(${zoom})`;
    }
    const zoomIndicator = document.getElementById('focus-zoom-level');
    if (zoomIndicator) {
        zoomIndicator.textContent = `${Math.round(zoom * 100)}%`;
    }
}

export function toggleFocusMode(forceState) {
    if (typeof forceState === 'boolean') {
        state.isFocusMode = forceState;
    } else {
        state.isFocusMode = !state.isFocusMode;
    }
    document.body.classList.toggle('focus-mode', state.isFocusMode);
}

export function initFocusAndZoomControls() {
    // Zoom in / out buttons
    document.getElementById('btn-zoom-in')?.addEventListener('click', () => updateZoom(0.15));
    document.getElementById('btn-zoom-out')?.addEventListener('click', () => updateZoom(-0.15));
    document.getElementById('btn-focus-zoom-in')?.addEventListener('click', () => updateZoom(0.15));
    document.getElementById('btn-focus-zoom-out')?.addEventListener('click', () => updateZoom(-0.15));

    // Focus toggles
    document.getElementById('btn-toggle-focus')?.addEventListener('click', () => toggleFocusMode());
    document.getElementById('btn-exit-focus')?.addEventListener('click', () => toggleFocusMode(false));

    // Ctrl + MouseWheel zoom
    document.getElementById('sheet-wrapper')?.addEventListener('wheel', (e) => {
        if (e.ctrlKey) {
            e.preventDefault();
            updateZoom(e.deltaY < 0 ? 0.1 : -0.1);
        }
    }, { passive: false });

    // Keyboard shortcuts: F (focus), Esc (exit focus), +/= (zoom in), - (zoom out), 0 (reset)
    window.addEventListener('keydown', (e) => {
        if (e.target && e.target.tagName === 'TEXTAREA') return;

        if (e.key === 'f' || e.key === 'F') {
            toggleFocusMode();
        } else if (e.key === 'Escape' && state.isFocusMode) {
            toggleFocusMode(false);
        } else if (e.key === '+' || e.key === '=') {
            updateZoom(0.1);
        } else if (e.key === '-' || e.key === '_') {
            updateZoom(-0.1);
        } else if (e.key === '0') {
            resetZoom();
        }
    });
}

