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
    const stageEl = document.getElementById('paper-stage');
    const roundedZoom = Math.round(zoom * 1000) / 1000;

    if (paperEl) {
        paperEl.style.transform = `scale(${roundedZoom})`;

        // Expand stage dimensions so scroll container detects overflow and provides horizontal & vertical scrolling
        if (stageEl) {
            const baseW = paperEl.offsetWidth || 820;
            const baseH = paperEl.offsetHeight || 600;
            const scaledW = baseW * roundedZoom;
            const scaledH = baseH * roundedZoom;

            stageEl.style.minWidth = `${scaledW + 60}px`;
            stageEl.style.minHeight = `${scaledH + 60}px`;
        }
    }
    const zoomIndicator = document.getElementById('focus-zoom-level');
    if (zoomIndicator) {
        zoomIndicator.textContent = `${Math.round(zoom * 100)}%`;
    }
    const sheetZoomIndicator = document.getElementById('zoom-level-text');
    if (sheetZoomIndicator) {
        sheetZoomIndicator.textContent = `${Math.round(zoom * 100)}%`;
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

    // Smooth lerp (0.08 factor per frame for ultra-gentle, gliding transition)
    currentZoom += diff * 0.08;
    applyZoom(currentZoom);
    zoomAnimationId = requestAnimationFrame(animateZoom);
}

function queueSmoothZoom(newTarget) {
    targetZoom = Math.max(0.5, Math.min(2.0, +newTarget.toFixed(3)));
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

let focusControlsTimeout = null;

export function resetFocusControlsFade() {
    const focusControls = document.getElementById('focus-controls');
    const audioBar = document.getElementById('audio-bar');

    if (focusControls) focusControls.classList.remove('faded');
    if (audioBar) audioBar.classList.remove('faded');
    clearTimeout(focusControlsTimeout);

    if (state.isFocusMode) {
        focusControlsTimeout = setTimeout(() => {
            if (state.isFocusMode) {
                if (focusControls) focusControls.classList.add('faded');
                if (audioBar) audioBar.classList.add('faded');
            }
        }, 2200);
    }
}

export function toggleFocusMode(forceState) {
    if (typeof forceState === 'boolean') {
        state.isFocusMode = forceState;
    } else {
        state.isFocusMode = !state.isFocusMode;
    }
    document.body.classList.toggle('focus-mode', state.isFocusMode);

    // Fullscreen integration: enter fullscreen when opening focus mode, exit when closing
    if (state.isFocusMode) {
        if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
            document.documentElement.requestFullscreen().catch(() => {});
        }
    } else {
        if (document.fullscreenElement && document.exitFullscreen) {
            document.exitFullscreen().catch(() => {});
        }
    }

    const focusControls = document.getElementById('focus-controls');
    const audioBar = document.getElementById('audio-bar');
    if (!state.isFocusMode) {
        if (focusControls) focusControls.classList.remove('faded');
        if (audioBar) audioBar.classList.remove('faded');
    }
    resetFocusControlsFade();
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
    // Zoom in / out buttons (gentle 5% steps for smooth gliding)
    document.getElementById('btn-zoom-in')?.addEventListener('click', () => updateZoom(0.05));
    document.getElementById('btn-zoom-out')?.addEventListener('click', () => updateZoom(-0.05));
    document.getElementById('btn-focus-zoom-in')?.addEventListener('click', () => updateZoom(0.05));
    document.getElementById('btn-focus-zoom-out')?.addEventListener('click', () => updateZoom(-0.05));

    // Focus toggles & toolbar buttons
    document.getElementById('btn-toggle-focus')?.addEventListener('click', () => {
        toggleFocusMode();
        setTimeout(centerSheetMusic, 300);
    });
    document.getElementById('btn-exit-focus')?.addEventListener('click', () => {
        toggleFocusMode(false);
        setTimeout(centerSheetMusic, 300);
    });

    // Fade out focus toolbar and floating audio bar on mouse idle (2.2s)
    window.addEventListener('mousemove', resetFocusControlsFade);
    window.addEventListener('mousedown', resetFocusControlsFade);
    window.addEventListener('touchstart', resetFocusControlsFade, { passive: true });

    // Sync focus-mode state if user exits fullscreen via browser UI or Esc
    document.addEventListener('fullscreenchange', () => {
        if (!document.fullscreenElement && state.isFocusMode) {
            toggleFocusMode(false);
            setTimeout(centerSheetMusic, 300);
        }
    });

    // Ctrl + MouseWheel / Trackpad pinch zoom (smooth controlled scaling)
    document.getElementById('sheet-wrapper')?.addEventListener('wheel', (e) => {
        if (e.ctrlKey) {
            e.preventDefault();
            // Scale proportional to scroll intensity with smooth decay and clamp
            const delta = Math.max(-0.03, Math.min(0.03, -e.deltaY * 0.0004));
            queueSmoothZoom(targetZoom + delta);
        }
    }, { passive: false });

    // Keyboard shortcuts: F (focus), Esc (exit focus), P (play/pause), R (repeat/loop), E (editor), +/= (zoom in), - (zoom out), 0 (reset)
    window.addEventListener('keydown', (e) => {
        if (e.target && (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT')) return;

        if (e.key === 'f' || e.key === 'F') {
            toggleFocusMode();
        } else if (e.key === 'Escape' && state.isFocusMode) {
            toggleFocusMode(false);
        } else if (e.key === 'e' || e.key === 'E') {
            e.preventDefault();
            document.getElementById('btn-toggle-editor')?.click();
        } else if ((e.key === 's' || e.key === 'S') && !e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            const sidebar = document.getElementById('sidebar');
            const toggleSidebarBtn = document.getElementById('btn-toggle-sidebar');
            const expandSidebarBtn = document.getElementById('btn-expand-sidebar');
            if (sidebar?.classList.contains('collapsed')) {
                expandSidebarBtn?.click();
            } else {
                toggleSidebarBtn?.click();
            }
        } else if (e.key === 'p' || e.key === 'P') {
            e.preventDefault();
            const playBtn = document.querySelector('.abcjs-midi-start');
            if (playBtn) playBtn.click();
        } else if ((e.key === 'r' || e.key === 'R') && !e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            const loopBtn = document.querySelector('.abcjs-midi-loop');
            if (loopBtn) loopBtn.click();
        } else if (e.key === '+' || e.key === '=') {
            updateZoom(0.05);
        } else if (e.key === '-' || e.key === '_') {
            updateZoom(-0.05);
        } else if (e.key === '0') {
            resetZoom();
        }
    });
}

