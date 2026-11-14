/**
 * Piano Studio - Owner Mode ("Secret Knock") & Backup / Export / Import UI
 *
 * Only activates in online mode (!isLocalMode()).
 * - Desktop: Ctrl + Shift + P
 * - Mobile: Triple-tap on the "Piano Studio" sidebar title
 */

import {
    exportScoresAsZip,
    getExportableScoreNames,
    importGuestScores,
    isLocalMode,
    isOwnerAuthenticated,
    lockOwner,
    unlockOwner
} from './api.js';
import { state } from './state.js';
import { parseTunes } from './music-engine.js';
import { openNewScoreFileDialog } from './sidebar.js';

const MORE_ICON_SVG = `<svg width="18" height="18" viewBox="0 0 24 24" fill="#2B2620" aria-hidden="true"><circle cx="5" cy="12" r="1.8"></circle><circle cx="12" cy="12" r="1.8"></circle><circle cx="19" cy="12" r="1.8"></circle></svg>`;

export function initOwnerAndGuestControls(onScoresChanged) {
    const isLocal = isLocalMode();

    const sidebarSection = document.querySelector('.sidebar-section');
    const titleEl = document.querySelector('.sidebar-header h2');
    if (!sidebarSection || !titleEl) return;

    // 1. Discreet Owner badge + Backup/Import ••• menu button
    const controlsWrap = document.createElement('div');
    controlsWrap.id = 'online-score-controls';
    controlsWrap.style.cssText = 'display:flex;gap:4px;align-items:center;margin-left:auto;position:relative;';

    const ownerBadge = document.createElement('button');
    ownerBadge.id = 'btn-owner-lock';
    ownerBadge.title = 'Owner Mode active — click to lock';
    ownerBadge.textContent = '● Owner';
    ownerBadge.style.cssText =
        'display:none;font-size:11px;padding:2px 7px;border-radius:999px;border:1px solid #2e7d32;background:#e8f5e9;color:#1b5e20;cursor:pointer;font-weight:600;';

    const backupBtn = document.createElement('button');
    backupBtn.id = 'btn-backup-menu';
    backupBtn.type = 'button';
    backupBtn.className = 'btn-backup-menu';
    backupBtn.title = 'Manage Score Files';
    backupBtn.setAttribute('aria-label', 'Manage Score Files');
    backupBtn.innerHTML = MORE_ICON_SVG;

    controlsWrap.append(ownerBadge, backupBtn);
    sidebarSection.style.display = 'flex';
    sidebarSection.style.alignItems = 'center';
    sidebarSection.appendChild(controlsWrap);

    let activeMenu = null;

    function closeBackupMenu() {
        if (activeMenu) {
            activeMenu.remove();
            activeMenu = null;
        }
        backupBtn.classList.remove('active');
    }

    function openExportModal() {
        const names = getExportableScoreNames();
        const dialog = document.createElement('dialog');
        dialog.className = 'studio-modal-dialog';
        dialog.innerHTML = `
            <form method="dialog" class="dialog-form">
                <h2>Export scores</h2>
                <label style="display:flex;gap:10px;align-items:center;font-size:14px;font-weight:500;margin-bottom:0;cursor:pointer;">
                    <input type="checkbox" id="export-select-all" checked> Select all
                </label>
                <div class="export-scores-box" id="export-scores-list"></div>
                <div style="display:flex;align-items:center;justify-content:space-between;margin-top:4px;">
                    <span id="export-selected-count" style="font-size:13px;color:#6B6458;"></span>
                    <span style="display:flex;gap:10px;">
                        <button type="button" class="btn-cancel">Cancel</button>
                        <button type="submit" class="btn-primary">Download</button>
                    </span>
                </div>
            </form>
        `;

        const listEl = dialog.querySelector('#export-scores-list');
        const selectAllCb = dialog.querySelector('#export-select-all');
        const countEl = dialog.querySelector('#export-selected-count');
        const checkboxes = [];

        const updateCount = () => {
            const count = checkboxes.filter((c) => c.checked).length;
            countEl.textContent = `${count} file${count === 1 ? '' : 's'} selected`;
            selectAllCb.checked = count > 0 && count === checkboxes.length;
        };

        if (names.length === 0) {
            listEl.innerHTML = `<div style="padding:12px 0;color:#6B6458;font-size:13px;">No scores available to export.</div>`;
        } else {
            for (const name of names) {
                const label = document.createElement('label');
                const cb = document.createElement('input');
                cb.type = 'checkbox';
                cb.checked = true;
                cb.value = name;
                cb.addEventListener('change', updateCount);
                checkboxes.push(cb);
                const span = document.createElement('span');
                span.textContent = name.replace(/\.abc$/, '');
                const tuneCount = parseTunes(state.fileContents?.[name] || '').length;
                const countBadge = document.createElement('span');
                countBadge.className = 'export-tune-count';
                countBadge.textContent = `${tuneCount} ${tuneCount === 1 ? 'tune' : 'tunes'}`;
                label.append(cb, span, countBadge);
                listEl.appendChild(label);
            }
        }
        updateCount();

        selectAllCb.addEventListener('change', () => {
            checkboxes.forEach((c) => { c.checked = selectAllCb.checked; });
            updateCount();
        });

        const cleanup = () => {
            dialog.close();
            dialog.remove();
        };

        dialog.querySelector('.btn-cancel').addEventListener('click', cleanup);
        dialog.addEventListener('click', (e) => { if (e.target === dialog) cleanup(); });

        dialog.querySelector('form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const selected = checkboxes.filter((c) => c.checked).map((c) => c.value);
            try {
                await exportScoresAsZip(selected);
                cleanup();
            } catch (err) {
                alert(err.message);
            }
        });

        document.body.appendChild(dialog);
        dialog.showModal();
    }

    function openImportModal() {
        const dialog = document.createElement('dialog');
        dialog.className = 'studio-modal-dialog';
        dialog.innerHTML = `
            <form method="dialog" class="dialog-form">
                <h2>Import scores</h2>
                <p>Select one or more .abc score files to add to your library.</p>
                <div class="import-dropzone" id="import-dropzone">
                    Drop .abc file(s) here, or <u>choose files</u>
                    <span class="import-dropzone-meta" id="import-file-meta"></span>
                </div>
                <input type="file" id="import-hidden-input" accept=".abc" multiple style="display:none;">
                <div class="dialog-actions">
                    <button type="button" class="btn-cancel">Cancel</button>
                    <button type="submit" class="btn-primary" id="import-submit-btn" disabled>Import</button>
                </div>
            </form>
        `;

        const dropzone = dialog.querySelector('#import-dropzone');
        const fileMeta = dialog.querySelector('#import-file-meta');
        const hiddenInput = dialog.querySelector('#import-hidden-input');
        const submitBtn = dialog.querySelector('#import-submit-btn');
        let selectedFiles = [];

        const setFiles = (files) => {
            const list = Array.from(files || []);
            if (list.length === 0) return;
            selectedFiles = list;
            fileMeta.textContent = list.length === 1
                ? `Selected: ${list[0].name}`
                : `Selected: ${list.length} files (${list.map(f => f.name).join(', ')})`;
            submitBtn.disabled = false;
        };

        dropzone.addEventListener('click', () => hiddenInput.click());
        hiddenInput.addEventListener('change', () => setFiles(hiddenInput.files));

        dropzone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropzone.classList.add('dragover');
        });
        dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
        dropzone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropzone.classList.remove('dragover');
            setFiles(e.dataTransfer?.files);
        });

        const cleanup = () => {
            dialog.close();
            dialog.remove();
        };

        dialog.querySelector('.btn-cancel').addEventListener('click', cleanup);
        dialog.addEventListener('click', (e) => { if (e.target === dialog) cleanup(); });

        dialog.querySelector('form').addEventListener('submit', async (e) => {
            e.preventDefault();
            if (selectedFiles.length === 0) return;
            try {
                await importGuestScores(selectedFiles);
                cleanup();
                if (onScoresChanged) await onScoresChanged();
            } catch (err) {
                alert(err.message);
            }
        });

        document.body.appendChild(dialog);
        dialog.showModal();
    }

    backupBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (activeMenu) {
            closeBackupMenu();
            return;
        }

        const menu = document.createElement('div');
        menu.className = 'sidebar-context-menu';
        menu.style.width = '250px';

        const newFileBtn = document.createElement('button');
        newFileBtn.type = 'button';
        newFileBtn.textContent = 'New score file';
        newFileBtn.addEventListener('click', () => {
            closeBackupMenu();
            openNewScoreFileDialog();
        });

        const exportAllBtn = document.createElement('button');
        exportAllBtn.type = 'button';
        exportAllBtn.textContent = 'Export all as zip';
        exportAllBtn.addEventListener('click', async () => {
            closeBackupMenu();
            try {
                await exportScoresAsZip(getExportableScoreNames());
            } catch (err) {
                alert(err.message);
            }
        });

        const chooseExportBtn = document.createElement('button');
        chooseExportBtn.type = 'button';
        chooseExportBtn.textContent = 'Choose scores to export';
        chooseExportBtn.addEventListener('click', () => {
            closeBackupMenu();
            openExportModal();
        });

        const div = document.createElement('div');
        div.className = 'menu-divider';
        const importItemBtn = document.createElement('button');
        importItemBtn.type = 'button';
        importItemBtn.textContent = 'Import from file';
        importItemBtn.addEventListener('click', () => {
            closeBackupMenu();
            openImportModal();
        });
        menu.append(newFileBtn, exportAllBtn, chooseExportBtn, div, importItemBtn);

        document.body.appendChild(menu);
        activeMenu = menu;
        backupBtn.classList.add('active');

        const rect = backupBtn.getBoundingClientRect();
        menu.style.left = `${Math.max(8, rect.left - 20)}px`;
        menu.style.top = `${rect.bottom + 6}px`;
    });

    document.addEventListener('click', (e) => {
        if (activeMenu && !activeMenu.contains(e.target) && e.target !== backupBtn) {
            closeBackupMenu();
        }
    });

    function refreshControlsVisibility() {
        const isOwner = isOwnerAuthenticated();
        ownerBadge.style.display = isOwner ? 'inline-block' : 'none';
    }

    // Owner Mode (online only)
    if (!isLocal) {
        const dialog = document.createElement('dialog');
        dialog.id = 'owner-unlock-dialog';
        dialog.className = 'studio-modal-dialog';
        dialog.innerHTML = `
            <form method="dialog" id="owner-unlock-form" class="dialog-form">
                <h2>Owner Access</h2>
                <p>Enter your passphrase to unlock your private scores.</p>
                <label for="owner-passphrase-input">Passphrase</label>
                <input id="owner-passphrase-input" type="password" autocomplete="current-password"
                    placeholder="Enter passphrase" required>
                <div id="owner-unlock-error" style="color:#B3261E;font-size:13px;display:none;"></div>
                <div class="dialog-actions">
                    <button type="button" id="owner-unlock-cancel" class="btn-cancel">Cancel</button>
                    <button type="submit" class="btn-primary">Unlock</button>
                </div>
            </form>
        `;
        document.body.appendChild(dialog);

    const form = dialog.querySelector('#owner-unlock-form');
    const passInput = dialog.querySelector('#owner-passphrase-input');
    const errEl = dialog.querySelector('#owner-unlock-error');
    const cancelBtn = dialog.querySelector('#owner-unlock-cancel');

    function openUnlockDialog() {
        if (isOwnerAuthenticated()) return;
        errEl.style.display = 'none';
        passInput.value = '';
        dialog.showModal();
        passInput.focus();
    }

    cancelBtn.addEventListener('click', () => dialog.close());

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        errEl.style.display = 'none';
        try {
            await unlockOwner(passInput.value);
            dialog.close();
            refreshControlsVisibility();
            if (onScoresChanged) await onScoresChanged();
        } catch (err) {
            errEl.textContent = err.message || 'Unlock failed';
            errEl.style.display = 'block';
        }
    });

    // Desktop Secret Knock: Ctrl + Shift + O (avoids 'P' which triggers Play/Pause)
    window.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'o') {
            e.preventDefault();
            openUnlockDialog();
        }
    });

    // Mobile Secret Knock: Triple-tap on "Piano Studio" title
    let tapCount = 0;
    let tapTimer = null;
    titleEl.addEventListener('click', () => {
        tapCount += 1;
        clearTimeout(tapTimer);
        if (tapCount >= 3) {
            tapCount = 0;
            openUnlockDialog();
        } else {
            tapTimer = setTimeout(() => {
                tapCount = 0;
            }, 600);
        }
    });

        // Lock button
        ownerBadge.addEventListener('click', async () => {
            await lockOwner();
            refreshControlsVisibility();
            if (onScoresChanged) await onScoresChanged();
        });
    }

    refreshControlsVisibility();
    return { refreshControlsVisibility };
}
