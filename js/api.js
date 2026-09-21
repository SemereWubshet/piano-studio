/**
 * Piano Studio - API Client & Server Communication
 *
 * Handles HTTP requests, score fetching, file saving, heartbeat monitoring, and shutdowns.
 */

import { state } from './state.js';

export async function fetchScoreList() {
    const response = await fetch('/scores/', { cache: 'no-store' });
    const html = await response.text();
    const matches = [...html.matchAll(/href="([^"]+\.abc)"/g)];
    return matches.map(m => decodeURIComponent(m[1]));
}

export async function fetchScoreContent(fileName) {
    const res = await fetch(`/scores/${fileName}`, { cache: 'no-store' });
    return await res.text();
}

export async function saveScoreContent(fileName, fullFileCode) {
    const res = await fetch(`/save/${fileName}`, {
        method: 'POST',
        body: fullFileCode
    });
    if (!res.ok) {
        throw new Error(`Failed to save: ${res.statusText}`);
    }
    return res;
}

export async function checkHeartbeat() {
    const res = await fetch('/heartbeat');
    return await res.text();
}

export function sendShutdownSignal() {
    if (state.isShuttingDown) return;
    state.isShuttingDown = true;
    navigator.sendBeacon('/shutdown');
}

export function startHeartbeatMonitor(onExternalChange) {
    setInterval(async () => {
        try {
            const serverTime = await checkHeartbeat();
            if (state.lastFolderSyncTime === "0") {
                state.lastFolderSyncTime = serverTime;
            } else if (serverTime !== state.lastFolderSyncTime) {
                console.log("External changes detected. Syncing scores...");
                state.lastFolderSyncTime = serverTime;
                if (onExternalChange) onExternalChange();
            }
        } catch (e) {
            // Heartbeat failed (e.g. server shutting down)
        }
    }, 2000);
}

