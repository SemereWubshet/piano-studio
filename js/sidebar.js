/**
 * Piano Studio - Sidebar Component
 *
 * Manages the collapsible score tree, file accordion navigation, and sidebar resizing.
 */

import { state, toggleExpandedFile } from './state.js';
import { parseTunes } from './music-engine.js';

export function renderSidebar(onSelectTune) {
    const fileListEl = document.getElementById('file-list');
    if (!fileListEl) return;

    fileListEl.innerHTML = '';

    state.scoreFiles.forEach(fileName => {
        const li = document.createElement('li');
        li.className = 'score-item';

        // 1. Folder Header
        const header = document.createElement('div');
        header.className = `score-header ${fileName === state.activeFileName ? 'active' : ''}`;
        const isOpen = state.expandedFiles.has(fileName);

        header.innerHTML = `
            <svg class="toggle-icon ${isOpen ? 'open' : ''}" viewBox="0 0 24 24">
                <path d="M8.59 16.59 13.17 12 8.59 7.41 10 6l6 6-6 6z"/>
            </svg>
            <span>${fileName.replace('.abc', '')}</span>
        `;

        header.onclick = () => {
            toggleExpandedFile(fileName);
            renderSidebar(onSelectTune);
        };
        li.appendChild(header);

        // 2. Indented Tunes List
        const tunesAbc = parseTunes(state.fileContents[fileName] || '');
        const tuneUl = document.createElement('ul');
        tuneUl.className = `tune-list ${isOpen ? 'open' : ''}`;

        tunesAbc.forEach((tuneAbc, index) => {
            const titleMatch = tuneAbc.match(/^T:\s*(.+)$/m);
            const tuneTitle = titleMatch ? titleMatch[1].trim() : `Song ${index + 1}`;

            const tuneLi = document.createElement('li');
            tuneLi.textContent = `${index + 1}. ${tuneTitle}`;

            if (fileName === state.activeFileName && index === state.activeTuneIndex) {
                tuneLi.classList.add('active-tune');
            }

            tuneLi.onclick = (e) => {
                e.stopPropagation();
                if (onSelectTune) onSelectTune(fileName, index);
            };

            tuneUl.appendChild(tuneLi);
        });

        li.appendChild(tuneUl);
        fileListEl.appendChild(li);
    });
}

export function initSidebarControls() {
    const sidebarEl = document.getElementById("sidebar");
    const toggleSidebarBtn = document.getElementById("btn-toggle-sidebar");

    if (!sidebarEl) return;

    // Toggle Collapse
    if (toggleSidebarBtn) {
        toggleSidebarBtn.addEventListener("click", () => {
            sidebarEl.style.setProperty('--sidebar-w', `${sidebarEl.offsetWidth}px`);
            sidebarEl.classList.toggle("collapsed");
        });
    }

    // Border Drag to Resize
    sidebarEl.addEventListener('mousedown', (e) => {
        const rect = sidebarEl.getBoundingClientRect();
        const distanceFromRightBorder = rect.right - e.clientX;

        if (distanceFromRightBorder > 8 || distanceFromRightBorder < 0) return;

        e.preventDefault();
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';

        const onMove = (moveEvt) => {
            const newWidth = moveEvt.clientX - rect.left;
            if (newWidth >= 180 && newWidth <= 500) {
                sidebarEl.style.width = `${newWidth}px`;
                sidebarEl.style.setProperty('--sidebar-w', `${newWidth}px`);
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

