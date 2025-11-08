# MediaPipe Hands Troubleshooting Guide

## Common Issues and Solutions

### Issue: Console Warnings About Missing Files

**Symptoms:**
- Warnings about `palm_detection_lite.tflite`, `hands_solution_packed_assets.data`, etc.
- Errors like "Failed to load" or "404" for MediaPipe assets

**Cause:**
MediaPipe Hands needs to load multiple asset files (WASM, models, data files) from a CDN or local server. These warnings appear when files are being loaded but don't prevent functionality.

**Solution:**
1. These warnings are usually **non-critical** - MediaPipe will retry loading files
2. The system should still work even with these warnings
3. If functionality is broken, check:
   - Internet connection (files load from CDN)
   - Browser console for actual errors (not warnings)
   - That MediaPipe Hands initialized successfully

### Issue: "Error processing frame" Messages

**Symptoms:**
- Console errors: "Error processing frame: sign-recognition.js:200"
- Hand detection not working

**Cause:**
MediaPipe Hands may throw errors during initial asset loading before it's fully initialized.

**Solution:**
1. Wait a few seconds after enabling the feature for MediaPipe to fully initialize
2. Check that camera permissions are granted
3. Ensure video element is playing and has valid dimensions
4. These errors should stop once MediaPipe finishes loading assets

### Issue: Files Not Loading from CDN

**Symptoms:**
- Persistent 404 errors for MediaPipe files
- Hand detection never starts

**Solutions:**

#### Option 1: Use Local File Serving (Recommended for Development)

1. Copy MediaPipe files to `public/` directory:
   ```bash
   # Copy MediaPipe Hands assets to public directory
   cp -r node_modules/@mediapipe/hands public/mediapipe-hands
   ```

2. Update `locateFile` in `sign-recognition.js`:
   ```javascript
   locateFile: (file) => {
       return `/mediapipe-hands/${file}`;
   }
   ```

#### Option 2: Use Different CDN

Try using unpkg instead of jsdelivr:
```javascript
locateFile: (file) => {
    return `https://unpkg.com/@mediapipe/hands@0.4.1675469240/${file}`;
}
```

#### Option 3: Serve via Vite Dev Server

Configure Vite to serve MediaPipe files from node_modules:

1. Update `vite.config.js`:
   ```javascript
   import { copyFileSync } from 'fs';
   import { resolve } from 'path';

   export default defineConfig({
       // ... existing config
       plugins: [
           // Copy MediaPipe files to public during build
           {
               name: 'copy-mediapipe',
               buildStart() {
                   // Copy MediaPipe Hands files
               }
           }
       ],
       server: {
           // Serve static files from node_modules
           fs: {
               allow: ['..']
           }
       }
   });
   ```

### Issue: CORS Errors

**Symptoms:**
- CORS policy errors in console
- Files fail to load

**Solution:**
- Serve MediaPipe files from the same origin (localhost for dev)
- Or use a CDN that supports CORS (jsdelivr and unpkg both do)
- Ensure your dev server is running on the same protocol (http/https)

### Issue: Performance Problems

**Symptoms:**
- Slow hand detection
- High CPU usage
- Browser freezing

**Solutions:**

1. **Use Lite Model:**
   ```javascript
   hands.setOptions({
       modelComplexity: 0  // Use lite model (0 = fastest)
   });
   ```

2. **Increase Throttling:**
   ```javascript
   const PROCESSING_THROTTLE = 5;  // Process every 5th frame instead of 3rd
   ```

3. **Reduce Buffer Size:**
   ```javascript
   const LANDMARK_BUFFER_SIZE = 15;  // Smaller buffer
   ```

### Issue: Hands Not Detected

**Symptoms:**
- No hand landmarks detected
- No predictions appearing

**Solutions:**

1. **Check Camera:**
   - Ensure camera is working
   - Check video element is playing
   - Verify camera permissions

2. **Adjust Detection Settings:**
   ```javascript
   hands.setOptions({
       minDetectionConfidence: 0.3,  // Lower threshold (more sensitive)
       minTrackingConfidence: 0.3
   });
   ```

3. **Lighting:**
   - Ensure good lighting
   - Avoid backlighting
   - Keep hands well-lit

4. **Hand Position:**
   - Keep hands in frame
   - Ensure hands are clearly visible
   - Avoid overlapping hands

### Issue: Model Classification Not Working

**Symptoms:**
- Hands detected but no letters/signs predicted
- Always shows "Hands detected (no model for classification)"

**Solution:**
- This is expected if no ASL model is installed
- Add a TensorFlow.js model to `assets/ml-models/sign-language/`
- See `assets/ml-models/sign-language/README.md` for model setup instructions

## Debugging Tips

### Enable Verbose Logging

Add logging to see what's happening:
```javascript
// In sign-recognition.js
console.log('MediaPipe file request:', file);
console.log('Hands detected:', results.multiHandLandmarks?.length);
console.log('Landmarks:', normalizedLandmarks);
```

### Check MediaPipe Initialization

Verify MediaPipe initialized:
```javascript
if (hands) {
    console.log('MediaPipe Hands initialized');
} else {
    console.error('MediaPipe Hands not initialized');
}
```

### Monitor Network Requests

1. Open Chrome DevTools → Network tab
2. Filter by "mediapipe" or "tflite"
3. Check which files are loading/failing
4. Verify file URLs are correct

### Test MediaPipe Standalone

Test if MediaPipe works in isolation:
```javascript
import { Hands } from '@mediapipe/hands';

const hands = new Hands({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
});

hands.setOptions({ maxNumHands: 2 });
hands.onResults((results) => {
    console.log('Hands results:', results);
});

// Test with an image
hands.send({ image: document.getElementById('test-image') });
```

## Expected Behavior

### Normal Console Output

You may see:
- ✅ "MediaPipe Hands initialized successfully"
- ✅ "Sign language detection started"
- ⚠️ Some warnings about file loading (normal, non-critical)
- ✅ "Hands detected: X" (when hands are visible)

### What to Ignore

- Warnings about "dependency" loading (MediaPipe internal)
- 404 errors during initial load (MediaPipe will retry)
- Asset loading warnings (non-critical)

### What to Fix

- Persistent errors that prevent initialization
- CORS errors
- Complete lack of hand detection
- Browser freezing/crashing

## Getting Help

If issues persist:
1. Check MediaPipe Hands documentation: https://google.github.io/mediapipe/solutions/hands
2. Verify npm package version: `npm list @mediapipe/hands`
3. Check browser compatibility (Chrome/Edge recommended)
4. Test in incognito mode (rules out extensions)
5. Clear browser cache and reload

