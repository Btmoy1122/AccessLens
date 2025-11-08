/**
 * Speech-to-Text Module
 * 
 * Provides real-time speech recognition and AR caption overlay
 * 
 * Features:
 * - Web Speech API integration
 * - AR text overlay positioning
 * - Timed fade-out animations
 */

// Speech recognition instance
let recognition = null;
let isListening = false;

/**
 * Initialize speech-to-text recognition
 */
export function initSpeechToText() {
    // Check browser support
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
        console.error('Speech recognition not supported in this browser');
        return;
    }
    
    // Initialize Speech Recognition API
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SpeechRecognition();
    
    // Configure recognition
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US'; // Default language
    
    // Event handlers
    recognition.onresult = handleSpeechResult;
    recognition.onerror = handleSpeechError;
    recognition.onend = handleSpeechEnd;
    
    console.log('Speech-to-text initialized');
}

/**
 * Start listening for speech
 */
export function startListening() {
    if (recognition && !isListening) {
        recognition.start();
        isListening = true;
        console.log('Speech recognition started');
    }
}

/**
 * Stop listening for speech
 */
export function stopListening() {
    if (recognition && isListening) {
        recognition.stop();
        isListening = false;
        console.log('Speech recognition stopped');
    }
}

/**
 * Handle speech recognition results
 */
function handleSpeechResult(event) {
    // TODO: Process speech results
    // TODO: Create AR text overlay
    // TODO: Position text based on speaker location
    // TODO: Add fade-out animation
    
    const transcript = event.results[event.results.length - 1][0].transcript;
    console.log('Speech detected:', transcript);
    
    // Example: Create AR text entity
    // const textEntity = document.createElement('a-text');
    // textEntity.setAttribute('value', transcript);
    // textEntity.setAttribute('position', '0 1.6 -1');
    // document.querySelector('a-scene').appendChild(textEntity);
}

/**
 * Handle speech recognition errors
 */
function handleSpeechError(event) {
    console.error('Speech recognition error:', event.error);
}

/**
 * Handle speech recognition end
 */
function handleSpeechEnd() {
    isListening = false;
    // Optionally restart if needed
    // recognition.start();
}

/**
 * Change recognition language
 */
export function setLanguage(lang) {
    if (recognition) {
        recognition.lang = lang;
    }
}

