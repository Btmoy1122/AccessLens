# Feature Documentation

## Core Features (MVP)

### 1. Live Speech-to-Text Captions
**Location**: `ml/speech/speech-to-text.js`

**Implementation**:
- Web Speech API for voice recognition
- A-Frame `<a-text>` overlay for captions
- Timed fade-out for readability

**Status**: ⏳ Planned

**Owner**: ML Developer

---

### 2. Scene & Person Description
**Location**: `ml/vision/scene-description.js`

**Implementation**:
- TensorFlow.js COCO-SSD for object detection
- Web Speech Synthesis API for narration
- face-api.js for emotion recognition

**Status**: ⏳ Planned

**Owner**: ML Developer + UX Lead

---

### 3. AR Memory System
**Location**: `ml/vision/face-recognition.js` + `backend/services/face-service.js`

**Implementation**:
- face-api.js for embedding generation
- Firebase Firestore for user data
- AR tag overlay for recognized faces

**Status**: ⏳ Planned

**Owner**: ML Developer + Backend Developer

---

## Stretch Goals

- 🌍 Multilingual translation
- 🎧 Voice command interface
- 🧩 Accessibility settings
- 🔁 Offline mode

## Feature Toggles

Users can toggle features on/off via UI controls in `frontend/components/controls.js`

