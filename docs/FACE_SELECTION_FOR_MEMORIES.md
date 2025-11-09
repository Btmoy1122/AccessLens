# Face Selection for Memory Recording

## Feature Overview

When multiple people are detected on screen and you want to record a memory, the app now shows a selection modal to choose which person to save the memory for.

## How It Works

### Single Person on Screen
- **Automatic**: If only one recognized person is on screen, recording starts immediately for that person
- **No modal shown**: Works exactly as before

### Multiple People on Screen
- **Selection Modal**: A modal appears with buttons for each recognized person
- **Choose Person**: Click on the person's name to select them
- **Recording Starts**: Memory recording begins for the selected person
- **Cancel Option**: You can cancel to abort the recording

## User Flow

1. **Click "Add Memory" button**
2. **If multiple faces detected:**
   - Modal appears: "Select Person for Memory"
   - Shows list of all recognized people on screen
   - Each person's name is a clickable button
3. **Select a person:**
   - Click their name
   - Modal closes
   - Recording starts: "💾 Recording memory for [Name]..."
4. **Speak** (your speech is captured)
5. **Click "Add Memory" again** (or it becomes "Stop Recording")
6. **Memory saved** for the selected person

## Technical Implementation

### New Functions

#### `getAllRecognizedFaces()` (face-recognition.js)
- Returns array of all recognized faces on screen
- Each face includes: `{ faceId, name, faceKey, detection }`

#### `startRecordingForFace(face)` (main.js)
- Starts memory recording for a specific face
- Stores the selected face in `selectedFaceForMemory`
- Updates UI and shows feedback

#### `showFaceSelectionModal(faces)` (main.js)
- Displays modal with face selection buttons
- Creates a button for each recognized person
- Handles click events to start recording

#### `hideFaceSelectionModal()` (main.js)
- Hides the face selection modal
- Cleans up UI state

### State Management

- **`selectedFaceForMemory`**: Stores the selected face for the current recording session
- Cleared after memory is saved
- Used when stopping recording to ensure correct person

### UI Components

- **Face Selection Modal**: New modal in `index.html`
- **Face Selection Buttons**: Dynamically created buttons for each person
- **Styled with hover effects**: Buttons highlight on hover

## Benefits

1. **User Control**: You choose which person to record for
2. **No Confusion**: Clear indication of who the memory is for
3. **Works with Multiple People**: Handles 2+ people on screen
4. **Backward Compatible**: Single person still works automatically
5. **Clear Feedback**: Shows which person you're recording for

## Example Scenarios

### Scenario 1: Two People Talking
- You and a friend are on camera
- Click "Add Memory"
- Modal shows: "You" and "Friend"
- Click "Friend" to record memory for your friend
- Speak: "Friend likes hiking and photography"
- Click "Add Memory" again to stop
- Memory saved for Friend

### Scenario 2: Group Conversation
- Three people on camera: Alice, Bob, Charlie
- Click "Add Memory"
- Modal shows all three names
- Click "Bob" to record for Bob
- Speak: "Bob is a software engineer at Google"
- Stop recording
- Memory saved for Bob

### Scenario 3: Single Person
- Only you on camera
- Click "Add Memory"
- No modal (automatic)
- Recording starts immediately
- Works as before

## Future Enhancements

Possible improvements:
- Show face thumbnails in selection modal
- Remember last selected person
- Allow recording for multiple people at once
- Voice selection: "Record for [Name]"

