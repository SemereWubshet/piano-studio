class PianoStudio {
    constructor() {
        // App State
        this.scoreFiles = [];
        this.activeFileName = null;
        this.tunes = []; // Holds the individual songs in a file
        this.activeTuneIndex = 0;
        this.zoomLevel = 1.0;
        this.synthControl = null;

        // DOM Elements
        this.els = {
            fileList: document.getElementById('file-list'),
            title: document.getElementById('active-score-title'),
            tabs: document.getElementById('tune-tabs'),
            paper: document.getElementById('paper'),
            audioControls: document.getElementById('midi-audio-controls'),
            editorDrawer: document.getElementById('editor-drawer'),
            abcSource: document.getElementById('abc-source')
        };

        this.init();
    }

    async init() {
        this.setupEventListeners();
        await this.fetchLocalScores();
    }

    // --- 1. FILE NAVIGATION ---

    async fetchLocalScores() {
        try {
            // We fetch the /scores/ directory. The Python server returns an HTML list of files!
            const response = await fetch('/scores/');
            const html = await response.text();
            
            // A clever little regex to extract all .abc file names from the HTML
            const matches = [...html.matchAll(/href="([^"]+\.abc)"/g)];
            this.scoreFiles = matches.map(m => decodeURIComponent(m[1]));

            this.renderSidebar();

            // Auto-load the first file if we have one
            if (this.scoreFiles.length > 0) {
                this.loadScoreFile(this.scoreFiles[0]);
            } else {
                this.els.fileList.innerHTML = '<li class="placeholder">No .abc files found in /scores/</li>';
            }
        } catch (error) {
            console.error("Could not load scores folder.", error);
            this.els.fileList.innerHTML = '<li class="placeholder" style="color:red;">Error connecting to /scores/</li>';
        }
    }

    renderSidebar() {
        this.els.fileList.innerHTML = '';
        this.scoreFiles.forEach(fileName => {
            const li = document.createElement('li');
            li.textContent = fileName.replace('.abc', '');
            if (fileName === this.activeFileName) li.classList.add('active');
            
            li.onclick = () => this.loadScoreFile(fileName);
            this.els.fileList.appendChild(li);
        });
    }

    async loadScoreFile(fileName) {
        this.activeFileName = fileName;
        this.renderSidebar(); // Update active highlight

        // Fetch the raw text of the .abc file
        const res = await fetch(`/scores/${fileName}`);
        const abcText = await res.text();

        // Split the file into separate songs (ABC format uses "X:" to start a new song)
        this.tunes = abcText.split(/(?=^X:\s*\d+)/m).filter(t => t.trim().length > 0);
        this.activeTuneIndex = 0;

        this.els.title.textContent = fileName.replace('.abc', '').replace(/[-_]/g, ' ');
        this.renderTuneTabs();
        this.drawSheetMusic();
    }

    renderTuneTabs() {
        this.els.tabs.innerHTML = '';
        this.tunes.forEach((tuneAbc, index) => {
            // Try to extract the title (T:) for the button
            const titleMatch = tuneAbc.match(/^T:\s*(.+)$/m);
            const tuneTitle = titleMatch ? titleMatch[1].trim() : `Song ${index + 1}`;

            const btn = document.createElement('button');
            btn.className = `tune-btn ${index === this.activeTuneIndex ? 'active' : ''}`;
            btn.textContent = tuneTitle;
            btn.onclick = () => {
                this.activeTuneIndex = index;
                this.renderTuneTabs();
                this.drawSheetMusic();
            };
            this.els.tabs.appendChild(btn);
        });
    }

    // --- 2. THE MUSIC ENGINE ---

    drawSheetMusic() {
        const currentTuneAbc = this.tunes[this.activeTuneIndex] || "";
        
        // Update Editor
        this.els.abcSource.value = currentTuneAbc;

        // Draw the visual sheet music
        const visualObjs = ABCJS.renderAbc("paper", currentTuneAbc, {
            responsive: "resize",
            add_classes: true, // Required for our blue highlighting!
            staffwidth: 760,
            wrap: { minSpacing: 1.8, maxSpacing: 2.8 }
        });

        // Initialize Audio and the Blue Tracker Cursor
        if (ABCJS.synth.supportsAudio() && visualObjs.length > 0) {
            this.setupAudioAndCursor(visualObjs[0]);
        }
    }

    setupAudioAndCursor(visualObj) {
        this.els.audioControls.innerHTML = ''; // Clear old controls

        this.synthControl = new ABCJS.synth.SynthController();
        
        // This is the magic that highlights the notes in blue!
        const cursorControl = {
            onStart: () => {},
            onEvent: (ev) => {
                // Clear old highlights
                document.querySelectorAll('.abcjs-note_selected').forEach(el => el.classList.remove('abcjs-note_selected'));
                // Add highlight to current note
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

        // Load the UI widget
        this.synthControl.load("#midi-audio-controls", cursorControl, {
            displayLoop: true,
            displayRestart: true,
            displayPlay: true,
            displayProgress: true,
            displayWarp: true // Tempo control
        });

        // Load the audio data
        const createSynth = new ABCJS.synth.CreateSynth();
        createSynth.init({ visualObj: visualObj }).then(() => {
            this.synthControl.setTune(visualObj, true, { program: 0 });
        });
    }

    // --- 3. UI CONTROLS ---

    setupEventListeners() {
        // Zooming Controls
        document.getElementById('btn-zoom-in').addEventListener('click', () => {
            this.zoomLevel = Math.min(2.5, this.zoomLevel + 0.15);
            this.els.paper.style.transform = `scale(${this.zoomLevel})`;
        });

        document.getElementById('btn-zoom-out').addEventListener('click', () => {
            this.zoomLevel = Math.max(0.5, this.zoomLevel - 0.15);
            this.els.paper.style.transform = `scale(${this.zoomLevel})`;
        });

        // Toggle Editor Drawer
        document.getElementById('btn-toggle-editor').addEventListener('click', () => {
            this.els.editorDrawer.classList.toggle('hidden');
        });

        // First click anywhere unlocks browser audio (standard browser security feature)
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

// Start the engine when the page loads
window.addEventListener("DOMContentLoaded", () => {
    new PianoStudio();
});