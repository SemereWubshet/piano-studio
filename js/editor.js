/**
 * Piano Studio - Editor Drawer Component
 *
 * Manages the ABC raw code drawer, left-edge drag resize, and code saving.
 */

import { state } from './state.js';
import { saveScoreContent, checkHeartbeat } from './api.js';
import { parseTunes } from './music-engine.js';

const isMobileMode = () =>
    window.matchMedia('(hover: none) and (pointer: coarse)').matches;

const isCompactMode = () =>
    window.matchMedia('(max-width: 768px)').matches;

const isOverlayMode = () => isMobileMode() || isCompactMode();

export function toggleEditor(forceState) {
    const drawer = document.getElementById('editor-drawer');
    const btnToggle = document.getElementById('btn-toggle-editor');
    if (!drawer) return;

    if (drawer.offsetWidth > 0) {
        drawer.style.setProperty('--drawer-w', `${drawer.offsetWidth}px`);
    }

    let isOpen;
    if (typeof forceState === "boolean") {
        isOpen = forceState;
        drawer.classList.toggle("open", isOpen);
        drawer.classList.toggle("hidden", !isOpen);
    } else {
        isOpen = drawer.classList.toggle("open");
        drawer.classList.toggle("hidden", !isOpen);
    }

    if (isOpen && isOverlayMode()) {
        const sidebarEl = document.getElementById('sidebar');
        const expandBtn = document.getElementById('btn-expand-sidebar');
        if (sidebarEl && !sidebarEl.classList.contains('collapsed')) {
            sidebarEl.classList.add('collapsed');
            if (expandBtn) expandBtn.style.display = 'inline-flex';
        }
    }

    if (btnToggle) {
        btnToggle.classList.toggle("active", isOpen);
    }
}

export function updateEditorContent(tuneAbc) {
    const abcSourceEl = document.getElementById('abc-source');
    if (abcSourceEl) {
        abcSourceEl.value = tuneAbc || '';
    }
}

export async function saveCurrentTune(onSavedCallback) {
    if (!state.activeFileName) return;

    const abcSourceEl = document.getElementById('abc-source');
    const btnSaveEl = document.getElementById('btn-save');
    if (!abcSourceEl || !btnSaveEl) return;

    const editedTuneCode = abcSourceEl.value;
    btnSaveEl.textContent = "Saving...";

    let allTunes = parseTunes(state.fileContents[state.activeFileName] || "")
                    .map(t => t.trim())
                    .filter(t => t.length > 0);

    allTunes[state.activeTuneIndex] = editedTuneCode.trim();
    const fullFileCode = allTunes.join("\n\n");

    try {
        await saveScoreContent(state.activeFileName, fullFileCode);

        setTimeout(async () => {
            state.lastFolderSyncTime = await checkHeartbeat();
        }, 500);

        btnSaveEl.textContent = "Saved!";
        setTimeout(() => btnSaveEl.textContent = "Save Changes", 2000);

        state.fileContents[state.activeFileName] = fullFileCode;

        if (onSavedCallback) onSavedCallback();
    } catch (error) {
        alert("Failed to save file.");
        btnSaveEl.textContent = "Save Changes";
    }
}

export function initEditorControls(onSavedCallback) {
    const drawer = document.getElementById('editor-drawer');
    const btnToggle = document.getElementById('btn-toggle-editor');
    const btnClose = document.getElementById('btn-close-editor');
    const btnSave = document.getElementById('btn-save');
    const abcSource = document.getElementById('abc-source');
    const cursorPosEl = document.getElementById('editor-cursor-pos');

    if (btnToggle) {
        btnToggle.addEventListener('click', () => toggleEditor());
    }

    if (btnClose) {
        btnClose.addEventListener('click', () => toggleEditor(false));
    }

    // Click outside editor drawer to dismiss in overlay mode
    document.addEventListener('click', (e) => {
        if (!isOverlayMode() || !drawer || !drawer.classList.contains('open')) return;
        if (drawer.contains(e.target) || btnToggle?.contains(e.target)) return;
        toggleEditor(false);
    });

    if (btnSave) {
        btnSave.addEventListener('click', () => saveCurrentTune(onSavedCallback));
    }

    if (abcSource && cursorPosEl) {
        const updateCursor = () => {
            const pos = abcSource.selectionStart || 0;
            const textBefore = abcSource.value.substring(0, pos);
            const lines = textBefore.split("\n");
            const line = lines.length;
            const col = lines[lines.length - 1].length + 1;
            cursorPosEl.textContent = `Line ${line}, Col ${col}`;
        };
        abcSource.addEventListener('keyup', updateCursor);
        abcSource.addEventListener('click', updateCursor);
        abcSource.addEventListener('input', updateCursor);
    }

    if (drawer) {
        // Ctrl + Enter to save score changes
        drawer.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                saveCurrentTune(onSavedCallback);
            }
        });

        drawer.addEventListener('mousedown', (e) => {
            if (e.offsetX > 8) return;
            e.preventDefault();
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';

            const onMove = (moveEvt) => {
                const newWidth = window.innerWidth - moveEvt.clientX;
                if (newWidth >= 280 && newWidth <= window.innerWidth * 0.75) {
                    drawer.style.setProperty('--drawer-w', `${newWidth}px`);
                }
            };

            const onUp = () => {
                document.body.style.cursor = '';
                document.body.style.userSelect = '';
                window.removeEventListener('mousemove', onMove);
                window.removeEventListener('mouseup', onUp);
            };

            window.addEventListener('mousemove', onMove);
            window.addEventListener('mouseup', onUp);
        });
    }
}

