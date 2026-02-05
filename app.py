import os
import json
import uuid
import datetime
from flask import Flask, render_template, request, jsonify, send_from_directory

app = Flask(__name__)

# Configuration
DATA_FILE = 'data.json'
MEMORIES_DIR = 'memories'

# Ensure directories exist
os.makedirs(MEMORIES_DIR, exist_ok=True)
if not os.path.exists(DATA_FILE):
    with open(DATA_FILE, 'w') as f:
        json.dump([], f)

def load_data():
    if not os.path.exists(DATA_FILE):
        return []
    with open(DATA_FILE, 'r') as f:
        try:
            return json.load(f)
        except json.JSONDecodeError:
            return []

def save_data(data):
    with open(DATA_FILE, 'w') as f:
        json.dump(data, f, indent=4)

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/memories/<path:filename>')
def serve_memory(filename):
    return send_from_directory(MEMORIES_DIR, filename)

@app.route('/api/notes', methods=['GET'])
def get_notes():
    date_str = request.args.get('date')
    if not date_str:
        return jsonify({'error': 'Date parameter is required'}), 400
    
    all_notes = load_data()
    # Filter notes by date
    notes = [note for note in all_notes if note.get('date') == date_str]
    return jsonify(notes)

@app.route('/api/notes', methods=['POST'])
def upload_note():
    if 'audio' not in request.files:
        return jsonify({'error': 'No audio file provided'}), 400
    
    audio_file = request.files['audio']
    date_str = request.form.get('date')
    
    if not date_str:
        return jsonify({'error': 'Date is required'}), 400
        
    if audio_file.filename == '':
        return jsonify({'error': 'No selected file'}), 400

    note_id = str(uuid.uuid4())
    # Generate a safe filename
    file_ext = os.path.splitext(audio_file.filename)[1] or '.webm'
    safe_filename = f"{note_id}{file_ext}"
    file_path = os.path.join(MEMORIES_DIR, safe_filename)
    
    audio_file.save(file_path)
    
    # Get transcription from form data if available
    transcription = request.form.get('transcription', '')
    
    new_note = {
        'id': note_id,
        'date': date_str,
        'filename': safe_filename,
        'timestamp': datetime.datetime.now().isoformat(),
        'transcription': transcription
    }
    
    data = load_data()
    data.append(new_note)
    save_data(data)
    
    return jsonify(new_note), 201

@app.route('/api/notes/<note_id>', methods=['DELETE'])
def delete_note(note_id):
    data = load_data()
    note_to_delete = next((item for item in data if item['id'] == note_id), None)
    
    if not note_to_delete:
        return jsonify({'error': 'Note not found'}), 404
    
    # Remove file
    file_path = os.path.join(MEMORIES_DIR, note_to_delete['filename'])
    if os.path.exists(file_path):
        os.remove(file_path)
        
    # Remove metadata
    data = [item for item in data if item['id'] != note_id]
    save_data(data)
    
    return jsonify({'message': 'Note deleted successfully'})

@app.route('/api/notes/<note_id>', methods=['PUT'])
def update_note(note_id):
    data = load_data()
    note_index = next((index for (index, item) in enumerate(data) if item['id'] == note_id), None)
    
    if note_index is None:
        return jsonify({'error': 'Note not found'}), 404
        
    req_data = request.get_json()
    if 'transcription' in req_data:
        data[note_index]['transcription'] = req_data['transcription']
        
    save_data(data)
    
    return jsonify(data[note_index])

if __name__ == '__main__':
    app.run(debug=True, port=5000)
