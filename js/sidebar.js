/**
 * Piano Studio - Sidebar Component
 *
 * Manages the collapsible score tree, file & tune context menus,
 * modal dialogs (New file, Delete file confirmation, Rename), and sidebar resizing.
 */

import { state, toggleExpandedFile } from './state.js';
import { deleteScoreFile, exportSingleScoreFile, renameScoreFile, saveScoreContent } from './api.js';
import { parseTunes } from './music-engine.js';
import { centerSheetMusic } from './focus-controls.js';

let refreshScoresCallback = null;
let selectTuneCallback = null;
let activeContextMenuEl = null;
let activeMenuTriggerRow = null;

const isMobileMode = () =>
    window.matchMedia('(hover: none) and (pointer: coarse)').matches;

const isCompactMode = () =>
    window.matchMedia('(max-width: 768px)').matches;

const isOverlayMode = () => isMobileMode() || isCompactMode();

const MORE_ICON_SVG = `<svg width="18" height="18" viewBox="0 0 24 24" fill="#2B2620" aria-hidden="true"><circle cx="5" cy="12" r="1.8"></circle><circle cx="12" cy="12" r="1.8"></circle><circle cx="19" cy="12" r="1.8"></circle></svg>`;

function closeContextMenu() {
    if (activeContextMenuEl) {
        activeContextMenuEl.remove();
        activeContextMenuEl = null;
    }
    if (activeMenuTriggerRow) {
        activeMenuTriggerRow.classList.remove('menu-open');
        activeMenuTriggerRow = null;
    }
}

function getTuneTitles(fileName) {
    const tunes = parseTunes(state.fileContents[fileName] || '');
    return tunes.map((t, idx) => {
        const m = t.match(/^T:\s*(.+)$/m);
        return m ? m[1].trim() : `Song ${idx + 1}`;
    });
}

function formatTuneListProse(titles) {
    if (titles.length === 0) {
        return "This file currently has no tunes. This can't be undone.";
    }
    if (titles.length === 1) {
        return `This also deletes its tune: ${titles[0]}. This can't be undone.`;
    }
    const head = titles.slice(0, -1).join(', ');
    const last = titles[titles.length - 1];
    return `This also deletes its ${titles.length} tunes: ${head} and ${last}. This can't be undone.`;
}

function reindexAndJoinTunes(tunesArray) {
    return tunesArray
        .map((t, idx) => {
            const trimmed = t.trim();
            if (/^X:\s*\d+/m.test(trimmed)) {
                return trimmed.replace(/^X:\s*\d+/m, `X:${idx + 1}`);
            }
            return `X:${idx + 1}\n${trimmed}`;
        })
        .join('\n\n') + '\n';
}

function showInputModal({ title, description, labelText, placeholder = '', initialValue = '', submitText = 'Save', onSubmit }) {
    const dialog = document.createElement('dialog');
    dialog.className = 'studio-modal-dialog';
    dialog.innerHTML = `
        <form method="dialog" class="dialog-form">
            <h2></h2>
            ${description ? `<p class="dialog-desc"></p>` : ''}
            <label for="studio-modal-input"></label>
            <input id="studio-modal-input" type="text" required autocomplete="off">
            <div class="dialog-actions">
                <button type="button" class="btn-cancel">Cancel</button>
                <button type="submit" class="btn-primary"></button>
            </div>
        </form>
    `;

    dialog.querySelector('h2').textContent = title;
    if (description) dialog.querySelector('.dialog-desc').textContent = description;
    dialog.querySelector('label').textContent = labelText;
    const input = dialog.querySelector('#studio-modal-input');
    input.placeholder = placeholder;
    input.value = initialValue;
    dialog.querySelector('.btn-primary').textContent = submitText;

    const cleanup = () => {
        dialog.close();
        dialog.remove();
    };

    dialog.querySelector('.btn-cancel').addEventListener('click', cleanup);
    dialog.addEventListener('click', (e) => {
        if (e.target === dialog) cleanup();
    });

    dialog.querySelector('form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const val = input.value.trim();
        if (!val) return;
        await onSubmit(val);
        cleanup();
    });

    document.body.appendChild(dialog);
    dialog.showModal();
    input.focus();
    input.select();
}

export function openNewScoreFileDialog() {
    showInputModal({
        title: 'New score file',
        description: 'A file holds a group of tunes, like a unit or a book. You can add tunes after.',
        labelText: 'File name',
        placeholder: 'Unit-6',
        submitText: 'Create file',
        onSubmit: async (rawName) => {
            const clean = rawName.replace(/[/\\]/g, '-').trim();
            if (!clean) return;
            const fileName = clean.endsWith('.abc') ? clean : `${clean}.abc`;
            const displayTitle = fileName.replace(/\.abc$/, '');
            const template = `X:1\nT:${displayTitle}\nM:4/4\nL:1/4\nK:C\nC D E F | G A B c |]\n`;
            await saveScoreContent(fileName, template);
            state.expandedFiles.add(fileName);
            state.activeFileName = fileName;
            state.activeTuneIndex = 0;
            if (refreshScoresCallback) await refreshScoresCallback();
            if (selectTuneCallback) selectTuneCallback(fileName, 0);
        }
    });
}

function openDeleteFileDialog(fileName) {
    const shortName = fileName.replace(/\.abc$/, '');
    const titles = getTuneTitles(fileName);
    const descText = formatTuneListProse(titles);

    const dialog = document.createElement('dialog');
    dialog.className = 'studio-modal-dialog';
    dialog.innerHTML = `
        <form method="dialog" class="dialog-form">
            <h2></h2>
            <p class="dialog-desc"></p>
            <div class="dialog-actions">
                <button type="button" class="btn-cancel">Cancel</button>
                <button type="submit" class="btn-danger">Delete file</button>
            </div>
        </form>
    `;

    dialog.querySelector('h2').textContent = `Delete ${shortName}?`;
    dialog.querySelector('.dialog-desc').textContent = descText;

    const cleanup = () => {
        dialog.close();
        dialog.remove();
    };

    dialog.querySelector('.btn-cancel').addEventListener('click', cleanup);
    dialog.addEventListener('click', (e) => {
        if (e.target === dialog) cleanup();
    });

    dialog.querySelector('form').addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
            await deleteScoreFile(fileName);
            if (state.activeFileName === fileName) {
                state.activeFileName = '';
                state.activeTuneIndex = 0;
            }
            cleanup();
            if (refreshScoresCallback) await refreshScoresCallback();
        } catch (err) {
            alert(err.message);
        }
    });

    document.body.appendChild(dialog);
    dialog.showModal();
}

function openDeleteTuneDialog(fileName, tuneIndex, tuneTitle) {
    const shortFile = fileName.replace(/\.abc$/, '');
    const dialog = document.createElement('dialog');
    dialog.className = 'studio-modal-dialog';
    dialog.innerHTML = `
        <form method="dialog" class="dialog-form">
            <h2></h2>
            <p class="dialog-desc"></p>
            <div class="dialog-actions">
                <button type="button" class="btn-cancel">Cancel</button>
                <button type="submit" class="btn-danger">Delete tune</button>
            </div>
        </form>
    `;

    dialog.querySelector('h2').textContent = `Delete ${tuneTitle}?`;
    dialog.querySelector('.dialog-desc').textContent =
        `This removes "${tuneTitle}" from ${shortFile}. This can't be undone.`;

    const cleanup = () => {
        dialog.close();
        dialog.remove();
    };

    dialog.querySelector('.btn-cancel').addEventListener('click', cleanup);
    dialog.addEventListener('click', (e) => {
        if (e.target === dialog) cleanup();
    });

    dialog.querySelector('form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const tunes = parseTunes(state.fileContents[fileName] || '');
        tunes.splice(tuneIndex, 1);
        const updated = tunes.length > 0 ? reindexAndJoinTunes(tunes) : '';
        await saveScoreContent(fileName, updated);
        state.fileContents[fileName] = updated;
        cleanup();
        const nextIdx = Math.max(0, Math.min(tuneIndex, tunes.length - 1));
        if (selectTuneCallback) selectTuneCallback(fileName, nextIdx);
    });

    document.body.appendChild(dialog);
    dialog.showModal();
}

function openContextMenu(anchorBtn, rowEl, items) {
    closeContextMenu();

    const menu = document.createElement('div');
    menu.className = 'sidebar-context-menu';

    for (const item of items) {
        if (item.divider) {
            const div = document.createElement('div');
            div.className = 'menu-divider';
            menu.appendChild(div);
            continue;
        }
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = item.label;
        if (item.danger) btn.classList.add('danger');
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            closeContextMenu();
            item.onClick();
        });
        menu.appendChild(btn);
    }

    document.body.appendChild(menu);
    activeContextMenuEl = menu;
    activeMenuTriggerRow = rowEl;
    rowEl.classList.add('menu-open');

    const sidebarRect = document.getElementById('sidebar')?.getBoundingClientRect();
    const btnRect = anchorBtn.getBoundingClientRect();
    const left = sidebarRect ? sidebarRect.right + 10 : btnRect.right + 8;
    const top = Math.min(btnRect.top - 4, window.innerHeight - menu.offsetHeight - 12);

    menu.style.left = `${left}px`;
    menu.style.top = `${Math.max(8, top)}px`;
}

function handleFileOptions(fileName, btnEl, rowEl) {
    const shortName = fileName.replace(/\.abc$/, '');
    const items = [
        {
            label: 'Rename file',
            onClick: () => {
                if (fileName === 'sample.abc') {
                    alert('sample.abc is the default showcase file and cannot be renamed.');
                    return;
                }
                showInputModal({
                    title: 'Rename file',
                    labelText: 'File name',
                    initialValue: shortName,
                    submitText: 'Rename',
                    onSubmit: async (newRaw) => {
                        const clean = newRaw.replace(/[/\\]/g, '-').trim();
                        if (!clean) return;
                        const newFileName = clean.endsWith('.abc') ? clean : `${clean}.abc`;
                        if (newFileName === fileName) return;
                        await renameScoreFile(fileName, newFileName);
                        if (state.expandedFiles.has(fileName)) {
                            state.expandedFiles.delete(fileName);
                            state.expandedFiles.add(newFileName);
                        }
                        if (state.activeFileName === fileName) {
                            state.activeFileName = newFileName;
                        }
                        if (refreshScoresCallback) await refreshScoresCallback();
                    }
                });
            }
        },
        {
            label: 'Export file',
            onClick: () => {
                exportSingleScoreFile(fileName, state.fileContents[fileName] || '');
            }
        }
    ];

    if (fileName !== 'sample.abc') {
        items.push(
            { divider: true },
            {
                label: 'Delete file',
                danger: true,
                onClick: () => openDeleteFileDialog(fileName)
            }
        );
    }

    openContextMenu(btnEl, rowEl, items);
}

function handleTuneOptions(fileName, tuneIndex, currentTitle, btnEl, rowEl) {
    const items = [
        {
            label: 'Rename tune',
            onClick: () => {
                showInputModal({
                    title: 'Rename tune',
                    labelText: 'Tune title',
                    initialValue: currentTitle,
                    submitText: 'Rename',
                    onSubmit: async (newTitle) => {
                        const tunes = parseTunes(state.fileContents[fileName] || '');
                        if (!tunes[tuneIndex]) return;
                        if (/^T:\s*.+$/m.test(tunes[tuneIndex])) {
                            tunes[tuneIndex] = tunes[tuneIndex].replace(/^T:\s*.+$/m, `T:${newTitle}`);
                        } else {
                            tunes[tuneIndex] = tunes[tuneIndex].replace(/^(X:\s*\d+\r?\n)/m, `$1T:${newTitle}\n`);
                        }
                        const updated = reindexAndJoinTunes(tunes);
                        await saveScoreContent(fileName, updated);
                        state.fileContents[fileName] = updated;
                        if (selectTuneCallback) selectTuneCallback(fileName, tuneIndex);
                    }
                });
            }
        },
        {
            label: 'Duplicate',
            onClick: async () => {
                const tunes = parseTunes(state.fileContents[fileName] || '');
                if (!tunes[tuneIndex]) return;
                let copyTune = tunes[tuneIndex];
                if (/^T:\s*(.+)$/m.test(copyTune)) {
                    copyTune = copyTune.replace(/^T:\s*(.+)$/m, `T:$1 (Copy)`);
                } else {
                    copyTune = `T:${currentTitle} (Copy)\n` + copyTune;
                }
                tunes.splice(tuneIndex + 1, 0, copyTune);
                const updated = reindexAndJoinTunes(tunes);
                await saveScoreContent(fileName, updated);
                state.fileContents[fileName] = updated;
                if (selectTuneCallback) selectTuneCallback(fileName, tuneIndex + 1);
            }
        },
        { divider: true },
        {
            label: 'Delete tune',
            danger: true,
            onClick: () => {
                const tunes = parseTunes(state.fileContents[fileName] || '');
                if (tunes.length <= 1) {
                    openDeleteFileDialog(fileName);
                    return;
                }
                openDeleteTuneDialog(fileName, tuneIndex, currentTitle);
            }
        }
    ];

    openContextMenu(btnEl, rowEl, items);
}

function handleAddNewTune(fileName) {
    showInputModal({
        title: 'New tune',
        labelText: 'Tune title',
        placeholder: 'Minuet in G',
        submitText: 'Add tune',
        onSubmit: async (title) => {
            const tunes = parseTunes(state.fileContents[fileName] || '');
            const newTune = `X:${tunes.length + 1}\nT:${title}\nM:4/4\nL:1/4\nK:C\nC D E F | G A B c |]`;
            tunes.push(newTune);
            const updated = reindexAndJoinTunes(tunes);
            await saveScoreContent(fileName, updated);
            state.fileContents[fileName] = updated;
            const newIndex = tunes.length - 1;
            if (selectTuneCallback) selectTuneCallback(fileName, newIndex);
        }
    });
}

export function renderSidebar(onSelectTune) {
    if (onSelectTune) selectTuneCallback = onSelectTune;
    const fileListEl = document.getElementById('file-list');
    if (!fileListEl) return;

    closeContextMenu();
    fileListEl.innerHTML = '';

    state.scoreFiles.forEach(fileName => {
        const li = document.createElement('li');
        li.className = 'score-item';

        // 1. Score Item Header with 3-dots File Options button
        const header = document.createElement('div');
        header.className = `score-header ${fileName === state.activeFileName ? 'active' : ''}`;
        const isOpen = state.expandedFiles.has(fileName);

        const nameSpan = document.createElement('span');
        nameSpan.textContent = fileName.replace('.abc', '');
        nameSpan.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';

        const moreBtn = document.createElement('button');
        moreBtn.type = 'button';
        moreBtn.className = 'sidebar-more-btn';
        moreBtn.setAttribute('aria-label', 'File options');
        moreBtn.innerHTML = MORE_ICON_SVG;
        moreBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            handleFileOptions(fileName, moreBtn, header);
        });

        header.append(nameSpan, moreBtn);

        header.onclick = (e) => {
            e.stopPropagation();
            toggleExpandedFile(fileName);
            renderSidebar(selectTuneCallback);
        };
        li.appendChild(header);

        // 2. Indented Tunes List with 3-dots Tune Options + "+ New tune"
        const tunesAbc = parseTunes(state.fileContents[fileName] || '');
        const tuneUl = document.createElement('ul');
        tuneUl.className = `tune-list ${isOpen ? 'open' : ''}`;

        tunesAbc.forEach((tuneAbc, index) => {
            const titleMatch = tuneAbc.match(/^T:\s*(.+)$/m);
            const tuneTitle = titleMatch ? titleMatch[1].trim() : `Song ${index + 1}`;

            const tuneLi = document.createElement('li');
            tuneLi.className = 'tune-item-row';

            if (fileName === state.activeFileName && index === state.activeTuneIndex) {
                tuneLi.classList.add('active-tune');
            }

            const titleSpan = document.createElement('span');
            titleSpan.textContent = tuneTitle;
            titleSpan.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';

            const tuneMoreBtn = document.createElement('button');
            tuneMoreBtn.type = 'button';
            tuneMoreBtn.className = 'sidebar-more-btn';
            tuneMoreBtn.setAttribute('aria-label', 'Tune options');
            tuneMoreBtn.innerHTML = MORE_ICON_SVG;
            tuneMoreBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                handleTuneOptions(fileName, index, tuneTitle, tuneMoreBtn, tuneLi);
            });

            tuneLi.append(titleSpan, tuneMoreBtn);

            tuneLi.onclick = (e) => {
                e.stopPropagation();
                if (selectTuneCallback) selectTuneCallback(fileName, index);
                if (isOverlayMode()) {
                    document.getElementById('sidebar')?.classList.remove('mobile-open');
                }
            };

            tuneUl.appendChild(tuneLi);
        });

        // "+ New tune" row at the bottom of the expanded tune list
        const newTuneLi = document.createElement('li');
        newTuneLi.className = 'sidebar-new-tune-row';
        newTuneLi.textContent = '+ New tune';
        newTuneLi.onclick = (e) => {
            e.stopPropagation();
            handleAddNewTune(fileName);
        };
        tuneUl.appendChild(newTuneLi);

        li.appendChild(tuneUl);
        fileListEl.appendChild(li);
    });
}

export function initSidebarControls(onScoresChanged) {
    refreshScoresCallback = onScoresChanged || null;
    const sidebarEl = document.getElementById("sidebar");
    const toggleSidebarBtn = document.getElementById("btn-toggle-sidebar");
    const expandSidebarBtn = document.getElementById("btn-expand-sidebar");
    const shortcutsBtn = document.getElementById("btn-shortcuts");
    const shortcutsDialog = document.getElementById("shortcuts-dialog");

    if (!sidebarEl) return;

    // Move shortcutsDialog to body so sidebar transform doesn't trap or hide it
    if (shortcutsDialog && shortcutsDialog.parentElement !== document.body) {
        document.body.appendChild(shortcutsDialog);
    }

    // Portrait Top-Bar Sliders ("Tune/Adjust") Button & Dropdown Menu
    const SLIDERS_ICON_SVG = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2B2620" stroke-width="1.9" stroke-linecap="round" aria-hidden="true"><line x1="4" y1="6" x2="20" y2="6"/><circle cx="9" cy="6" r="2" fill="#2B2620"/><line x1="4" y1="12" x2="20" y2="12"/><circle cx="15" cy="12" r="2" fill="#2B2620"/><line x1="4" y1="18" x2="20" y2="18"/><circle cx="10" cy="18" r="2" fill="#2B2620"/></svg>`;
    const topBarRight = document.querySelector('.top-bar-right');
    if (topBarRight && !document.getElementById('btn-mobile-more')) {
        const moreBtn = document.createElement('button');
        moreBtn.id = 'btn-mobile-more';
        moreBtn.type = 'button';
        moreBtn.setAttribute('aria-label', 'More options');
        moreBtn.title = 'More options';
        moreBtn.innerHTML = SLIDERS_ICON_SVG;
        topBarRight.appendChild(moreBtn);

        let activeMobileMenu = null;
        const closeSheet = () => {
            if (activeMobileMenu) {
                activeMobileMenu.remove();
                activeMobileMenu = null;
            }
        };

        document.addEventListener('click', (ev) => {
            if (activeMobileMenu && !activeMobileMenu.contains(ev.target) && !moreBtn.contains(ev.target)) {
                closeSheet();
            }
        });

        moreBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (activeMobileMenu) {
                closeSheet();
                return;
            }

            const sheet = document.createElement('div');
            sheet.className = 'mobile-options-menu';

            const voiceLabelEl = document.getElementById('current-voice-label');
            const selectVoiceEl = document.getElementById('select-piano-voice');
            const sustainBtn = document.getElementById('btn-toggle-sustain');
            const keysBtn = document.getElementById('btn-toggle-keyboard');
            const focusBtn = document.getElementById('btn-toggle-focus');
            const editorBtn = document.getElementById('btn-toggle-editor');

            const isKeysActive = keysBtn?.classList.contains('active');
            const isSustainActive = sustainBtn?.classList.contains('active');

            sheet.innerHTML = `
                <button type="button" class="sheet-row" id="sheet-row-instrument">
                    <span>Instrument</span>
                    <span id="sheet-instrument-val" style="color:#6B6458">${voiceLabelEl?.textContent || 'Concert Grand'} ▾</span>
                </button>
                <div id="sheet-instrument-list" style="display:none;flex-direction:column;padding:4px 0 8px 12px;gap:2px;"></div>
                <hr>
                <button type="button" class="sheet-row" id="sheet-row-sustain">
                    <span>Sustain</span>
                    <span class="sheet-toggle-pill ${isSustainActive ? 'on' : ''}" id="sheet-sustain-pill"></span>
                </button>
                <hr>
                <button type="button" class="sheet-row" id="sheet-row-keys">
                    <span>Keys</span>
                    <span class="sheet-toggle-pill ${isKeysActive ? 'on' : ''}" id="sheet-keys-pill"></span>
                </button>
                <hr>
                <button type="button" class="sheet-row" id="sheet-row-focus">
                    <span>Focus mode</span>
                </button>
                <hr>
                <button type="button" class="sheet-row" id="sheet-row-editor">
                    <span>Score editor</span>
                </button>
                <hr>
                <button type="button" class="sheet-row" id="sheet-row-shortcuts">
                    <span>Shortcuts</span>
                </button>
            `;

            const instListEl = sheet.querySelector('#sheet-instrument-list');
            const renderInstrumentOptions = () => {
                if (!selectVoiceEl || !instListEl) return;
                instListEl.innerHTML = '';
                Array.from(selectVoiceEl.options).forEach((opt, idx) => {
                    const isSelected = idx === selectVoiceEl.selectedIndex;
                    const optBtn = document.createElement('button');
                    optBtn.type = 'button';
                    optBtn.style.cssText =
                        `display:flex;justify-content:space-between;align-items:center;height:40px;padding:0 10px;border:0;border-radius:8px;background:${isSelected ? '#F5F1E6' : 'transparent'};font:inherit;font-size:14px;font-weight:${isSelected ? '600' : '400'};color:#2B2620;cursor:pointer;text-align:left;`;
                    optBtn.innerHTML = `<span>${opt.text}</span><span>${isSelected ? '✓' : ''}</span>`;
                    optBtn.addEventListener('click', () => {
                        selectVoiceEl.selectedIndex = idx;
                        selectVoiceEl.dispatchEvent(new Event('change'));
                        sheet.querySelector('#sheet-instrument-val').textContent = `${opt.text} ▾`;
                        instListEl.style.display = 'none';
                    });
                    instListEl.appendChild(optBtn);
                });
            };

            sheet.querySelector('#sheet-row-instrument').addEventListener('click', () => {
                const isOpen = instListEl.style.display === 'flex';
                if (isOpen) {
                    instListEl.style.display = 'none';
                } else {
                    renderInstrumentOptions();
                    instListEl.style.display = 'flex';
                }
            });

            sheet.querySelector('#sheet-row-sustain').addEventListener('click', () => {
                sustainBtn?.click();
                sheet.querySelector('#sheet-sustain-pill').classList.toggle('on', Boolean(sustainBtn?.classList.contains('active')));
            });

            sheet.querySelector('#sheet-row-keys').addEventListener('click', () => {
                keysBtn?.click();
                sheet.querySelector('#sheet-keys-pill').classList.toggle('on', Boolean(keysBtn?.classList.contains('active')));
            });

            sheet.querySelector('#sheet-row-focus').addEventListener('click', () => {
                closeSheet();
                focusBtn?.click();
            });

            sheet.querySelector('#sheet-row-editor').addEventListener('click', (ev) => {
                ev.stopPropagation();
                closeSheet();
                editorBtn?.click();
            });

            sheet.querySelector('#sheet-row-shortcuts').addEventListener('click', (ev) => {
                ev.stopPropagation();
                closeSheet();
                shortcutsDialog?.classList.remove('hidden');
            });

            document.body.appendChild(sheet);
            activeMobileMenu = sheet;
        });
    }

    // Click outside sidebar to dismiss in overlay mode
    document.addEventListener('click', (e) => {
        if (!isOverlayMode() || !sidebarEl.classList.contains('mobile-open')) return;
        if (sidebarEl.contains(e.target) || expandSidebarBtn?.contains(e.target)) return;
        if (e.target.closest('.sidebar-context-menu, .studio-modal-dialog')) return;
        sidebarEl.classList.remove('mobile-open');
    });

    // Close context menu on outside click or Escape
    document.addEventListener('click', (e) => {
        if (activeContextMenuEl && !activeContextMenuEl.contains(e.target)) {
            closeContextMenu();
        }
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && activeContextMenuEl) {
            closeContextMenu();
        }
    });

    const toggleSidebar = () => {
        if (isOverlayMode()) {
            const isOpen = sidebarEl.classList.toggle("mobile-open");
            if (isOpen) {
                const drawer = document.getElementById('editor-drawer');
                const btnEditor = document.getElementById('btn-toggle-editor');
                if (drawer && drawer.classList.contains('open')) {
                    drawer.classList.remove('open');
                    drawer.classList.add('hidden');
                    if (btnEditor) btnEditor.classList.remove('active');
                }
            }
            return;
        }
        sidebarEl.style.setProperty('--sidebar-w', `${sidebarEl.offsetWidth}px`);
        const isCollapsed = sidebarEl.classList.toggle("collapsed");
        if (expandSidebarBtn) {
            expandSidebarBtn.style.display = isCollapsed ? 'inline-flex' : 'none';
        }
        setTimeout(centerSheetMusic, 280);
    };

    // Toggle Collapse / Expand
    if (toggleSidebarBtn) {
        toggleSidebarBtn.addEventListener("click", toggleSidebar);
    }
    if (expandSidebarBtn) {
        expandSidebarBtn.addEventListener("click", toggleSidebar);
    }

    // Keyboard Shortcuts Dialog Toggle
    if (shortcutsBtn && shortcutsDialog) {
        shortcutsBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            shortcutsDialog.classList.toggle("hidden");
        });

        document.addEventListener("click", (e) => {
            if (!shortcutsDialog.classList.contains("hidden") &&
                !shortcutsDialog.contains(e.target) &&
                e.target !== shortcutsBtn) {
                shortcutsDialog.classList.add("hidden");
            }
        });
    }

    // Drag-to-resize sidebar right edge
    sidebarEl.addEventListener("mousedown", (e) => {
        if (sidebarEl.offsetWidth - e.offsetX > 8) return;
        e.preventDefault();
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";

        const onMove = (moveEvt) => {
            const newWidth = moveEvt.clientX;
            if (newWidth >= 180 && newWidth <= 450) {
                sidebarEl.style.setProperty('--sidebar-w', `${newWidth}px`);
            }
        };

        const onUp = () => {
            document.body.style.cursor = "";
            document.body.style.userSelect = "";
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("mouseup", onUp);
        };

        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp);
    });
}
