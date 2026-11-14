/**
 * Piano Studio - API Client & Server Communication
 *
 * Supports two modes seamlessly:
 * 1. Local mode (localhost / 127.0.0.1): talks directly to launcher.py.
 * 2. Online mode (Vercel): talks to /api/scores, /api/auth, /api/save,
 *    with localStorage fallback for unauthenticated guests.
 */

import { state } from './state.js';

const GUEST_STORAGE_KEY = 'piano_studio_guest_scores';

let onlineCache = {
    authenticated: false,
    files: new Map() // name -> content
};

export function isLocalMode() {
    const host = window.location.hostname;
    return host === 'localhost' || host === '127.0.0.1';
}

export function isOwnerAuthenticated() {
    return onlineCache.authenticated;
}

function getGuestScores() {
    try {
        const raw = localStorage.getItem(GUEST_STORAGE_KEY);
        return raw ? JSON.parse(raw) : {};
    } catch {
        return {};
    }
}

function setGuestScores(scoresObj) {
    localStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify(scoresObj));
    if (navigator.storage && typeof navigator.storage.persist === 'function') {
        navigator.storage.persist().catch(() => {});
    }
}

export async function unlockOwner(passphrase) {
    const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passphrase })
    });
    if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Invalid passphrase');
    }
    onlineCache.authenticated = true;
    return true;
}

export async function lockOwner() {
    await fetch('/api/auth?action=logout', { method: 'POST' });
    onlineCache.authenticated = false;
    onlineCache.files.clear();
}

export function getExportableScoreNames() {
    return [...(state.scoreFiles || [])].sort((a, b) => a.localeCompare(b));
}

export async function exportScoresAsZip(selectedNames) {
    if (typeof window.JSZip === 'undefined') {
        throw new Error('JSZip failed to load. Please refresh and try again.');
    }
    const zip = new window.JSZip();

    let count = 0;
    for (const name of selectedNames) {
        let content = state.fileContents?.[name];
        if (content === undefined) {
            content = await fetchScoreContent(name);
        }
        if (content !== undefined) {
            zip.file(name, content);
            count++;
        }
    }
    if (count === 0) {
        throw new Error('No scores selected to export.');
    }

    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `piano-studio-scores-${new Date().toISOString().slice(0, 10)}.zip`;
    a.click();
    URL.revokeObjectURL(url);
}

export async function importGuestScores(filesOrFile) {
    const fileList = Array.from(filesOrFile instanceof FileList ? filesOrFile : (Array.isArray(filesOrFile) ? filesOrFile : [filesOrFile]));
    const imported = {};

    for (const file of fileList) {
        if (!file.name.endsWith('.abc')) {
            throw new Error(`Unsupported file "${file.name}". Please import .abc score files only.`);
        }
        imported[file.name] = await file.text();
    }

    const names = Object.keys(imported);
    for (const name of names) {
        await saveScoreContent(name, imported[name]);
    }
    return names;
}

export async function fetchScoreList() {
    if (isLocalMode()) {
        const response = await fetch('/scores/', { cache: 'no-store' });
        const html = await response.text();
        const matches = [...html.matchAll(/href="([^"]+\.abc)"/g)];
        return matches.map(m => decodeURIComponent(m[1]));
    }

    const res = await fetch('/api/scores', { cache: 'no-store' });
    const data = await res.json();
    onlineCache.authenticated = Boolean(data.authenticated);
    onlineCache.files.clear();

    for (const file of data.files || []) {
        onlineCache.files.set(file.name, file.content);
    }

    // Merge guest localStorage scores when not in owner mode
    if (!onlineCache.authenticated) {
        const guest = getGuestScores();
        for (const [name, content] of Object.entries(guest)) {
            onlineCache.files.set(name, content);
        }
    }

    return Array.from(onlineCache.files.keys()).sort((a, b) => a.localeCompare(b));
}

export async function fetchScoreContent(fileName) {
    if (isLocalMode()) {
        const res = await fetch(`/scores/${fileName}`, { cache: 'no-store' });
        return await res.text();
    }

    if (onlineCache.files.has(fileName)) {
        return onlineCache.files.get(fileName);
    }

    // Fallback: refresh list once
    await fetchScoreList();
    return onlineCache.files.get(fileName) || '';
}

export async function saveScoreContent(fileName, fullFileCode) {
    if (isLocalMode()) {
        const res = await fetch(`/save/${fileName}`, {
            method: 'POST',
            body: fullFileCode
        });
        if (!res.ok) {
            throw new Error(`Failed to save: ${res.statusText}`);
        }
        return res;
    }

    onlineCache.files.set(fileName, fullFileCode);

    if (onlineCache.authenticated) {
        const res = await fetch('/api/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filename: fileName, content: fullFileCode })
        });
        if (!res.ok) {
            throw new Error(`Failed to save online: ${res.statusText}`);
        }
        return res;
    }

    // Guest mode: save strictly to browser localStorage
    const guest = getGuestScores();
    guest[fileName] = fullFileCode;
    setGuestScores(guest);
    return { ok: true };
}

export async function deleteScoreFile(fileName) {
    if (fileName === 'sample.abc') {
        throw new Error('sample.abc cannot be deleted.');
    }

    if (isLocalMode()) {
        const res = await fetch(`/delete/${encodeURIComponent(fileName)}`, { method: 'POST' });
        if (!res.ok) {
            throw new Error(`Failed to delete: ${res.statusText}`);
        }
        return res;
    }

    onlineCache.files.delete(fileName);

    if (onlineCache.authenticated) {
        const res = await fetch('/api/save?action=delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filename: fileName })
        });
        if (!res.ok) {
            throw new Error(`Failed to delete online: ${res.statusText}`);
        }
        return res;
    }

    const guest = getGuestScores();
    delete guest[fileName];
    setGuestScores(guest);
    return { ok: true };
}

export async function renameScoreFile(oldFileName, newFileName) {
    if (oldFileName === newFileName) return;
    const content = await fetchScoreContent(oldFileName);
    await saveScoreContent(newFileName, content);
    await deleteScoreFile(oldFileName);
}

export function exportSingleScoreFile(fileName, content) {
    const blob = new Blob([content || ''], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName.endsWith('.abc') ? fileName : `${fileName}.abc`;
    a.click();
    URL.revokeObjectURL(url);
}

export async function checkHeartbeat() {
    if (!isLocalMode()) return '0';
    const res = await fetch('/heartbeat');
    return await res.text();
}

export function sendShutdownSignal() {
    if (!isLocalMode()) return;
    if (state.isShuttingDown) return;
    state.isShuttingDown = true;
    navigator.sendBeacon('/shutdown');
}

export function startHeartbeatMonitor(onExternalChange) {
    if (!isLocalMode()) return;
    setInterval(async () => {
        try {
            const serverTime = await checkHeartbeat();
            if (state.lastFolderSyncTime === '0') {
                state.lastFolderSyncTime = serverTime;
            } else if (serverTime !== state.lastFolderSyncTime) {
                console.log('External changes detected. Syncing scores...');
                state.lastFolderSyncTime = serverTime;
                if (onExternalChange) onExternalChange();
            }
        } catch (e) {
            // Heartbeat failed (e.g. server shutting down)
        }
    }, 2000);
}
