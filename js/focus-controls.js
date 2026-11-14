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
let anchorState = null;

function getStageBaseWidth(wrapperEl) {
    if (!wrapperEl) return 820;
    const cs = window.getComputedStyle(wrapperEl);
    const padX = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
    return Math.max(280, (wrapperEl.clientWidth || 880) - padX);
}

function captureScrollAnchor(focalPoint = null) {
    const wrapperEl = document.getElementById('sheet-wrapper');
    if (!wrapperEl) return;

    let focalX = wrapperEl.clientWidth / 2;
    let focalY = wrapperEl.scrollTop > 10 ? wrapperEl.clientHeight / 2 : 0;

    if (focalPoint && typeof focalPoint.clientX === 'number') {
        const rect = wrapperEl.getBoundingClientRect();
        focalX = Math.max(0, Math.min(wrapperEl.clientWidth, focalPoint.clientX - rect.left));
        focalY = Math.max(0, Math.min(wrapperEl.clientHeight, focalPoint.clientY - rect.top));
    }

    const canScrollX = currentZoom > 1.001 && wrapperEl.scrollWidth > wrapperEl.clientWidth;
    const uX = canScrollX
        ? (wrapperEl.scrollLeft + focalX) / Math.max(1, wrapperEl.scrollWidth)
        : (focalPoint ? focalX / Math.max(1, wrapperEl.clientWidth) : 0.5);

    const canScrollY = (wrapperEl.scrollTop > 10 || focalPoint) && wrapperEl.scrollHeight > wrapperEl.clientHeight;
    const uY = canScrollY
        ? (wrapperEl.scrollTop + focalY) / Math.max(1, wrapperEl.scrollHeight)
        : 0;

    anchorState = {
        focalX,
        focalY,
        uX,
        uY,
        clientX: focalPoint?.clientX ?? null,
        clientY: focalPoint?.clientY ?? null
    };
}

function applyZoom(zoom, options = {}) {
    const wrapperEl = document.getElementById('sheet-wrapper');
    const paperEl = document.getElementById('paper');
    const stageEl = document.getElementById('paper-stage');
    const roundedZoom = Math.round(zoom * 1000) / 1000;

    if (stageEl) {
        stageEl.style.minWidth = '';
        stageEl.style.minHeight = '';
    }

    if (paperEl) {
        // Clear ABCJS responsive padding-bottom hack so height scales purely from SVG viewBox & paper width
        paperEl.style.paddingBottom = '';
        paperEl.style.overflow = '';
        paperEl.style.transform = '';

        const baseW = getStageBaseWidth(wrapperEl);
        const scaledW = Math.round(baseW * roundedZoom * 10) / 10;
        paperEl.style.width = `${scaledW}px`;
        paperEl.style.padding = `${Math.round(24 * roundedZoom)}px ${Math.round(30 * roundedZoom)}px`;

        if (options.preserveScroll !== false && wrapperEl && anchorState) {
            if (roundedZoom <= 1.001) {
                wrapperEl.scrollLeft = 0;
            } else {
                wrapperEl.scrollLeft = Math.max(0, anchorState.uX * wrapperEl.scrollWidth - anchorState.focalX);
            }
            if (anchorState.uY > 0) {
                wrapperEl.scrollTop = Math.max(0, anchorState.uY * wrapperEl.scrollHeight - anchorState.focalY);
            }
        }
    }

    const displayZoom = targetZoom || zoom;
    const pctText = `${Math.round(displayZoom * 100)}%`;
    const zoomIndicator = document.getElementById('focus-zoom-level');
    if (zoomIndicator) zoomIndicator.textContent = pctText;
    const sheetZoomIndicator = document.getElementById('zoom-level-text');
    if (sheetZoomIndicator) sheetZoomIndicator.textContent = pctText;
}

export function syncSheetZoom() {
    applyZoom(currentZoom, { preserveScroll: false });
}

/**
 * Linear interpolation animation loop for snappy, responsive zoom transitions.
 */
function animateZoom() {
    const diff = targetZoom - currentZoom;
    if (Math.abs(diff) < 0.002) {
        currentZoom = targetZoom;
        applyZoom(currentZoom);
        zoomAnimationId = null;
        anchorState = null;
        return;
    }

    // Snappy lerp (0.38 factor per frame for crisp, low-latency response)
    currentZoom += diff * 0.38;
    applyZoom(currentZoom);
    zoomAnimationId = requestAnimationFrame(animateZoom);
}

function queueSmoothZoom(newTarget, focalPoint = null) {
    const clampedTarget = Math.max(0.5, Math.min(2.0, +newTarget.toFixed(3)));
    if (!zoomAnimationId || !anchorState) {
        captureScrollAnchor(focalPoint);
    } else if (focalPoint && anchorState.clientX !== null) {
        const moved = Math.hypot(focalPoint.clientX - anchorState.clientX, focalPoint.clientY - anchorState.clientY);
        if (moved > 12) captureScrollAnchor(focalPoint);
    }

    targetZoom = clampedTarget;
    setZoomLevel(targetZoom);

    if (!zoomAnimationId) {
        zoomAnimationId = requestAnimationFrame(animateZoom);
    }
}

export function updateZoom(delta) {
    const nextStep = Math.round((targetZoom + delta) * 100) / 100;
    queueSmoothZoom(nextStep);
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

    applyZoom(currentZoom, { preserveScroll: false });

    // Small delay/RAF to ensure ABCJS has completed rendering SVG dimensions
    requestAnimationFrame(() => {
        applyZoom(currentZoom, { preserveScroll: false });
        const scrollRange = wrapper.scrollWidth - wrapper.clientWidth;
        if (scrollRange > 0) {
            wrapper.scrollLeft = scrollRange / 2;
        } else {
            wrapper.scrollLeft = 0;
        }
    });
}

export function initFocusAndZoomControls() {
    // Zoom in / out buttons (clean 5% steps) & click percentage label to reset to 100%
    document.getElementById('btn-zoom-in')?.addEventListener('click', () => updateZoom(0.05));
    document.getElementById('btn-zoom-out')?.addEventListener('click', () => updateZoom(-0.05));
    document.getElementById('btn-focus-zoom-in')?.addEventListener('click', () => updateZoom(0.05));
    document.getElementById('btn-focus-zoom-out')?.addEventListener('click', () => updateZoom(-0.05));
    document.getElementById('zoom-level-text')?.addEventListener('click', () => resetZoom());
    document.getElementById('focus-zoom-level')?.addEventListener('click', () => resetZoom());

    // Keep sheet music width & floating zoom pill synced when stage resizes (window resize, sidebar/editor toggle, focus mode)
    const wrapperEl = document.getElementById('sheet-wrapper');
    const workspaceEl = document.getElementById('workspace-body');
    const zoomOverlayEl = document.querySelector('.sheet-zoom-overlay');
    const syncZoomOverlayPosition = () => {
        if (!wrapperEl || !workspaceEl || !zoomOverlayEl) return;
        const rightInset = Math.max(0, workspaceEl.clientWidth - (wrapperEl.offsetLeft + wrapperEl.offsetWidth));
        zoomOverlayEl.style.right = `${rightInset + 24}px`;
    };
    syncZoomOverlayPosition();

    if (wrapperEl && typeof ResizeObserver !== 'undefined') {
        let lastWrapperWidth = wrapperEl.clientWidth;
        const ro = new ResizeObserver(() => {
            syncZoomOverlayPosition();
            const w = wrapperEl.clientWidth;
            if (w > 0 && Math.abs(w - lastWrapperWidth) > 1) {
                lastWrapperWidth = w;
                applyZoom(currentZoom, { preserveScroll: false });
            }
        });
        ro.observe(wrapperEl);
    }

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
    wrapperEl?.addEventListener('wheel', (e) => {
        if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            let dy = e.deltaY;
            if (e.deltaMode === 1) dy *= 16;
            else if (e.deltaMode === 2) dy *= 100;

            const isDiscreteWheel = Math.abs(dy) >= 48 && e.deltaMode === 0 && Number.isInteger(e.deltaY);
            const rawDelta = isDiscreteWheel
                ? Math.sign(-dy) * 0.05
                : -dy * 0.0055;
            const delta = Math.max(-0.08, Math.min(0.08, rawDelta));
            queueSmoothZoom(targetZoom + delta, { clientX: e.clientX, clientY: e.clientY });
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

