class PianoStudio {
    constructor() {
        this.scoreFiles = [];
        this.activeFileName = null;
        this.tunes = [];
        this.activeTuneIndex = 0;
        this.zoomLevel = 1.0;
        this.synthControl = null;
        this.lastFolderSyncTime = "0"; // Tracks external file changes

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

    // --- 1. FILE NAVIGATION & ACCORDION SIDEBAR ---

    async fetchLocalScores() {
        try {
            const response = await fetch('/scores/');
            const html = await response.text();
            
            const matches = [...html.matchAll(/href="([^"]+\.abc)"/g)];
            this.scoreFiles = matches.map(m => decodeURIComponent(m[1]));

            this.renderSidebar();

            if (this.scoreFiles.length > 0 && !this.activeFileName) {
                await this.loadScoreFile(this.scoreFiles[0]);
            }
        } catch (error) {
            console.error("Could not load scores folder.", error);
        }
    }

    renderSidebar() {
        this.els.fileList.innerHTML = '';
        this.scoreFiles.forEach(fileName => {
            // Create the main Score File button
            const fileItem = document.createElement('li');
            fileItem.textContent = fileName.replace('.abc', '');
            
            if (fileName === this.activeFileName) {
                fileItem.classList.add('active');
                
                // If active, create the Accordion List of tunes directly underneath!
                const tuneList = document.createElement('ul');
                tuneList.className = 'tune-list';
                
                this.tunes.forEach((tuneAbc, index) => {
                    const titleMatch = tuneAbc.match(/^T:\s*(.+)$/m);
                    const tuneTitle = titleMatch ? titleMatch[1].trim() : `Song ${index + 1}`;
                    
                    const tuneItem = document.createElement('li');
                    tuneItem.textContent = `${index + 1}. ${tuneTitle}`;
                    if (index === this.activeTuneIndex) tuneItem.classList.add('active-tune');
                    
                    tuneItem.onclick = (e) => {
                        e.stopPropagation(); // Stop the file click from triggering
                        this.activeTuneIndex = index;
                        this.renderSidebar();
                        this.drawSheetMusic();
                    };
                    tuneList.appendChild(tuneItem);
                });
                
                fileItem.appendChild(tuneList);
            }
            
            // Clicking the file name loads it and opens the accordion
            fileItem.onclick = () => {
                if (this.activeFileName !== fileName) {
                    this.loadScoreFile(fileName);
                }
            };
            this.els.fileList.appendChild(fileItem);
        });
    }

    async loadScoreFile(fileName) {
        this.activeFileName = fileName;
        
        const res = await fetch(`/scores/${fileName}`);
        const abcText = await res.text();

        this.tunes = abcText.split(/(?=^X:\s*\d+)/m).filter(t => t.trim().length > 0);
        this.activeTuneIndex = 0;

        this.els.title.textContent = fileName.replace('.abc', '').replace(/[-_]/g, ' ');
        this.renderSidebar();
        this.drawSheetMusic();
    }

    // --- 2. SAVING & MONITORING ---

    async saveChanges() {
        if (!this.activeFileName) return;
        
        const newCode = this.els.abcSource.value;
        this.els.btnSave.textContent = "Saving...";
        
        try {
            // 1. Send POST request to Python to write the file
            await fetch(`/save/${this.activeFileName}`, {
                method: 'POST',
                body: newCode
            });
            
            // --- THE FIX ---
            // 2. Immediately fetch the new heartbeat time so we don't trigger a fake "external update" reload!
            const res = await fetch('/heartbeat');
            this.lastFolderSyncTime = await res.text();
            // ---------------
            
            this.els.btnSave.textContent = "Saved!";
            setTimeout(() => this.els.btnSave.textContent = "Save Changes", 2000);
            
            // 3. Reload the view with the new code
            this.tunes = newCode.split(/(?=^X:\s*\d+)/m).filter(t => t.trim().length > 0);
            this.renderSidebar();
            this.drawSheetMusic();

        } catch (error) {
            console.error(error);
            alert("Failed to save file.");
            this.els.btnSave.textContent = "Save Changes";
        }
    }

    startHeartbeatMonitor() {
        setInterval(async () => {
            try {
                // Ping Python. Python returns the timestamp of the latest file edit
                const res = await fetch('/heartbeat');
                const serverTime = await res.text();
                
                if (this.lastFolderSyncTime === "0") {
                    this.lastFolderSyncTime = serverTime; // Initial load
                } else if (serverTime !== this.lastFolderSyncTime) {
                    // Something changed in the folder externally! 
                    console.log("External changes detected. Refreshing app...");
                    this.lastFolderSyncTime = serverTime;
                    
                    // Re-fetch everything seamlessly without a page reload
                    await this.fetchLocalScores();
                    if (this.activeFileName) {
                        await this.loadScoreFile(this.activeFileName);
                    }
                }
            } catch (e) {
                // Ignore failed heartbeats (happens during shutdown)
            }
        }, 2000);
    }

    // --- 3. THE MUSIC ENGINE ---

    drawSheetMusic() {
        if (this.synthControl) {
            this.synthControl.pause();
        }

        const currentTuneAbc = this.tunes[this.activeTuneIndex] || "";
        this.els.abcSource.value = currentTuneAbc;

        const visualObjs = ABCJS.renderAbc("paper", currentTuneAbc, {
            responsive: "resize",
            add_classes: true, 
            staffwidth: 760,
            wrap: { minSpacing: 1.8, maxSpacing: 2.8 }
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
        document.getElementById('btn-zoom-in').addEventListener('click', () => {
            this.zoomLevel = Math.min(2.5, this.zoomLevel + 0.15);
            this.els.paper.style.transform = `scale(${this.zoomLevel})`;
        });

        document.getElementById('btn-zoom-out').addEventListener('click', () => {
            this.zoomLevel = Math.max(0.5, this.zoomLevel - 0.15);
            this.els.paper.style.transform = `scale(${this.zoomLevel})`;
        });

        document.getElementById('btn-toggle-editor').addEventListener('click', () => {
            this.els.editorDrawer.classList.toggle('hidden');
        });

        // The Save Button!
        this.els.btnSave.addEventListener('click', () => this.saveChanges());

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