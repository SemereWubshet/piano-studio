console.log("FLAG 1: app.js is officially loading.");

class PianoStudio {
    constructor() {
        this.scoreFiles = [];
        this.fileContents = {}; // Caches the text of all files
        this.activeFileName = null;
        this.activeTuneIndex = 0;
        this.expandedFiles = new Set(); // Tracks which folders are clicked open
        
        this.zoomLevel = 1.0;
        this.synthControl = null;
        this.lastFolderSyncTime = "0"; 

        this.els = {
            fileList: document.getElementById('file-list'),
            title: document.getElementById('active-score-title'),
            paper: document.getElementById('paper'),
            audioControls: document.getElementById('midi-audio-controls'),
            editorDrawer: document.getElementById('editor-drawer'),
            abcSource: document.getElementById('abc-source'),
            btnSave: document.getElementById('btn-save')
        };

        this.init();
    }

    async init() {
        this.setupEventListeners();
        await this.fetchLocalScores();
        this.startHeartbeatMonitor();
    }

    // --- 1. THE COLLAPSIBLE SIDEBAR ---

    async fetchLocalScores() {
        try {
            const response = await fetch('/scores/');
            const html = await response.text();
            
            const matches = [...html.matchAll(/href="([^"]+\.abc)"/g)];
            this.scoreFiles = matches.map(m => decodeURIComponent(m[1]));

            // Fetch the contents of ALL files so we can list their tunes
            for (const file of this.scoreFiles) {
                const res = await fetch(`/scores/${file}`);
                this.fileContents[file] = await res.text();
            }

            // Auto-load first file on startup
            if (this.scoreFiles.length > 0 && !this.activeFileName) {
                this.expandedFiles.add(this.scoreFiles[0]); // Open it in sidebar
                this.loadScoreFile(this.scoreFiles[0], 0);
            } else {
                this.renderSidebar();
            }
        } catch (error) {
            console.error("Could not load scores folder.", error);
        }
    }

    renderSidebar() {
        this.els.fileList.innerHTML = '';
        
        this.scoreFiles.forEach(fileName => {
            const li = document.createElement('li');
            li.className = 'score-item';
            
            // 1. Create the Folder Header (Unit-1, Unit-2)
            const header = document.createElement('div');
            header.className = `score-header ${fileName === this.activeFileName ? 'active' : ''}`;
            const isOpen = this.expandedFiles.has(fileName);
            
            // The little SVG caret arrow
            header.innerHTML = `
                <svg class="toggle-icon ${isOpen ? 'open' : ''}" viewBox="0 0 24 24">
                    <path d="M8.59 16.59 13.17 12 8.59 7.41 10 6l6 6-6 6z"/>
                </svg>
                <span>${fileName.replace('.abc', '')}</span>
            `;
            
            // Click folder to open/close it
            header.onclick = () => {
                if (this.expandedFiles.has(fileName)) {
                    this.expandedFiles.delete(fileName);
                } else {
                    this.expandedFiles.add(fileName);
                }
                this.renderSidebar();
            };
            li.appendChild(header);
            
            // 2. Create the Tunes List underneath it
            const tunesAbc = this.fileContents[fileName].split(/(?=^X:\s*\d+)/m).filter(t => t.trim().length > 0);
            const tuneUl = document.createElement('ul');
            tuneUl.className = `tune-list ${isOpen ? 'open' : ''}`;
            
            tunesAbc.forEach((tuneAbc, index) => {
                const titleMatch = tuneAbc.match(/^T:\s*(.+)$/m);
                const tuneTitle = titleMatch ? titleMatch[1].trim() : `Song ${index + 1}`;
                
                const tuneLi = document.createElement('li');
                tuneLi.textContent = `${index + 1}. ${tuneTitle}`;
                
                // Highlight if it's the currently playing tune
                if (fileName === this.activeFileName && index === this.activeTuneIndex) {
                    tuneLi.classList.add('active-tune');
                }
                
                // Click tune to play it
                tuneLi.onclick = (e) => {
                    e.stopPropagation();
                    this.loadScoreFile(fileName, index);
                };
                
                tuneUl.appendChild(tuneLi);
            });
            
            li.appendChild(tuneUl);
            this.els.fileList.appendChild(li);
        });
    }

    loadScoreFile(fileName, tuneIndex = 0) {
        this.activeFileName = fileName;
        this.activeTuneIndex = tuneIndex;
        this.expandedFiles.add(fileName); // Ensure folder stays open
        
        this.els.title.textContent = fileName.replace('.abc', '').replace(/[-_]/g, ' ');
        this.renderSidebar();
        this.drawSheetMusic();
    }

    // --- 2. SAVING & MONITORING ---

    async saveChanges() {
        if (!this.activeFileName) return;
        
        const editedTuneCode = this.els.abcSource.value;
        this.els.btnSave.textContent = "Saving...";

        // 1. Grab all tunes, and trim any messy trailing/leading whitespace from each one
        let allTunes = this.fileContents[this.activeFileName]
                        .split(/(?=^X:\s*\d+)/m)
                        .map(t => t.trim()) // <-- THIS IS THE MAGIC FIX
                        .filter(t => t.length > 0);

        // 2. Replace the active tune with your edits
        allTunes[this.activeTuneIndex] = editedTuneCode.trim();

        // 3. Join them cleanly with a single newline
        const fullFileCode = allTunes.join("\n\n");
        
        try {
            await fetch(`/save/${this.activeFileName}`, {
                method: 'POST',
                body: fullFileCode
            });
            
            setTimeout(async () => {
                const res = await fetch('/heartbeat');
                this.lastFolderSyncTime = await res.text();
            }, 500);
            
            this.els.btnSave.textContent = "Saved!";
            setTimeout(() => this.els.btnSave.textContent = "Save Changes", 2000);
            
            this.fileContents[this.activeFileName] = fullFileCode;
            this.renderSidebar();
            this.drawSheetMusic();

        } catch (error) {
            alert("Failed to save file.");
            this.els.btnSave.textContent = "Save Changes";
        }
    }

    startHeartbeatMonitor() {
        setInterval(async () => {
            try {
                const res = await fetch('/heartbeat');
                const serverTime = await res.text();
                
                if (this.lastFolderSyncTime === "0") {
                    this.lastFolderSyncTime = serverTime; 
                } else if (serverTime !== this.lastFolderSyncTime) {
                    console.log("External changes detected. Refreshing app...");
                    this.lastFolderSyncTime = serverTime;
                    await this.fetchLocalScores(); 
                }
            } catch (e) {}
        }, 2000);
    }

    // --- 3. THE MUSIC ENGINE ---

    drawSheetMusic() {
        if (this.synthControl) {
            this.synthControl.pause();
        }

        // Pull the active tune from the cache
        const allTunes = this.fileContents[this.activeFileName].split(/(?=^X:\s*\d+)/m).filter(t => t.trim().length > 0);
        const currentTuneAbc = allTunes[this.activeTuneIndex] || "";
        
        this.els.abcSource.value = currentTuneAbc;

        const visualObjs = ABCJS.renderAbc("paper", currentTuneAbc, {
            responsive: "resize",
            add_classes: true, 
            staffwidth: 760
        });

        if (ABCJS.synth.supportsAudio() && visualObjs.length > 0) {
            this.setupAudioAndCursor(visualObjs[0]);
        }
    }

    setupAudioAndCursor(visualObj) {
        this.els.audioControls.innerHTML = ''; 

        this.synthControl = new ABCJS.synth.SynthController();
        
        const cursorControl = {
            onStart: () => {},
            onEvent: (ev) => {
                document.querySelectorAll('.abcjs-note_selected').forEach(el => el.classList.remove('abcjs-note_selected'));
                if (ev && ev.elements) {
                    ev.elements.forEach(noteArray => {
                        noteArray.forEach(svgNode => svgNode.classList.add('abcjs-note_selected'));
                    });
                }
            },
            onFinished: () => {
                document.querySelectorAll('.abcjs-note_selected').forEach(el => el.classList.remove('abcjs-note_selected'));
            }
        };

        this.synthControl.load("#midi-audio-controls", cursorControl, {
            displayLoop: true,
            displayRestart: true,
            displayPlay: true,
            displayProgress: true,
            displayWarp: true 
        });

        const createSynth = new ABCJS.synth.CreateSynth();
        createSynth.init({ visualObj: visualObj }).then(() => {
            this.synthControl.setTune(visualObj, true, { program: 0 });
        });
    }

    // --- 4. UI CONTROLS ---

setupEventListeners() {
        // The ?. prevents crashes if a button is missing from the HTML
        document.getElementById('btn-zoom-in')?.addEventListener('click', () => {
            this.zoomLevel = Math.min(2.5, this.zoomLevel + 0.15);
            this.els.paper.style.transform = `scale(${this.zoomLevel})`;
        });

        document.getElementById('btn-zoom-out')?.addEventListener('click', () => {
            this.zoomLevel = Math.max(0.5, this.zoomLevel - 0.15);
            this.els.paper.style.transform = `scale(${this.zoomLevel})`;
        });

        document.getElementById('btn-toggle-editor')?.addEventListener('click', () => {
            this.els.editorDrawer.classList.toggle('hidden');
        });

        // The Quit Button logic that works
        // const quitBtn = document.getElementById("btn-quit");
        // if (quitBtn) {
        //     quitBtn.addEventListener("click", () => {
        //         console.log("FLAG 4: Button clicked. Bypassing pop-up and sending signal to Python...");
                
        //         fetch("/shutdown", { method: "POST" })
        //             .then(response => {
        //                 console.log("FLAG 5 SUCCESS: Python replied with status:", response.status);
        //             })
        //             .catch(error => {
        //                 console.error("FLAG 5 ERROR: The signal never reached Python:", error);
        //             });
        //     });
        // }

        const quitBtn = document.getElementById("btn-quit");
        if (quitBtn) {
            quitBtn.addEventListener("click", () => {
                // Instantly change button text to show it registered the click
                quitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> <span>Shutting down...</span>';
                
                // 1. Brute-force kill ALL background loops
                for (let i = 1; i < 99999; i++) window.clearInterval(i);
                
                // 2. Fire the shutdown signal in the background
                fetch("/shutdown", { method: "POST", keepalive: true }).catch(() => {});
                
                // 3. Attempt to close the tab IMMEDIATELY
                window.open('', '_self', '');
                window.close();
                
                // 4. Fallback: Wipe the screen clean if the browser blocks the close
                setTimeout(() => {
                    document.body.innerHTML = `
                        <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100vh; background:#f8fafc; font-family:sans-serif;">
                            <h1 style="color:#0f172a; margin-bottom: 8px;">🎹 Studio Offline</h1>
                            <p style="color:#64748b;">The local server has been cleanly shut down.</p>
                            <p style="color:#64748b;">You can safely close this tab.</p>
                        </div>
                    `;
                }, 150);
            });
        }

        this.els.btnSave?.addEventListener('click', () => this.saveChanges());

        const unlockAudio = () => {
            if (window.AudioContext || window.webkitAudioContext) {
                const ctx = new (window.AudioContext || window.webkitAudioContext)();
                if (ctx.state === "suspended") ctx.resume();
            }
            document.removeEventListener("click", unlockAudio);
        };
        document.addEventListener("click", unlockAudio, { once: true });
    }
}

window.addEventListener("DOMContentLoaded", () => {
    new PianoStudio();
});
