document.addEventListener('DOMContentLoaded', () => {
    // --- FIREBASE SETUP ---
    const firebaseConfig = {
        apiKey: "AIzaSyBlIkSA3IAscbFtsJA04ODzYRcPy6RcjkQ",
        authDomain: "voice-notes-fb8d7.firebaseapp.com",
        projectId: "voice-notes-fb8d7",
        storageBucket: "voice-notes-fb8d7.firebasestorage.app",
        messagingSenderId: "660364833590",
        appId: "1:660364833590:web:1f22adf2134a12c45b7997",
        measurementId: "G-9SM0X7Y1PF"
    };

    // Initialize Firebase
    if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
    }
    const db = firebase.firestore();
    const storage = firebase.storage();
    // DOM Elements
    const calendarDays = document.getElementById('calendarDays');
    const currentMonthYear = document.getElementById('currentMonthYear');
    const prevMonthBtn = document.getElementById('prevMonth');
    const nextMonthBtn = document.getElementById('nextMonth');
    const displayDate = document.getElementById('displayDate');
    const recordBtn = document.getElementById('recordBtn');

    // Landing Interaction
    const startBtn = document.getElementById('startBtn');
    if (startBtn) {
        startBtn.addEventListener('click', () => {
            const app = document.getElementById('app-interface');
            if (app) app.scrollIntoView({ behavior: 'smooth' });
        });
    }

    // Recording UI Elements
    const recordingOverlay = document.getElementById('recordingOverlay');
    const timerDisplay = document.getElementById('timer');
    const stopBtn = document.getElementById('stopBtn');
    const notesList = document.getElementById('notesList');

    // Visualizer Elements
    const canvas = document.getElementById('visualizerCanvas');
    const canvasCtx = canvas.getContext('2d');

    // State
    const STATE = {
        currentDate: new Date(),
        selectedDate: null,
        mediaRecorder: null,
        audioChunks: [],
        timerInterval: null,
        audioContext: null,
        analyser: null,
        dataArray: null,
        source: null,
        animationId: null,
        recognition: null,
        currentTranscript: ''
    };

    // --- TRANSCRIPTION SETUP ---
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
        STATE.recognition = new SpeechRecognition();
        STATE.recognition.continuous = true;
        STATE.recognition.interimResults = true;
        STATE.recognition.lang = 'en-US';

        STATE.recognition.onresult = (event) => {
            let interimTranscript = '';
            for (let i = event.resultIndex; i < event.results.length; ++i) {
                if (event.results[i].isFinal) {
                    STATE.currentTranscript += event.results[i][0].transcript + ' ';
                } else {
                    interimTranscript += event.results[i][0].transcript;
                }
            }
            // Optional: You could display interim results in real-time here
            console.log('Transcript:', STATE.currentTranscript + interimTranscript);
        };

        STATE.recognition.onerror = (event) => {
            console.error('Speech recognition error', event.error);
        };
    } else {
        console.warn('Web Speech API not supported in this browser.');
    }

    // Calendar Functions
    function renderCalendar(date) {
        calendarDays.innerHTML = '';
        const year = date.getFullYear();
        const month = date.getMonth();

        currentMonthYear.textContent = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(date);

        const firstDayIndex = new Date(year, month, 1).getDay();
        const lastDay = new Date(year, month + 1, 0).getDate();

        for (let i = 0; i < firstDayIndex; i++) {
            const dayDiv = document.createElement('div');
            calendarDays.appendChild(dayDiv);
        }

        for (let i = 1; i <= lastDay; i++) {
            const dayDiv = document.createElement('div');
            dayDiv.classList.add('day');
            dayDiv.textContent = i;
            const dateString = formatDateString(year, month + 1, i);
            dayDiv.dataset.date = dateString;

            const today = new Date();
            if (i === today.getDate() && month === today.getMonth() && year === today.getFullYear()) {
                dayDiv.classList.add('today');
            }

            if (STATE.selectedDate === dateString) {
                dayDiv.classList.add('selected');
            }

            dayDiv.addEventListener('click', () => selectDate(dateString));
            calendarDays.appendChild(dayDiv);
        }
    }

    function formatDateString(year, month, day) {
        return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }

    function selectDate(dateStr) {
        STATE.selectedDate = dateStr;

        const dateObj = new Date(dateStr + 'T12:00:00');
        const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        displayDate.textContent = dateObj.toLocaleDateString('en-US', options);

        document.querySelectorAll('.day').forEach(d => d.classList.remove('selected'));
        const dayEl = document.querySelector(`.day[data-date="${dateStr}"]`);
        if (dayEl) dayEl.classList.add('selected');

        recordBtn.disabled = false;
        fetchNotes(dateStr);
    }

    // Navigation Listeners
    prevMonthBtn.addEventListener('click', () => {
        STATE.currentDate.setMonth(STATE.currentDate.getMonth() - 1);
        renderCalendar(STATE.currentDate);
        restoreSelection();
    });

    nextMonthBtn.addEventListener('click', () => {
        STATE.currentDate.setMonth(STATE.currentDate.getMonth() + 1);
        renderCalendar(STATE.currentDate);
        restoreSelection();
    });

    function restoreSelection() {
        if (STATE.selectedDate) {
            const dayEl = document.querySelector(`.day[data-date="${STATE.selectedDate}"]`);
            if (dayEl) dayEl.classList.add('selected');
        }
    }

    // --- VISUALIZER LOGIC ---
    function setupAudioContext(stream) {
        if (!STATE.audioContext) {
            STATE.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        STATE.analyser = STATE.audioContext.createAnalyser();
        STATE.source = STATE.audioContext.createMediaStreamSource(stream);
        STATE.source.connect(STATE.analyser);
        STATE.analyser.fftSize = 256;
        const bufferLength = STATE.analyser.frequencyBinCount;
        STATE.dataArray = new Uint8Array(bufferLength);

        drawVisualizer();
    }

    function drawVisualizer() {
        if (!recordingOverlay.style.display || recordingOverlay.style.display === 'none') {
            cancelAnimationFrame(STATE.animationId);
            return;
        }

        STATE.animationId = requestAnimationFrame(drawVisualizer);
        STATE.analyser.getByteFrequencyData(STATE.dataArray);

        const width = canvas.width;
        const height = canvas.height;
        canvasCtx.clearRect(0, 0, width, height);

        const barWidth = (width / STATE.dataArray.length) * 2.5;
        let barHeight;
        let x = 0;

        for (let i = 0; i < STATE.dataArray.length; i++) {
            barHeight = STATE.dataArray[i];

            // Dynamic Gradient Color
            const gradient = canvasCtx.createLinearGradient(0, height, 0, height - barHeight);
            gradient.addColorStop(0, '#bd00ff'); // Purple
            gradient.addColorStop(1, '#00f3ff'); // Cyan

            canvasCtx.fillStyle = gradient;
            canvasCtx.fillRect(x, height - barHeight, barWidth, barHeight);

            x += barWidth + 1;
        }
    }

    // --- RECORDING LOGIC ---
    recordBtn.addEventListener('click', async () => {
        if (!STATE.selectedDate) return;

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

            // Setup Recorder
            STATE.mediaRecorder = new MediaRecorder(stream);
            STATE.audioChunks = [];

            STATE.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) STATE.audioChunks.push(event.data);
            };

            STATE.mediaRecorder.start();

            // Start Recognition
            if (STATE.recognition) {
                STATE.currentTranscript = ''; // Reset
                try {
                    STATE.recognition.start();
                } catch (e) { console.error('Recognition already started', e); }
            }

            showRecordingUI();
            setupAudioContext(stream); // Start Visualizer
            startTimer();

        } catch (err) {
            console.error('Microphone Error:', err);
            alert('Could not access microphone. Please allow permissions.');
        }
    });

    stopBtn.addEventListener('click', () => {
        if (STATE.mediaRecorder && STATE.mediaRecorder.state !== 'inactive') {
            STATE.mediaRecorder.stop();
            stopTimer();
            if (STATE.audioContext) STATE.audioContext.suspend();
            cancelAnimationFrame(STATE.animationId);

            // Stop Recognition
            if (STATE.recognition) {
                STATE.recognition.stop();
            }

            setTimeout(() => {
                uploadRecordedNote();
                hideRecordingUI();
            }, 500);
        }
    });

    function showRecordingUI() {
        recordingOverlay.style.display = 'flex';
        // Resize canvas to fit container
        canvas.width = recordingOverlay.offsetWidth * 0.8;
        canvas.height = 300;
    }

    function hideRecordingUI() {
        recordingOverlay.style.display = 'none';
        if (STATE.mediaRecorder) {
            STATE.mediaRecorder.stream.getTracks().forEach(track => track.stop());
        }
    }

    function startTimer() {
        const startTime = Date.now();
        STATE.timerInterval = setInterval(() => {
            const diff = Date.now() - startTime;
            const mins = Math.floor((diff / 60000) % 60);
            const secs = Math.floor((diff / 1000) % 60);
            timerDisplay.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
        }, 1000);
    }

    function stopTimer() {
        clearInterval(STATE.timerInterval);
        timerDisplay.textContent = "00:00";
    }

    async function uploadRecordedNote() {
        if (STATE.audioChunks.length === 0) return;

        const audioBlob = new Blob(STATE.audioChunks, { type: 'audio/webm' });
        const noteId = Date.now().toString(); // Simple ID generation
        const filename = `voice_notes/${STATE.selectedDate}/${noteId}.webm`;
        const storageRef = storage.ref().child(filename);

        try {
            // 1. Upload Audio to Firebase Storage
            const snapshot = await storageRef.put(audioBlob);
            const downloadURL = await snapshot.ref.getDownloadURL();

            // 2. Save Metadata to Firestore
            const noteData = {
                id: noteId,
                date: STATE.selectedDate,
                audioUrl: downloadURL,
                storagePath: filename,
                timestamp: new Date().toISOString(),
                transcription: STATE.currentTranscript.trim()
            };

            await db.collection('notes').doc(noteId).set(noteData);
            fetchNotes(STATE.selectedDate);

        } catch (e) {
            console.error('Upload failed:', e);
            alert('Error uploading note. Check console for details.');
        }
    }

    // --- DATA MANAGEMENT ---
    async function fetchNotes(date) {
        notesList.innerHTML = '<div style="text-align:center; padding: 2rem; color: #00f3ff;"><i class="fas fa-circle-notch fa-spin fa-2x"></i></div>';
        try {
            const snapshot = await db.collection('notes')
                .where('date', '==', date)
                .get(); // Note: You might want to add .orderBy('timestamp') logic here which requires an index

            const notes = [];
            snapshot.forEach(doc => {
                notes.push(doc.data());
            });

            // Sort manually to avoid index requirement for now
            notes.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

            renderNotes(notes);
        } catch (e) {
            console.error(e);
            notesList.innerHTML = '<div style="text-align:center; padding: 2rem;">Error fetching notes. Ensure Firestore is enabled.</div>';
        }
    }

    function renderNotes(notes) {
        notesList.innerHTML = '';
        if (!notes || notes.length === 0) {
            notesList.innerHTML = `
                <div style="text-align:center; padding: 3rem; opacity: 0.5;">
                    <i class="fas fa-wave-square fa-3x" style="margin-bottom: 1rem;"></i>
                    <p>No frequencies detected for this timeline.</p>
                </div>`;
            return;
        }

        notes.forEach(note => {
            const card = document.createElement('div');
            card.className = 'note-card';

            const timeStr = new Date(note.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            card.innerHTML = `
                <div class="note-header">
                    <span class="note-time"><i class="far fa-clock"></i> ${timeStr}</span>
                    <div class="note-actions">
                        <button class="btn-action save-btn" data-id="${note.id}"><i class="fas fa-save"></i> Save</button>
                        <button class="btn-action delete delete-btn" data-id="${note.id}"><i class="fas fa-trash"></i> Delete</button>
                    </div>
                </div>
                <audio controls>
                    <source src="${note.audioUrl}" type="audio/webm">
                </audio>
                <textarea class="transcription-area" placeholder="Enter transcription...">${note.transcription || ''}</textarea>
            `;

            card.querySelector('.save-btn').addEventListener('click', (e) => saveTranscription(note.id, e.target.closest('button'), card));
            card.querySelector('.delete-btn').addEventListener('click', (e) => deleteNote(note.id, e.target.closest('button')));

            notesList.appendChild(card);
        });
    }

    async function deleteNote(id, btn) {
        const originalContent = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i>';
        btn.disabled = true;

        try {
            await db.collection('notes').doc(id).delete();
            // Optional: Delete from storage using note.storagePath if you tracked it

            fetchNotes(STATE.selectedDate);
        } catch (e) {
            console.error(e);
            btn.innerHTML = 'Error';
            setTimeout(() => {
                btn.innerHTML = originalContent;
                btn.disabled = false;
            }, 1500);
        }
    }

    async function saveTranscription(id, btn, card) {
        const textarea = card.querySelector('.transcription-area');
        const text = textarea.value;
        const originalContent = btn.innerHTML;

        btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i>';

        try {
            await db.collection('notes').doc(id).update({
                transcription: text
            });

            btn.innerHTML = '<i class="fas fa-check"></i>';
            setTimeout(() => { btn.innerHTML = originalContent; }, 1500);
        } catch (e) {
            console.error(e);
            btn.innerHTML = 'Error';
            setTimeout(() => { btn.innerHTML = originalContent; }, 1500);
        }
    }

    // Init
    renderCalendar(STATE.currentDate);
    const today = new Date();
    selectDate(formatDateString(today.getFullYear(), today.getMonth() + 1, today.getDate()));
});
