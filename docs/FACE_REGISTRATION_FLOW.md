# Face Registration Flow

This document explains how AccessLens detects and registers new unrecognized faces.

## Overview

When a face is detected that doesn't match any known faces in the database, the system uses a confidence buffer mechanism to ensure the face is consistently present before prompting for registration. This prevents false positives and reduces interruptions.

## Registration Flow

### 1. Face Detection (Continuous)

- **Frequency**: Face detection runs every **500ms** (`DETECTION_INTERVAL_MS`)
- **Location**: `ml/vision/face-recognition.js` → `recognitionLoop()`
- **Process**:
  1. Captures frame from video element
  2. Runs face detection using face-api.js
  3. Extracts face embeddings (128-dimensional vectors)
  4. Compares with known faces in database

### 2. Recognition Attempt

For each detected face:
1. **Compare with known faces**: Calculate distance between detected face embedding and all known face embeddings
2. **Recognition threshold**: 
   - Normal threshold: **0.55** (`RECOGNITION_THRESHOLD`)
   - Relaxed threshold: **0.62** (`RELAXED_RECOGNITION_THRESHOLD`) - used for angle tolerance
3. **Match found?**:
   - ✅ **Yes** → Face is recognized, display AR tag with name
   - ❌ **No** → Proceed to unknown face handling

### 3. Unknown Face Detection

**Location**: `ml/vision/face-recognition.js` → `handleUnknownFace()`

**Requirements**:
- Detection confidence must be ≥ **0.65** (`MIN_CONFIDENCE_FOR_REGISTRATION`)
- Face size must be ≥ **25 pixels** (`MIN_FACE_SIZE`)

**Process**:
1. **Create face key**: Generate unique key based on face position and size
2. **Check unknown buffer**: See if this face was already detected
3. **Add to buffer**: If new, add to `unknownFacesBuffer` with timestamps:
   ```javascript
   {
     firstSeen: timestamp,
     lastSeen: timestamp,
     detection: detection,
     key: faceKey
   }
   ```
4. **Update buffer**: If existing, update `lastSeen` timestamp

### 4. Confidence Buffer Period

**Duration**: **4 seconds** (`UNKNOWN_FACE_BUFFER_TIME_MS`)

**Purpose**: Ensure the face is consistently detected before prompting for registration. This prevents:
- False positives from brief face detections
- Interruptions from faces that quickly disappear
- Registration prompts for faces that aren't stable

**Process**:
- Face must be detected continuously for 4 seconds
- System tracks `firstSeen` timestamp
- After 4 seconds, face is considered "confirmed"

### 5. Registration Prompt

**Location**: `frontend/js/main.js` → `showFaceRegistrationModal()`

**Trigger**: After confidence buffer period (4 seconds), if:
- Face is still detected
- No existing pending registration for this face
- `onNewFaceCallback` is called → triggers modal display

**Process**:
1. Set `pendingRegistration` in face-recognition module
2. Store detection data in `currentPendingDetection`
3. Call `onNewFaceCallback(detection, faceKey)`
4. Display registration modal

### 6. Registration Modal

**Location**: `frontend/js/main.js` → `showFaceRegistrationModal()`

**Modal Features**:
- **Name input**: Required field for person's name
- **Notes input**: Optional field for additional information
- **Register button**: Submits registration
- **Skip button**: Dismisses registration (only for non-self registration)
- **Close button**: Closes modal (only for non-self registration)

**Self Registration Mode**:
- Activated when `sessionStorage.getItem('registerSelfFace') === 'true'`
- Pre-fills name with user's display name or "Me"
- Pre-fills notes with "This is me - the user of AccessLens"
- Hides skip and close buttons (required registration)
- Modal cannot be closed until registration is complete

### 7. Face Registration

**Location**: `frontend/js/main.js` → `handleFaceRegistration()`

**Process**:
1. **Validate input**: Ensure name is provided
2. **Check guest mode**: If guest, show message and return (no saving)
3. **Call registerFace()**: 
   ```javascript
   registerFace(name, notes, detection, userId, isSelf)
   ```
4. **Extract embedding**: Get 128-dimensional face embedding from detection
5. **Save to Firebase**: Store in `faces` collection with:
   - `name`: Person's name
   - `notes`: Optional notes
   - `embedding`: Face embedding (converted to array)
   - `userId`: Current user's ID
   - `isSelf`: Boolean flag for self-registration
   - `createdAt`: Server timestamp
   - `updatedAt`: Server timestamp
6. **Update local cache**: Add to `knownFaces` array
7. **Clear pending registration**: Remove from `pendingRegistration` and `unknownFacesBuffer`
8. **Reload faces**: Refresh known faces from Firebase
9. **Show success message**: Display confirmation to user

### 8. Post-Registration

After successful registration:
1. **Face is now recognized**: Next detection cycle will recognize the face
2. **AR tag displayed**: Shows name and notes above face
3. **Speech bubble tracking**: Speech bubbles will follow this face when speaking
4. **Memory recording**: Can record memories associated with this face

## Key Constants

```javascript
// Detection frequency
DETECTION_INTERVAL_MS = 500; // Run detection every 500ms

// Recognition thresholds
RECOGNITION_THRESHOLD = 0.55; // Normal threshold
RELAXED_RECOGNITION_THRESHOLD = 0.62; // For angle tolerance

// Face detection requirements
MIN_FACE_SIZE = 25; // Minimum face size in pixels
MIN_CONFIDENCE_FOR_REGISTRATION = 0.65; // Minimum detection confidence

// Confidence buffer
UNKNOWN_FACE_BUFFER_TIME_MS = 4000; // 4 seconds before prompting

// Cache management
RECOGNIZED_FACE_CACHE_TIMEOUT = 6000; // Keep recognized faces for 6 seconds
FACE_TRACKING_DISTANCE_THRESHOLD = 80; // Pixels - same face if within this distance
```

## Data Structures

### Unknown Face Buffer

```javascript
unknownFacesBuffer = Map<faceKey, {
  firstSeen: timestamp,
  lastSeen: timestamp,
  detection: detection,
  key: faceKey
}>
```

### Pending Registration

```javascript
pendingRegistration = {
  key: faceKey,
  detection: detection,
  timestamp: timestamp
}
```

### Known Face

```javascript
knownFace = {
  id: faceId, // Firestore document ID
  name: string,
  notes: string,
  embedding: Float32Array, // 128-dimensional vector
  userId: string,
  isSelf: boolean
}
```

## User Experience

### Normal Registration Flow

1. **Unknown face appears** → System detects face
2. **4 seconds pass** → Face is consistently detected
3. **Modal appears** → Registration prompt shown
4. **User enters name** → Optional notes
5. **User clicks Register** → Face saved to database
6. **Face recognized** → AR tag appears, face is now known

### Self Registration Flow

1. **User signs in** → If no face registered, self-registration triggered
2. **Modal appears** → Pre-filled with user's name
3. **User clicks Register** → Face saved with `isSelf: true`
4. **Welcome message** → "Your face has been registered! Welcome to AccessLens."
5. **Face recognized** → User's own face is now recognized

### Skipping Registration

- **Skip button**: Available for non-self registrations
- **Close button**: Available for non-self registrations
- **Guest mode**: Registration skipped automatically (no saving)
- **Face disappears**: If face leaves before registration, buffer is cleared

## Error Handling

### Low Confidence Detection
- Faces with confidence < 0.65 are ignored
- Prevents false positives from poor detections

### Face Disappears
- If face leaves before 4 seconds: Buffer is cleared, no prompt
- If face leaves after prompt: Modal remains, user can still register if face returns

### Registration Failure
- Network errors: Show error message, allow retry
- Invalid detection: Show error, clear pending registration
- Guest mode: Show message that face won't be saved

## Integration Points

### Firebase Firestore
- **Collection**: `faces`
- **Fields**: `name`, `notes`, `embedding`, `userId`, `isSelf`, `createdAt`, `updatedAt`
- **Security**: Users can only access faces for their `userId`

### Face Recognition Module
- **Detection**: `recognitionLoop()` - Continuous face detection
- **Recognition**: `recognizeFace()` - Compare embeddings
- **Unknown handling**: `handleUnknownFace()` - Buffer and prompt
- **Registration**: `registerFace()` - Save to database

### Main Application
- **Modal display**: `showFaceRegistrationModal()` - Show registration UI
- **Registration handler**: `handleFaceRegistration()` - Process registration
- **Callback setup**: `onNewFace()` - Set callback for unknown faces

## Future Improvements

1. **Batch registration**: Register multiple faces at once
2. **Face grouping**: Group similar faces for easier registration
3. **Registration from memory**: Register faces from memory recordings
4. **Face editing**: Edit name/notes after registration
5. **Face deletion**: Remove faces from database
6. **Registration analytics**: Track registration patterns

