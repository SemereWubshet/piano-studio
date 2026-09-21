/**
 * Piano Studio - Editor Drawer Component
 *
 * Manages the ABC raw code drawer, left-edge drag resize, and code saving.
 */

import { state } from './state.js';
import { saveScoreContent, checkHeartbeat } from './api.js';
import { parseTunes } from './music-engine.js';

export function toggleEditor(forceState) {
    const drawer = document.getElementById('editor-drawer');
    if (!drawer) return;

    if (drawer.offsetWidth > 0) {
        drawer.style.setProperty('--drawer-w', `${drawer.offsetWidth}px`);
    }

    if (typeof forceState === "boolean") {
        drawer.classList.toggle("open", forceState);
        drawer.classList.toggle("hidden", !forceState);
    } else {
        drawer.classList.toggle("open");
        drawer.classList.toggle("hidden");
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
    const btnSave = document.getElementById('btn-save');

    if (btnToggle) {
        btnToggle.addEventListener('click', () => toggleEditor());
    }

    if (btnSave) {
        btnSave.addEventListener('click', () => saveCurrentTune(onSavedCallback));
    }

    if (drawer) {
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

