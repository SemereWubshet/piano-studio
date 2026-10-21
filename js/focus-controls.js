/**
 * Piano Studio - Focus Mode & Smooth Zoom Controller
 *
 * Handles smooth 60fps sheet magnification (+, -, reset, wheel, pinch-trackpad)
 * and fullscreen focus mode toggling with lerp animation.
 */

import { state, setZoomLevel } from './state.js';

let targetZoom = state.zoomLevel;
let currentZoom = state.zoomLevel;
let zoomAnimationId = null;

function applyZoom(zoom) {
    const paperEl = document.getElementById('paper');
    if (paperEl) {
        // Round to 3 decimal places so browser SVG renderer doesn't suffer subpixel raster blurring
        const roundedZoom = Math.round(zoom * 1000) / 1000;
        paperEl.style.transform = `scale(${roundedZoom})`;
    }
    const zoomIndicator = document.getElementById('focus-zoom-level');
    if (zoomIndicator) {
        zoomIndicator.textContent = `${Math.round(zoom * 100)}%`;
    }
}

/**
 * Linear interpolation animation loop for buttery smooth zoom transitions.
 */
function animateZoom() {
    const diff = targetZoom - currentZoom;
    if (Math.abs(diff) < 0.001) {
        currentZoom = targetZoom;
        applyZoom(currentZoom);
        zoomAnimationId = null;
        return;
    }

    // Smooth lerp (0.2 factor per frame)
    currentZoom += diff * 0.2;
    applyZoom(currentZoom);
    zoomAnimationId = requestAnimationFrame(animateZoom);
}

function queueSmoothZoom(newTarget) {
    targetZoom = Math.max(0.4, Math.min(2.5, +newTarget.toFixed(3)));
    setZoomLevel(targetZoom);

    if (!zoomAnimationId) {
        zoomAnimationId = requestAnimationFrame(animateZoom);
    }
}

export function updateZoom(delta) {
    queueSmoothZoom(targetZoom + delta);
}

export function resetZoom() {
    queueSmoothZoom(1.0);
}

export function toggleFocusMode(forceState) {
    if (typeof forceState === 'boolean') {
        state.isFocusMode = forceState;
    } else {
        state.isFocusMode = !state.isFocusMode;
    }
    document.body.classList.toggle('focus-mode', state.isFocusMode);
}

/**
 * Centers the sheet music horizontally inside #sheet-wrapper.
 */
export function centerSheetMusic() {
    const wrapper = document.getElementById('sheet-wrapper');
    const paper = document.getElementById('paper');
    if (!wrapper || !paper) return;

    // Small delay/RAF to ensure ABCJS has completed rendering SVG dimensions
    requestAnimationFrame(() => {
        const scrollRange = wrapper.scrollWidth - wrapper.clientWidth;
        if (scrollRange > 0) {
            wrapper.scrollLeft = scrollRange / 2;
        } else {
            wrapper.scrollLeft = 0;
        }
    });
}

export function initFocusAndZoomControls() {
    // Zoom in / out buttons (smooth steps)
    document.getElementById('btn-zoom-in')?.addEventListener('click', () => updateZoom(0.15));
    document.getElementById('btn-zoom-out')?.addEventListener('click', () => updateZoom(-0.15));
    document.getElementById('btn-focus-zoom-in')?.addEventListener('click', () => updateZoom(0.15));
    document.getElementById('btn-focus-zoom-out')?.addEventListener('click', () => updateZoom(-0.15));

    // Focus toggles
    document.getElementById('btn-toggle-focus')?.addEventListener('click', () => {
        toggleFocusMode();
        setTimeout(centerSheetMusic, 300);
    });
    document.getElementById('btn-exit-focus')?.addEventListener('click', () => {
        toggleFocusMode(false);
        setTimeout(centerSheetMusic, 300);
    });

    // Ctrl + MouseWheel / Trackpad pinch zoom
    document.getElementById('sheet-wrapper')?.addEventListener('wheel', (e) => {
        if (e.ctrlKey) {
            e.preventDefault();
            // Scale proportional to scroll intensity with smooth decay
            const delta = -e.deltaY * 0.002;
            queueSmoothZoom(targetZoom + delta);
        }
    }, { passive: false });

    // Keyboard shortcuts: F (focus), Esc (exit focus), P (play/pause), R (repeat/loop), +/= (zoom in), - (zoom out), 0 (reset)
    window.addEventListener('keydown', (e) => {
        if (e.target && (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT')) return;

        if (e.key === 'f' || e.key === 'F') {
            toggleFocusMode();
        } else if (e.key === 'Escape' && state.isFocusMode) {
            toggleFocusMode(false);
        } else if (e.key === 'p' || e.key === 'P') {
            e.preventDefault();
            const playBtn = document.querySelector('.abcjs-midi-start');
            if (playBtn) playBtn.click();
        } else if ((e.key === 'r' || e.key === 'R') && !e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            const loopBtn = document.querySelector('.abcjs-midi-loop');
            if (loopBtn) loopBtn.click();
        } else if (e.key === '+' || e.key === '=') {
            updateZoom(0.12);
        } else if (e.key === '-' || e.key === '_') {
            updateZoom(-0.12);
        } else if (e.key === '0') {
            resetZoom();
        }
    });
}

