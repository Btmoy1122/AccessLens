# Scene Detection Feature - Implementation Guide

## 📋 Overview

### What This Feature Does

The **Scene Detection** feature provides real-time audio narration of objects and scenes captured by the camera. This is designed for visually impaired users who need assistance understanding their surroundings.

**Flow:**
1. Camera captures video frames
2. TensorFlow.js COCO-SSD model detects objects in each frame
3. Detected objects are converted into natural language descriptions
4. Web Speech Synthesis API narrates the description aloud
5. Process repeats every 3-5 seconds (to avoid constant chatter)

**Example Output:**
- "I see a person, a laptop, and a cell phone"
- "I see a chair, a table, and a cup"
- "I see a dog and a ball"

---

## 🛠️ Technologies Used

### 1. **TensorFlow.js** 
- **Purpose**: Machine learning framework for running models in the browser
- **Why**: Enables object detection without a backend server
- **Package**: `@tensorflow/tfjs`

### 2. **COCO-SSD Model**
- **Purpose**: Pre-trained object detection model (detects 80+ common objects)
- **Why**: Fast, accurate, and works entirely client-side
- **Package**: `@tensorflow-models/coco-ssd`
- **Objects Detected**: person, car, laptop, phone, chair, table, cup, bottle, etc.

### 3. **Web Speech Synthesis API**
- **Purpose**: Browser-native text-to-speech functionality
- **Why**: No external TTS service needed, works offline, zero cost
- **Built-in**: No package required (browser API)

### 4. **MediaStream API** (Already in use)
- **Purpose**: Access to camera video feed
- **Status**: Already implemented in `main.js`

---

## 📦 Installation Steps

### Step 1: Install Dependencies

Run the following command in your project root:

```bash
npm install @tensorflow/tfjs @tensorflow-models/coco-ssd
```

**What this installs:**
- `@tensorflow/tfjs`: Core TensorFlow.js library (~1MB)
- `@tensorflow-models/coco-ssd`: Pre-trained COCO-SSD model loader (~500KB)

**Note:** The actual model weights (~5-10MB) will be downloaded automatically on first use from a CDN.

### Step 2: Verify Installation

Check that the packages are in `package.json`:

```json
{
  "dependencies": {
    "@tensorflow/tfjs": "^4.x.x",
    "@tensorflow-models/coco-ssd": "^2.x.x",
    "firebase": "^10.7.1"
  }
}
```

---

## 🏗️ Architecture

### Frontend-Only Implementation

**No Backend Required!** This feature runs entirely in the browser:

```
┌─────────────────────────────────────────┐
│         Browser (Client-Side)           │
│                                         │
│  ┌──────────────────────────────────┐  │
│  │   Video Element (Camera Feed)    │  │
│  └──────────────┬───────────────────┘  │
│                 │                       │
│                 ▼                       │
│  ┌──────────────────────────────────┐  │
│  │   scene-description.js Module    │  │
│  │                                  │  │
│  │  ┌────────────────────────────┐ │  │
│  │  │  COCO-SSD Model            │ │  │
│  │  │  (Object Detection)        │ │  │
│  │  └──────────┬─────────────────┘ │  │
│  │             │                    │  │
│  │             ▼                    │  │
│  │  ┌────────────────────────────┐ │  │
│  │  │  generateDescription()     │ │  │
│  │  │  (Natural Language)        │ │  │
│  │  └──────────┬─────────────────┘ │  │
│  │             │                    │  │
│  │             ▼                    │  │
│  │  ┌────────────────────────────┐ │  │
│  │  │  Speech Synthesis API      │ │  │
│  │  │  (Text-to-Speech)          │ │  │
│  │  └────────────────────────────┘ │  │
│  └──────────────────────────────────┘  │
│                 │                       │
│                 ▼                       │
│         Audio Output (Speaker)          │
└─────────────────────────────────────────┘
```

### Module Structure

Following the same pattern as `speech-to-text.js`:

```
ml/vision/scene-description.js
├── initSceneDescription()      # Initialize model and speech API
├── startDescription()          # Start detection loop
├── stopDescription()           # Stop detection and narration
├── setVideoElement()           # Pass video element reference
├── detectLoop()                # Main detection loop (private)
├── processFrame()              # Process single frame (private)
├── generateDescription()       # Convert detections to text (private)
└── narrateDescription()        # Speak description (private)
```

### Integration Points

**In `main.js`:**
1. Import scene description functions
2. Initialize module after camera is ready
3. Pass video element to module
4. Connect toggle button to start/stop functions

---

## 📊 Data Flow

### Detection Flow

```
1. User toggles "Scene Description" ON
   ↓
2. startDescription() called
   ↓
3. detectLoop() starts (runs every 3-5 seconds)
   ↓
4. model.detect(videoElement) processes frame
   ↓
5. Returns predictions: [
     { class: "person", score: 0.95 },
     { class: "laptop", score: 0.87 },
     { class: "cell phone", score: 0.82 }
   ]
   ↓
6. generateDescription(predictions) 
   → "I see a person, a laptop, and a cell phone"
   ↓
7. narrateDescription(description)
   → Audio plays through speakers
   ↓
8. Wait 3-5 seconds, repeat from step 4
```

### Performance Considerations

- **Frame Rate**: Process every 3-5 seconds (not every frame)
- **Model Loading**: ~5-10MB downloaded on first use (cached afterward)
- **CPU Usage**: Moderate (runs on CPU, not GPU)
- **Memory**: ~50-100MB for model in memory

---

## 🔧 Implementation Steps

### Phase 1: Setup & Dependencies
1. ✅ Install npm packages
2. ✅ Verify installation
3. ✅ Test that Vite can resolve imports

### Phase 2: Core Implementation
1. ✅ Implement `initSceneDescription()`
   - Load COCO-SSD model
   - Initialize Speech Synthesis API
   - Return success/failure

2. ✅ Implement `setVideoElement()`
   - Store video element reference
   - Used by detection loop

3. ✅ Implement `startDescription()`
   - Validate model is loaded
   - Set `isDescribing = true`
   - Start `detectLoop()`

4. ✅ Implement `detectLoop()`
   - Check if still describing
   - Run `model.detect(videoElement)`
   - Generate and narrate description
   - Wait 3-5 seconds
   - Repeat with `requestAnimationFrame`

5. ✅ Implement `generateDescription()`
   - Convert predictions array to natural language
   - Handle singular/plural
   - Handle comma-separated lists
   - Return null if no detections

6. ✅ Implement `narrateDescription()`
   - Cancel any ongoing speech
   - Create SpeechSynthesisUtterance
   - Configure rate, pitch, volume
   - Speak description

7. ✅ Implement `stopDescription()`
   - Set `isDescribing = false`
   - Cancel speech synthesis
   - Stop detection loop

### Phase 3: Integration
1. ✅ Import functions in `main.js`
2. ✅ Initialize after camera ready
3. ✅ Pass video element to module
4. ✅ Connect toggle button
5. ✅ Handle errors gracefully

### Phase 4: Testing & Polish
1. ✅ Test on desktop browser
2. ✅ Test on mobile device
3. ✅ Test error handling (no camera, model load failure)
4. ✅ Adjust detection interval (3-5 seconds)
5. ✅ Fine-tune speech rate and clarity

---

## 🚨 Error Handling

### Model Loading Errors
- **Scenario**: Model fails to load (network issue, browser incompatibility)
- **Handling**: Return `false` from `initSceneDescription()`
- **UI**: Disable "Scene Description" button, show error message

### Camera Not Ready
- **Scenario**: User toggles feature before camera is ready
- **Handling**: Check `videoElement` exists and has valid dimensions
- **UI**: Show "Camera not ready" message, wait for camera

### Speech Synthesis Errors
- **Scenario**: Browser doesn't support Speech Synthesis
- **Handling**: Check `window.speechSynthesis` exists
- **UI**: Fallback to text display (if needed)

### Detection Errors
- **Scenario**: Model throws error during detection
- **Handling**: Catch error, log it, continue loop (don't crash)
- **UI**: Silent failure (don't spam user with errors)

---

## 📱 Browser Compatibility

### Supported Browsers
- ✅ **Chrome/Edge**: Full support (recommended)
- ✅ **Firefox**: Full support
- ⚠️ **Safari**: Partial support (Speech Synthesis works, TensorFlow.js works)
- ⚠️ **Mobile Safari**: Limited (may have performance issues)

### Required APIs
- ✅ `navigator.mediaDevices.getUserMedia` (camera) - Already implemented
- ✅ `window.speechSynthesis` (text-to-speech) - Built into browsers
- ✅ `TensorFlow.js` (ML) - Runs in all modern browsers

---

## 🎯 Success Criteria

### Functional Requirements
- ✅ Model loads successfully on initialization
- ✅ Objects detected in camera feed
- ✅ Descriptions generated in natural language
- ✅ Descriptions narrated audibly
- ✅ Feature can be toggled on/off
- ✅ Detection runs at reasonable interval (3-5 seconds)

### Performance Requirements
- ✅ Model loads within 10 seconds on first use
- ✅ Detection completes within 1-2 seconds per frame
- ✅ Speech doesn't overlap (cancels previous speech)
- ✅ No significant lag in camera feed

### User Experience
- ✅ Clear audio narration
- ✅ Natural language descriptions
- ✅ No constant chatter (throttled appropriately)
- ✅ Graceful error handling

---

## 🔄 Future Enhancements (Out of Scope for MVP)

### Potential Improvements
1. **Emotion Detection**: Use face-api.js to detect emotions (already mentioned in code)
2. **Confidence Threshold**: Only narrate objects above certain confidence score
3. **Custom Descriptions**: User preferences for description style
4. **Object Counting**: "I see 3 people and 2 laptops"
5. **Spatial Information**: "A person on the left, a laptop on the right"
6. **Historical Context**: "The person is still there" (track objects over time)

---

## 📝 Next Steps

### Before Writing Code:
1. ✅ **Install dependencies**: `npm install @tensorflow/tfjs @tensorflow-models/coco-ssd`
2. ✅ **Test import**: Verify Vite can resolve the packages
3. ✅ **Review existing code**: Understand `speech-to-text.js` pattern
4. ✅ **Review video element**: Ensure camera is working in `main.js`

### Implementation Order:
1. **Start with initialization** (`initSceneDescription`)
2. **Add detection loop** (`detectLoop`, `processFrame`)
3. **Add description generation** (`generateDescription`)
4. **Add narration** (`narrateDescription`)
5. **Integrate with main.js** (import, initialize, connect toggle)
6. **Test and refine** (adjust intervals, error handling)

---

## 🐛 Common Issues & Solutions

### Issue: Model takes too long to load
**Solution**: Show loading indicator, allow app to continue running

### Issue: Detection is too slow
**Solution**: Increase interval between detections (5 seconds instead of 3)

### Issue: Speech overlaps
**Solution**: Always cancel previous speech before starting new one

### Issue: Too many detections
**Solution**: Filter by confidence score (only narrate if score > 0.5)

### Issue: Model not found
**Solution**: Check internet connection (model downloads from CDN on first use)

---

## 📚 Resources

- [TensorFlow.js Documentation](https://www.tensorflow.org/js)
- [COCO-SSD Model](https://github.com/tensorflow/tfjs-models/tree/master/coco-ssd)
- [Web Speech Synthesis API](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis)
- [COCO Dataset Objects](https://cocodataset.org/#explore) (80 object classes)

---

## ✅ Checklist

Before starting implementation, ensure:

- [ ] Node.js and npm are installed
- [ ] Project dependencies are installed (`npm install`)
- [ ] Vite dev server runs successfully (`npm run dev`)
- [ ] Camera access works in browser
- [ ] Speech-to-text feature works (to understand the pattern)
- [ ] You understand the module structure and export pattern

**Ready to implement?** Start with installing dependencies, then move to Phase 2 of implementation!

