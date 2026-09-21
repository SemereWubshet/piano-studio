/**
 * Piano Studio - Central Application State Store
 *
 * Holds shared state variables across components with clean setter helpers.
 */

export const state = {
    scoreFiles: [],
    fileContents: {},       // Cache: fileName -> raw ABC file text
    activeFileName: null,
    activeTuneIndex: 0,
    expandedFiles: new Set(),// Tracks open folder accordions
    zoomLevel: 1.0,
    isFocusMode: false,
    synthControl: null,
    lastFolderSyncTime: "0",
    isShuttingDown: false,
};

export function setActiveFile(fileName, tuneIndex = 0) {
    state.activeFileName = fileName;
    state.activeTuneIndex = tuneIndex;
    if (fileName) {
        state.expandedFiles.add(fileName);
    }
}

export function setZoomLevel(level) {
    state.zoomLevel = Math.max(0.4, Math.min(2.5, +level.toFixed(2)));
    return state.zoomLevel;
}

export function toggleExpandedFile(fileName) {
    if (state.expandedFiles.has(fileName)) {
        state.expandedFiles.delete(fileName);
        return false;
    } else {
        state.expandedFiles.add(fileName);
        return true;
    }
}

