/**
 * Piano Studio - Owner Mode ("Secret Knock") & Guest Local Backup UI
 *
 * Only activates in online mode (!isLocalMode()).
 * - Desktop: Ctrl + Shift + P
 * - Mobile: Triple-tap on the "Piano Studio" sidebar title
 */

import {
    exportGuestScores,
    importGuestScores,
    isLocalMode,
    isOwnerAuthenticated,
    lockOwner,
    unlockOwner
} from './api.js';

export function initOwnerAndGuestControls(onScoresChanged) {
    if (isLocalMode()) return;

    const sidebarSection = document.querySelector('.sidebar-section');
    const titleEl = document.querySelector('.sidebar-header h2');
    if (!sidebarSection || !titleEl) return;

    // 1. Add discreet Owner badge + Lock button & Guest Export/Import controls
    const controlsWrap = document.createElement('div');
    controlsWrap.id = 'online-score-controls';
    controlsWrap.style.cssText = 'display:flex;gap:6px;align-items:center;margin-left:auto;';

    const ownerBadge = document.createElement('button');
    ownerBadge.id = 'btn-owner-lock';
    ownerBadge.title = 'Owner Mode active — click to lock';
    ownerBadge.textContent = '● Owner';
    ownerBadge.style.cssText =
        'display:none;font-size:11px;padding:2px 7px;border-radius:999px;border:1px solid #2e7d32;background:#e8f5e9;color:#1b5e20;cursor:pointer;font-weight:600;';

    const exportBtn = document.createElement('button');
    exportBtn.id = 'btn-guest-export';
    exportBtn.title = 'Export your local browser scores (.json)';
    exportBtn.textContent = 'Export';
    exportBtn.style.cssText =
        'font-size:11px;padding:2px 6px;border-radius:4px;border:1px solid currentColor;background:transparent;color:inherit;opacity:0.75;cursor:pointer;';

    const importBtn = document.createElement('button');
    importBtn.id = 'btn-guest-import';
    importBtn.title = 'Import .abc or .json scores into browser storage';
    importBtn.textContent = 'Import';
    importBtn.style.cssText = exportBtn.style.cssText;

    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.abc,.json';
    fileInput.style.display = 'none';

    controlsWrap.append(ownerBadge, exportBtn, importBtn, fileInput);
    sidebarSection.style.display = 'flex';
    sidebarSection.style.alignItems = 'center';
    sidebarSection.appendChild(controlsWrap);

    function refreshControlsVisibility() {
        const isOwner = isOwnerAuthenticated();
        ownerBadge.style.display = isOwner ? 'inline-block' : 'none';
        exportBtn.style.display = isOwner ? 'none' : 'inline-block';
        importBtn.style.display = isOwner ? 'none' : 'inline-block';
    }

    // 2. Native <dialog> for Secret Knock passphrase prompt
    const dialog = document.createElement('dialog');
    dialog.id = 'owner-unlock-dialog';
    dialog.style.cssText =
        'border:none;border-radius:12px;padding:20px;max-width:340px;width:90%;box-shadow:0 12px 32px rgba(0,0,0,0.25);font-family:inherit;';
    dialog.innerHTML = `
        <form method="dialog" id="owner-unlock-form" style="display:flex;flex-direction:column;gap:12px;">
            <div style="font-weight:700;font-size:15px;">Owner Access</div>
            <input id="owner-passphrase-input" type="password" autocomplete="current-password"
                placeholder="Enter passphrase" required
                style="padding:8px 10px;border:1px solid #ccc;border-radius:6px;font-size:14px;">
            <div id="owner-unlock-error" style="color:#c62828;font-size:12px;display:none;"></div>
            <div style="display:flex;justify-content:flex-end;gap:8px;">
                <button type="button" id="owner-unlock-cancel" style="padding:6px 12px;border-radius:6px;border:1px solid #ccc;background:transparent;cursor:pointer;">Cancel</button>
                <button type="submit" style="padding:6px 14px;border-radius:6px;border:none;background:#111;color:#fff;cursor:pointer;font-weight:600;">Unlock</button>
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

    // Desktop Secret Knock: Ctrl + Shift + P
    window.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'p') {
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

    // Guest Export / Import
    exportBtn.addEventListener('click', () => exportGuestScores());
    importBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', async () => {
        const file = fileInput.files?.[0];
        if (!file) return;
        try {
            await importGuestScores(file);
            if (onScoresChanged) await onScoresChanged();
        } catch (err) {
            alert(err.message);
        } finally {
            fileInput.value = '';
        }
    });

    // Initial state sync (in case cookie is already active)
    refreshControlsVisibility();
    return { refreshControlsVisibility };
}
