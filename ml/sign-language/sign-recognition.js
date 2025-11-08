/**
 * Sign Language Recognition Module
 * 
 * Provides ASL gesture recognition using MediaPipe Hands and TensorFlow.js
 * 
 * Features:
 * - MediaPipe Hands integration for real-time hand landmark detection
 * - TensorFlow.js ASL alphabet classifier (A-Z)
 * - Temporal landmark buffering (15-30 frames) for word-level recognition
 * - AR text overlay display via captions container
 */

import { Hands } from '@mediapipe/hands';
import * as tf from '@tensorflow/tfjs';

// Import element click registry for pinch-to-click functionality
// This allows direct handler invocation, bypassing browser security restrictions
let getClickHandler = null;
let elementClickRegistry = null;

// Configuration constants
const LANDMARK_BUFFER_SIZE = 30; // Frame buffer for temporal analysis
const PROCESSING_THROTTLE = 3; // Process every Nth frame for performance
const MIN_CONFIDENCE = 0.7; // Minimum confidence threshold for predictions
const ASL_ALPHABET = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 
                      'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z'];

// Module state
let hands = null;
let aslModel = null;
let isDetecting = false;
let isInitialized = false;
let isMediaPipeReady = false; // Track if MediaPipe is fully loaded and ready
let videoElement = null;
let landmarkBuffer = [];
let frameCount = 0;
let lastPrediction = null;
let predictionTimeout = null;
let displayCallback = null;
let animationFrameId = null;

// Pinch detection state
let PINCH_THRESHOLD = 0.05; // Distance threshold for pinch detection (tune as needed)
const PINCH_DEBOUNCE_FRAMES = 3; // Number of consecutive frames to confirm state change
let pinchStateHistory = []; // History of pinch states for debouncing
let currentPinchState = false; // Current debounced pinch state
let pinchStatusElement = null; // DOM element for pinch status display

// Pinch-to-click state
let pinchToClickEnabled = false; // Whether pinch-to-click is enabled
let lastPinchState = false; // Previous pinch state for detecting transitions
let pinchOverlayCanvas = null; // Canvas for visual feedback
let pinchOverlayCtx = null; // Canvas 2D context
let lastClickTime = 0; // Timestamp of last click to prevent spam
const CLICK_DEBOUNCE_MS = 300; // Minimum time between clicks (ms)
let lastPinchClickLocation = null; // Last location where we triggered a click
const MIN_PINCH_MOVE_DISTANCE = 0.05; // Minimum normalized distance to trigger new click while pinched
let pinchLocation = null; // Current pinch location {x, y}

// Middle finger pinch drag state
let middlePinchDragEnabled = false; // Whether middle finger drag is enabled
let isMiddlePinchActive = false; // Current middle finger pinch state
let lastMiddlePinchState = false; // Previous middle finger pinch state
let middlePinchStateHistory = []; // History for debouncing
let draggingButtonId = null; // ID of button being dragged
let dragStartLocation = null; // Starting location of drag with offset {x, y, offsetX, offsetY}
let middlePinchLocation = null; // Current middle finger pinch location {x, y}
const MIDDLE_PINCH_THRESHOLD = 0.05; // Threshold for middle finger pinch detection
const MIDDLE_PINCH_DEBOUNCE_FRAMES = 3; // Frames to debounce middle finger pinch

// ASL model configuration
const MODEL_CONFIG = {
    // Local model path (place model.json and weights in assets/ml-models/sign-language/)
    localPath: '/assets/ml-models/sign-language/model.json',
    // CDN fallback (if you have a model hosted elsewhere)
    cdnPath: null, // e.g., 'https://your-cdn.com/models/asl-alphabet/model.json'
    // Model input shape: [batch, sequence_length, landmarks]
    // For static alphabet: [1, 63] (21 landmarks * 3 coordinates)
    // For temporal: [1, sequence_length, 63]
    inputShape: [1, 63], // Single frame: 21 landmarks * (x, y, z)
    useTemporal: false, // Set to true when using sequence-based models
};

/**
 * Initialize sign language recognition
 * Lazy-loads MediaPipe and TensorFlow.js model
 */
export async function initSignRecognition() {
    if (isInitialized) {
        console.log('Sign language recognition already initialized');
        return true;
    }

    try {
        // Initialize MediaPipe Hands
        await initializeMediaPipe();
        
        // Load TensorFlow.js ASL model (optional - will work with MediaPipe alone for testing)
        await loadASLModel();
        
        isInitialized = true;
        console.log('Sign language recognition initialized successfully');
        return true;
    } catch (error) {
        console.error('Error initializing sign language recognition:', error);
        isInitialized = false;
        return false;
    }
}

/**
 * Initialize MediaPipe Hands
 */
async function initializeMediaPipe() {
    try {
        // MediaPipe Hands configuration
        // When using from npm, MediaPipe automatically resolves files from node_modules
        // We only need to provide locateFile if files aren't found automatically
        hands = new Hands({
            locateFile: (file) => {
                // MediaPipe Hands needs to load various asset files (WASM, models, etc.)
                // In Vite, we can serve from node_modules or use a CDN
                // Using the installed package version for consistency
                const packageVersion = '0.4.1675469240';
                
                // Use jsdelivr CDN which properly serves npm packages
                // jsdelivr has better compatibility with MediaPipe's file structure
                const baseUrl = `https://cdn.jsdelivr.net/npm/@mediapipe/hands@${packageVersion}`;
                
                // Return the file path - MediaPipe will construct the full URL
                // Note: MediaPipe may request files with paths like:
                // - "hands_solution_packed_assets.data"
                // - "third_party/mediapipe/modules/palm_detection/palm_detection_lite.tflite"
                // - "_wasm/hands_solution_packed_assets_loader.js"
                return `${baseUrl}/${file}`;
            }
        });

        // Configure MediaPipe Hands options
        hands.setOptions({
            maxNumHands: 2, // Support both hands
            modelComplexity: 0, // Use lite model (0 = lite, faster, less accurate)
            minDetectionConfidence: 0.5, // Minimum confidence to detect hands
            minTrackingConfidence: 0.5 // Minimum confidence to track hands
        });

        // Set up callback for when hands are detected
        hands.onResults(onHandsResults);
        
        // Wait for MediaPipe to be fully ready before marking as initialized
        // MediaPipe needs to load WASM files, models, and all dependencies
        // Processing frames before this completes causes "Aborted (Assertion failed)" errors
        console.log('MediaPipe Hands initializing...');
        console.log('Waiting for assets to load from CDN...');
        
        // Wait for MediaPipe to complete loading
        // Use a test frame approach to verify MediaPipe is actually ready
        const ready = await waitForMediaPipeReadyWithTest();
        
        if (!ready) {
            console.error('MediaPipe failed to initialize properly');
            console.error('This may be due to:');
            console.error('1. Slow internet connection (MediaPipe files are large)');
            console.error('2. CDN access issues');
            console.error('3. Browser compatibility issues');
            isMediaPipeReady = false;
            throw new Error('MediaPipe initialization failed - assets not loading');
        }
        
        console.log('MediaPipe Hands initialization complete and verified');
    } catch (error) {
        console.error('Error initializing MediaPipe Hands:', error);
        console.error('MediaPipe may not be fully compatible with this setup');
        isMediaPipeReady = false;
        throw error;
    }
}

/**
 * Wait for MediaPipe to be fully ready by testing with a dummy frame
 * This is more reliable than just waiting a fixed time
 */
async function waitForMediaPipeReadyWithTest() {
    console.log('Waiting for MediaPipe to load assets from CDN...');
    console.log('This requires downloading large files - may take 30-60 seconds on slow connections');
    
    // First, check if CDN is accessible
    const packageVersion = '0.4.1675469240';
    const testUrl = `https://cdn.jsdelivr.net/npm/@mediapipe/hands@${packageVersion}/hands_solution_packed_assets.data`;
    
    console.log('Testing CDN accessibility...');
    try {
        const response = await fetch(testUrl, { method: 'HEAD', mode: 'no-cors' });
        console.log('CDN appears accessible');
    } catch (error) {
        console.warn('CDN accessibility test failed (may be CORS, but files might still load)');
    }
    
    // Wait initial period for basic loading
    console.log('Waiting 10 seconds for initial asset loading...');
    await new Promise(resolve => setTimeout(resolve, 10000));
    console.log('Initial wait complete, testing MediaPipe readiness...');
    
    // Try to detect if MediaPipe is ready by checking if we can send a test frame
    // We'll create a small test canvas to avoid using the video element
    const maxAttempts = 15; // Increased attempts for slow connections
    let attempts = 0;
    let lastError = null;
    
    while (attempts < maxAttempts) {
        attempts++;
        console.log(`Testing MediaPipe readiness (attempt ${attempts}/${maxAttempts})...`);
        
        try {
            // Create a small test canvas
            const testCanvas = document.createElement('canvas');
            testCanvas.width = 640; // Use realistic size
            testCanvas.height = 480;
            const ctx = testCanvas.getContext('2d');
            ctx.fillStyle = '#000000';
            ctx.fillRect(0, 0, 640, 480);
            
            // Try to send a test frame to MediaPipe
            // If it succeeds without errors, MediaPipe is ready
            try {
                await new Promise((resolve, reject) => {
                    const timeout = setTimeout(() => {
                        reject(new Error('Test timeout - MediaPipe not responding'));
                    }, 5000); // Longer timeout
                    
                    // Send test frame
                    hands.send({ image: testCanvas }).then(() => {
                        clearTimeout(timeout);
                        resolve();
                    }).catch(error => {
                        clearTimeout(timeout);
                        reject(error);
                    });
                });
                
                // If we get here, the test succeeded
                console.log('✅ MediaPipe test frame succeeded - MediaPipe is ready!');
                isMediaPipeReady = true;
                return true;
                
            } catch (error) {
                lastError = error;
                // Check if it's an assertion/buffer error (MediaPipe not ready)
                const errorMsg = error.message || error.toString();
                const errorString = error.toString();
                
                if (errorMsg.includes('Aborted') || 
                    errorString.includes('Aborted') ||
                    errorMsg.includes('Assertion') ||
                    errorString.includes('Assertion') ||
                    errorMsg.includes('buffer') ||
                    errorMsg.includes('undefined') ||
                    errorString.includes('buffer') ||
                    errorString.includes('undefined')) {
                    // MediaPipe not ready yet, wait and retry
                    const waitTime = attempts < 5 ? 5000 : 10000; // Wait longer on later attempts
                    console.log(`MediaPipe not ready yet (attempt ${attempts}/${maxAttempts}) - waiting ${waitTime/1000} seconds...`);
                    console.log(`Error: ${errorMsg.substring(0, 100)}...`);
                    await new Promise(resolve => setTimeout(resolve, waitTime));
                    continue;
                } else if (errorMsg.includes('timeout')) {
                    // Timeout - MediaPipe not responding, wait longer
                    console.log(`MediaPipe not responding (attempt ${attempts}) - waiting 10 seconds...`);
                    await new Promise(resolve => setTimeout(resolve, 10000));
                    continue;
                } else {
                    // Other error - might be ready but test failed for other reasons
                    console.log('MediaPipe test had non-critical error, assuming ready');
                    console.log('Error:', errorMsg);
                    isMediaPipeReady = true;
                    return true;
                }
            }
        } catch (error) {
            // Test setup failed, wait and retry
            console.log(`Test setup failed (attempt ${attempts}), waiting...`);
            await new Promise(resolve => setTimeout(resolve, 5000));
            continue;
        }
    }
    
    // If we get here, MediaPipe never became ready
    console.error('❌ MediaPipe failed to become ready after', maxAttempts, 'attempts (~', (maxAttempts * 5), 'seconds)');
    console.error('Last error:', lastError);
    console.error('MediaPipe assets may not be loading properly from CDN');
    console.error('Possible issues:');
    console.error('1. Slow internet connection - MediaPipe files are large (10+ MB)');
    console.error('2. CDN access blocked or restricted');
    console.error('3. Browser compatibility issues');
    console.error('4. Network firewall blocking CDN requests');
    console.error('');
    console.error('Solutions:');
    console.error('1. Check Network tab in DevTools - are MediaPipe files loading?');
    console.error('2. Try a different browser (Chrome/Edge recommended)');
    console.error('3. Check internet connection speed');
    console.error('4. Wait longer (some connections need 1-2 minutes)');
    console.error('5. Serve MediaPipe files locally (see docs/MEDIAPIPE_CDN_ISSUES.md)');
    
    isMediaPipeReady = false;
    return false;
}

/**
 * Load TensorFlow.js ASL classification model
 */
async function loadASLModel() {
    try {
        // Try loading from local path first
        try {
            aslModel = await tf.loadLayersModel(MODEL_CONFIG.localPath);
            console.log('ASL model loaded from local path');
            return;
        } catch (localError) {
            console.warn('Could not load model from local path, trying CDN...', localError);
        }

        // Try CDN fallback if configured
        if (MODEL_CONFIG.cdnPath) {
            try {
                aslModel = await tf.loadLayersModel(MODEL_CONFIG.cdnPath);
                console.log('ASL model loaded from CDN');
                return;
            } catch (cdnError) {
                console.warn('Could not load model from CDN', cdnError);
            }
        }

        // If no model is available, log warning but continue
        // MediaPipe will still detect hands, just no classification
        console.warn('No ASL model available. Hand detection will work, but classification requires a model.');
        console.warn('Place a TensorFlow.js model at:', MODEL_CONFIG.localPath);
        aslModel = null;
    } catch (error) {
        console.error('Error loading ASL model:', error);
        aslModel = null;
    }
}

/**
 * Set video element for processing
 */
export function setVideoElement(video) {
    if (video && video instanceof HTMLVideoElement) {
        videoElement = video;
        console.log('Video element set for sign language recognition');
    } else {
        console.warn('Invalid video element provided to setVideoElement');
    }
}

/**
 * Set callback for displaying recognized signs
 */
export function setDisplayCallback(callback) {
    displayCallback = callback;
}

/**
 * Set element click registry and handler getter for pinch-to-click
 * This allows direct handler invocation, bypassing browser security restrictions
 * @param {Object} registry - Element click registry object
 * @param {Function} handlerGetter - Function to get click handler for an element
 */
export function setClickRegistry(registry, handlerGetter) {
    elementClickRegistry = registry;
    getClickHandler = handlerGetter;
    console.log('Element click registry set for pinch-to-click', {
        registryKeys: registry ? Object.keys(registry) : 'null',
        hasHandlerGetter: typeof handlerGetter === 'function'
    });
}

/**
 * Start sign language detection
 */
export async function startDetection() {
    if (isDetecting) {
        console.log('Sign language detection already running');
        return;
    }

    if (!isInitialized) {
        console.error('Sign language recognition not initialized. Call initSignRecognition() first.');
        return;
    }

    if (!videoElement) {
        console.error('Video element not set. Call setVideoElement() first.');
        return;
    }

    if (!hands) {
        console.error('MediaPipe Hands not initialized');
        return;
    }

    // MediaPipe should already be ready from initialization
    // But double-check before starting
    if (!isMediaPipeReady) {
        console.error('MediaPipe is not ready - initialization may have failed');
        console.error('Please check the console for MediaPipe loading errors');
        throw new Error('MediaPipe not ready - cannot start detection');
    }
    
    console.log('Starting frame processing - MediaPipe is ready');

    isDetecting = true;
    landmarkBuffer = []; // Reset buffer
    frameCount = 0;
    
    // Initialize pinch detection state
    pinchStateHistory = [];
    currentPinchState = false;
    lastPinchState = false;
    middlePinchStateHistory = [];
    isMiddlePinchActive = false;
    lastMiddlePinchState = false;
    draggingButtonId = null;
    dragStartLocation = null;
    
    // Initialize pinch status element
    pinchStatusElement = document.getElementById('pinch-text');
    const pinchContainer = document.getElementById('pinch-status');
    if (pinchContainer && !pinchContainer.classList.contains('hidden')) {
        // Ensure it starts hidden until hand is detected
        pinchContainer.classList.add('hidden');
    }
    
    // Enable middle finger pinch drag by default when sign language is enabled
    middlePinchDragEnabled = true;
    
    // Initialize pinch overlay canvas for visual feedback
    initializePinchOverlay();
    
    // Start processing loop using requestAnimationFrame
    processVideoFrames();
    console.log('Sign language detection started');
}

/**
 * Process video frames in a loop
 */
function processVideoFrames() {
    if (!isDetecting || !videoElement || !hands) {
        return;
    }

    // CRITICAL: Don't process frames until MediaPipe is fully ready
    // Processing frames before MediaPipe is ready causes "memory access out of bounds" errors
    if (!isMediaPipeReady) {
        // Wait a bit more and try again
        animationFrameId = requestAnimationFrame(processVideoFrames);
        return;
    }

    // Throttle processing for performance
    frameCount++;
    if (frameCount % PROCESSING_THROTTLE === 0) {
        // Only process if video is ready and playing with valid dimensions
        if (videoElement.readyState >= 2 && 
            !videoElement.paused && 
            videoElement.videoWidth > 0 && 
            videoElement.videoHeight > 0) {
            
            try {
                // Validate video dimensions before sending
                // MediaPipe requires valid dimensions to allocate WASM memory correctly
                if (videoElement.videoWidth < 64 || videoElement.videoHeight < 64) {
                    // Video too small, skip this frame
                    animationFrameId = requestAnimationFrame(processVideoFrames);
                    return;
                }

                // Send frame to MediaPipe for processing
                // CRITICAL: Only send if MediaPipe is confirmed ready
                if (!isMediaPipeReady) {
                    // Skip this frame - MediaPipe isn't ready yet
                    animationFrameId = requestAnimationFrame(processVideoFrames);
                    return;
                }
                
                // Validate video element is in a good state before sending
                if (!videoElement || videoElement.readyState < 2) {
                    // Video not ready, skip this frame
                    animationFrameId = requestAnimationFrame(processVideoFrames);
                    return;
                }
                
                // Send frame to MediaPipe
                // Wrap in try-catch to handle any synchronous errors
                try {
                    const sendPromise = hands.send({ image: videoElement });
                    
                    // Handle the promise
                    sendPromise.catch(error => {
                        const errorMessage = error.message || error.toString();
                        const errorString = error.toString();
                        
                        // Check for WASM assertion failures (critical errors)
                        const isAssertionFailure = 
                            errorMessage.includes('Aborted') ||
                            errorMessage.includes('Assertion failed') ||
                            errorString.includes('Aborted') ||
                            errorString.includes('Assertion failed');
                        
                        // Check for initialization errors
                        const isInitializationError = 
                            errorMessage.includes('fetch') || 
                            errorMessage.includes('Failed to load') ||
                            errorMessage.includes('404') ||
                            errorMessage.includes('NetworkError');
                        
                        // Check for memory errors
                        const isMemoryError =
                            errorMessage.includes('memory') ||
                            errorMessage.includes('out of bounds') ||
                            errorMessage.includes('RuntimeError');
                        
                        // If we get assertion failures, MediaPipe isn't ready
                        // STOP processing immediately - don't retry automatically
                        if (isAssertionFailure) {
                            console.error('MediaPipe assertion failure - STOPPING frame processing');
                            console.error('MediaPipe is still loading assets. Please wait and try again.');
                            isMediaPipeReady = false;
                            isDetecting = false; // Stop detection completely
                            
                            // Stop the animation frame loop
                            if (animationFrameId) {
                                cancelAnimationFrame(animationFrameId);
                                animationFrameId = null;
                            }
                            
                            // Don't auto-retry - user needs to wait for MediaPipe to fully load
                            // and then manually re-enable the feature
                            if (displayCallback) {
                                displayCallback('MediaPipe still loading - please wait and try again', true);
                            }
                            return;
                        }
                        
                        // Log other errors only if MediaPipe should be ready
                        if (isMediaPipeReady && !isInitializationError && !isMemoryError) {
                            console.error('Error processing frame:', error);
                        } else if (!isMediaPipeReady && (isMemoryError || isInitializationError)) {
                            // Expected during initialization - don't log
                            return;
                        }
                    });
                } catch (syncError) {
                    // Handle synchronous errors (shouldn't happen, but be safe)
                    const errorMessage = syncError.message || syncError.toString();
                    if (errorMessage.includes('Aborted') || errorMessage.includes('Assertion') || 
                        errorMessage.includes('buffer') || errorMessage.includes('undefined')) {
                        console.error('MediaPipe synchronous error - STOPPING frame processing');
                        console.error('Error:', syncError);
                        isMediaPipeReady = false;
                        isDetecting = false; // Stop detection completely
                        
                        // Stop the animation frame loop
                        if (animationFrameId) {
                            cancelAnimationFrame(animationFrameId);
                            animationFrameId = null;
                        }
                        
                        if (displayCallback) {
                            displayCallback('MediaPipe error - please disable and re-enable the feature', true);
                        }
                    } else {
                        console.error('Synchronous error sending frame:', syncError);
                    }
                }
            } catch (error) {
                // Handle synchronous errors (like invalid video element)
                const errorMessage = error.message || error.toString();
                if (errorMessage.includes('memory') || errorMessage.includes('out of bounds') ||
                    errorMessage.includes('buffer') || errorMessage.includes('undefined') ||
                    errorMessage.includes('Aborted') || errorMessage.includes('Assertion')) {
                    // Critical error - MediaPipe not ready, stop processing
                    console.error('MediaPipe critical error - STOPPING frame processing');
                    isMediaPipeReady = false;
                    isDetecting = false; // Stop detection completely
                    
                    // Stop the animation frame loop
                    if (animationFrameId) {
                        cancelAnimationFrame(animationFrameId);
                        animationFrameId = null;
                    }
                    
                    if (displayCallback) {
                        displayCallback('MediaPipe error - please wait and try again', true);
                    }
                } else {
                    console.error('Error sending frame to MediaPipe:', error);
                }
            }
        }
    }

    // Continue processing
    animationFrameId = requestAnimationFrame(processVideoFrames);
}

/**
 * Stop sign language detection
 */
export function stopDetection() {
    if (!isDetecting) {
        return;
    }

    isDetecting = false;
    
    // Stop animation frame loop
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }
    
    // Clear buffers and timeouts
    landmarkBuffer = [];
    frameCount = 0;
    lastPrediction = null;
    
    if (predictionTimeout) {
        clearTimeout(predictionTimeout);
        predictionTimeout = null;
    }

    // Clear pinch detection state
    pinchStateHistory = [];
    currentPinchState = false;
    lastPinchState = false;
    updatePinchStatus(false, false); // Hide pinch status
    
    // Clear pinch-to-click visual feedback
    if (pinchToClickEnabled) {
        clearPinchVisualFeedback();
    }

    // Clear display
    if (displayCallback) {
        displayCallback('', false);
    }

    console.log('Sign language detection stopped');
}

/**
 * Handle MediaPipe Hands results
 */
function onHandsResults(results) {
    if (!isDetecting) {
        return;
    }

    // Extract hand landmarks
    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        // Process each detected hand (use first hand for pinch detection)
        const primaryHand = results.multiHandLandmarks[0];
        processHandLandmarks(primaryHand);
        
        // Process remaining hands if needed (for multi-hand support)
        if (results.multiHandLandmarks.length > 1) {
            for (let i = 1; i < results.multiHandLandmarks.length; i++) {
                // Process additional hands for gesture classification if needed
                const normalizedLandmarks = normalizeLandmarks(results.multiHandLandmarks[i]);
                landmarkBuffer.push(normalizedLandmarks);
                if (landmarkBuffer.length > LANDMARK_BUFFER_SIZE) {
                    landmarkBuffer.shift();
                }
            }
        }
    } else {
        // No hands detected - clear pinch state and buffer after delay
        updatePinchStatus(false, false); // Force update to "not pinched"
        pinchStateHistory = []; // Clear debounce history
        
        if (landmarkBuffer.length > 0) {
            setTimeout(() => {
                if (landmarkBuffer.length > 0 && !isDetecting) {
                    landmarkBuffer = [];
                }
            }, 1000);
        }
    }
}

/**
 * Process hand landmarks and classify gesture
 */
async function processHandLandmarks(landmarks) {
    // Normalize landmarks (MediaPipe provides normalized coordinates 0-1)
    const normalizedLandmarks = normalizeLandmarks(landmarks);
    
    // Add to buffer for temporal analysis
    landmarkBuffer.push(normalizedLandmarks);
    
    // Maintain buffer size (sliding window)
    if (landmarkBuffer.length > LANDMARK_BUFFER_SIZE) {
        landmarkBuffer.shift(); // Remove oldest frame
    }

    // Detect pinch gesture
    detectPinch(landmarks);

    // Classify gesture
    if (aslModel) {
        await classifyGesture(normalizedLandmarks);
    } else {
        // No model available - just log that hands are detected
        console.log('Hands detected (no model for classification)');
    }
}

/**
 * Calculate Euclidean distance between two points
 * @param {Object} pointA - Point with x, y, z coordinates
 * @param {Object} pointB - Point with x, y, z coordinates
 * @returns {number} Distance between the two points
 */
function getDistance(pointA, pointB) {
    const dx = pointA.x - pointB.x;
    const dy = pointA.y - pointB.y;
    const dz = (pointA.z || 0) - (pointB.z || 0);
    
    // Use 2D distance for pinch detection (x, y only)
    // Can optionally use 3D: return Math.sqrt(dx * dx + dy * dy + dz * dz);
    return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Detect pinch gesture from hand landmarks
 * Detects both index finger pinch (for clicking) and middle finger pinch (for dragging)
 * @param {Array} landmarks - MediaPipe hand landmarks (21 points)
 */
function detectPinch(landmarks) {
    // Ensure we have enough landmarks
    if (!landmarks || landmarks.length < 13) {
        updatePinchStatus(false, false);
        updatePinchTypeIndicator(null);
        if (pinchToClickEnabled) {
            handlePinchRelease();
        }
        if (middlePinchDragEnabled) {
            handleMiddlePinchRelease();
        }
        return;
    }

    // Get thumb tip (index 4), index finger tip (index 8), and middle finger tip (index 12)
    const THUMB_TIP_INDEX = 4;
    const INDEX_FINGER_TIP_INDEX = 8;
    const MIDDLE_FINGER_TIP_INDEX = 12;
    
    const thumbTip = landmarks[THUMB_TIP_INDEX];
    const indexTip = landmarks[INDEX_FINGER_TIP_INDEX];
    const middleTip = landmarks[MIDDLE_FINGER_TIP_INDEX];

    if (!thumbTip || !indexTip || !middleTip) {
        updatePinchStatus(false, false);
        updatePinchTypeIndicator(null);
        if (pinchToClickEnabled) {
            handlePinchRelease();
        }
        if (middlePinchDragEnabled) {
            handleMiddlePinchRelease();
        }
        return;
    }

    // Calculate distances between thumb and both fingers
    const distIndexThumb = getDistance(thumbTip, indexTip);
    const distMiddleThumb = getDistance(thumbTip, middleTip);

    // Determine which pinch is active (or neither)
    const isIndexPinch = distIndexThumb < PINCH_THRESHOLD && distIndexThumb < distMiddleThumb;
    const isMiddlePinch = distMiddleThumb < MIDDLE_PINCH_THRESHOLD && distMiddleThumb < distIndexThumb && !isIndexPinch;
    
    // Update pinch type indicator
    if (isIndexPinch) {
        updatePinchTypeIndicator('index');
    } else if (isMiddlePinch) {
        updatePinchTypeIndicator('middle');
    } else {
        updatePinchTypeIndicator(null);
    }

    // Handle index finger pinch (for clicking)
    const pinchX = indexTip.x;
    const pinchY = indexTip.y;
    pinchLocation = { x: pinchX, y: pinchY };
    const isPinched = isIndexPinch;

    // Add to debounce history
    pinchStateHistory.push(isPinched);

    // Maintain debounce history size
    if (pinchStateHistory.length > PINCH_DEBOUNCE_FRAMES) {
        pinchStateHistory.shift(); // Remove oldest state
    }

    // Check if state is consistent across debounce frames
    if (pinchStateHistory.length >= PINCH_DEBOUNCE_FRAMES) {
        // Check if all recent frames agree on the state
        const allAgree = pinchStateHistory.every(state => state === isPinched);
        
        if (allAgree) {
            // All frames agree - update if state changed
            const stateChanged = isPinched !== currentPinchState;
            
            if (stateChanged) {
                const previousState = currentPinchState;
                currentPinchState = isPinched;
                updatePinchStatus(isPinched, true);
                
                // Handle pinch-to-click if enabled
                if (pinchToClickEnabled) {
                    console.log('🔵 Pinch-to-click enabled, state changed:', {
                        previousState,
                        newState: isPinched,
                        lastPinchState,
                        willTriggerClick: isPinched && !lastPinchState
                    });
                    
                    if (isPinched && !lastPinchState) {
                        // Pinch started - simulate click
                        console.log('🔴 Pinch STARTED - triggering click at:', { x: pinchX, y: pinchY });
                        handlePinchClick(pinchX, pinchY);
                        lastPinchClickLocation = { x: pinchX, y: pinchY };
                    } else if (!isPinched && lastPinchState) {
                        // Pinch released
                        console.log('🟢 Pinch RELEASED');
                        handlePinchRelease();
                        lastPinchClickLocation = null; // Reset location tracking
                    }
                } else {
                    // Debug: Log why pinch-to-click isn't working
                    if (isPinched && !lastPinchState) {
                        console.warn('⚠️ Pinch detected but pinch-to-click is DISABLED. Enable it in settings!');
                    }
                }
                
                // Update last pinch state AFTER checking transition
                lastPinchState = isPinched;
            } else {
                // State didn't change - but if we're pinched and pinch-to-click is enabled,
                // we might want to trigger a click if the location changed significantly
                // For now, just update display
                if (pinchStateHistory.length === PINCH_DEBOUNCE_FRAMES) {
                    // Initial state - ensure display is updated
                    updatePinchStatus(isPinched, true);
                }
                
                // If already pinched and pinch-to-click is enabled, check if location moved significantly
                if (pinchToClickEnabled && isPinched) {
                    // Check if pinch location moved significantly since last click
                    if (lastPinchClickLocation) {
                        const moveDistance = getDistance(
                            { x: pinchX, y: pinchY },
                            lastPinchClickLocation
                        );
                        
                        if (moveDistance > MIN_PINCH_MOVE_DISTANCE) {
                            // Pinch location moved significantly - trigger click at new location
                            console.log('🔴 Pinch MOVED - triggering click at new location:', {
                                x: pinchX,
                                y: pinchY,
                                moveDistance: moveDistance.toFixed(3)
                            });
                            handlePinchClick(pinchX, pinchY);
                            lastPinchClickLocation = { x: pinchX, y: pinchY };
                        }
                    } else {
                        // First time pinched - set initial location
                        lastPinchClickLocation = { x: pinchX, y: pinchY };
                    }
                }
            }
            
            // Handle middle finger pinch (for dragging buttons) - process separately
            processMiddleFingerPinch(isMiddlePinch, middleTip, thumbTip);
            
            // Update visual feedback if enabled
            if (pinchToClickEnabled && isPinched) {
                updatePinchVisualFeedback(pinchX, pinchY);
            } else if (pinchToClickEnabled && !isPinched) {
                clearPinchVisualFeedback();
            }
        } else {
            // Frames don't agree yet - still debouncing
            // But we can still update visual feedback if enabled and pinched
            if (pinchToClickEnabled && isPinched) {
                updatePinchVisualFeedback(pinchX, pinchY);
            }
            
            // Still process middle finger pinch even if index finger state is debouncing
            processMiddleFingerPinch(isMiddlePinch, middleTip, thumbTip);
        }
        // If frames don't agree, keep current state (prevents flickering)
    } else {
        // Not enough frames yet - use current detection for initial display
        if (pinchStateHistory.length === 1) {
            // First frame - set initial state
            currentPinchState = isPinched;
            updatePinchStatus(isPinched, true);
        }
    }
    
    // Update last pinch state
    lastPinchState = isPinched;
}

/**
 * Update pinch status display in the UI
 * @param {boolean} isPinched - Whether hand is currently pinched
 * @param {boolean} handDetected - Whether a hand is detected
 */
function updatePinchStatus(isPinched, handDetected) {
    // Get or create pinch status element
    if (!pinchStatusElement) {
        pinchStatusElement = document.getElementById('pinch-text');
        const pinchContainer = document.getElementById('pinch-status');
        
        if (!pinchStatusElement || !pinchContainer) {
            // Elements not found - create them if needed
            console.warn('Pinch status elements not found in DOM');
            return;
        }
    }

    // Show/hide based on hand detection
    const pinchContainer = document.getElementById('pinch-status');
    if (pinchContainer) {
        if (handDetected && isDetecting) {
            pinchContainer.classList.remove('hidden');
        } else {
            pinchContainer.classList.add('hidden');
            return;
        }
    }

    // Update text and styling
    if (isPinched) {
        pinchStatusElement.textContent = 'pinch';
        pinchStatusElement.classList.remove('not-pinched');
        pinchStatusElement.classList.add('pinched');
    } else {
        pinchStatusElement.textContent = 'not pinched';
        pinchStatusElement.classList.remove('pinched');
        pinchStatusElement.classList.add('not-pinched');
    }
}

/**
 * Normalize landmarks for model input
 * MediaPipe provides normalized coordinates (0-1), but we may need to center/scale
 */
function normalizeLandmarks(landmarks) {
    // Flatten landmarks: [x1, y1, z1, x2, y2, z2, ...]
    const flattened = [];
    
    for (const landmark of landmarks) {
        flattened.push(landmark.x);
        flattened.push(landmark.y);
        flattened.push(landmark.z || 0); // z may not always be available
    }
    
    return flattened;
}

/**
 * Classify gesture using TensorFlow.js model
 */
async function classifyGesture(landmarks) {
    if (!aslModel || landmarks.length !== 63) {
        return; // Invalid input
    }

    try {
        // Prepare input tensor
        let inputTensor;
        
        if (MODEL_CONFIG.useTemporal && landmarkBuffer.length >= 10) {
            // Use temporal sequence (last N frames)
            const sequenceLength = Math.min(landmarkBuffer.length, 30);
            const sequence = landmarkBuffer.slice(-sequenceLength);
            inputTensor = tf.tensor3d([sequence]);
        } else {
            // Use single frame (current landmarks)
            inputTensor = tf.tensor2d([landmarks]);
        }

        // Run inference
        const prediction = aslModel.predict(inputTensor);
        const predictionArray = await prediction.data();
        
        // Clean up tensors
        inputTensor.dispose();
        prediction.dispose();

        // Get predicted class (index with highest probability)
        const maxIndex = predictionArray.indexOf(Math.max(...predictionArray));
        const confidence = predictionArray[maxIndex];

        // Only display if confidence is above threshold
        if (confidence >= MIN_CONFIDENCE) {
            const predictedLetter = ASL_ALPHABET[maxIndex] || `Class ${maxIndex}`;
            
            // Debounce predictions (avoid flickering)
            if (predictedLetter !== lastPrediction) {
                lastPrediction = predictedLetter;
                displaySign(predictedLetter, confidence);
            }
        }
    } catch (error) {
        console.error('Error during gesture classification:', error);
    }
}

/**
 * Display recognized sign
 */
function displaySign(letter, confidence) {
    if (!displayCallback) {
        // Fallback to console if no callback set
        console.log(`ASL Sign: ${letter} (confidence: ${(confidence * 100).toFixed(1)}%)`);
        return;
    }

    // Format display text
    const displayText = `✋ ${letter} (${(confidence * 100).toFixed(0)}%)`;
    
    // Display via callback (will show in captions container)
    displayCallback(displayText, false);

    // Auto-clear after a delay if no new predictions
    if (predictionTimeout) {
        clearTimeout(predictionTimeout);
    }
    
    predictionTimeout = setTimeout(() => {
        if (displayCallback) {
            displayCallback('', false);
        }
        lastPrediction = null;
    }, 2000); // Clear after 2 seconds of no new predictions
}

/**
 * Check if detection is active
 */
export function isActive() {
    return isDetecting;
}

/**
 * Check if module is initialized
 */
export function isModuleInitialized() {
    return isInitialized;
}

/**
 * Set pinch detection threshold
 * @param {number} threshold - Distance threshold for pinch detection (default: 0.05)
 * Lower values = more sensitive (requires fingers closer together)
 * Higher values = less sensitive (easier to trigger)
 */
export function setPinchThreshold(threshold) {
    if (typeof threshold === 'number' && threshold > 0 && threshold < 1) {
        PINCH_THRESHOLD = threshold;
        console.log(`Pinch threshold updated to: ${threshold}`);
    } else {
        console.warn('Invalid pinch threshold. Must be a number between 0 and 1.');
    }
}

/**
 * Get current pinch threshold
 * @returns {number} Current pinch threshold value
 */
export function getPinchThreshold() {
    return PINCH_THRESHOLD;
}

/**
 * Enable or disable pinch-to-click functionality
 * @param {boolean} enabled - Whether to enable pinch-to-click
 */
export function setPinchToClickEnabled(enabled) {
    pinchToClickEnabled = enabled;
    
    if (!enabled) {
        // Clear visual feedback when disabled
        clearPinchVisualFeedback();
        lastPinchState = false;
    }
    
    console.log('Pinch-to-click', enabled ? 'enabled' : 'disabled');
}

/**
 * Check if pinch-to-click is enabled
 * @returns {boolean} Whether pinch-to-click is enabled
 */
export function isPinchToClickEnabled() {
    return pinchToClickEnabled;
}

/**
 * Update pinch type indicator (Index finger pinch / Middle finger pinch)
 * @param {string|null} pinchType - 'index', 'middle', or null
 */
function updatePinchTypeIndicator(pinchType) {
    const indicator = document.getElementById('pinch-type-indicator');
    const textElement = document.getElementById('pinch-type-text');
    
    if (!indicator || !textElement) {
        return;
    }
    
    if (pinchType === 'index') {
        indicator.classList.remove('hidden');
        textElement.textContent = 'Index finger pinch';
        textElement.classList.remove('middle-pinch');
        textElement.classList.add('index-pinch');
    } else if (pinchType === 'middle') {
        indicator.classList.remove('hidden');
        textElement.textContent = 'Middle finger pinch';
        textElement.classList.remove('index-pinch');
        textElement.classList.add('middle-pinch');
    } else {
        indicator.classList.add('hidden');
        textElement.classList.remove('index-pinch', 'middle-pinch');
    }
}

/**
 * Process middle finger pinch for drag-and-drop functionality
 * @param {boolean} isMiddlePinch - Whether middle finger pinch is detected
 * @param {Object} middleTip - Middle finger tip landmark
 * @param {Object} thumbTip - Thumb tip landmark
 */
function processMiddleFingerPinch(isMiddlePinch, middleTip, thumbTip) {
    if (!middlePinchDragEnabled) {
        return;
    }
    
    // Calculate midpoint between middle finger and thumb for drag location
    const middlePinchX = (middleTip.x + thumbTip.x) / 2;
    const middlePinchY = (middleTip.y + thumbTip.y) / 2;
    middlePinchLocation = { x: middlePinchX, y: middlePinchY };
    
    // Add to debounce history
    middlePinchStateHistory.push(isMiddlePinch);
    
    // Maintain debounce history size
    if (middlePinchStateHistory.length > MIDDLE_PINCH_DEBOUNCE_FRAMES) {
        middlePinchStateHistory.shift();
    }
    
    // Check if state is consistent across debounce frames
    if (middlePinchStateHistory.length >= MIDDLE_PINCH_DEBOUNCE_FRAMES) {
        const allAgree = middlePinchStateHistory.every(state => state === isMiddlePinch);
        
        if (allAgree) {
            const stateChanged = isMiddlePinch !== isMiddlePinchActive;
            
            if (stateChanged) {
                isMiddlePinchActive = isMiddlePinch;
                
                if (isMiddlePinch && !lastMiddlePinchState) {
                    // Middle pinch started - check if over a button to start drag
                    handleMiddlePinchStart(middlePinchX, middlePinchY);
                } else if (!isMiddlePinch && lastMiddlePinchState) {
                    // Middle pinch released - end drag
                    handleMiddlePinchRelease();
                }
                
                lastMiddlePinchState = isMiddlePinch;
            } else if (isMiddlePinchActive && isMiddlePinch) {
                // Continue dragging if already dragging
                handleMiddlePinchDrag(middlePinchX, middlePinchY);
            }
        }
    }
}

/**
 * Handle middle finger pinch start - begin drag if over a button
 * @param {number} normalizedX - Normalized X coordinate (0-1)
 * @param {number} normalizedY - Normalized Y coordinate (0-1)
 */
function handleMiddlePinchStart(normalizedX, normalizedY) {
    const screenCoords = mapNormalizedToScreen(normalizedX, normalizedY);
    
    // Find element at pinch location
    const canvas = document.getElementById('pinch-overlay');
    const canvasDisplay = canvas ? canvas.style.display : '';
    if (canvas) {
        canvas.style.display = 'none';
    }
    
    const elementAtPoint = document.elementFromPoint(screenCoords.x, screenCoords.y);
    
    if (canvas) {
        canvas.style.display = canvasDisplay || '';
    }
    
    if (!elementAtPoint) {
        return;
    }
    
    // Check if it's a nav-item button or inside one
    let buttonElement = elementAtPoint;
    let depth = 0;
    
    // Traverse up to find the nav-item button
    while (buttonElement && depth < 5) {
        if (buttonElement.classList && buttonElement.classList.contains('nav-item')) {
            draggingButtonId = buttonElement.id;
            
            // Store initial location for reference (button will align with pinch location)
            dragStartLocation = {
                x: screenCoords.x,
                y: screenCoords.y
            };
            
            // Add dragging class for visual feedback
            buttonElement.classList.add('dragging');
            
            console.log('🟡 Middle finger pinch - starting drag for button:', draggingButtonId);
            return;
        }
        buttonElement = buttonElement.parentElement;
        depth++;
    }
}

/**
 * Handle middle finger pinch drag - move button to new location
 * @param {number} normalizedX - Normalized X coordinate (0-1)
 * @param {number} normalizedY - Normalized Y coordinate (0-1)
 */
function handleMiddlePinchDrag(normalizedX, normalizedY) {
    if (!draggingButtonId) {
        return;
    }
    
    const button = document.getElementById(draggingButtonId);
    if (!button) {
        draggingButtonId = null;
        return;
    }
    
    const screenCoords = mapNormalizedToScreen(normalizedX, normalizedY);
    
    // Get sidebar and sidebar-nav elements for proper coordinate calculation
    const sidebar = document.getElementById('sidebar');
    const sidebarNav = document.querySelector('.sidebar-nav');
    
    if (!sidebar || !sidebarNav) {
        return;
    }
    
    const sidebarRect = sidebar.getBoundingClientRect();
    const sidebarNavRect = sidebarNav.getBoundingClientRect();
    
    // Get button dimensions (use current button rect for accurate size)
    const buttonRect = button.getBoundingClientRect();
    const buttonWidth = buttonRect.width || 310;
    const buttonHeight = buttonRect.height || 56;
    
    // Debug: Log coordinates to understand the offset
    if (Math.random() < 0.01) { // Log ~1% of frames to avoid spam
        console.log('Drag coordinates:', {
            normalized: { x: normalizedX.toFixed(3), y: normalizedY.toFixed(3) },
            screen: { x: Math.round(screenCoords.x), y: Math.round(screenCoords.y) },
            sidebarNav: { 
                top: Math.round(sidebarNavRect.top), 
                left: Math.round(sidebarNavRect.left),
                height: Math.round(sidebarNavRect.height)
            },
            button: {
                width: Math.round(buttonWidth),
                height: Math.round(buttonHeight)
            }
        });
    }
    
    // Calculate button center to align with pinch location
    // Align button center Y with pinch Y for same vertical level
    let buttonCenterX = screenCoords.x;
    let buttonCenterY = screenCoords.y; // Align vertically with pinch
    
    // Calculate top-left corner of button (viewport coordinates)
    let targetX = buttonCenterX - buttonWidth / 2;
    let targetY = buttonCenterY - buttonHeight / 2;
    
    // Constrain horizontally within sidebar bounds
    targetX = Math.max(sidebarRect.left, Math.min(targetX, sidebarRect.right - buttonWidth));
    
    // Constrain vertically within sidebar-nav bounds (not sidebar, to exclude header)
    targetY = Math.max(sidebarNavRect.top, Math.min(targetY, sidebarNavRect.bottom - buttonHeight));
    
    // Convert viewport coordinates to relative coordinates within sidebar-nav
    // sidebar-nav has position: relative, so buttons positioned absolutely will be relative to it
    // 
    // CRITICAL: getBoundingClientRect() returns the element's position in the viewport,
    // which is what we want. We just need to subtract the sidebar-nav's viewport position
    // to get coordinates relative to it.
    const relativeX = targetX - sidebarNavRect.left;
    let relativeY = targetY - sidebarNavRect.top;
    
    // Apply absolute positioning (relative to sidebar-nav)
    button.style.position = 'absolute';
    button.style.left = `${relativeX}px`;
    button.style.top = `${relativeY}px`;
    button.style.width = `${buttonWidth}px`;
    button.style.margin = '0';
    button.style.zIndex = '10'; // Ensure dragged button is on top
    
    // IMPORTANT FIX: Verify and correct button position to match pinch location
    // After setting the position, check if the button center actually aligns with the pinch
    // If not, adjust to compensate for any coordinate mapping errors
    
    // Force a reflow to ensure the position is applied before measuring
    void button.offsetHeight;
    
    // Get the actual rendered button position
    const actualRect = button.getBoundingClientRect();
    const actualButtonCenterY = actualRect.top + actualRect.height / 2;
    const expectedButtonCenterY = screenCoords.y; // Where we want the button center to be
    
    // Calculate the offset between expected and actual position
    const yOffsetError = actualButtonCenterY - expectedButtonCenterY;
    
    // If there's a significant offset (more than 2px), correct it
    // This ensures the button center is exactly at the pinch location
    if (Math.abs(yOffsetError) > 2) {
        // Adjust the relative Y position to compensate for the offset
        const correctedRelativeY = relativeY - yOffsetError;
        button.style.top = `${correctedRelativeY}px`;
        
        // Verify the correction worked
        void button.offsetHeight; // Force reflow again
        const correctedRect = button.getBoundingClientRect();
        const correctedCenterY = correctedRect.top + correctedRect.height / 2;
        const finalOffset = correctedCenterY - expectedButtonCenterY;
        
        if (Math.random() < 0.1 && Math.abs(yOffsetError) > 10) { // Log large offsets
            console.log('Button position correction:', {
                buttonId: draggingButtonId,
                expectedCenterY: Math.round(expectedButtonCenterY),
                initialActualCenterY: Math.round(actualButtonCenterY),
                yOffsetError: Math.round(yOffsetError),
                correctedRelativeY: Math.round(correctedRelativeY),
                finalCenterY: Math.round(correctedCenterY),
                finalOffset: Math.round(finalOffset)
            });
        }
    }
    
    // Debug: Verify final position (only when dragging bottom buttons for debugging)
    if (Math.random() < 0.02 && relativeY > 300) { // Log more for bottom buttons
        const finalRect = button.getBoundingClientRect();
        console.log('Final button position (bottom button):', {
            normalized: { x: normalizedX.toFixed(3), y: normalizedY.toFixed(3) },
            screenCoords: { x: Math.round(screenCoords.x), y: Math.round(screenCoords.y) },
            target: { x: Math.round(targetX), y: Math.round(targetY) },
            sidebarScroll: sidebarScrollTop,
            sidebarNavRect: { top: Math.round(sidebarNavRect.top), height: Math.round(sidebarNavRect.height) },
            relative: { x: Math.round(relativeX), y: Math.round(relativeY) },
            finalViewport: { x: Math.round(finalRect.left), y: Math.round(finalRect.top) },
            buttonCenter: { 
                x: Math.round(finalRect.left + finalRect.width / 2), 
                y: Math.round(finalRect.top + finalRect.height / 2)
            },
            pinchLocation: { x: Math.round(screenCoords.x), y: Math.round(screenCoords.y) },
            offset: {
                x: Math.round((finalRect.left + finalRect.width / 2) - screenCoords.x),
                y: Math.round((finalRect.top + finalRect.height / 2) - screenCoords.y)
            }
        });
    }
}

/**
 * Handle middle finger pinch release - end drag and save position
 */
function handleMiddlePinchRelease() {
    if (!draggingButtonId) {
        return;
    }
    
    const button = document.getElementById(draggingButtonId);
    if (button) {
        // Remove dragging class
        button.classList.remove('dragging');
        
        // Save position to localStorage
        saveButtonPosition(draggingButtonId, {
            left: button.style.left,
            top: button.style.top,
            position: 'absolute',
            width: button.style.width
        });
        
        console.log('🟢 Middle finger pinch released - drag ended for button:', draggingButtonId);
    }
    
    draggingButtonId = null;
    dragStartLocation = null;
}

/**
 * Save button position to localStorage
 * @param {string} buttonId - ID of the button
 * @param {Object} position - Position data {left, top, position, width}
 */
function saveButtonPosition(buttonId, position) {
    try {
        const savedPositions = JSON.parse(localStorage.getItem('sidebarButtonPositions') || '{}');
        savedPositions[buttonId] = position;
        localStorage.setItem('sidebarButtonPositions', JSON.stringify(savedPositions));
    } catch (error) {
        console.error('Error saving button position:', error);
    }
}

/**
 * Load and apply saved button positions
 */
export function loadButtonPositions() {
    try {
        const savedPositions = JSON.parse(localStorage.getItem('sidebarButtonPositions') || '{}');
        
        Object.keys(savedPositions).forEach(buttonId => {
            const button = document.getElementById(buttonId);
            if (button && savedPositions[buttonId]) {
                const pos = savedPositions[buttonId];
                button.style.position = pos.position || 'absolute';
                button.style.left = pos.left || '';
                button.style.top = pos.top || '';
                if (pos.width) {
                    button.style.width = pos.width;
                }
                button.style.margin = '0';
            }
        });
    } catch (error) {
        console.error('Error loading button positions:', error);
    }
}

/**
 * Initialize pinch overlay canvas for visual feedback
 */
function initializePinchOverlay() {
    pinchOverlayCanvas = document.getElementById('pinch-overlay');
    if (!pinchOverlayCanvas) {
        console.warn('Pinch overlay canvas not found');
        return;
    }
    
    // Set canvas size to match viewport
    const resizeCanvas = () => {
        pinchOverlayCanvas.width = window.innerWidth;
        pinchOverlayCanvas.height = window.innerHeight;
    };
    
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    
    // Get 2D context
    pinchOverlayCtx = pinchOverlayCanvas.getContext('2d');
    if (!pinchOverlayCtx) {
        console.warn('Failed to get 2D context for pinch overlay');
    }
}

/**
 * Map normalized coordinates (0-1) to screen coordinates
 * MediaPipe provides coordinates relative to the video frame (0-1)
 * The video uses object-fit: cover, so we need to account for aspect ratio differences
 * @param {number} normalizedX - Normalized X coordinate (0-1) from MediaPipe
 * @param {number} normalizedY - Normalized Y coordinate (0-1) from MediaPipe
 * @returns {{x: number, y: number}} Screen coordinates in pixels
 */
function mapNormalizedToScreen(normalizedX, normalizedY) {
    const video = videoElement;
    if (!video) {
        return { x: normalizedX * window.innerWidth, y: normalizedY * window.innerHeight };
    }
    
    // Get video element's bounding rectangle on screen
    const rect = video.getBoundingClientRect();
    const containerWidth = rect.width;
    const containerHeight = rect.height;
    
    // Get actual video frame dimensions (from the video stream)
    const videoWidth = video.videoWidth || 640;
    const videoHeight = video.videoHeight || 480;
    
    if (videoWidth === 0 || videoHeight === 0) {
        // Fallback if video dimensions aren't available yet
        console.warn('Video dimensions not available, using container size');
        let screenX = normalizedX * containerWidth;
        let screenY = normalizedY * containerHeight;
        
        const isFlipped = video.classList.contains('flipped');
        if (isFlipped) {
            screenX = containerWidth - screenX;
        }
        
        return { x: screenX + rect.left, y: screenY + rect.top };
    }
    
    // Calculate aspect ratios
    const videoAspect = videoWidth / videoHeight;
    const containerAspect = containerWidth / containerHeight;
    
    // Calculate the scale factor and offsets for object-fit: cover
    // object-fit: cover scales the video to fill the container while maintaining aspect ratio
    // This means one dimension fits perfectly, and the other is cropped (centered)
    
    let scale, screenX, screenY;
    const videoPixelX = normalizedX * videoWidth;
    const videoPixelY = normalizedY * videoHeight;
    
    if (videoAspect > containerAspect) {
        // Video is wider than container
        // Height fits container height, width is cropped from sides
        scale = containerHeight / videoHeight;
        
        // Scaled video dimensions
        const scaledVideoWidth = videoWidth * scale;
        
        // Calculate how much is cropped on each side
        const croppedWidth = scaledVideoWidth - containerWidth;
        const cropOffset = croppedWidth / 2;
        
        // Map video pixel X to screen X
        // Video pixel 0 → screen position (cropOffset) from left
        // Video pixel videoWidth → screen position (containerWidth + cropOffset) from left
        // So: screenX = (videoPixelX * scale) - cropOffset
        screenX = (videoPixelX * scale) - cropOffset;
        
        // Y maps directly (no cropping vertically)
        screenY = videoPixelY * scale;
        
    } else {
        // Video is taller than container (or same aspect ratio)
        // Width fits container width, height is cropped from top/bottom
        scale = containerWidth / videoWidth;
        
        // Scaled video dimensions
        const scaledVideoHeight = videoHeight * scale;
        
        // Calculate how much is cropped on top and bottom
        const croppedHeight = scaledVideoHeight - containerHeight;
        const cropOffset = croppedHeight / 2;
        
        // X maps directly (no cropping horizontally)
        screenX = videoPixelX * scale;
        
        // Map video pixel Y to screen Y
        // Video pixel 0 → screen position (cropOffset) from top
        // Video pixel videoHeight → screen position (containerHeight + cropOffset) from top
        // So: screenY = (videoPixelY * scale) - cropOffset
        screenY = (videoPixelY * scale) - cropOffset;
    }
    
    // Clamp to container bounds (safety check)
    screenX = Math.max(0, Math.min(containerWidth, screenX));
    screenY = Math.max(0, Math.min(containerHeight, screenY));
    
    // Check if video is flipped (mirrored) - if so, flip X coordinate
    const isFlipped = video.classList.contains('flipped');
    if (isFlipped) {
        screenX = containerWidth - screenX;
    }
    
    // Add video element's position offset to get absolute screen coordinates
    screenX += rect.left;
    screenY += rect.top;
    
    return { x: screenX, y: screenY };
}

/**
 * Handle pinch click - invoke click handler directly or simulate click
 * @param {number} normalizedX - Normalized X coordinate (0-1)
 * @param {number} normalizedY - Normalized Y coordinate (0-1)
 */
function handlePinchClick(normalizedX, normalizedY) {
    // Prevent click spam
    const now = Date.now();
    if (now - lastClickTime < CLICK_DEBOUNCE_MS) {
        return;
    }
    lastClickTime = now;
    
    // Map normalized coordinates to screen coordinates
    const screenCoords = mapNormalizedToScreen(normalizedX, normalizedY);
    
    console.log('Pinch click detected at:', screenCoords, 'from normalized:', { x: normalizedX, y: normalizedY });
    
    // Find the element at this screen position
    // Temporarily hide overlay canvas to get the actual element underneath
    const canvas = document.getElementById('pinch-overlay');
    const canvasDisplay = canvas ? canvas.style.display : '';
    if (canvas) {
        canvas.style.display = 'none';
    }
    
    try {
        // Get element at the click position
        const elementAtPoint = document.elementFromPoint(screenCoords.x, screenCoords.y);
        
        // Restore canvas immediately
        if (canvas) {
            canvas.style.display = canvasDisplay || '';
        }
        
        if (!elementAtPoint) {
            console.warn('No element found at pinch location:', screenCoords);
            return;
        }
        
        console.log('Element at pinch location:', {
            tag: elementAtPoint.tagName,
            id: elementAtPoint.id,
            classes: elementAtPoint.className,
            coordinates: screenCoords
        });
        
        // SOLUTION 1: Direct Handler Invocation (Most Reliable)
        // Check if we have a registered click handler for this element
        if (getClickHandler && typeof getClickHandler === 'function') {
            const handler = getClickHandler(elementAtPoint);
            
            if (handler && typeof handler === 'function') {
                try {
                    console.log('✅ FOUND HANDLER - Calling registered handler directly for element:', elementAtPoint.id || elementAtPoint.className || elementAtPoint.tagName);
                    handler();
                    console.log('✅ HANDLER EXECUTED - Action should have occurred');
                    return; // Success! No need to try other methods
                } catch (error) {
                    console.error('❌ ERROR calling registered handler:', error);
                    console.error('Stack trace:', error.stack);
                    // Fall through to backup methods
                }
            } else {
                // Log detailed info about why handler wasn't found
                console.log('🔍 Handler lookup - no handler found:', {
                    elementTag: elementAtPoint.tagName,
                    elementId: elementAtPoint.id || '(no id)',
                    elementClasses: elementAtPoint.className || '(no classes)',
                    parentId: elementAtPoint.parentElement?.id || '(no parent id)',
                    parentClasses: elementAtPoint.parentElement?.className || '(no parent classes)',
                    registryKeys: elementClickRegistry ? Object.keys(elementClickRegistry) : 'no registry'
                });
            }
        } else {
            console.warn('⚠️ getClickHandler not available:', {
                getClickHandler: getClickHandler,
                type: typeof getClickHandler,
                hasRegistry: elementClickRegistry !== null
            });
        }
        
        // FALLBACK: Direct click() method
        // For elements without registered handlers, try direct click()
        if (typeof elementAtPoint.click === 'function') {
            try {
                // Focus the element first (helps with some elements)
                if (elementAtPoint.focus && typeof elementAtPoint.focus === 'function') {
                    elementAtPoint.focus();
                }
                
                // Use requestAnimationFrame for better timing
                requestAnimationFrame(() => {
                    try {
                        elementAtPoint.click();
                        console.log('Direct click() called on element:', elementAtPoint.tagName, elementAtPoint.id);
                    } catch (e) {
                        console.warn('Direct click() failed:', e);
                    }
                });
                return; // Attempted click, exit
            } catch (e) {
                console.warn('Direct click() setup failed:', e);
                // Fall through to event dispatch
            }
        }
        
        // LAST RESORT: Dispatch mouse events
        // Only if handler invocation and click() both failed
        console.log('Attempting event dispatch as last resort');
        const mouseEventInit = {
            view: window,
            bubbles: true,
            cancelable: true,
            clientX: screenCoords.x,
            clientY: screenCoords.y,
            screenX: screenCoords.x + (window.screenX || 0),
            screenY: screenCoords.y + (window.screenY || 0),
            button: 0,
            buttons: 1,
            detail: 1
        };
        
        // Try focus first
        if (elementAtPoint.focus) {
            elementAtPoint.focus();
        }
        
        // Dispatch mouse events in sequence
        requestAnimationFrame(() => {
            try {
                // Mouseover
                const mouseover = new MouseEvent('mouseover', mouseEventInit);
                elementAtPoint.dispatchEvent(mouseover);
                
                // Mousemove
                const mousemove = new MouseEvent('mousemove', mouseEventInit);
                elementAtPoint.dispatchEvent(mousemove);
                
                // Small delay, then click sequence
                setTimeout(() => {
                    try {
                        const mousedown = new MouseEvent('mousedown', mouseEventInit);
                        elementAtPoint.dispatchEvent(mousedown);
                        
                        setTimeout(() => {
                            try {
                                const mouseup = new MouseEvent('mouseup', {
                                    ...mouseEventInit,
                                    buttons: 0
                                });
                                elementAtPoint.dispatchEvent(mouseup);
                                
                                setTimeout(() => {
                                    try {
                                        const click = new MouseEvent('click', {
                                            ...mouseEventInit,
                                            buttons: 0
                                        });
                                        const result = elementAtPoint.dispatchEvent(click);
                                        console.log('Event dispatch click result:', result);
                                    } catch (e) {
                                        console.warn('Click event dispatch failed:', e);
                                    }
                                }, 10);
                            } catch (e) {
                                console.warn('Mouseup event dispatch failed:', e);
                            }
                        }, 10);
                    } catch (e) {
                        console.warn('Mousedown event dispatch failed:', e);
                    }
                }, 50);
            } catch (e) {
                console.warn('Event dispatch setup failed:', e);
            }
        });
        
    } catch (error) {
        console.error('Error in handlePinchClick:', error);
        // Restore canvas if there was an error
        if (canvas) {
            canvas.style.display = canvasDisplay || '';
        }
    }
}

/**
 * Handle pinch release - clear visual feedback
 */
function handlePinchRelease() {
    clearPinchVisualFeedback();
    pinchLocation = null;
}

/**
 * Update visual feedback on canvas overlay
 * @param {number} normalizedX - Normalized X coordinate (0-1)
 * @param {number} normalizedY - Normalized Y coordinate (0-1)
 */
function updatePinchVisualFeedback(normalizedX, normalizedY) {
    if (!pinchOverlayCanvas || !pinchOverlayCtx) {
        return;
    }
    
    // Clear canvas
    pinchOverlayCtx.clearRect(0, 0, pinchOverlayCanvas.width, pinchOverlayCanvas.height);
    
    // Map normalized coordinates to screen coordinates
    const screenCoords = mapNormalizedToScreen(normalizedX, normalizedY);
    
    // Debug logging (only occasionally to avoid spam)
    if (Math.random() < 0.02) { // Log ~2% of frames
        const video = videoElement;
        if (video) {
            console.log('Pinch coordinates:', {
                normalized: { x: normalizedX.toFixed(3), y: normalizedY.toFixed(3) },
                screen: { x: Math.round(screenCoords.x), y: Math.round(screenCoords.y) },
                videoSize: { width: video.videoWidth, height: video.videoHeight },
                containerSize: { width: video.getBoundingClientRect().width, height: video.getBoundingClientRect().height },
                aspectRatio: {
                    video: (video.videoWidth / video.videoHeight).toFixed(2),
                    container: (video.getBoundingClientRect().width / video.getBoundingClientRect().height).toFixed(2)
                }
            });
        }
    }
    
    // Draw outer circle (white outline for visibility)
    pinchOverlayCtx.beginPath();
    pinchOverlayCtx.arc(screenCoords.x, screenCoords.y, 20, 0, 2 * Math.PI);
    pinchOverlayCtx.strokeStyle = '#ffffff';
    pinchOverlayCtx.lineWidth = 4;
    pinchOverlayCtx.stroke();
    
    // Draw middle circle (red)
    pinchOverlayCtx.beginPath();
    pinchOverlayCtx.arc(screenCoords.x, screenCoords.y, 15, 0, 2 * Math.PI);
    pinchOverlayCtx.strokeStyle = '#ff0000';
    pinchOverlayCtx.lineWidth = 3;
    pinchOverlayCtx.stroke();
    
    // Draw inner filled circle
    pinchOverlayCtx.beginPath();
    pinchOverlayCtx.arc(screenCoords.x, screenCoords.y, 10, 0, 2 * Math.PI);
    pinchOverlayCtx.fillStyle = 'rgba(255, 0, 0, 0.8)';
    pinchOverlayCtx.fill();
    
    // Draw center dot
    pinchOverlayCtx.beginPath();
    pinchOverlayCtx.arc(screenCoords.x, screenCoords.y, 3, 0, 2 * Math.PI);
    pinchOverlayCtx.fillStyle = '#ffffff';
    pinchOverlayCtx.fill();
}

/**
 * Clear visual feedback from canvas overlay
 */
function clearPinchVisualFeedback() {
    if (!pinchOverlayCanvas || !pinchOverlayCtx) {
        return;
    }
    
    // Clear entire canvas
    pinchOverlayCtx.clearRect(0, 0, pinchOverlayCanvas.width, pinchOverlayCanvas.height);
}

/**
 * Update model configuration (for switching between static/temporal models)
 */
export function updateModelConfig(config) {
    Object.assign(MODEL_CONFIG, config);
}

/**
 * Get current model configuration
 */
export function getModelConfig() {
    return { ...MODEL_CONFIG };
}

/**
 * Cleanup resources
 */
export function cleanup() {
    stopDetection();
    
    if (hands) {
        hands.close();
        hands = null;
    }
    
    if (aslModel) {
        aslModel.dispose();
        aslModel = null;
    }
    
    isInitialized = false;
    console.log('Sign language recognition cleaned up');
}
