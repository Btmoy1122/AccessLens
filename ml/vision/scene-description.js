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
import '@tensorflow/tfjs';
import { getAllActiveFaces } from './face-recognition.js';

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
        
        // Load COCO-SSD model
        console.log('Loading COCO-SSD model...');
        model = await cocoSsd.load();
        
        console.log('Scene description initialized successfully');
        return true;
    } catch (error) {
        console.error('Error initializing scene description:', error);
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
        // Detect objects in the current video frame
        const predictions = await model.detect(videoElement);
        
        // Generate description from predictions
        const description = generateDescription(predictions);
        
        // Narrate the description if valid
        if (description) {
            narrateDescription(description);
        }
    } catch (error) {
        console.error('Error during object detection:', error);
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
        return null;
    }
    
    // Get person bounding box (COCO-SSD uses bbox format [x, y, width, height])
    const personBox = personDetection.bbox;
    if (!personBox) {
        return null;
    }
    
    // Check each recognized face for overlap
    for (const face of recognizedFaces) {
        // Only match recognized faces (not unknown)
        if (!face.isRecognized || !face.faceData || !face.faceData.name) {
            continue;
        }
        
        // Get face bounding box
        if (face.detection && face.detection.detection && face.detection.detection.box) {
            const faceBox = face.detection.detection.box;
            
            // Check if boxes overlap
            if (boxesOverlap(personBox, faceBox, 150)) {
                return face.faceData;
            }
        }
    }
    
    return null;
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
    let recognizedFaces = [];
    try {
        recognizedFaces = getAllActiveFaces();
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
    
    // Process each prediction and replace "person" with names if recognized
    const processedObjects = validPredictions.map(prediction => {
        // If it's a person, try to match with recognized faces
        if (prediction.class === 'person' && prediction.bbox) {
            const matchingFace = findMatchingFace(prediction, recognizedFaces);
            if (matchingFace && matchingFace.name) {
                // Use person's name instead of "person"
                return matchingFace.name;
            }
            // If no match found, use "unknown person" instead of "person"
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

