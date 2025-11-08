# Frontend Architecture

## Overview

The AccessLens frontend is built with a modular architecture designed for rapid hackathon development. It uses:

- **Vite** - Modern build tool with HMR
- **A-Frame** - WebXR/AR framework
- **AR.js** - Markerless AR capabilities
- **Vanilla JavaScript** - No framework overhead

## Architecture Diagram

```
┌─────────────────────────────────────────────────┐
│              index.html (Entry Point)           │
│  - A-Frame Scene Setup                          │
│  - AR.js Configuration                          │
│  - UI Controls Container                        │
└─────────────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────┐
│              main.js (Orchestrator)             │
│  - Initializes AR Scene                         │
│  - Coordinates Feature Modules                  │
│  - Manages Camera Access                        │
└─────────────────────────────────────────────────┘
                      │
        ┌─────────────┼─────────────┐
        ▼             ▼             ▼
┌──────────────┐ ┌──────────┐ ┌──────────────┐
│   Speech     │ │   Sign   │ │    Vision    │
│   Module     │ │  Module  │ │   Modules    │
│              │ │          │ │              │
│ - STT        │ │ - Media  │ │ - Face Rec   │
│ - Captions   │ │   Pipe   │ │ - Scene Desc │
└──────────────┘ └──────────┘ └──────────────┘
        │             │             │
        └─────────────┼─────────────┘
                      ▼
┌─────────────────────────────────────────────────┐
│            AR Overlay System                    │
│  - Text Overlays (Captions, Signs)              │
│  - Face Tags                                    │
│  - Scene Annotations                            │
└─────────────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────┐
│            Backend Services                     │
│  - Firebase Firestore                           │
│  - Face Data Storage                            │
│  - User Preferences                             │
└─────────────────────────────────────────────────┘
```

## Module Structure

### 1. Main Entry Point (`frontend/index.html`)

**Responsibilities**:
- Sets up A-Frame scene
- Configures AR.js
- Loads A-Frame and AR.js libraries
- Provides container for AR overlays
- Includes UI controls container

**Key Elements**:
```html
<a-scene>           <!-- A-Frame AR scene -->
  <a-entity camera> <!-- Camera entity -->
  <!-- AR overlays added here -->
</a-scene>
<div id="controls"> <!-- UI controls -->
```

### 2. Application Orchestrator (`frontend/js/main.js`)

**Responsibilities**:
- Initializes application on DOM load
- Coordinates feature modules
- Manages camera permissions
- Handles initialization errors
- Imports and initializes feature modules

**Flow**:
```javascript
DOMContentLoaded → Request Camera → Initialize Features → Start AR
```

### 3. Feature Modules

#### Speech Module (`ml/speech/speech-to-text.js`)
- **Input**: Audio from microphone
- **Process**: Web Speech API
- **Output**: Text captions in AR overlay

#### Sign Language Module (`ml/sign-language/sign-recognition.js`)
- **Input**: Video frames from camera
- **Process**: MediaPipe Hands + TensorFlow.js
- **Output**: Recognized signs as AR text

#### Vision Modules (`ml/vision/`)
- **Face Recognition**: face-api.js → Firebase → AR tags
- **Scene Description**: COCO-SSD → TTS → Audio narration

### 4. UI Controls (`frontend/components/controls.js`)

**Responsibilities**:
- Feature toggle buttons
- User preference controls
- Accessibility settings
- Visual feedback for active features

**Features**:
- Toggle speech captions on/off
- Toggle sign language detection
- Toggle scene description
- Toggle face recognition

### 5. AR Overlay System

**Components**:
- **Text Overlays**: Speech captions, sign language text
- **Face Tags**: Recognized faces with names/notes
- **Scene Annotations**: Object labels, descriptions

**Implementation**:
- Uses A-Frame `<a-text>` entities
- Positioned in 3D space relative to camera
- Animated fade-in/fade-out
- Styled for readability

## Data Flow

### Speech-to-Text Flow

```
Microphone → Web Speech API → Text → AR Text Overlay → User
```

### Sign Language Flow

```
Camera → MediaPipe Hands → Landmarks → TensorFlow.js → Sign → AR Text → User
```

### Face Recognition Flow

```
Camera → face-api.js → Embedding → Compare with Firebase → Match → AR Tag → User
```

### Scene Description Flow

```
Camera → COCO-SSD → Objects → Generate Description → TTS → Audio → User
```

## Module Communication

### Event-Based Communication

Modules communicate through events and callbacks:

```javascript
// Example: Speech module emits event
speechModule.on('transcript', (text) => {
  displayARText(text);
});

// Example: Face recognition emits event
faceModule.on('faceRecognized', (faceData) => {
  displayFaceTag(faceData);
});
```

### Direct Function Calls

Modules can also be called directly:

```javascript
import { startListening } from '@ml/speech/speech-to-text.js';
startListening();
```

## State Management

### Global State

Simple object to track application state:

```javascript
const appState = {
  camera: { active: false, stream: null },
  features: {
    speech: { enabled: false, active: false },
    sign: { enabled: false, active: false },
    scene: { enabled: false, active: false },
    face: { enabled: false, active: false },
  },
  recognizedFaces: [],
  settings: { ... },
};
```

### Feature State

Each feature module manages its own internal state:

```javascript
// speech-to-text.js
let recognition = null;
let isListening = false;
let currentTranscript = '';
```

## Error Handling

### Camera Errors

```javascript
try {
  const stream = await navigator.mediaDevices.getUserMedia({ video: true });
} catch (error) {
  if (error.name === 'NotAllowedError') {
    // Handle permission denied
  } else if (error.name === 'NotFoundError') {
    // Handle no camera found
  }
}
```

### Module Errors

Each module should handle its own errors:

```javascript
// Example: Speech recognition error
recognition.onerror = (event) => {
  console.error('Speech recognition error:', event.error);
  // Show user-friendly error message
  showError('Speech recognition unavailable');
};
```

## Performance Considerations

### Frame Rate Optimization

- Process video frames at reduced rate (e.g., 10 FPS for ML)
- Use requestAnimationFrame for smooth AR updates
- Debounce expensive operations

### Memory Management

- Clean up event listeners
- Dispose of ML models when not in use
- Clear AR overlays after timeout

### Network Optimization

- Load ML models from CDN
- Cache Firebase data locally
- Use Web Workers for heavy computations (if time permits)

## Browser Compatibility

### Supported Browsers

- **Chrome/Edge**: Full support (recommended)
- **Firefox**: Good support (some Web Speech API limitations)
- **Safari**: Limited support (Web Speech API not available)

### Feature Detection

```javascript
// Check for Web Speech API
if ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window) {
  // Speech recognition available
}

// Check for camera
if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
  // Camera access available
}
```

## Development Best Practices

### 1. Module Independence

Each module should be independent and testable:

```javascript
// Good: Module can be tested independently
export function initSpeechToText() { ... }

// Bad: Module depends on global state
function initSpeechToText() { ... } // No export
```

### 2. Error Handling

Always handle errors gracefully:

```javascript
try {
  await initializeFeature();
} catch (error) {
  console.error('Feature initialization failed:', error);
  showUserFriendlyError();
}
```

### 3. Code Organization

- One feature per module
- Clear function names
- Comment complex logic
- Keep functions small and focused

### 4. Performance

- Lazy load ML models
- Process frames at reduced rate
- Clean up resources when done

## Next Steps

1. ✅ Understand architecture
2. ➡️ Set up frontend (see `docs/FRONTEND_SETUP.md`)
3. ➡️ Implement first feature (speech-to-text recommended)
4. ➡️ Test on mobile devices
5. ➡️ Iterate and improve

