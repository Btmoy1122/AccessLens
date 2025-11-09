/**
 * Face Recognition Module
 * 
 * Provides face recognition and AR memory tags using face-api.js.
 * Detects faces in video feed, matches them with known faces from Firebase,
 * and displays AR tags with names and notes.
 * 
 * Features:
 * - Face detection using face-api.js
 * - Face recognition by comparing embeddings
 * - Face registration with name and notes
 * - Firebase integration for face storage
 * - AR tag display for recognized faces
 * 
 * @module ml/vision/face-recognition
 */

import * as faceapi from '@vladmandic/face-api';
import { getFacesByUser, addFace } from '@backend/services/face-service.js';

// Configuration constants
const DETECTION_INTERVAL_MS = 500; // Run detection every 500ms for much smoother tracking
const RECOGNITION_THRESHOLD = 0.55; // Stricter threshold (0.55) - reduces false positives
const RELAXED_RECOGNITION_THRESHOLD = 0.62; // More lenient threshold for position-matched faces (angle tolerance)
const MIN_FACE_SIZE = 25; // Minimum face size in pixels (reduced from 50 to detect faces from farther away)
const FACE_TRACKING_DISTANCE_THRESHOLD = 80; // Pixels - faces closer than this are considered the same (reduced for better separation)
const MIN_CONFIDENCE_FOR_REGISTRATION = 0.65; // Lowered from 0.75 to allow registration of smaller/distant faces
const RECOGNIZED_FACE_CACHE_TIMEOUT = 6000; // Keep recognized faces in cache for 6 seconds (increased for angle tolerance)
const UNKNOWN_FACE_BUFFER_TIME_MS = 4000; // Wait 4 seconds before prompting for unknown face registration
// Removed MIN_DISTANCE_BETWEEN_FACES - using position-based deduplication in detection loop

// Module state
let modelsLoaded = false;
let isRecognizing = false;
let videoElement = null;
let knownFaces = []; // Array of { id, name, notes, embedding }
let recognitionTimeoutId = null;
let recognizedFacesCache = new Map(); // Cache of currently recognized faces
let pendingRegistration = null; // Face waiting to be registered
let unknownFacesBuffer = new Map(); // Track unknown faces with timestamps for confidence buffer
// Key: faceKey, Value: { firstSeen: timestamp, detection: detection, lastSeen: timestamp }
let currentUserId = 'default'; // Current user ID for face operations

// Callback functions
let onFaceRecognizedCallback = null;
let onNewFaceCallback = null;
let onFaceUpdateCallback = null; // Called for each frame update
let onFaceRemovedCallback = null; // Called when a face is removed from cache

/**
 * Initialize face recognition module.
 * Loads face-api.js models and known faces from Firebase.
 * 
 * @returns {Promise<boolean>} True if initialization successful, false otherwise
 */
export async function initFaceRecognition() {
    try {
        console.log('Initializing face recognition...');
        
        // Load face-api.js models from CDN
        // Using CDN for @vladmandic/face-api models
        const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.14/model/';
        
        console.log('Loading face-api.js models...');
        
        // @vladmandic/face-api uses its own TensorFlow.js instance
        // Make sure TensorFlow.js is ready
        if (faceapi.tf && faceapi.tf.ready) {
            await faceapi.tf.ready();
        }
        
        // Load models
        await Promise.all([
            faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
            faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
            faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
        ]);
        
        modelsLoaded = true;
        console.log('Face-api.js models loaded successfully');
        
        // Load known faces from Firebase
        await loadKnownFaces();
        
        console.log('Face recognition initialized successfully');
        return true;
    } catch (error) {
        console.error('Error initializing face recognition:', error);
        console.error('Error details:', error.message, error.stack);
        modelsLoaded = false;
        return false;
    }
}

/**
 * Set the video element for face detection.
 * This must be called after the camera is initialized.
 * 
 * @param {HTMLVideoElement} video - The video element containing the camera feed
 */
export function setVideoElement(video) {
    if (video && video instanceof HTMLVideoElement) {
        videoElement = video;
        console.log('Video element set for face recognition');
    } else {
        console.warn('Invalid video element provided to setVideoElement');
    }
}

/**
 * Set callback for when a face is recognized.
 * 
 * @param {Function} callback - Callback function(faceData, detection)
 */
export function onFaceRecognized(callback) {
    onFaceRecognizedCallback = callback;
}

/**
 * Set callback for when a new (unknown) face is detected.
 * 
 * @param {Function} callback - Callback function(detection, faceKey)
 */
export function onNewFace(callback) {
    onNewFaceCallback = callback;
}

/**
 * Set callback for face updates (called every frame with all active faces).
 * Useful for updating overlays.
 * 
 * @param {Function} callback - Callback function(faces) where faces is array of active faces
 */
export function onFaceUpdate(callback) {
    onFaceUpdateCallback = callback;
}

/**
 * Set callback for when a face is removed from cache.
 * Useful for removing overlays.
 * 
 * @param {Function} callback - Callback function(faceKey)
 */
export function onFaceRemoved(callback) {
    onFaceRemovedCallback = callback;
}

/**
 * Get the primary face currently on screen (largest/centermost recognized face).
 * Useful for associating conversations with a specific person.
 * 
 * @returns {Object|null} Face data with id, name, and faceKey, or null if no recognized face
 */
/**
 * Get all recognized faces currently on screen
 * 
 * @returns {Array} Array of face objects with { faceId, name, faceKey }
 */
export function getAllRecognizedFaces() {
    const activeFaces = getAllActiveFaces();
    
    // Filter to only recognized faces (not unknown)
    const recognizedFaces = activeFaces.filter(face => 
        face.isRecognized && face.faceData && face.faceData.id
    );
    
    // Return array of face info
    return recognizedFaces.map(face => ({
        faceId: face.faceData.id,
        name: face.faceData.name,
        faceKey: face.faceKey,
        detection: face.detection // Include detection for size calculation
    }));
}

/**
 * Get the primary (largest/most prominent) face on screen
 * 
 * @returns {Object|null} Face object with { faceId, name, faceKey } or null
 */
export function getPrimaryFaceOnScreen() {
    const recognizedFaces = getAllRecognizedFaces();
    
    if (recognizedFaces.length === 0) {
        return null;
    }
    
    // If only one recognized face, return it
    if (recognizedFaces.length === 1) {
        const face = recognizedFaces[0];
        return {
            faceId: face.faceId,
            name: face.name,
            faceKey: face.faceKey
        };
    }
    
    // Multiple faces - find the largest one (most prominent)
    let largestFace = null;
    let largestSize = 0;
    
    for (const face of recognizedFaces) {
        if (face.detection && face.detection.detection && face.detection.detection.box) {
            const box = face.detection.detection.box;
            const size = box.width * box.height;
            
            if (size > largestSize) {
                largestSize = size;
                largestFace = face;
            }
        }
    }
    
    if (largestFace) {
        return {
            faceId: largestFace.faceId,
            name: largestFace.name,
            faceKey: largestFace.faceKey
        };
    }
    
    // Fallback: return first recognized face
    const firstFace = recognizedFaces[0];
    return {
        faceId: firstFace.faceId,
        name: firstFace.name,
        faceKey: firstFace.faceKey
    };
}

/**
 * Get the primary face with detection (including landmarks) for speech bubble positioning
 * 
 * @returns {Object|null} Face object with { faceId, name, faceKey, detection } or null
 */
export function getPrimaryFaceWithDetection() {
    const recognizedFaces = getAllRecognizedFaces();
    
    if (recognizedFaces.length === 0) {
        return null;
    }
    
    // If only one recognized face, return it with detection
    if (recognizedFaces.length === 1) {
        return recognizedFaces[0];
    }
    
    // Multiple faces - find the largest one (most prominent)
    let largestFace = null;
    let largestSize = 0;
    
    for (const face of recognizedFaces) {
        if (face.detection && face.detection.detection && face.detection.detection.box) {
            const box = face.detection.detection.box;
            const size = box.width * box.height;
            
            if (size > largestSize) {
                largestSize = size;
                largestFace = face;
            }
        }
    }
    
    if (largestFace) {
        return largestFace;
    }
    
    // Fallback: return first recognized face
    return recognizedFaces[0];
}

/**
 * Get mouth position from face detection landmarks
 * Face-api.js provides 68 landmarks:
 * - Points 48-67 are mouth landmarks
 * - Point 62 is approximately the center bottom of the upper lip (mouth center)
 * 
 * @param {Object} detection - Face detection object with landmarks
 * @param {HTMLVideoElement} videoElement - Video element for coordinate conversion
 * @returns {Object|null} Mouth position { x, y } in screen coordinates or null
 */
export function getMouthPosition(detection, videoElement) {
    if (!detection || !videoElement) {
        return null;
    }
    
    try {
        // face-api.js detection structure from @vladmandic/face-api:
        // The detection object has: detection.landmarks
        // landmarks.positions is an array of 68 point objects with {x, y} properties
        // Mouth landmarks are indices 48-67 (20 points)
        // We want the center of the mouth opening for speech bubbles
        
        let landmarks = null;
        let mouthPoints = null;
        
        // Check if landmarks exist on the detection object
        // face-api.js detection structure: detection.landmarks.positions
        if (!detection.landmarks) {
            return null;
        }
        
        landmarks = detection.landmarks;
        
        // @vladmandic/face-api structure: landmarks.positions is an array of 68 points
        if (!landmarks.positions || !Array.isArray(landmarks.positions)) {
            return null;
        }
        
        if (landmarks.positions.length < 68) {
            return null;
        }
        
        // Get mouth landmarks
        // Points 48-67: Outer mouth (lips outline)
        // Points 60-67: Inner mouth (mouth opening) - MORE ACCURATE for center
        // Points 61, 63, 65, 67: Top, right, bottom, left of inner mouth
        // Point 62, 66: Left and right corners of inner mouth
        
        // Use INNER mouth points (60-67) for more accurate center
        // These represent the actual mouth opening, not just the lips
        const innerMouthIndices = [60, 61, 62, 63, 64, 65, 66, 67]; // 8 points for inner mouth
        const outerMouthIndices = [48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59]; // Outer lips
        
        // Try inner mouth first (more accurate)
        mouthPoints = innerMouthIndices.map(idx => landmarks.positions[idx]).filter(p => p != null);
        
        // If inner mouth points aren't valid, fall back to outer mouth
        if (mouthPoints.length === 0) {
            mouthPoints = outerMouthIndices.map(idx => landmarks.positions[idx]).filter(p => p != null);
        }
        
        // If still no points, try all mouth points (48-67)
        if (mouthPoints.length === 0) {
            mouthPoints = landmarks.positions.slice(48, 68).filter(p => p != null);
        }
        
        if (mouthPoints.length === 0) {
            return null;
        }
        
        // Calculate mouth center using weighted average
        // Give more weight to center points (61, 63, 65) which are more stable
        let mouthCenterX = 0;
        let mouthCenterY = 0;
        let totalWeight = 0;
        
        for (let i = 0; i < mouthPoints.length; i++) {
            const point = mouthPoints[i];
            if (!point) continue;
            
            // Extract x, y coordinates
            let x = null;
            let y = null;
            
            if (point && typeof point === 'object') {
                // Try different property names
                x = point.x !== undefined ? point.x : (point._x !== undefined ? point._x : null);
                y = point.y !== undefined ? point.y : (point._y !== undefined ? point._y : null);
                
                // Some versions use getX() and getY() methods
                if (x === null && typeof point.getX === 'function') {
                    x = point.getX();
                }
                if (y === null && typeof point.getY === 'function') {
                    y = point.getY();
                }
            } else if (Array.isArray(point) && point.length >= 2) {
                x = point[0];
                y = point[1];
            }
            
            if (typeof x === 'number' && typeof y === 'number' && !isNaN(x) && !isNaN(y) && isFinite(x) && isFinite(y)) {
                // Weight center points more heavily for stability
                // Points in the middle of the array are typically center points
                const weight = 1.0 + (0.5 * (1 - Math.abs(i - mouthPoints.length / 2) / (mouthPoints.length / 2)));
                mouthCenterX += x * weight;
                mouthCenterY += y * weight;
                totalWeight += weight;
            }
        }
        
        if (totalWeight === 0) {
            return null;
        }
        
        mouthCenterX = mouthCenterX / totalWeight;
        mouthCenterY = mouthCenterY / totalWeight;
        
        const mouthLandmark = { x: mouthCenterX, y: mouthCenterY };
        
        // Convert video coordinates to screen coordinates
        // This accounts for video scaling and letterboxing
        const videoRect = videoElement.getBoundingClientRect();
        
        // Get actual video dimensions (may differ from displayed size)
        const videoWidth = videoElement.videoWidth;
        const videoHeight = videoElement.videoHeight;
        
        if (!videoWidth || !videoHeight) {
            // Video not ready yet
            return null;
        }
        
        // Calculate aspect ratios
        const videoAspect = videoWidth / videoHeight;
        const displayAspect = videoRect.width / videoRect.height;
        
        let scaleX = 1;
        let scaleY = 1;
        let offsetX = 0;
        let offsetY = 0;
        
        // Calculate scaling and offsets based on how video is fitted
        if (videoAspect > displayAspect) {
            // Video is wider than display - letterboxed vertically (black bars top/bottom)
            scaleY = videoRect.height / videoHeight;
            scaleX = scaleY; // Maintain aspect ratio
            offsetX = (videoRect.width - videoWidth * scaleX) / 2;
            offsetY = 0;
        } else {
            // Video is taller than display - letterboxed horizontally (black bars left/right)
            scaleX = videoRect.width / videoWidth;
            scaleY = scaleX; // Maintain aspect ratio
            offsetX = 0;
            offsetY = (videoRect.height - videoHeight * scaleY) / 2;
        }
        
        // Convert landmark coordinates from video space to screen space
        // Mouth landmark coordinates are in video pixel space (0 to videoWidth/videoHeight)
        const screenX = videoRect.left + offsetX + (mouthLandmark.x * scaleX);
        const screenY = videoRect.top + offsetY + (mouthLandmark.y * scaleY);
        
        // Validate coordinates are within reasonable bounds
        if (!isFinite(screenX) || !isFinite(screenY) || isNaN(screenX) || isNaN(screenY)) {
            return null;
        }
        
        return { x: screenX, y: screenY };
    } catch (error) {
        console.error('Error getting mouth position:', error);
        return null;
    }
}

/**
 * Start face recognition.
 * Begins the detection loop that processes video frames and recognizes faces.
 */
export function startRecognition() {
    // Validate prerequisites
    if (!modelsLoaded) {
        console.error('Cannot start face recognition: Models not loaded');
        return;
    }
    
    if (!videoElement) {
        console.error('Cannot start face recognition: Video element not set');
        return;
    }
    
    // Check if video element is ready
    if (!videoElement.videoWidth || !videoElement.videoHeight) {
        console.warn('Video element not ready, waiting...');
        setTimeout(() => startRecognition(), 500);
        return;
    }
    
    if (!isRecognizing) {
        isRecognizing = true;
        recognizedFacesCache.clear();
        console.log('Face recognition started');
        recognitionLoop();
    }
}

/**
 * Stop face recognition.
 * Stops the detection loop and clears recognized faces cache.
 */
export function stopRecognition() {
    if (isRecognizing) {
        isRecognizing = false;
        
        // Clear any pending recognition timeout
        if (recognitionTimeoutId) {
            clearTimeout(recognitionTimeoutId);
            recognitionTimeoutId = null;
        }
        
        // Clear recognized faces cache
        recognizedFacesCache.clear();
        
        console.log('Face recognition stopped');
    }
}

/**
 * Main recognition loop.
 * Processes video frames at regular intervals and recognizes faces.
 */
async function recognitionLoop() {
    // Exit if recognition was stopped
    if (!isRecognizing || !modelsLoaded || !videoElement) {
        return;
    }
    
    // Validate video element is still ready
    if (!videoElement.videoWidth || !videoElement.videoHeight || videoElement.paused) {
        console.warn('Video element not ready, skipping detection');
        recognitionTimeoutId = setTimeout(recognitionLoop, DETECTION_INTERVAL_MS);
        return;
    }
    
    try {
        // Detect faces in the current video frame
        // Use @vladmandic/face-api detection API
        // Increased inputSize to 512 (max) for better small face detection at distance
        // Lowered scoreThreshold to detect lower confidence (smaller/distant) faces
        const options = new faceapi.TinyFaceDetectorOptions({ 
            inputSize: 512, // Increased from 320 to 512 for better small face detection
            scoreThreshold: 0.4 // Lowered from 0.5 to detect smaller/distant faces (more sensitive)
        });
        
        const detections = await faceapi
            .detectAllFaces(videoElement, options)
            .withFaceLandmarks()
            .withFaceDescriptors();
        
        // Filter out very small faces (but keep smaller faces for better range)
        // MIN_FACE_SIZE is now 25px to allow detection from farther away
        const validDetections = detections.filter(detection => {
            if (!detection.detection || !detection.detection.box) {
                return false;
            }
            const box = detection.detection.box;
            // Allow faces as small as MIN_FACE_SIZE (25px) for better range
            return box.width >= MIN_FACE_SIZE && box.height >= MIN_FACE_SIZE;
        });
        
        // Process each detected face
        // Sort by confidence (highest first) for better recognition order
        const sortedDetections = validDetections.sort((a, b) => {
            const scoreA = a.detection?.score || 0;
            const scoreB = b.detection?.score || 0;
            return scoreB - scoreA;
        });
        
        // Track processed positions to avoid duplicate processing in the same frame
        const processedInThisFrame = new Set();
        
        for (const detection of sortedDetections) {
            if (!detection.detection || !detection.detection.box) {
                continue;
            }
            
            // Create a position key for this detection
            const box = detection.detection.box;
            const positionKey = `${Math.round(box.x / 25)}_${Math.round(box.y / 25)}`;
            
            // Skip if we've already processed a detection at this position in this frame
            // This prevents processing the same face multiple times
            if (processedInThisFrame.has(positionKey)) {
                continue;
            }
            processedInThisFrame.add(positionKey);
            
            // Check if there's a recently recognized face at a similar position
            // This helps handle angle changes where embedding might be slightly different
            const closestCachedKey = findClosestFaceKey(detection);
            const closestCached = closestCachedKey ? recognizedFacesCache.get(closestCachedKey) : null;
            
            // Try recognition with normal threshold first
            const match = await recognizeFace(detection.descriptor, RECOGNITION_THRESHOLD);
            
            if (match) {
                // Face recognized - verify distance is within threshold
                const distance = calculateEuclideanDistance(detection.descriptor, match.embedding);
                if (distance < RECOGNITION_THRESHOLD) {
                    handleRecognizedFace(match, detection);
                } else {
                    // Distance too high with normal threshold - try relaxed threshold if position matches
                    if (closestCached && closestCached.faceData && closestCached.faceData.id) {
                        // There's a recognized face nearby - try relaxed threshold for angle tolerance
                        const relaxedMatch = await recognizeFace(detection.descriptor, RELAXED_RECOGNITION_THRESHOLD);
                        if (relaxedMatch && relaxedMatch.id === closestCached.faceData.id) {
                            // Same person, just different angle - use relaxed match
                            console.log(`Recognized ${relaxedMatch.name} with relaxed threshold (angle variation)`);
                            handleRecognizedFace(relaxedMatch, detection);
                        } else {
                            // Different person or no match - treat as unknown
                            handleUnknownFace(detection);
                        }
                    } else {
                        // No nearby recognized face - treat as unknown
                        handleUnknownFace(detection);
                    }
                }
            } else {
                // No match with normal threshold - check if it's a recognized face at similar position with relaxed threshold
                if (closestCached && closestCached.faceData && closestCached.faceData.id) {
                    // Try relaxed threshold for angle tolerance
                    const relaxedMatch = await recognizeFace(detection.descriptor, RELAXED_RECOGNITION_THRESHOLD);
                    if (relaxedMatch && relaxedMatch.id === closestCached.faceData.id) {
                        // Same person, angle change - use relaxed match
                        console.log(`Recognized ${relaxedMatch.name} with relaxed threshold (angle variation)`);
                        handleRecognizedFace(relaxedMatch, detection);
                    } else {
                        // Unknown face
                        handleUnknownFace(detection);
                    }
                } else {
                    // Unknown face
                    handleUnknownFace(detection);
                }
            }
        }
        
        // Clean up cache for faces that are no longer detected
        cleanupRecognizedFacesCache(validDetections);
        
        // Clean up stale unknown faces buffer
        cleanupUnknownFacesBuffer();
        
        // Call face update callback with all active faces
        if (onFaceUpdateCallback) {
            const allFaces = getAllActiveFaces();
            onFaceUpdateCallback(allFaces);
        }
        
    } catch (error) {
        console.error('Error during face recognition:', error);
        // Continue the loop even if detection fails
    }
    
    // Schedule next detection
    if (isRecognizing) {
        recognitionTimeoutId = setTimeout(recognitionLoop, DETECTION_INTERVAL_MS);
    }
}

/**
 * Recognize face by comparing embedding with known faces.
 * 
 * @param {Float32Array} descriptor - Face embedding from face-api.js
 * @param {number} threshold - Recognition threshold (defaults to RECOGNITION_THRESHOLD)
 * @returns {Object|null} Matched face data or null if no match
 */
async function recognizeFace(descriptor, threshold = RECOGNITION_THRESHOLD) {
    if (knownFaces.length === 0) {
        return null;
    }
    
    let bestMatch = null;
    let bestDistance = Infinity;
    
    // Compare with all known faces
    for (const knownFace of knownFaces) {
        const distance = calculateEuclideanDistance(descriptor, knownFace.embedding);
        
        if (distance < threshold && distance < bestDistance) {
            bestDistance = distance;
            bestMatch = knownFace;
        }
    }
    
    return bestMatch;
}

/**
 * Calculate Euclidean distance between two face embeddings.
 * 
 * @param {Float32Array} embedding1 - First face embedding
 * @param {Float32Array} embedding2 - Second face embedding
 * @returns {number} Euclidean distance (lower = more similar)
 */
function calculateEuclideanDistance(embedding1, embedding2) {
    if (embedding1.length !== embedding2.length) {
        return Infinity;
    }
    
    let sumSquaredDiff = 0;
    for (let i = 0; i < embedding1.length; i++) {
        const diff = embedding1[i] - embedding2[i];
        sumSquaredDiff += diff * diff;
    }
    
    return Math.sqrt(sumSquaredDiff);
}

/**
 * Handle a recognized face.
 * 
 * @param {Object} faceData - Recognized face data
 * @param {Object} detection - Face detection object from face-api.js
 */
function handleRecognizedFace(faceData, detection) {
    // Priority 1: Match by identity (faceData.id) - same person, can move anywhere
    // Priority 2: Match by position - close to existing face
    // Priority 3: Create new entry
    
    let faceKey = null;
    let existing = null;
    let oldKeyToRemove = null;
    
    // First, look for existing face with same identity (same person)
    // This allows tracking the same person even when they move significantly
    if (faceData.id) {
        for (const [key, cached] of recognizedFacesCache.entries()) {
            if (cached.faceData && cached.faceData.id === faceData.id) {
                // Same person found - reuse this key to maintain overlay continuity
                faceKey = key;
                existing = cached;
                break;
            }
        }
    }
    
    // If no identity match, try position-based matching (for unknown faces or first-time recognition)
    if (!faceKey) {
        const closestKey = findClosestFaceKey(detection);
        if (closestKey) {
            const closestFace = recognizedFacesCache.get(closestKey);
            // Use position match only if:
            // 1. No identity conflict (different person shouldn't reuse key)
            // 2. Close enough to be the same face
            if (closestFace) {
                const hasIdentityConflict = closestFace.faceData.id && 
                                           faceData.id && 
                                           closestFace.faceData.id !== faceData.id;
                
                if (!hasIdentityConflict) {
                    faceKey = closestKey;
                    existing = closestFace;
                }
            }
        }
    }
    
    // If still no match, create new key
    if (!faceKey) {
        faceKey = createFaceKey(detection);
    }
    
    if (!existing) {
        // New recognition - add to cache
        // Update cache with latest detection (including fresh landmarks)
        recognizedFacesCache.set(faceKey, {
            faceData: faceData,
            detection: detection, // Store the full detection object with landmarks
            lastSeen: Date.now(),
            faceKey: faceKey,
            faceId: faceData.id || `recognized_${Date.now()}`
        });
        
        // Clear this face from unknown faces buffer (it's now recognized)
        clearUnknownFaceFromBuffer(faceKey);
        
        console.log(`Recognized face: ${faceData.name} (new key: ${faceKey})`);
        
        // Call callback if set (only for first recognition)
        if (onFaceRecognizedCallback) {
            onFaceRecognizedCallback(faceData, detection, faceKey);
        }
    } else {
        // Clear this face from unknown faces buffer (it's now recognized)
        clearUnknownFaceFromBuffer(faceKey);
        // Update existing face - same person, just updating position
        // IMPORTANT: Update detection with fresh landmarks for speech bubble tracking
        existing.lastSeen = Date.now();
        existing.detection = detection; // Update detection with new position AND fresh landmarks
        existing.faceData = faceData; // Update face data
        
        // Important: Keep the same key to maintain overlay continuity
        // The overlay system uses the key to track which overlay belongs to which face
        // If we change the key, we'd get duplicate overlays
        
        // If somehow the key changed, we need to migrate (shouldn't happen with identity matching)
        if (existing.faceKey && existing.faceKey !== faceKey) {
            console.warn(`Face key changed from ${existing.faceKey} to ${faceKey} for ${faceData.name}`);
            // Migrate to new key
            oldKeyToRemove = existing.faceKey;
            existing.faceKey = faceKey;
            recognizedFacesCache.set(faceKey, existing);
            if (oldKeyToRemove) {
                recognizedFacesCache.delete(oldKeyToRemove);
                // Notify overlay system to update key (this shouldn't happen often)
                if (onFaceRemovedCallback) {
                    onFaceRemovedCallback(oldKeyToRemove);
                }
            }
        }
    }
}

/**
 * Handle an unknown face.
 * Implements confidence buffer - only prompts for registration after consistent detection.
 * 
 * @param {Object} detection - Face detection object from face-api.js
 */
function handleUnknownFace(detection) {
    // Check detection confidence - only register high-confidence detections
    if (detection.detection && detection.detection.score < MIN_CONFIDENCE_FOR_REGISTRATION) {
        return; // Skip low-confidence detections
    }
    
    const now = Date.now();
    
    // Find closest existing face key for tracking
    const closestKey = findClosestFaceKey(detection);
    const faceKey = closestKey || createFaceKey(detection);
    
    // Check if this unknown face is already in the buffer
    let unknownFace = unknownFacesBuffer.get(faceKey);
    
    if (!unknownFace) {
        // New unknown face - add to buffer with timestamp
        unknownFace = {
            firstSeen: now,
            lastSeen: now,
            detection: detection,
            key: faceKey
        };
        unknownFacesBuffer.set(faceKey, unknownFace);
        console.log('Unknown face detected - starting confidence buffer', { 
            confidence: detection.detection?.score,
            position: detection.detection?.box,
            faceKey: faceKey
        });
    } else {
        // Update last seen timestamp
        unknownFace.lastSeen = now;
        unknownFace.detection = detection; // Update with latest detection
    }
    
    // Check if this face has been consistently detected for the buffer time
    const timeSinceFirstSeen = now - unknownFace.firstSeen;
    
    if (timeSinceFirstSeen >= UNKNOWN_FACE_BUFFER_TIME_MS) {
        // Face has been consistently detected - check if we should prompt
        // Only prompt if we don't already have a pending registration for this face
        if (!pendingRegistration || pendingRegistration.key !== faceKey) {
            console.log('Unknown face confirmed after buffer period', {
                faceKey: faceKey,
                timeDetected: timeSinceFirstSeen
            });
            
            // Set as pending registration
            pendingRegistration = {
                key: faceKey,
                detection: detection,
                timestamp: now
            };
            
            // Remove from buffer (we're now handling it)
            unknownFacesBuffer.delete(faceKey);
            
            // Call callback to trigger registration prompt
            if (onNewFaceCallback) {
                onNewFaceCallback(detection, faceKey);
            }
        }
    }
}

/**
 * Clear unknown face from buffer (called when face is recognized or disappears).
 * This resets the confidence buffer for that face.
 * 
 * @param {string} faceKey - Face key to clear from buffer
 */
function clearUnknownFaceFromBuffer(faceKey) {
    if (unknownFacesBuffer.has(faceKey)) {
        unknownFacesBuffer.delete(faceKey);
        console.log('Cleared unknown face from buffer:', faceKey);
    }
}

/**
 * Clean up stale entries from unknown faces buffer.
 * Called periodically to remove faces that are no longer detected.
 */
function cleanupUnknownFacesBuffer() {
    const now = Date.now();
    const STALE_THRESHOLD = 3000; // Remove if not seen for 3 seconds
    
    for (const [faceKey, unknownFace] of unknownFacesBuffer.entries()) {
        if (now - unknownFace.lastSeen > STALE_THRESHOLD) {
            unknownFacesBuffer.delete(faceKey);
            console.log('Removed stale unknown face from buffer:', faceKey);
        }
    }
}

/**
 * Create a unique key for a face based on its position and size.
 * Used to track faces across frames and reduce false positives.
 * 
 * @param {Object} detection - Face detection object
 * @returns {string} Unique key for the face
 */
function createFaceKey(detection) {
    if (!detection || !detection.detection || !detection.detection.box) {
        return `face_${Date.now()}_${Math.random()}`;
    }
    
    const box = detection.detection.box;
    // Use center point and size for more stable tracking
    const centerX = Math.round((box.x + box.width / 2) / 25) * 25;
    const centerY = Math.round((box.y + box.height / 2) / 25) * 25;
    const size = Math.round(box.width / 20) * 20;
    return `face_${centerX}_${centerY}_${size}`;
}

/**
 * Find closest existing face in cache by position
 * Helps match faces across frames even with movement
 * 
 * @param {Object} detection - New detection
 * @returns {string|null} Closest face key or null
 */
function findClosestFaceKey(detection) {
    if (!detection || !detection.detection || !detection.detection.box) {
        return null;
    }
    
    const box = detection.detection.box;
    const centerX = box.x + box.width / 2;
    const centerY = box.y + box.height / 2;
    
    let closestKey = null;
    let minDistance = FACE_TRACKING_DISTANCE_THRESHOLD;
    
    for (const [key, cached] of recognizedFacesCache.entries()) {
        if (!cached.detection || !cached.detection.detection || !cached.detection.detection.box) {
            continue;
        }
        
        const cachedBox = cached.detection.detection.box;
        const cachedCenterX = cachedBox.x + cachedBox.width / 2;
        const cachedCenterY = cachedBox.y + cachedBox.height / 2;
        
        const distance = Math.sqrt(
            Math.pow(centerX - cachedCenterX, 2) + 
            Math.pow(centerY - cachedCenterY, 2)
        );
        
        if (distance < minDistance) {
            minDistance = distance;
            closestKey = key;
        }
    }
    
    return closestKey;
}

// Removed isTooCloseToRecognizedFace - using position-based deduplication instead
// This is handled in the detection loop to prevent processing the same face twice

/**
 * Clean up recognized faces cache.
 * Removes faces that are no longer detected.
 * 
 * @param {Array} currentDetections - Currently detected faces
 */
function cleanupRecognizedFacesCache(currentDetections) {
    const now = Date.now();
    // Use longer timeout for recognized faces to handle angle changes
    const CACHE_TIMEOUT = RECOGNIZED_FACE_CACHE_TIMEOUT;
    
    // Create set of current detection positions (using closest matching for tracking)
    const currentFacePositions = new Set();
    for (const detection of currentDetections) {
        if (detection && detection.detection && detection.detection.box) {
            const box = detection.detection.box;
            const centerX = box.x + box.width / 2;
            const centerY = box.y + box.height / 2;
            // Use rounded position for matching
            const positionKey = `${Math.round(centerX / 25) * 25}_${Math.round(centerY / 25) * 25}`;
            currentFacePositions.add(positionKey);
        }
    }
    
    // Track which cached faces are still visible
    const stillVisible = new Set();
    for (const [key, cached] of recognizedFacesCache.entries()) {
        if (cached.detection && cached.detection.detection && cached.detection.detection.box) {
            const box = cached.detection.detection.box;
            const centerX = box.x + box.width / 2;
            const centerY = box.y + box.height / 2;
            const positionKey = `${Math.round(centerX / 25) * 25}_${Math.round(centerY / 25) * 25}`;
            
            // Check if this position is still occupied
            if (currentFacePositions.has(positionKey)) {
                stillVisible.add(key);
            } else {
                // Face moved or disappeared - check timeout
                if (now - cached.lastSeen > CACHE_TIMEOUT) {
                    // Call removal callback before deleting
                    if (onFaceRemovedCallback) {
                        onFaceRemovedCallback(key);
                    }
                    // Remove from cache
                    recognizedFacesCache.delete(key);
                    console.log(`Removed face from cache: ${cached.faceData?.name || 'Unknown'}`);
                }
            }
        }
    }
    
    // Clean up pending registration if face is no longer detected
    if (pendingRegistration && pendingRegistration.detection) {
        const box = pendingRegistration.detection.detection?.box;
        if (box) {
            const centerX = box.x + box.width / 2;
            const centerY = box.y + box.height / 2;
            const positionKey = `${Math.round(centerX / 25) * 25}_${Math.round(centerY / 25) * 25}`;
            
            if (!currentFacePositions.has(positionKey) && 
                now - pendingRegistration.timestamp > CACHE_TIMEOUT) {
                console.log('Clearing stale pending registration');
                pendingRegistration = null;
            }
        }
    }
}

/**
 * Set the current user ID for face operations.
 * 
 * @param {string} userId - User ID
 */
export function setUserId(userId) {
    currentUserId = userId || 'default';
    console.log('Face recognition userId set to:', currentUserId);
}

/**
 * Get the current user ID.
 * 
 * @returns {string} Current user ID
 */
export function getUserId() {
    return currentUserId;
}

/**
 * Register a new face.
 * Saves the face to Firebase and adds it to known faces.
 * 
 * @param {string} name - Name of the person
 * @param {string} notes - Additional notes about the person
 * @param {Object} detection - Face detection object with descriptor
 * @param {string} [userId] - Optional user ID (defaults to currentUserId)
 * @returns {Promise<string>} Document ID of the saved face
 */
export async function registerFace(name, notes, detection, userId = null, isSelf = false) {
    try {
        if (!detection || !detection.descriptor) {
            throw new Error('Invalid detection: missing descriptor');
        }
        
        const faceUserId = userId || currentUserId;
        
        // Save to Firebase
        const faceId = await addFace({
            name: name,
            notes: notes || '',
            embedding: detection.descriptor,
            userId: faceUserId,
            isSelf: isSelf
        });
        
        // Add to known faces array
        const newFace = {
            id: faceId,
            name: name,
            notes: notes || '',
            embedding: detection.descriptor,
            userId: faceUserId,
            isSelf: isSelf
        };
        
        knownFaces.push(newFace);
        
        // Clear pending registration
        pendingRegistration = null;
        
        console.log(`Face registered: ${name} (ID: ${faceId}, User: ${faceUserId}, isSelf: ${isSelf})`);
        return faceId;
    } catch (error) {
        console.error('Error registering face:', error);
        throw error;
    }
}

/**
 * Load known faces from Firebase.
 * Filters faces by current user ID.
 * 
 * @returns {Promise<void>}
 */
async function loadKnownFaces() {
    try {
        console.log('Loading known faces from Firebase...');
        
        // Get faces for current user (server-side filtered)
        knownFaces = await getFacesByUser(currentUserId);
        
        // Also load 'default' faces for backward compatibility if needed
        // (Only if currentUserId is not 'default' to avoid duplicate loading)
        if (currentUserId !== 'default') {
            try {
                const defaultFaces = await getFacesByUser('default');
                knownFaces = [...knownFaces, ...defaultFaces];
            } catch (error) {
                console.warn('Could not load default faces:', error);
            }
        }
        
        console.log(`Loaded ${knownFaces.length} known faces for user: ${currentUserId}`);
    } catch (error) {
        console.error('Error loading known faces:', error);
        knownFaces = [];
    }
}

/**
 * Reload known faces from Firebase.
 * Useful after registering a new face.
 * 
 * @returns {Promise<void>}
 */
export async function reloadKnownFaces() {
    await loadKnownFaces();
}

/**
 * Get currently recognized faces with their tracking keys.
 * 
 * @returns {Array} Array of { faceData, detection, faceKey }
 */
export function getRecognizedFaces() {
    return Array.from(recognizedFacesCache.entries()).map(([key, cached]) => ({
        faceKey: key,
        faceData: cached.faceData,
        detection: cached.detection
    }));
}

/**
 * Get all active faces (recognized and unknown) with their positions.
 * Useful for displaying overlays.
 * 
 * @returns {Array} Array of face objects with detection info
 */
export function getAllActiveFaces() {
    const faces = [];
    
    // Add recognized faces
    for (const [key, cached] of recognizedFacesCache.entries()) {
        if (cached.detection) {
            faces.push({
                faceKey: key,
                faceData: cached.faceData,
                detection: cached.detection,
                isRecognized: true
            });
        }
    }
    
    // Add pending unknown face if exists
    if (pendingRegistration && pendingRegistration.detection) {
        faces.push({
            faceKey: pendingRegistration.key,
            faceData: { name: 'Unknown', notes: '' },
            detection: pendingRegistration.detection,
            isRecognized: false
        });
    }
    
    return faces;
}

/**
 * Get pending registration (if any).
 * 
 * @returns {Object|null} Pending registration or null
 */
export function getPendingRegistration() {
    return pendingRegistration ? pendingRegistration.detection : null;
}

/**
 * Clear pending registration.
 */
export function clearPendingRegistration() {
    pendingRegistration = null;
}

/**
 * Get current recognition status.
 * 
 * @returns {boolean} True if recognition is active
 */
export function isActive() {
    return isRecognizing;
}
