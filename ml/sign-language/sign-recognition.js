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
        // Process each detected hand
        for (const landmarks of results.multiHandLandmarks) {
            processHandLandmarks(landmarks);
        }
    } else {
        // No hands detected - clear buffer after delay
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

    // Classify gesture
    if (aslModel) {
        await classifyGesture(normalizedLandmarks);
    } else {
        // No model available - just log that hands are detected
        console.log('Hands detected (no model for classification)');
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
