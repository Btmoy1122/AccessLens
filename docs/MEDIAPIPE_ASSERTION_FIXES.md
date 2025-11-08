# MediaPipe "Aborted (Assertion failed)" Error Fixes

## Problem

MediaPipe Hands was throwing "Aborted (Assertion failed)" errors in its WebAssembly (WASM) module. These errors occur when:

1. **Frames are processed before MediaPipe is fully initialized** - MediaPipe's WASM module needs time to load all dependencies (models, assets, etc.) before it can process video frames
2. **Memory allocation issues** - The WASM module tries to access memory that hasn't been properly allocated yet
3. **Asset loading race conditions** - MediaPipe is still loading files when frames start being processed

## Symptoms

- Console shows "Aborted (Assertion failed)" errors
- "Error processing frame" messages
- 394+ errors and 69+ warnings in console
- Hand detection not working
- Application may freeze or crash

## Root Cause

The frame processing loop was starting before MediaPipe's WASM module finished loading all its dependencies. MediaPipe needs to:
1. Load WASM files
2. Load model files (.tflite)
3. Load asset files (.data, .txt)
4. Initialize internal memory structures
5. Set up hand detection pipelines

All of this takes 5-10 seconds, but the code was trying to process frames after only 1-2 seconds.

## Solution

### 1. Extended Initialization Wait Times

**Before:** 2-3 seconds wait
**After:** 5-10 seconds wait with multiple stages

```javascript
async function waitForMediaPipeReady() {
    // Initial wait for basic initialization
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Additional wait for asset loading
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Total: 5 seconds minimum
}
```

### 2. Readiness Flag System

Added `isMediaPipeReady` flag that:
- Starts as `false`
- Only becomes `true` after all initialization delays
- Gets reset to `false` if assertion failures occur
- Prevents frame processing until `true`

### 3. Assertion Failure Detection

The code now detects assertion failures and handles them:

```javascript
const isAssertionFailure = 
    errorMessage.includes('Aborted') ||
    errorMessage.includes('Assertion failed');

if (isAssertionFailure) {
    // MediaPipe isn't ready - wait longer
    isMediaPipeReady = false;
    setTimeout(() => {
        isMediaPipeReady = true;
    }, 5000);
}
```

### 4. Frame Processing Guards

Multiple checks before processing frames:

```javascript
// Check 1: MediaPipe ready flag
if (!isMediaPipeReady) {
    return; // Skip this frame
}

// Check 2: Video element valid
if (!videoElement || videoElement.readyState < 2) {
    return; // Skip this frame
}

// Check 3: Video dimensions valid
if (videoElement.videoWidth < 64 || videoElement.videoHeight < 64) {
    return; // Skip this frame
}
```

### 5. Error Recovery

When assertion failures occur:
1. Immediately stop processing frames
2. Mark MediaPipe as not ready
3. Wait 5 seconds
4. Retry processing

## Usage

### Normal Flow

1. User enables "Sign Language" feature
2. MediaPipe starts initializing (5-10 seconds)
3. Console shows: "MediaPipe Hands initializing... (this may take 5-10 seconds)"
4. After initialization: "MediaPipe Hands initialization complete"
5. Frame processing begins
6. Hand detection works correctly

### If Errors Occur

1. Assertion failures are caught
2. MediaPipe is marked as not ready
3. Processing stops
4. System waits 5 seconds
5. Processing resumes automatically

## Expected Console Output

### During Initialization (First 5-10 seconds)

```
MediaPipe Hands initializing... (this may take 5-10 seconds)
Please wait for all assets to load - do not process frames yet
Waiting for MediaPipe assets to load...
MediaPipe Hands marked as ready (will verify during processing)
MediaPipe Hands initialization complete
Note: You may still see dependency warnings - this is normal
```

### During Processing

- ✅ No "Aborted (Assertion failed)" errors
- ✅ No "Error processing frame" errors
- ⚠️ Some dependency warnings (normal, can be ignored)
- ✅ Hand detection working

## Troubleshooting

### If Assertion Failures Persist

1. **Increase wait times:**
   ```javascript
   // In waitForMediaPipeReady()
   await new Promise(resolve => setTimeout(resolve, 5000)); // Increase to 5 seconds
   await new Promise(resolve => setTimeout(resolve, 3000)); // Increase to 3 seconds
   ```

2. **Check network connection:**
   - MediaPipe loads files from CDN
   - Slow connection = longer load times
   - Consider increasing wait times if on slow connection

3. **Check browser compatibility:**
   - Chrome/Edge recommended
   - Firefox may have issues
   - Safari not fully supported

4. **Clear browser cache:**
   - Old cached files may cause issues
   - Clear cache and reload

### If Hand Detection Doesn't Work

1. **Wait longer:**
   - MediaPipe may need more than 5 seconds
   - Wait 10-15 seconds after enabling feature

2. **Check camera:**
   - Ensure camera is working
   - Check camera permissions
   - Verify video element is playing

3. **Check lighting:**
   - Ensure good lighting
   - Keep hands well-lit
   - Avoid backlighting

## Performance Impact

- **Initialization:** 5-10 seconds (one-time, when feature is first enabled)
- **Frame Processing:** Minimal impact after initialization
- **Memory:** MediaPipe uses WASM, which is efficient
- **CPU:** Moderate usage during frame processing

## Future Improvements

1. **Progressive Loading:** Load MediaPipe assets in background before feature is enabled
2. **Readiness Detection:** Poll MediaPipe to detect when it's actually ready (not just guessing)
3. **Error Recovery:** Automatic retry with exponential backoff
4. **User Feedback:** Show loading progress to user during initialization

## Related Files

- `ml/sign-language/sign-recognition.js` - Main implementation
- `frontend/js/main.js` - Integration code
- `docs/MEDIAPIPE_TROUBLESHOOTING.md` - General troubleshooting guide

