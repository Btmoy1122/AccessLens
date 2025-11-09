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

// Hand menu mode state
let handMenuModeEnabled = false; // Whether hand menu mode is enabled
let handMenuQuadrilateral = null; // Current quadrilateral {leftThumb, rightThumb, rightIndex, leftIndex}
let handMenuOverlay = null; // Hand menu overlay container element
let handMenuButtons = null; // Hand menu buttons container element
let handMenuQuadrilateralSVG = null; // SVG element for quadrilateral visualization
let handMenuButtonElements = []; // Array of button elements in hand menu
let lastQuadrilateralUpdate = 0; // Timestamp of last quadrilateral update
const QUADRILATERAL_UPDATE_THROTTLE = 100; // Throttle updates to every 100ms

// Hand menu locking state
let handMenuLocked = false; // Whether the hand menu is currently locked
let handMenuLockStartTime = null; // Timestamp when valid quadrilateral detection started
let handMenuLockThreshold = 2000; // Duration in milliseconds to hold pose before locking (2 seconds)
let lockedQuadrilateral = null; // Store the locked quadrilateral position
let handMenuUnlockButton = null; // Unlock button element
let handMenuLockIndicator = null; // Lock status indicator element

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
let originalButtonX = null; // Original X position of button when drag starts (locked)
let middlePinchLocation = null; // Current middle finger pinch location {x, y}
const MIDDLE_PINCH_THRESHOLD = 0.05; // Threshold for middle finger pinch detection
const MIDDLE_PINCH_DEBOUNCE_FRAMES = 3; // Frames to debounce middle finger pinch

// Snap-to-grid configuration
const SNAP_GRID_SIZE = 70; // Grid cell size in pixels (height for vertical slots)
const SNAP_THRESHOLD = 25; // Distance in pixels to trigger snap (half of grid size)
let snapSlots = []; // Array of slot positions {x, y, width, height}
let showSnapGrid = false; // Whether to show visual grid
let occupiedSlots = new Map(); // Map of slot index to button ID to prevent overlap

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
    
    // Initialize snap grid slots
    initializeSnapGrid();
    
    // Initialize pinch overlay canvas for visual feedback
    initializePinchOverlay();
    
    // Initialize hand menu overlay if mode is enabled
    if (handMenuModeEnabled) {
        initializeHandMenuOverlay();
    }
    
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
        // Process hand menu mode if enabled
        if (handMenuModeEnabled) {
            processHandMenuQuadrilateral(results);
        }
        
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
        
        // Hide hand menu if no hands detected
        if (handMenuModeEnabled) {
            hideHandMenuOverlay();
        }
        
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
    
    // Update hand menu button highlighting if in hand menu mode
    if (handMenuModeEnabled && pinchLocation) {
        updateHandMenuButtonHighlighting();
    }
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
        // Skip camera selector container (not draggable)
        if (buttonElement.classList && buttonElement.classList.contains('camera-selector-container')) {
            return; // Don't allow dragging the camera selector
        }
        
        if (buttonElement.classList && buttonElement.classList.contains('nav-item')) {
            // Make sure it's not the camera selector container
            if (buttonElement.id === 'camera-select' || buttonElement.closest('.camera-selector-container')) {
                return; // Don't allow dragging the camera selector
            }
            
            draggingButtonId = buttonElement.id;
            
            // Store original X position (locked - button will only move vertically)
            const buttonRect = buttonElement.getBoundingClientRect();
            const sidebarNav = document.querySelector('.sidebar-nav');
            if (sidebarNav) {
                const sidebarNavRect = sidebarNav.getBoundingClientRect();
                // Store the button's current X position relative to sidebar-nav
                let currentX = buttonRect.left - sidebarNavRect.left;
                
                // If button hasn't been positioned yet (still in normal flow), use nav-section padding
                if (currentX < 5 || !buttonElement.style.position || buttonElement.style.position !== 'absolute') {
                    // Button is in normal flow, use nav-section padding (20px from CSS)
                    originalButtonX = 20;
                } else {
                    // Button is already absolutely positioned, use its current X
                    originalButtonX = currentX;
                }
            } else {
                // Fallback: use nav-section padding (20px from CSS)
                originalButtonX = 20;
            }
            
            // Ensure X is within valid bounds (nav-section padding to sidebar width - button width - padding)
            const sidebarPadding = 20;
            if (originalButtonX < sidebarPadding) {
                originalButtonX = sidebarPadding;
            }
            
            // Store initial location for reference (button will align with pinch location)
            dragStartLocation = {
                x: screenCoords.x,
                y: screenCoords.y
            };
            
            // Add dragging class for visual feedback
            buttonElement.classList.add('dragging');
            
            // Update occupied slots before starting drag
            updateOccupiedSlots();
            
            // Remove this button from occupied slots (will be re-added when snapped)
            const currentTop = parseInt(buttonElement.style.top) || 0;
            const currentSlotIndex = getSlotIndex(currentTop);
            if (occupiedSlots.get(currentSlotIndex) === draggingButtonId) {
                occupiedSlots.delete(currentSlotIndex);
            }
            
            // Show snap grid when dragging starts
            updateSnapGridVisibility(true);
            
            console.log('🟡 Middle finger pinch - starting drag for button:', draggingButtonId, 'locked X:', originalButtonX);
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
    
    // LOCK X-AXIS: Only move button vertically, keep X position locked to original
    // Use the original X position stored when drag started, or fallback to nav-section padding
    let relativeX = originalButtonX;
    if (relativeX === null) {
        // Fallback: use nav-section padding (20px) if originalButtonX wasn't set
        relativeX = 20;
    }
    
    // Calculate button center to align with pinch location (Y-axis only)
    // Align button center Y with pinch Y for same vertical level
    const buttonCenterY = screenCoords.y; // Align vertically with pinch
    
    // Calculate top-left corner of button (viewport coordinates) - Y only
    let targetY = buttonCenterY - buttonHeight / 2;
    
    // Constrain horizontally - ensure button stays within sidebar bounds
    const sidebarPadding = 20; // Match nav-section padding
    
    // Ensure button stays within sidebar bounds to prevent text cutoff
    // Constrain width to prevent overflow
    const maxButtonWidth = sidebarNavRect.width - (sidebarPadding * 2);
    const finalButtonWidth = Math.min(buttonWidth, maxButtonWidth);
    
    // Calculate max X to prevent button from going off-screen (using finalButtonWidth)
    const maxX = sidebarNavRect.width - finalButtonWidth - sidebarPadding;
    const clampedX = Math.max(sidebarPadding, Math.min(relativeX, maxX));
    
    // Constrain vertically within sidebar-nav bounds (not sidebar, to exclude header)
    targetY = Math.max(sidebarNavRect.top, Math.min(targetY, sidebarNavRect.bottom - buttonHeight));
    
    // Convert to relative coordinates within sidebar-nav
    let relativeY = targetY - sidebarNavRect.top;
    
    // Apply absolute positioning (relative to sidebar-nav)
    // X is locked, only Y changes
    button.style.position = 'absolute';
    button.style.left = `${clampedX}px`;
    button.style.top = `${relativeY}px`;
    button.style.width = `${finalButtonWidth}px`;
    button.style.margin = '0';
    button.style.zIndex = '10'; // Ensure dragged button is on top
    
    // Use clampedX for grid snapping (ensures button stays within bounds)
    const relativeXForSnap = clampedX;
    
    // ALWAYS snap to grid during drag for smooth, stable movement (no shaking)
    // This prevents shaking by always moving button to a stable grid position
    // Update occupied slots first (excluding current button)
    updateOccupiedSlots();
    
    // Snap to nearest grid slot (always snaps, no threshold)
    // Use finalButtonWidth and clampedX to ensure proper width calculation and bounds
    const snappedPosition = snapToGrid(relativeXForSnap, relativeY, finalButtonWidth, buttonHeight, sidebarNavRect, draggingButtonId);
    
    if (snappedPosition) {
        // Smooth transition between grid slots (prevents shaking)
        button.style.transition = 'top 0.15s ease-out';
        button.style.left = `${relativeXForSnap}px`; // Always use clamped X (locked within bounds)
        button.style.top = `${snappedPosition.y}px`;
        
        // Update occupied slots with current button position
        occupiedSlots.set(snappedPosition.slotIndex, draggingButtonId);
    } else {
        // Fallback: ensure X stays locked (shouldn't happen if snap always works)
        button.style.left = `${relativeXForSnap}px`;
        button.style.transition = 'top 0.15s ease-out';
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
        // Get final position and snap to grid
        const sidebarNav = document.querySelector('.sidebar-nav');
        if (sidebarNav) {
            const sidebarNavRect = sidebarNav.getBoundingClientRect();
            const buttonRect = button.getBoundingClientRect();
            const relativeX = buttonRect.left - sidebarNavRect.left;
            const relativeY = buttonRect.top - sidebarNavRect.top;
            const buttonWidth = buttonRect.width || 310;
            const buttonHeight = buttonRect.height || 56;
            
            // Update occupied slots before final snap
            updateOccupiedSlots();
            
            // Snap to nearest grid slot on release
            // X position remains locked, only Y snaps
            const lockedX = originalButtonX !== null ? originalButtonX : 20;
            const snappedPosition = snapToGrid(lockedX, relativeY, buttonWidth, buttonHeight, sidebarNavRect, draggingButtonId);
            
            if (snappedPosition) {
                button.style.transition = 'top 0.2s ease-out';
                button.style.left = `${lockedX}px`; // Always use locked X
                button.style.top = `${snappedPosition.y}px`;
                
                // Mark slot as occupied
                occupiedSlots.set(snappedPosition.slotIndex, draggingButtonId);
            } else {
                // Even if not snapping, ensure X is locked
                button.style.left = `${lockedX}px`;
            }
            
            // Update occupied slots after final position
            updateOccupiedSlots();
        }
        
        // Remove dragging class
        button.classList.remove('dragging');
        
        // Hide snap grid when dragging ends
        updateSnapGridVisibility(false);
        
        // Save position to localStorage
        saveButtonPosition(draggingButtonId, {
            left: button.style.left,
            top: button.style.top,
            position: 'absolute',
            width: button.style.width
        });
        
        console.log('🟢 Middle finger pinch released - drag ended for button:', draggingButtonId);
    }
    
    // Update occupied slots after drag ends
    updateOccupiedSlots();
    
    draggingButtonId = null;
    dragStartLocation = null;
    originalButtonX = null; // Clear locked X position
}

/**
 * Get the nearest grid slot index for a Y position
 * @param {number} y - Y position
 * @returns {number} Slot index (0-based)
 */
function getSlotIndex(y) {
    return Math.round(y / SNAP_GRID_SIZE);
}

/**
 * Get grid slot Y position from slot index
 * @param {number} slotIndex - Slot index
 * @returns {number} Y position of slot top
 */
function getSlotY(slotIndex) {
    return slotIndex * SNAP_GRID_SIZE;
}

/**
 * Snap button position to nearest grid slot (always snaps, no threshold)
 * @param {number} x - Current X position (relative to sidebar-nav)
 * @param {number} y - Current Y position (relative to sidebar-nav)
 * @param {number} buttonWidth - Button width
 * @param {number} buttonHeight - Button height
 * @param {DOMRect} sidebarNavRect - Sidebar nav bounding rect
 * @param {string} buttonId - ID of the button being dragged (to exclude from overlap check)
 * @returns {{x: number, y: number, slotIndex: number}|null} Snapped position or null if invalid
 */
function snapToGrid(x, y, buttonWidth, buttonHeight, sidebarNavRect, buttonId = null) {
    // Always snap to nearest grid slot (no threshold)
    const slotIndex = getSlotIndex(y);
    const slotY = getSlotY(slotIndex);
    
    // Constrain within sidebar-nav bounds
    const minY = 0;
    const maxY = Math.max(0, sidebarNavRect.height - buttonHeight);
    const snappedY = Math.max(minY, Math.min(slotY, maxY));
    
    // Check if this slot is occupied by another button
    if (buttonId && isSlotOccupied(slotIndex, buttonId)) {
        // Find nearest unoccupied slot
        const nearestSlot = findNearestUnoccupiedSlot(slotIndex, buttonId, sidebarNavRect, buttonHeight);
        if (nearestSlot !== null) {
            return {
                x: x,
                y: nearestSlot.y,
                slotIndex: nearestSlot.index
            };
        }
    }
    
    // X position is locked, so return the same X
    return {
        x: x,
        y: snappedY,
        slotIndex: slotIndex
    };
}

/**
 * Check if a slot is occupied by another button
 * @param {number} slotIndex - Slot index to check
 * @param {string} excludeButtonId - Button ID to exclude from check (the one being dragged)
 * @returns {boolean} True if slot is occupied
 */
function isSlotOccupied(slotIndex, excludeButtonId = null) {
    if (!occupiedSlots.has(slotIndex)) {
        return false;
    }
    const occupyingButtonId = occupiedSlots.get(slotIndex);
    return occupyingButtonId !== excludeButtonId;
}

/**
 * Find the nearest unoccupied slot
 * @param {number} startSlotIndex - Starting slot index
 * @param {string} excludeButtonId - Button ID to exclude from check
 * @param {DOMRect} sidebarNavRect - Sidebar nav bounding rect
 * @param {number} buttonHeight - Button height
 * @returns {{index: number, y: number}|null} Nearest unoccupied slot or null
 */
function findNearestUnoccupiedSlot(startSlotIndex, excludeButtonId, sidebarNavRect, buttonHeight) {
    const maxSlotIndex = Math.floor((sidebarNavRect.height - buttonHeight) / SNAP_GRID_SIZE);
    
    // Search in both directions
    for (let offset = 0; offset <= maxSlotIndex; offset++) {
        // Check slot above
        const slotAbove = startSlotIndex - offset;
        if (slotAbove >= 0 && !isSlotOccupied(slotAbove, excludeButtonId)) {
            return {
                index: slotAbove,
                y: getSlotY(slotAbove)
            };
        }
        
        // Check slot below
        const slotBelow = startSlotIndex + offset;
        if (slotBelow <= maxSlotIndex && !isSlotOccupied(slotBelow, excludeButtonId)) {
            return {
                index: slotBelow,
                y: getSlotY(slotBelow)
            };
        }
    }
    
    return null; // No unoccupied slot found
}

/**
 * Update occupied slots map based on current button positions
 */
function updateOccupiedSlots() {
    occupiedSlots.clear();
    
    // Get all nav-item buttons
    const buttons = document.querySelectorAll('.nav-item');
    buttons.forEach(button => {
        const style = window.getComputedStyle(button);
        if (style.position === 'absolute') {
            const top = parseInt(button.style.top) || 0;
            const slotIndex = getSlotIndex(top);
            const buttonId = button.id;
            
            // Only mark as occupied if button is actually positioned
            if (buttonId && top >= 0) {
                occupiedSlots.set(slotIndex, buttonId);
            }
        }
    });
}

/**
 * Initialize snap-to-grid slots
 * Creates visual slots that buttons can snap into
 */
function initializeSnapGrid() {
    const sidebarNav = document.querySelector('.sidebar-nav');
    if (!sidebarNav) {
        return;
    }
    
    // Create grid overlay canvas for visual feedback
    let gridCanvas = document.getElementById('snap-grid-overlay');
    if (!gridCanvas) {
        gridCanvas = document.createElement('canvas');
        gridCanvas.id = 'snap-grid-overlay';
        gridCanvas.className = 'snap-grid-overlay';
        sidebarNav.appendChild(gridCanvas);
    }
    
    // Set canvas size to match sidebar-nav
    const resizeGrid = () => {
        const rect = sidebarNav.getBoundingClientRect();
        gridCanvas.width = rect.width;
        gridCanvas.height = rect.height;
        gridCanvas.style.width = `${rect.width}px`;
        gridCanvas.style.height = `${rect.height}px`;
        drawSnapGrid(gridCanvas);
    };
    
    resizeGrid();
    window.addEventListener('resize', resizeGrid);
    
    // Update grid when sidebar opens/closes
    const sidebar = document.getElementById('sidebar');
    if (sidebar) {
        const observer = new MutationObserver(() => {
            if (sidebar.classList.contains('open')) {
                setTimeout(resizeGrid, 100); // Wait for transition
            }
        });
        observer.observe(sidebar, { attributes: true, attributeFilter: ['class'] });
    }
    
    // Show grid by default when dragging
    showSnapGrid = false; // Hidden by default, shown when dragging
}

/**
 * Draw snap grid overlay
 * @param {HTMLCanvasElement} canvas - Canvas element to draw on
 */
function drawSnapGrid(canvas) {
    if (!showSnapGrid) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        return;
    }
    
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw horizontal grid lines (slot boundaries) - make them more visible
    ctx.strokeStyle = 'rgba(74, 144, 226, 0.6)'; // More visible blue
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]); // Dashed lines
    
    for (let y = 0; y < canvas.height; y += SNAP_GRID_SIZE) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
    }
    
    // Draw slot highlights (subtle background for each slot)
    ctx.fillStyle = 'rgba(74, 144, 226, 0.1)'; // More visible
    for (let y = 0; y < canvas.height; y += SNAP_GRID_SIZE) {
        ctx.fillRect(0, y, canvas.width, SNAP_GRID_SIZE);
    }
    
    // Draw vertical lines at edges to show button boundaries (optional)
    ctx.strokeStyle = 'rgba(74, 144, 226, 0.4)';
    ctx.lineWidth = 1;
    ctx.setLineDash([]);
    const sidebarPadding = 20;
    ctx.beginPath();
    ctx.moveTo(sidebarPadding, 0);
    ctx.lineTo(sidebarPadding, canvas.height);
    ctx.stroke();
    
    ctx.beginPath();
    ctx.moveTo(canvas.width - sidebarPadding, 0);
    ctx.lineTo(canvas.width - sidebarPadding, canvas.height);
    ctx.stroke();
    
    ctx.setLineDash([]); // Reset line dash
}

/**
 * Update snap grid visibility
 * @param {boolean} visible - Whether to show the grid
 */
function updateSnapGridVisibility(visible) {
    showSnapGrid = visible;
    const gridCanvas = document.getElementById('snap-grid-overlay');
    if (gridCanvas) {
        // Resize canvas if needed
        const sidebarNav = document.querySelector('.sidebar-nav');
        if (sidebarNav) {
            const rect = sidebarNav.getBoundingClientRect();
            gridCanvas.width = rect.width;
            gridCanvas.height = rect.height;
            gridCanvas.style.width = `${rect.width}px`;
            gridCanvas.style.height = `${rect.height}px`;
        }
        
        if (visible) {
            // Redraw grid when showing
            drawSnapGrid(gridCanvas);
            // Ensure canvas is visible
            gridCanvas.style.display = 'block';
            gridCanvas.style.opacity = '0.6';
        } else {
            const ctx = gridCanvas.getContext('2d');
            ctx.clearRect(0, 0, gridCanvas.width, gridCanvas.height);
            gridCanvas.style.display = 'none';
        }
    }
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
        
        // Update occupied slots after loading positions
        setTimeout(() => {
            updateOccupiedSlots();
        }, 100);
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
 * Set hand menu mode enabled/disabled
 * @param {boolean} enabled - Whether hand menu mode is enabled
 */
export function setHandMenuMode(enabled) {
    handMenuModeEnabled = enabled;
    
    if (enabled) {
        initializeHandMenuOverlay();
    } else {
        // Unlock menu when disabling mode
        if (handMenuLocked) {
            unlockHandMenu();
        }
        hideHandMenuOverlay();
    }
    
    console.log('Hand menu mode:', enabled ? 'enabled' : 'disabled');
}

/**
 * Initialize hand menu overlay system
 */
function initializeHandMenuOverlay() {
    // Get or create overlay container
    handMenuOverlay = document.getElementById('hand-menu-overlay');
    if (!handMenuOverlay) {
        console.warn('Hand menu overlay element not found');
        return;
    }
    
    // Get SVG element for quadrilateral visualization
    handMenuQuadrilateralSVG = document.getElementById('hand-menu-quadrilateral');
    if (!handMenuQuadrilateralSVG) {
        console.warn('Hand menu quadrilateral SVG not found');
        return;
    }
    
    // Get buttons container
    handMenuButtons = document.getElementById('hand-menu-buttons');
    if (!handMenuButtons) {
        console.warn('Hand menu buttons container not found');
        return;
    }
    
    // Create menu buttons from sidebar items
    createHandMenuButtons();
}

/**
 * Create hand menu buttons from sidebar items
 */
function createHandMenuButtons() {
    if (!handMenuButtons) {
        return;
    }
    
    // Clear existing buttons
    handMenuButtons.innerHTML = '';
    handMenuButtonElements = [];
    
    // Create lock status indicator
    handMenuLockIndicator = document.createElement('div');
    handMenuLockIndicator.className = 'hand-menu-lock-indicator';
    handMenuLockIndicator.id = 'hand-menu-lock-indicator';
    handMenuLockIndicator.innerHTML = '🔓 Unlocked';
    updateHandMenuLockIndicator();
    handMenuButtons.appendChild(handMenuLockIndicator);
    
    // Create unlock button (hidden by default, shown when locked)
    handMenuUnlockButton = document.createElement('button');
    handMenuUnlockButton.className = 'hand-menu-unlock-button';
    handMenuUnlockButton.id = 'hand-menu-unlock-button';
    handMenuUnlockButton.innerHTML = '🔓 Unlock Menu';
    handMenuUnlockButton.style.display = 'none';
    
    // Add click handler for unlock button
    handMenuUnlockButton.addEventListener('click', () => {
        unlockHandMenu();
    });
    
    // Register unlock button in click registry for pinch-to-click
    if (elementClickRegistry) {
        elementClickRegistry['hand-menu-unlock-button'] = () => {
            unlockHandMenu();
        };
    }
    
    handMenuButtons.appendChild(handMenuUnlockButton);
    
    // Get all sidebar nav items
    const sidebarNavItems = document.querySelectorAll('.nav-item');
    if (!sidebarNavItems || sidebarNavItems.length === 0) {
        console.warn('No sidebar nav items found');
        return;
    }
    
    // Create buttons for each nav item
    sidebarNavItems.forEach((navItem, index) => {
        // Skip camera selector container
        if (navItem.closest('.camera-selector-container')) {
            return;
        }
        
        const button = document.createElement('button');
        button.className = 'hand-menu-button';
        button.id = `hand-menu-${navItem.id || `button-${index}`}`;
        
        // Copy icon and label from nav item
        const icon = navItem.querySelector('.nav-icon');
        const label = navItem.querySelector('.nav-label');
        
        if (icon) {
            const iconSpan = document.createElement('span');
            iconSpan.className = 'hand-menu-button-icon';
            iconSpan.textContent = icon.textContent;
            button.appendChild(iconSpan);
        }
        
        if (label) {
            const labelSpan = document.createElement('span');
            labelSpan.className = 'hand-menu-button-label';
            labelSpan.textContent = label.textContent;
            button.appendChild(labelSpan);
        }
        
        // Copy active state
        if (navItem.classList.contains('active')) {
            button.classList.add('active');
        }
        
        // Add click handler - use the same handler as the original nav item
        if (navItem.id && elementClickRegistry && elementClickRegistry[navItem.id]) {
            button.addEventListener('click', () => {
                elementClickRegistry[navItem.id]();
            });
        } else {
            // Fallback to clicking the original nav item
            button.addEventListener('click', () => {
                navItem.click();
            });
        }
        
        handMenuButtons.appendChild(button);
        handMenuButtonElements.push({
            element: button,
            navItem: navItem,
            id: navItem.id
        });
    });
}

/**
 * Process hand menu quadrilateral from both hands
 * @param {Object} results - MediaPipe hands results
 */
function processHandMenuQuadrilateral(results) {
    // If menu is locked, keep it visible but don't update position
    if (handMenuLocked && lockedQuadrilateral) {
        // Update overlay with locked position to ensure it stays visible
        updateHandMenuOverlay(lockedQuadrilateral);
        return;
    }
    
    if (!results.multiHandLandmarks || results.multiHandLandmarks.length < 2) {
        // Need both hands for quadrilateral
        // Reset lock timer if hands are not detected
        handMenuLockStartTime = null;
        hideHandMenuOverlay();
        return;
    }
    
    // Throttle updates
    const now = Date.now();
    if (now - lastQuadrilateralUpdate < QUADRILATERAL_UPDATE_THROTTLE) {
        return;
    }
    lastQuadrilateralUpdate = now;
    
    // Get landmarks and handedness for both hands
    const landmarks = results.multiHandLandmarks;
    const handedness = results.multiHandedness || [];
    
    // Identify left and right hands
    let leftHand = null;
    let rightHand = null;
    
    for (let i = 0; i < landmarks.length; i++) {
        const hand = landmarks[i];
        const handInfo = handedness[i] || {};
        const handLabel = handInfo.displayName || handInfo.categoryName || '';
        
        if (handLabel.toLowerCase().includes('left')) {
            leftHand = hand;
        } else if (handLabel.toLowerCase().includes('right')) {
            rightHand = hand;
        }
    }
    
    // If we can't determine handedness, use position-based detection
    // (left hand typically has lower x coordinate in normalized space)
    if (!leftHand || !rightHand) {
        if (landmarks.length >= 2) {
            // Use first hand as left, second as right (or vice versa based on x position)
            const hand0 = landmarks[0];
            const hand1 = landmarks[1];
            
            // Get wrist position (landmark 0) to determine which is left/right
            const hand0X = hand0[0].x;
            const hand1X = hand1[0].x;
            
            if (hand0X < hand1X) {
                leftHand = hand0;
                rightHand = hand1;
            } else {
                leftHand = hand1;
                rightHand = hand0;
            }
        } else {
            hideHandMenuOverlay();
            return;
        }
    }
    
    // Extract thumb tip (#4) and index tip (#8) from both hands
    const THUMB_TIP = 4;
    const INDEX_TIP = 8;
    
    const leftThumb = leftHand[THUMB_TIP];
    const leftIndex = leftHand[INDEX_TIP];
    const rightThumb = rightHand[THUMB_TIP];
    const rightIndex = rightHand[INDEX_TIP];
    
    // Validate that all required landmarks are present and have valid coordinates
    if (!leftThumb || !leftIndex || !rightThumb || !rightIndex) {
        hideHandMenuOverlay();
        return;
    }
    
    // Create quadrilateral: [leftThumb, rightThumb, rightIndex, leftIndex]
    // Order: bottom-left, bottom-right, top-right, top-left (counter-clockwise)
    const quadrilateral = {
        leftThumb: { x: leftThumb.x, y: leftThumb.y },
        rightThumb: { x: rightThumb.x, y: rightThumb.y },
        rightIndex: { x: rightIndex.x, y: rightIndex.y },
        leftIndex: { x: leftIndex.x, y: leftIndex.y }
    };
    
    handMenuQuadrilateral = quadrilateral;
    
    // Check for automatic locking
    checkHandMenuLock(quadrilateral);
    
    // Update overlay with quadrilateral
    updateHandMenuOverlay(quadrilateral);
}

/**
 * Check if hand menu should be automatically locked
 * @param {Object} quadrilateral - Current quadrilateral
 */
function checkHandMenuLock(quadrilateral) {
    const now = Date.now();
    
    // If we have a valid quadrilateral, start or continue tracking lock timer
    if (quadrilateral) {
        if (handMenuLockStartTime === null) {
            // Start tracking lock timer
            handMenuLockStartTime = now;
        } else {
            // Check if threshold has been met
            const elapsed = now - handMenuLockStartTime;
            if (elapsed >= handMenuLockThreshold && !handMenuLocked) {
                // Lock the menu
                lockHandMenu(quadrilateral);
            }
        }
    } else {
        // Reset timer if quadrilateral is invalid
        handMenuLockStartTime = null;
    }
}

/**
 * Lock the hand menu at current position
 * @param {Object} quadrilateral - Quadrilateral to lock at
 */
function lockHandMenu(quadrilateral) {
    handMenuLocked = true;
    lockedQuadrilateral = quadrilateral;
    handMenuLockStartTime = null; // Reset timer
    
    // Update visual indicators
    updateHandMenuLockIndicator();
    
    // Show unlock button
    showHandMenuUnlockButton();
    
    console.log('Hand menu locked at position:', quadrilateral);
}

/**
 * Unlock the hand menu
 */
export function unlockHandMenu() {
    handMenuLocked = false;
    lockedQuadrilateral = null;
    handMenuLockStartTime = null; // Reset timer
    
    // Update visual indicators
    updateHandMenuLockIndicator();
    
    // Hide unlock button
    hideHandMenuUnlockButton();
    
    console.log('Hand menu unlocked');
}

/**
 * Update hand menu lock indicator
 */
function updateHandMenuLockIndicator() {
    if (!handMenuLockIndicator) {
        return;
    }
    
    if (handMenuLocked) {
        handMenuLockIndicator.classList.add('locked');
        handMenuLockIndicator.classList.remove('unlocked');
        handMenuLockIndicator.innerHTML = '🔒 Locked';
    } else {
        handMenuLockIndicator.classList.add('unlocked');
        handMenuLockIndicator.classList.remove('locked');
        handMenuLockIndicator.innerHTML = '🔓 Unlocked';
    }
}

/**
 * Show unlock button
 */
function showHandMenuUnlockButton() {
    if (handMenuUnlockButton) {
        handMenuUnlockButton.style.display = 'flex';
    }
}

/**
 * Hide unlock button
 */
function hideHandMenuUnlockButton() {
    if (handMenuUnlockButton) {
        handMenuUnlockButton.style.display = 'none';
    }
}

/**
 * Update hand menu overlay with quadrilateral
 * @param {Object} quadrilateral - Quadrilateral with {leftThumb, rightThumb, rightIndex, leftIndex}
 */
function updateHandMenuOverlay(quadrilateral) {
    if (!handMenuOverlay || !handMenuQuadrilateralSVG || !handMenuButtons) {
        return;
    }
    
    // If menu is locked, use locked quadrilateral instead of current one
    const quadToUse = handMenuLocked && lockedQuadrilateral ? lockedQuadrilateral : quadrilateral;
    
    // Show overlay
    handMenuOverlay.style.display = 'block';
    
    // Hide prompt when quadrilateral is detected
    hideHandMenuPrompt();
    
    // Update SVG quadrilateral visualization
    const path = document.getElementById('quadrilateral-path');
    if (path) {
        // Create points string for SVG polygon
        // Order: leftThumb (bottom-left), rightThumb (bottom-right), rightIndex (top-right), leftIndex (top-left)
        const points = [
            `${quadToUse.leftThumb.x},${quadToUse.leftThumb.y}`,      // Bottom-left
            `${quadToUse.rightThumb.x},${quadToUse.rightThumb.y}`,    // Bottom-right
            `${quadToUse.rightIndex.x},${quadToUse.rightIndex.y}`,    // Top-right
            `${quadToUse.leftIndex.x},${quadToUse.leftIndex.y}`       // Top-left
        ].join(' ');
        
        path.setAttribute('points', points);
        
        // Update visual style based on lock status
        if (handMenuLocked) {
            path.classList.add('locked');
        } else {
            path.classList.remove('locked');
        }
    }
    
    // Calculate transform to map buttons to quadrilateral
    // Use CSS clip-path or transform to warp buttons into quadrilateral
    mapButtonsToQuadrilateral(quadToUse);
    
    // Update button highlighting based on pinch location
    updateHandMenuButtonHighlighting();
}

/**
 * Map menu buttons to quadrilateral using CSS transforms
 * @param {Object} quadrilateral - Quadrilateral coordinates
 */
function mapButtonsToQuadrilateral(quadrilateral) {
    if (!handMenuButtons || !videoElement) {
        return;
    }
    
    // Get video element dimensions and position
    const videoRect = videoElement.getBoundingClientRect();
    const videoWidth = videoElement.videoWidth || videoRect.width;
    const videoHeight = videoElement.videoHeight || videoRect.height;
    
    // Convert normalized coordinates to screen coordinates
    // Account for object-fit: cover if needed
    const screenCoords = {
        leftThumb: mapNormalizedToScreen(quadrilateral.leftThumb.x, quadrilateral.leftThumb.y),
        rightThumb: mapNormalizedToScreen(quadrilateral.rightThumb.x, quadrilateral.rightThumb.y),
        rightIndex: mapNormalizedToScreen(quadrilateral.rightIndex.x, quadrilateral.rightIndex.y),
        leftIndex: mapNormalizedToScreen(quadrilateral.leftIndex.x, quadrilateral.leftIndex.y)
    };
    
    // Calculate bounding box of quadrilateral
    const minX = Math.min(screenCoords.leftThumb.x, screenCoords.rightThumb.x, screenCoords.rightIndex.x, screenCoords.leftIndex.x);
    const maxX = Math.max(screenCoords.leftThumb.x, screenCoords.rightThumb.x, screenCoords.rightIndex.x, screenCoords.leftIndex.x);
    const minY = Math.min(screenCoords.leftThumb.y, screenCoords.rightThumb.y, screenCoords.rightIndex.y, screenCoords.leftIndex.y);
    const maxY = Math.max(screenCoords.leftThumb.y, screenCoords.rightThumb.y, screenCoords.rightIndex.y, screenCoords.leftIndex.y);
    
    const quadWidth = maxX - minX;
    const quadHeight = maxY - minY;
    
    // Position and scale the buttons container to fit the quadrilateral
    handMenuButtons.style.left = `${minX}px`;
    handMenuButtons.style.top = `${minY}px`;
    handMenuButtons.style.width = `${quadWidth}px`;
    handMenuButtons.style.height = `${quadHeight}px`;
    
    // Use CSS clip-path to create quadrilateral shape
    // clip-path: polygon(x1% y1%, x2% y2%, x3% y3%, x4% y4%)
    const clipPath = `polygon(
        ${((screenCoords.leftThumb.x - minX) / quadWidth) * 100}% ${((screenCoords.leftThumb.y - minY) / quadHeight) * 100}%,
        ${((screenCoords.rightThumb.x - minX) / quadWidth) * 100}% ${((screenCoords.rightThumb.y - minY) / quadHeight) * 100}%,
        ${((screenCoords.rightIndex.x - minX) / quadWidth) * 100}% ${((screenCoords.rightIndex.y - minY) / quadHeight) * 100}%,
        ${((screenCoords.leftIndex.x - minX) / quadWidth) * 100}% ${((screenCoords.leftIndex.y - minY) / quadHeight) * 100}%
    )`;
    
    handMenuButtons.style.clipPath = clipPath;
    handMenuButtons.style.webkitClipPath = clipPath;
}

/**
 * Update hand menu button highlighting based on pinch location
 */
function updateHandMenuButtonHighlighting() {
    if (!handMenuModeEnabled || !pinchLocation) {
        // Clear all highlights
        handMenuButtonElements.forEach(btn => {
            if (btn.element) {
                btn.element.classList.remove('highlighted');
            }
        });
        // Also clear unlock button highlight
        if (handMenuUnlockButton) {
            handMenuUnlockButton.classList.remove('highlighted');
        }
        return;
    }
    
    // Map pinch location to screen coordinates
    const screenCoords = mapNormalizedToScreen(pinchLocation.x, pinchLocation.y);
    
    // Check if pinch is over unlock button first
    if (handMenuUnlockButton && handMenuLocked) {
        const unlockRect = handMenuUnlockButton.getBoundingClientRect();
        const isOverUnlock = (
            screenCoords.x >= unlockRect.left &&
            screenCoords.x <= unlockRect.right &&
            screenCoords.y >= unlockRect.top &&
            screenCoords.y <= unlockRect.bottom
        );
        
        if (isOverUnlock && currentPinchState) {
            handMenuUnlockButton.classList.add('highlighted');
        } else {
            handMenuUnlockButton.classList.remove('highlighted');
        }
    }
    
    // Check which button the pinch is over
    if (handMenuButtonElements.length > 0) {
        handMenuButtonElements.forEach(btn => {
            if (!btn.element) {
                return;
            }
            
            const rect = btn.element.getBoundingClientRect();
            const isOverButton = (
                screenCoords.x >= rect.left &&
                screenCoords.x <= rect.right &&
                screenCoords.y >= rect.top &&
                screenCoords.y <= rect.bottom
            );
            
            if (isOverButton && currentPinchState) {
                btn.element.classList.add('highlighted');
            } else {
                btn.element.classList.remove('highlighted');
            }
        });
    }
}

/**
 * Hide hand menu overlay
 */
function hideHandMenuOverlay() {
    // Don't hide if menu is locked (keep it visible)
    if (handMenuLocked) {
        return;
    }
    
    if (handMenuOverlay) {
        handMenuOverlay.style.display = 'none';
    }
    handMenuQuadrilateral = null;
    
    // Reset lock timer
    handMenuLockStartTime = null;
    
    // Show prompt when hands are not detected
    showHandMenuPrompt();
}

/**
 * Show hand menu prompt
 */
function showHandMenuPrompt() {
    if (!handMenuModeEnabled) {
        return;
    }
    
    const prompt = document.getElementById('hand-menu-prompt');
    if (prompt) {
        prompt.classList.remove('hidden');
    }
}

/**
 * Hide hand menu prompt
 */
function hideHandMenuPrompt() {
    const prompt = document.getElementById('hand-menu-prompt');
    if (prompt) {
        prompt.classList.add('hidden');
    }
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
    
    // Cleanup hand menu
    if (handMenuLocked) {
        unlockHandMenu();
    }
    hideHandMenuOverlay();
    handMenuModeEnabled = false;
    handMenuLockStartTime = null;
    lockedQuadrilateral = null;
    
    isInitialized = false;
    console.log('Sign language recognition cleaned up');
}
