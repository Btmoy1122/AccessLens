/**
 * Scene Description Module
 * 
 * Provides audio narration of scenes and objects for visually impaired users.
 * Uses TensorFlow.js COCO-SSD for object detection and Web Speech Synthesis API for narration.
 * Integrates with face recognition to identify recognized people by name.
 * 
 * Features:
 * - Real-time object detection using COCO-SSD model
 * - Natural language description generation
 * - Audio narration using browser's speech synthesis
 * - Integration with face recognition to identify recognized people by name
 * - Configurable detection interval and confidence threshold
 * 
 * @module ml/vision/scene-description
 */

import * as cocoSsd from '@tensorflow-models/coco-ssd';
import * as tf from '@tensorflow/tfjs';
import { getAllActiveFaces, getAllRecognizedFaces } from './face-recognition.js';

// Force CPU backend on Mac to avoid WebGL context issues
// This is a workaround for "Failed to create WebGL canvas context" errors
// Must be done before any TensorFlow operations
const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;

// Disable WebGL backend on Mac before TensorFlow.js initializes
if (isMac) {
    // Try to disable WebGL backend registration entirely
    // This prevents TensorFlow from even trying to use WebGL
    try {
        // Set environment flag to disable WebGL
        if (typeof process !== 'undefined' && process.env) {
            process.env.TFJS_FORCE_CPU = '1';
        }
        
        // Override WebGL backend registration if possible
        const originalRegisterBackend = tf.registerBackend;
        if (originalRegisterBackend) {
            tf.registerBackend = function(name, factory, priority) {
                // Skip WebGL backend registration on Mac
                if (name === 'webgl' || name === 'webgpu') {
                    console.log('Skipping WebGL backend registration on Mac');
                    return false;
                }
                return originalRegisterBackend.call(this, name, factory, priority);
            };
        }
    } catch (err) {
        console.warn('Could not disable WebGL backend registration:', err);
    }
    
    // Register CPU backend and set it as default before any operations
    // This prevents TensorFlow from trying to use WebGL
    (async () => {
        try {
            // Wait for TensorFlow to be ready
            await tf.ready();
            // Set CPU backend immediately
            await tf.setBackend('cpu');
            await tf.ready();
            console.log('TensorFlow.js using CPU backend (Mac compatibility)');
        } catch (err) {
            console.warn('Could not set CPU backend initially:', err);
        }
    })();
}

// Configuration constants
const DETECTION_INTERVAL_MS = 4000; // Run detection every 4 seconds
const MIN_CONFIDENCE_SCORE = 0.5; // Only narrate objects with confidence >= 0.5
const MAX_OBJECTS_TO_NARRATE = 5; // Limit narration to top 5 objects

// Module state
let model = null;
let isDescribing = false;
let speechSynthesis = null;
let videoElement = null;
let detectionTimeoutId = null;
let detectionCanvas = null;
let detectionCtx = null;

/**
 * Initialize scene description module.
 * Loads the COCO-SSD model and initializes speech synthesis.
 * 
 * @returns {Promise<boolean>} True if initialization successful, false otherwise
 */
export async function initSceneDescription() {
    try {
        // Check if speech synthesis is available
        if (!('speechSynthesis' in window)) {
            console.warn('Speech Synthesis API not available in this browser');
            return false;
        }
        
        speechSynthesis = window.speechSynthesis;
        
        // On Mac, ensure CPU backend is set before loading model
        // This is critical to avoid WebGL context errors
        if (isMac) {
            try {
                // Wait for TensorFlow to be ready first
                await tf.ready();
                // Set CPU backend
                await tf.setBackend('cpu');
                // Wait for backend to be ready
                await tf.ready();
                console.log('TensorFlow.js using CPU backend (Mac compatibility)');
                
                // Verify backend is actually set to CPU
                const currentBackend = tf.getBackend();
                if (currentBackend !== 'cpu') {
                    console.warn(`Backend is ${currentBackend}, not CPU. This may cause WebGL errors on Mac.`);
                }
            } catch (backendError) {
                console.warn('Could not set CPU backend, will try default:', backendError);
            }
        } else {
            // On non-Mac, wait for TensorFlow to be ready
            await tf.ready();
        }
        
        // Load COCO-SSD model
        console.log('Loading COCO-SSD model...');
        model = await cocoSsd.load();
        
        console.log('Scene description initialized successfully');
        return true;
    } catch (error) {
        const errorMsg = error.message || error.toString() || '';
        console.error('Error initializing scene description:', error);
        
        // If WebGL error, try to switch to CPU and reload
        if (errorMsg.includes('WebGL') || errorMsg.includes('canvas context')) {
            console.warn('WebGL error detected, trying CPU backend...');
            try {
                // Force CPU backend
                await tf.setBackend('cpu');
                await tf.ready();
                console.log('Switched to CPU backend, retrying model load...');
                model = await cocoSsd.load();
                console.log('Scene description initialized successfully with CPU backend');
                return true;
            } catch (retryError) {
                console.error('Failed to load model even with CPU backend:', retryError);
                // Don't show alert - just return false silently
                return false;
            }
        }
        
        // For other errors, also don't show alerts
        return false;
    }
}

/**
 * Set the video element for object detection.
 * This must be called after the camera is initialized.
 * 
 * @param {HTMLVideoElement} video - The video element containing the camera feed
 */
export function setVideoElement(video) {
    if (video && video instanceof HTMLVideoElement) {
        videoElement = video;
        
        // Create a canvas for processing video frames
        // This helps avoid WebGL context issues on Mac
        if (!detectionCanvas) {
            detectionCanvas = document.createElement('canvas');
            detectionCanvas.style.display = 'none';
            detectionCanvas.style.position = 'absolute';
            detectionCanvas.style.top = '0';
            detectionCanvas.style.left = '0';
            document.body.appendChild(detectionCanvas);
            detectionCtx = detectionCanvas.getContext('2d', { 
                willReadFrequently: true,
                alpha: false 
            });
        }
        
        console.log('Video element set for scene description');
    } else {
        console.warn('Invalid video element provided to setVideoElement');
    }
}

/**
 * Start scene description.
 * Begins the detection loop that processes video frames and narrates detected objects.
 */
export function startDescription() {
    // Validate prerequisites
    if (!model) {
        console.error('Cannot start scene description: Model not loaded');
        return;
    }
    
    if (!videoElement) {
        console.error('Cannot start scene description: Video element not set');
        return;
    }
    
    if (!speechSynthesis) {
        console.error('Cannot start scene description: Speech synthesis not available');
        return;
    }
    
    // Check if video element is ready
    if (!videoElement.videoWidth || !videoElement.videoHeight) {
        console.warn('Video element not ready, waiting...');
        // Retry after a short delay
        setTimeout(() => startDescription(), 500);
        return;
    }
    
    if (!isDescribing) {
        isDescribing = true;
        console.log('Scene description started');
        // Start the detection loop
        detectLoop();
    }
}

/**
 * Stop scene description.
 * Stops the detection loop and cancels any ongoing narration.
 */
export function stopDescription() {
    if (isDescribing) {
        isDescribing = false;
        
        // Clear any pending detection timeout
        if (detectionTimeoutId) {
            clearTimeout(detectionTimeoutId);
            detectionTimeoutId = null;
        }
        
        // Cancel any ongoing speech
        if (speechSynthesis) {
            speechSynthesis.cancel();
        }
        
        console.log('Scene description stopped');
    }
}

/**
 * Main detection loop.
 * Processes video frames at regular intervals and narrates detected objects.
 * Uses a recursive timeout pattern to maintain consistent timing.
 */
async function detectLoop() {
    // Exit if description was stopped
    if (!isDescribing || !model || !videoElement) {
        return;
    }
    
    // Validate video element is still ready
    if (!videoElement.videoWidth || !videoElement.videoHeight || videoElement.paused) {
        console.warn('Video element not ready, skipping detection');
        // Retry after interval
        detectionTimeoutId = setTimeout(detectLoop, DETECTION_INTERVAL_MS);
        return;
    }
    
    try {
        // Ensure CPU backend is set on Mac before detection
        if (navigator.platform.toUpperCase().indexOf('MAC') >= 0) {
            const currentBackend = tf.getBackend();
            if (currentBackend !== 'cpu') {
                try {
                    await tf.setBackend('cpu');
                    await tf.ready();
                    console.log('Switched to CPU backend for detection (Mac compatibility)');
                } catch (backendError) {
                    console.warn('Could not switch to CPU backend:', backendError);
                }
            }
        }
        
        // Use canvas instead of video element directly to avoid WebGL context issues
        // This is especially important on Mac
        let imageSource = videoElement;
        
        if (detectionCanvas && detectionCtx && videoElement.videoWidth > 0 && videoElement.videoHeight > 0) {
            // Set canvas dimensions to match video
            if (detectionCanvas.width !== videoElement.videoWidth || 
                detectionCanvas.height !== videoElement.videoHeight) {
                detectionCanvas.width = videoElement.videoWidth;
                detectionCanvas.height = videoElement.videoHeight;
            }
            
            // Draw video frame to canvas
            try {
                detectionCtx.drawImage(videoElement, 0, 0, detectionCanvas.width, detectionCanvas.height);
                imageSource = detectionCanvas;
            } catch (drawError) {
                // If drawing fails, fall back to using video element directly
                console.warn('Could not draw video to canvas, using video element directly:', drawError);
                imageSource = videoElement;
            }
        }
        
        // Detect objects in the current video frame
        // Wrap in try-catch to handle WebGL errors gracefully
        let predictions;
        try {
            predictions = await model.detect(imageSource);
        } catch (detectError) {
            // If detection fails with WebGL error, try to switch to CPU and retry once
            const errorMsg = detectError.message || detectError.toString() || '';
            if (errorMsg.includes('WebGL') || errorMsg.includes('canvas context')) {
                console.warn('WebGL error during detection, switching to CPU backend...');
                try {
                    await tf.setBackend('cpu');
                    await tf.ready();
                    // Retry detection with CPU backend
                    predictions = await model.detect(imageSource);
                } catch (retryError) {
                    console.error('Detection failed even with CPU backend:', retryError);
                    // Continue loop without predictions
                    predictions = [];
                }
            } else {
                throw detectError; // Re-throw if it's not a WebGL error
            }
        }
        
        // Generate description from predictions
        const description = generateDescription(predictions);
        
        // Narrate the description if valid
        if (description) {
            narrateDescription(description);
        }
    } catch (error) {
        // Check if it's a WebGL context error
        const errorMessage = error.message || error.toString() || '';
        if (errorMessage.includes('WebGL') || errorMessage.includes('canvas context')) {
            console.warn('WebGL context error detected. This is a known issue on Mac. Trying CPU backend...');
            // Try to force CPU backend
            try {
                await tf.setBackend('cpu');
                await tf.ready();
                console.log('Switched to CPU backend after error');
                // Don't retry detection in this loop iteration to avoid infinite loop
            } catch (backendError) {
                console.error('Could not switch to CPU backend:', backendError);
            }
        } else {
            console.error('Error during object detection:', error);
        }
        // Continue the loop even if detection fails
    }
    
    // Schedule next detection
    if (isDescribing) {
        detectionTimeoutId = setTimeout(detectLoop, DETECTION_INTERVAL_MS);
    }
}

/**
 * Check if two bounding boxes overlap or are close to each other.
 * Used to match person detections with recognized faces.
 * 
 * @param {Object} box1 - First bounding box {x, y, width, height} or [x, y, width, height]
 * @param {Object} box2 - Second bounding box {x, y, width, height}
 * @param {number} threshold - Maximum distance between centers to consider a match (in pixels)
 * @returns {boolean} True if boxes overlap or are close
 */
function boxesOverlap(box1, box2, threshold = 100) {
    // Handle both array format [x, y, width, height] and object format {x, y, width, height}
    const x1 = Array.isArray(box1) ? box1[0] : box1.x;
    const y1 = Array.isArray(box1) ? box1[1] : box1.y;
    const w1 = Array.isArray(box1) ? box1[2] : box1.width;
    const h1 = Array.isArray(box1) ? box1[3] : box1.height;
    
    // Calculate center points
    const centerX1 = x1 + w1 / 2;
    const centerY1 = y1 + h1 / 2;
    const centerX2 = box2.x + box2.width / 2;
    const centerY2 = box2.y + box2.height / 2;
    
    // Calculate distance between centers
    const distance = Math.sqrt(
        Math.pow(centerX1 - centerX2, 2) + 
        Math.pow(centerY1 - centerY2, 2)
    );
    
    // Check if distance is within threshold
    return distance < threshold;
}

/**
 * Find recognized face that matches a person detection by position.
 * 
 * @param {Object} personDetection - Person detection from COCO-SSD with bbox
 * @param {Array} recognizedFaces - Array of recognized faces from face recognition
 * @returns {Object|null} Matched face data or null if no match
 */
function findMatchingFace(personDetection, recognizedFaces) {
    if (!recognizedFaces || recognizedFaces.length === 0) {
        console.log('Scene description: No recognized faces available for matching');
        return null;
    }
    
    // Get person bounding box (COCO-SSD uses bbox format [x, y, width, height])
    const personBox = personDetection.bbox;
    if (!personBox || !Array.isArray(personBox) || personBox.length < 4) {
        console.log('Scene description: Invalid person box:', personBox);
        return null;
    }
    
    // COCO-SSD bbox format: [x, y, width, height] in pixels relative to video native resolution
    const [personX, personY, personWidth, personHeight] = personBox;
    const personCenterX = personX + personWidth / 2;
    const personCenterY = personY + personHeight / 2;
    
    console.log(`Scene description: Looking for face match for person at (${personCenterX.toFixed(1)}, ${personCenterY.toFixed(1)}) size ${personWidth.toFixed(1)}x${personHeight.toFixed(1)}`);
    console.log(`Scene description: Checking ${recognizedFaces.length} recognized faces:`, 
        recognizedFaces.map(f => f.faceData.name));
    
    // Check each recognized face for overlap
    // Faces are already filtered to be recognized with names, but double-check
    let bestMatch = null;
    let closestDistance = Infinity;
    
    for (const face of recognizedFaces) {
        // Skip if missing required data
        if (!face.faceData || !face.faceData.name || face.faceData.name === 'Unknown') {
            console.log(`Scene description: Skipping face - missing data or unknown:`, face.faceData?.name);
            continue;
        }
        
        // Get face bounding box
        if (face.detection && face.detection.detection && face.detection.detection.box) {
            const faceBox = face.detection.detection.box;
            
            // face-api.js box format: {x, y, width, height} in pixels relative to video native resolution
            const faceCenterX = faceBox.x + faceBox.width / 2;
            const faceCenterY = faceBox.y + faceBox.height / 2;
            
            // Calculate distance between centers
            const distance = Math.sqrt(
                Math.pow(personCenterX - faceCenterX, 2) + 
                Math.pow(personCenterY - faceCenterY, 2)
            );
            
            // Calculate overlap area to help with matching
            // Check if face center is within person box (more lenient matching)
            const faceInPersonBox = (
                faceCenterX >= personX && 
                faceCenterX <= personX + personWidth &&
                faceCenterY >= personY && 
                faceCenterY <= personY + personHeight
            );
            
            // Also check if person center is near face (within reasonable distance)
            // Person boxes are larger, so face should be inside person box
            // Use a very lenient threshold based on person box size - if face is within person box or close to it
            // Increased to 80% to handle cases where coordinates might be slightly off
            const maxDistance = Math.max(personWidth, personHeight) * 0.8; // 80% of person box dimension (very lenient)
            
            // Also check if person center is in the upper portion of person box (where face typically is)
            // Faces are usually in the top 40% of a person's body
            const personTopPortion = personY + personHeight * 0.4;
            const faceInPersonHeadArea = faceCenterY >= personY && faceCenterY <= personTopPortion;
            
            console.log(`Scene description: Checking ${face.faceData.name} - face at (${faceCenterX.toFixed(1)}, ${faceCenterY.toFixed(1)}) size ${faceBox.width.toFixed(1)}x${faceBox.height.toFixed(1)}, distance: ${distance.toFixed(1)}px, inPersonBox: ${faceInPersonBox}, maxDistance: ${maxDistance.toFixed(1)}px`);
            
            // Match if face center is within person box OR within reasonable distance
            // Also check if face box overlaps with person box at all (even partially)
            const faceBoxOverlaps = (
                faceBox.x < personX + personWidth &&
                faceBox.x + faceBox.width > personX &&
                faceBox.y < personY + personHeight &&
                faceBox.y + faceBox.height > personY
            );
            
            // Very lenient matching: match if face is in person box, close to person, boxes overlap, OR face is in head area
            // This handles cases where coordinates might be slightly off or timing is mismatched
            if (faceInPersonBox || faceBoxOverlaps || distance < maxDistance || faceInPersonHeadArea) {
                // Calculate a match score - prefer matches that are closer and more certain
                // Lower score is better (distance-based)
                let matchScore = distance;
                
                // Boost score if face is in person box (very likely match)
                if (faceInPersonBox) {
                    matchScore *= 0.5;
                }
                
                // Boost score if face is in head area (faces are typically in upper body)
                if (faceInPersonHeadArea) {
                    matchScore *= 0.7;
                }
                
                // Boost score if boxes overlap (definite overlap)
                if (faceBoxOverlaps) {
                    matchScore *= 0.6;
                }
                
                // Track best match based on score (lower is better)
                if (matchScore < closestDistance) {
                    closestDistance = matchScore;
                    bestMatch = face.faceData;
                    console.log(`Scene description: New best match: ${bestMatch.name} (score: ${matchScore.toFixed(1)}, distance: ${distance.toFixed(1)}px, inBox: ${faceInPersonBox}, overlaps: ${faceBoxOverlaps}, inHeadArea: ${faceInPersonHeadArea})`);
                }
            }
        } else {
            console.log(`Scene description: Skipping ${face.faceData.name} - no detection box`);
        }
    }
    
    // Fallback matching strategies if no match found:
    // 1. If exactly one person and one recognized face, assume they match
    // 2. If multiple people and faces, match largest person to largest face (simple heuristic)
    if (!bestMatch) {
        if (recognizedFaces.length === 1) {
            // Single face - assume it matches the person
            const singleFace = recognizedFaces[0];
            if (singleFace.faceData && singleFace.faceData.name && singleFace.faceData.name !== 'Unknown') {
                console.log(`Scene description: Fallback match - single person and single recognized face (${singleFace.faceData.name})`);
                bestMatch = singleFace.faceData;
            }
        } else if (recognizedFaces.length > 0) {
            // Multiple faces - try to match based on size/position
            // Find the largest face (most prominent) as a fallback
            let largestFace = null;
            let largestSize = 0;
            
            for (const face of recognizedFaces) {
                if (face.detection && face.detection.detection && face.detection.detection.box) {
                    const faceBox = face.detection.detection.box;
                    const size = faceBox.width * faceBox.height;
                    if (size > largestSize) {
                        largestSize = size;
                        largestFace = face;
                    }
                }
            }
            
            // If person box is also large, match to largest face (simple heuristic)
            const personSize = personWidth * personHeight;
            if (largestFace && personSize > 50000) { // Only for reasonably sized person detections
                console.log(`Scene description: Fallback match - matching large person to largest face (${largestFace.faceData.name})`);
                bestMatch = largestFace.faceData;
            }
        }
    }
    
    if (bestMatch) {
        console.log(`Scene description: ✅ MATCHED person to ${bestMatch.name} (distance: ${closestDistance !== Infinity ? closestDistance.toFixed(1) : 'N/A'}px)`);
    } else {
        console.log(`Scene description: ❌ No match found for person at (${personCenterX.toFixed(1)}, ${personCenterY.toFixed(1)})`);
        if (recognizedFaces.length > 0) {
            console.log(`Scene description: Available recognized faces: ${recognizedFaces.map(f => f.faceData.name).join(', ')}`);
        }
    }
    
    return bestMatch;
}

/**
 * Generate natural language description from object detections.
 * Filters predictions by confidence score and formats them into readable text.
 * Integrates with face recognition to identify recognized people.
 * 
 * @param {Array} predictions - Array of detection objects from COCO-SSD
 * @param {string} predictions[].class - Object class name (e.g., "person", "laptop")
 * @param {number} predictions[].score - Confidence score (0-1)
 * @param {Array} predictions[].bbox - Bounding box [x, y, width, height]
 * @returns {string|null} Natural language description or null if no valid objects
 */
function generateDescription(predictions) {
    if (!predictions || predictions.length === 0) {
        return null;
    }
    
    // Get currently recognized faces for matching
    // Use getAllActiveFaces to get faces with full detection data, then filter for recognized ones
    let recognizedFaces = [];
    try {
        const allFaces = getAllActiveFaces();
        // Filter to only recognized faces (not unknown) and ensure they have names
        recognizedFaces = allFaces.filter(face => 
            face.isRecognized && 
            face.faceData && 
            face.faceData.name && 
            face.faceData.name !== 'Unknown' &&
            face.detection &&
            face.detection.detection &&
            face.detection.detection.box
        );
        
        // Debug logging
        if (recognizedFaces.length > 0) {
            console.log(`Scene description: Found ${recognizedFaces.length} recognized faces:`, 
                recognizedFaces.map(f => ({ 
                    name: f.faceData.name, 
                    isSelf: f.faceData.isSelf,
                    hasDetection: !!f.detection,
                    hasBox: !!(f.detection?.detection?.box)
                })));
        } else {
            console.log('Scene description: No recognized faces found (allFaces count:', allFaces.length, ')');
            if (allFaces.length > 0) {
                console.log('Scene description: All faces:', allFaces.map(f => ({
                    name: f.faceData?.name || 'Unknown',
                    isRecognized: f.isRecognized,
                    hasDetection: !!f.detection
                })));
            }
        }
    } catch (error) {
        console.warn('Could not get recognized faces for scene description:', error);
    }
    
    // Filter predictions by confidence score and sort by score (highest first)
    const validPredictions = predictions
        .filter(p => p.score >= MIN_CONFIDENCE_SCORE)
        .sort((a, b) => b.score - a.score)
        .slice(0, MAX_OBJECTS_TO_NARRATE);
    
    if (validPredictions.length === 0) {
        return null;
    }
    
    // Count persons and recognized faces for fallback matching
    const personDetections = validPredictions.filter(p => p.class === 'person' && p.bbox);
    const recognizedFaceCount = recognizedFaces.length;
    
    // Process each prediction and replace "person" with names if recognized
    const processedObjects = validPredictions.map(prediction => {
        // If it's a person, try to match with recognized faces
        if (prediction.class === 'person' && prediction.bbox) {
            const matchingFace = findMatchingFace(prediction, recognizedFaces);
            if (matchingFace && matchingFace.name && matchingFace.name !== 'Unknown') {
                // Check if this is the user's own face (isSelf flag)
                if (matchingFace.isSelf === true) {
                    // Use "you" instead of name for the user
                    console.log(`Scene description: ✅ Matched person to user (you)`);
                    return 'you';
                }
                // Use person's name instead of "person"
                console.log(`Scene description: ✅ Matched person to ${matchingFace.name}`);
                return matchingFace.name;
            }
            
            // Enhanced fallback strategies when coordinate matching fails
            if (!matchingFace && recognizedFaces.length > 0) {
                // Strategy 1: Single person and single face - assume they match
                if (personDetections.length === 1 && recognizedFaceCount === 1) {
                    const singleFace = recognizedFaces[0];
                    if (singleFace.faceData && singleFace.faceData.name && singleFace.faceData.name !== 'Unknown') {
                        if (singleFace.faceData.isSelf === true) {
                            console.log(`Scene description: Fallback Strategy 1 - single person to user (you)`);
                            return 'you';
                        } else {
                            console.log(`Scene description: Fallback Strategy 1 - single person to ${singleFace.faceData.name}`);
                            return singleFace.faceData.name;
                        }
                    }
                }
                
                // Strategy 2: Multiple people/faces - use size/position heuristics
                // Find the largest recognized face as a fallback (most prominent person)
                let largestFace = null;
                let largestFaceSize = 0;
                for (const face of recognizedFaces) {
                    if (face.detection && face.detection.detection && face.detection.detection.box) {
                        const box = face.detection.detection.box;
                        const size = box.width * box.height;
                        if (size > largestFaceSize) {
                            largestFaceSize = size;
                            largestFace = face;
                        }
                    }
                }
                
                // Strategy 2a: If this is the first (largest) person detection, match to largest face
                const personSize = personWidth * personHeight;
                const isLargestPerson = personDetections.every(p => {
                    if (p === prediction) return true;
                    const otherSize = p.bbox[2] * p.bbox[3];
                    return personSize >= otherSize;
                });
                
                if (largestFace && isLargestPerson && largestFace.faceData && largestFace.faceData.name && largestFace.faceData.name !== 'Unknown') {
                    if (largestFace.faceData.isSelf === true) {
                        console.log(`Scene description: Fallback Strategy 2 - largest person to largest face (you)`);
                        return 'you';
                    } else {
                        console.log(`Scene description: Fallback Strategy 2 - largest person to largest face (${largestFace.faceData.name})`);
                        return largestFace.faceData.name;
                    }
                }
                
                // Strategy 3: Last resort - if there are recognized faces, use the first one
                // This is better than "unknown person" when faces ARE recognized
                if (recognizedFaces.length > 0) {
                    const firstFace = recognizedFaces[0];
                    if (firstFace.faceData && firstFace.faceData.name && firstFace.faceData.name !== 'Unknown') {
                        if (firstFace.faceData.isSelf === true) {
                            console.log(`Scene description: Fallback Strategy 3 - using first recognized face (you) - coordinate matching failed`);
                            return 'you';
                        } else {
                            console.log(`Scene description: Fallback Strategy 3 - using first recognized face (${firstFace.faceData.name}) - coordinate matching failed`);
                            return firstFace.faceData.name;
                        }
                    }
                }
            }
            
            // If no match found and no recognized faces, use "unknown person"
            if (recognizedFaces.length === 0) {
                console.log(`Scene description: ⚠️ Person detected but no recognized faces available`);
            } else {
                console.log(`Scene description: ⚠️ Person detected but all fallback strategies failed. Persons: ${personDetections.length}, Recognized faces: ${recognizedFaceCount} (${recognizedFaces.map(f => f.faceData.name).join(', ')})`);
            }
            return 'unknown person';
        }
        // For non-person objects, use the class name
        return prediction.class;
    });
    
    // Get unique object names (remove duplicates while preserving order)
    const seen = new Set();
    const uniqueObjects = [];
    for (const obj of processedObjects) {
        if (!seen.has(obj)) {
            seen.add(obj);
            uniqueObjects.push(obj);
        }
    }
    
    // Helper function to check if an object is a recognized person (name)
    const isName = (obj) => {
        // "you" is treated as a name (the user themselves)
        if (obj === 'you') {
            return true;
        }
        // Names are typically capitalized single words that aren't common object names
        // Also exclude "unknown person" which should be treated as an object
        return obj !== 'person' && 
               obj !== 'unknown person' &&
               obj[0] === obj[0].toUpperCase() && 
               !obj.includes(' ') &&
               !['Laptop', 'Phone', 'Book', 'Cup', 'Bottle', 'Chair', 'Table'].includes(obj);
    };
    
    // Generate natural language description
    if (uniqueObjects.length === 1) {
        const obj = uniqueObjects[0];
        if (isName(obj)) {
            return `I see ${obj}`;
        }
        return `I see a ${obj}`;
    } else if (uniqueObjects.length === 2) {
        const obj1 = uniqueObjects[0];
        const obj2 = uniqueObjects[1];
        const prefix1 = isName(obj1) ? '' : 'a ';
        const prefix2 = isName(obj2) ? '' : 'a ';
        return `I see ${prefix1}${obj1} and ${prefix2}${obj2}`;
    } else {
        // For 3+ objects, use comma-separated list with "and" before the last item
        const lastObject = uniqueObjects.pop();
        const prefixLast = isName(lastObject) ? '' : 'a ';
        
        const formattedObjects = uniqueObjects.map(obj => {
            const prefix = isName(obj) ? '' : 'a ';
            return `${prefix}${obj}`;
        });
        
        return `I see ${formattedObjects.join(', ')}, and ${prefixLast}${lastObject}`;
    }
}

/**
 * Narrate description using Web Speech Synthesis API.
 * Cancels any ongoing speech before starting new narration to avoid overlap.
 * 
 * @param {string} description - The text description to narrate
 */
function narrateDescription(description) {
    if (!speechSynthesis || !description) {
        return;
    }
    
    // Cancel any ongoing speech to avoid overlap
    speechSynthesis.cancel();
    
    // Small delay to ensure cancellation completes
    setTimeout(() => {
        // Double-check we're still describing (user might have stopped it)
        if (!isDescribing) {
            return;
        }
        
        // Create speech utterance
        const utterance = new SpeechSynthesisUtterance(description);
        utterance.rate = 1.0; // Speech rate (0.1 to 10)
        utterance.pitch = 1.0; // Pitch (0 to 2)
        utterance.volume = 1.0; // Volume (0 to 1)
        utterance.lang = 'en-US'; // Language
        
        // Speak the description
        speechSynthesis.speak(utterance);
    }, 100);
}

/**
 * Set speech speed for narration.
 * 
 * @param {number} rate - Speech rate (0.1 to 10, default 1.0)
 */
export function setSpeechSpeed(rate) {
    // This will be used in future narrations
    // For now, we hardcode it in narrateDescription()
    // TODO: Store preference and apply it in narrateDescription()
    console.log('Speech speed adjustment not yet implemented');
}

/**
 * Get current scene description status.
 * 
 * @returns {boolean} True if scene description is currently active
 */
export function isActive() {
    return isDescribing;
}

