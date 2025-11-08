# MediaPipe CDN Loading Issues - Troubleshooting Guide

## Problem

MediaPipe Hands assets are not loading properly from CDN, causing:
- "MediaPipe is still loading assets. Please wait and try again." message
- Continuous assertion failures
- Feature never becomes ready

## Root Cause

MediaPipe Hands requires several large files from CDN:
- `hands_solution_packed_assets.data` (large binary file)
- WASM files
- Model files (.tflite)

If these files fail to load or load slowly, MediaPipe never initializes.

## Solutions

### Solution 1: Check Network Connection

1. Open browser DevTools → Network tab
2. Filter by "mediapipe" or ".data"
3. Check if files are loading:
   - ✅ Green (200 status) = Loading successfully
   - ❌ Red (404/500) = Not found or server error
   - ⏳ Pending = Still loading (wait longer)

### Solution 2: Use Local Files (Recommended)

Instead of CDN, serve MediaPipe files locally:

1. **Copy MediaPipe files to public directory:**
   ```bash
   # Copy MediaPipe Hands files
   mkdir -p public/mediapipe-hands
   cp -r node_modules/@mediapipe/hands/* public/mediapipe-hands/
   ```

2. **Update `locateFile` in `sign-recognition.js`:**
   ```javascript
   locateFile: (file) => {
       // Use local files instead of CDN
       return `/mediapipe-hands/${file}`;
   }
   ```

3. **Restart dev server:**
   ```bash
   npm run dev
   ```

### Solution 3: Try Different CDN

Update the CDN URL in `sign-recognition.js`:

```javascript
// Option 1: Use unpkg instead of jsdelivr
const baseUrl = `https://unpkg.com/@mediapipe/hands@${packageVersion}`;

// Option 2: Use esm.sh
const baseUrl = `https://esm.sh/@mediapipe/hands@${packageVersion}`;

// Option 3: Use skypack
const baseUrl = `https://cdn.skypack.dev/@mediapipe/hands@${packageVersion}`;
```

### Solution 4: Increase Timeout

If files are loading but slowly, increase wait times:

In `waitForMediaPipeReadyWithTest()`:
```javascript
// Increase initial wait
await new Promise(resolve => setTimeout(resolve, 15000)); // 15 seconds

// Increase retry wait
await new Promise(resolve => setTimeout(resolve, 5000)); // 5 seconds

// Increase max attempts
const maxAttempts = 20; // Try 20 times instead of 10
```

### Solution 5: Check Browser Console

Look for specific errors:
- **404 errors:** Files not found on CDN
- **CORS errors:** Cross-origin issues
- **Network errors:** Connection problems
- **Timeout errors:** Files taking too long to load

### Solution 6: Use Alternative Approach

If MediaPipe continues to fail, consider:

1. **Use TensorFlow.js HandPose instead:**
   - Already in browser, no CDN needed
   - Different API but similar functionality

2. **Serve MediaPipe from your own server:**
   - Host MediaPipe files on your server
   - Update `locateFile` to point to your server

3. **Use Web Workers:**
   - Load MediaPipe in a Web Worker
   - May help with initialization issues

## Quick Test

To test if MediaPipe files are loading:

1. Open browser console
2. Run:
   ```javascript
   fetch('https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/hands_solution_packed_assets.data')
     .then(r => console.log('File loaded:', r.status))
     .catch(e => console.error('File failed:', e));
   ```

If this fails, the CDN is the problem.

## Expected Behavior

### Success:
```
MediaPipe Hands initializing...
Waiting for assets to load from CDN...
Waiting for MediaPipe to load assets...
Initial wait complete, testing MediaPipe readiness...
Testing MediaPipe readiness (attempt 1/10)...
MediaPipe test frame succeeded - MediaPipe is ready!
MediaPipe Hands initialization complete and verified
```

### Failure:
```
MediaPipe failed to become ready after 10 attempts
MediaPipe assets may not be loading properly from CDN
Error: MediaPipe initialization failed - assets not loading
```

## Next Steps

If MediaPipe still doesn't work after trying these solutions:

1. Check MediaPipe GitHub issues for known problems
2. Try a different MediaPipe version
3. Consider using an alternative hand detection library
4. Contact MediaPipe support if it's a CDN issue

## Alternative: Disable Sign Language Feature

If MediaPipe continues to cause problems, you can disable the feature:

1. Comment out sign language imports in `main.js`
2. Remove sign language toggle from UI
3. Focus on other features (speech, scene description, face recognition)

