/**
 * Speech-to-Text Module
 * 
 * Provides real-time speech recognition and caption display
 * 
 * Features:
 * - Web Speech API integration
 * - Real-time caption display
 * - Timed fade-out for captions
 */

// Speech recognition instance
let recognition = null;
let isListening = false;
let captionCallback = null;
let currentTranscript = '';
let transcriptTimeout = null;
let isRecordingMemory = false; // Whether we're recording for memory
let recordedTranscripts = []; // Accumulated transcripts during memory recording
let finalTranscriptCallback = null; // Callback for final transcripts (for memory recording)

/**
 * Initialize speech-to-text recognition
 */
export function initSpeechToText() {
    // Check browser support
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
        console.error('Speech recognition not supported in this browser');
        return false;
    }
    
    try {
        // Initialize Speech Recognition API
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        recognition = new SpeechRecognition();
        
        // Configure recognition
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-US'; // Default language
        recognition.maxAlternatives = 1;
        
        // Event handlers
        recognition.onresult = handleSpeechResult;
        recognition.onerror = handleSpeechError;
        recognition.onend = handleSpeechEnd;
        recognition.onstart = handleSpeechStart;
        
        console.log('Speech-to-text initialized');
        return true;
    } catch (error) {
        console.error('Error initializing speech recognition:', error);
        return false;
    }
}

/**
 * Set callback for caption updates
 */
export function setCaptionCallback(callback) {
    captionCallback = callback;
}

/**
 * Start listening for speech
 */
export function startListening() {
    if (!recognition) {
        const initialized = initSpeechToText();
        if (!initialized) {
            console.error('Cannot start listening: Speech recognition not available');
            if (captionCallback) {
                captionCallback('Speech recognition not supported in this browser', true);
            }
            return false;
        }
    }
    
    if (!isListening) {
        try {
            recognition.start();
            isListening = true;
            console.log('Speech recognition started');
            return true;
        } catch (error) {
            // Recognition might already be running
            if (error.name !== 'InvalidStateError') {
                console.error('Error starting speech recognition:', error);
                return false;
            }
        }
    }
    return true;
}

/**
 * Stop listening for speech
 */
export function stopListening() {
    if (recognition && isListening) {
        try {
            recognition.stop();
            isListening = false;
            currentTranscript = '';
            console.log('Speech recognition stopped');
            
            // Clear any pending transcript timeout
            if (transcriptTimeout) {
                clearTimeout(transcriptTimeout);
                transcriptTimeout = null;
            }
            
            // Clear captions
            if (captionCallback) {
                captionCallback('', false);
            }
        } catch (error) {
            console.error('Error stopping speech recognition:', error);
        }
    }
}

/**
 * Handle speech recognition start
 */
function handleSpeechStart() {
    console.log('Speech recognition started successfully');
    if (captionCallback) {
        captionCallback('Listening...', false);
    }
}

/**
 * Handle speech recognition results
 */
function handleSpeechResult(event) {
    let interimTranscript = '';
    let finalTranscript = '';
    
    // Process all results
    for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
            finalTranscript += transcript + ' ';
        } else {
            interimTranscript += transcript;
        }
    }
    
    // Update current transcript
    if (finalTranscript) {
        const finalText = finalTranscript.trim();
        currentTranscript = finalText;
        
        // If recording memory, collect this final transcript
        if (isRecordingMemory && finalText) {
            recordedTranscripts.push(finalText);
            console.log('Collected transcript for memory:', finalText);
        }
        
        // Call final transcript callback if set (for memory recording)
        if (finalTranscriptCallback && finalText) {
            finalTranscriptCallback(finalText);
        }
        
        displayCaption(currentTranscript, false);
        
        // Clear caption after 5 seconds of silence
        clearTimeout(transcriptTimeout);
        transcriptTimeout = setTimeout(() => {
            if (captionCallback) {
                captionCallback('', false);
            }
        }, 5000);
    } else if (interimTranscript) {
        // Show interim results in real-time
        displayCaption(interimTranscript, true);
    }
}

/**
 * Display caption
 */
function displayCaption(text, isInterim) {
    if (captionCallback) {
        captionCallback(text, isInterim);
    }
}

/**
 * Handle speech recognition errors
 */
function handleSpeechError(event) {
    console.error('Speech recognition error:', event.error);
    
    let errorMessage = '';
    switch (event.error) {
        case 'no-speech':
            // No speech detected - not really an error, just silence
            return;
        case 'audio-capture':
            errorMessage = 'No microphone found';
            break;
        case 'not-allowed':
            errorMessage = 'Microphone permission denied';
            break;
        case 'network':
            errorMessage = 'Network error';
            break;
        case 'aborted':
            // User or system aborted - not an error
            return;
        default:
            errorMessage = `Speech recognition error: ${event.error}`;
    }
    
    if (errorMessage && captionCallback) {
        captionCallback(errorMessage, true);
    }
    
    // Try to restart if it's a recoverable error
    if (event.error !== 'not-allowed' && event.error !== 'aborted') {
        setTimeout(() => {
            if (isListening && recognition) {
                try {
                    recognition.start();
                } catch (e) {
                    console.error('Failed to restart recognition:', e);
                }
            }
        }, 1000);
    }
}

/**
 * Handle speech recognition end
 */
function handleSpeechEnd() {
    isListening = false;
    
    // Auto-restart if we're supposed to be listening
    // This handles cases where recognition stops unexpectedly
    if (appState?.features?.speech?.enabled) {
        setTimeout(() => {
            if (appState?.features?.speech?.enabled && !isListening) {
                try {
                    recognition.start();
                } catch (e) {
                    console.error('Failed to restart recognition after end:', e);
                }
            }
        }, 100);
    }
}

/**
 * Change recognition language
 */
export function setLanguage(lang) {
    if (recognition) {
        recognition.lang = lang;
        console.log('Speech recognition language set to:', lang);
    }
}

/**
 * Get current recognition state
 */
export function isActive() {
    return isListening;
}

/**
 * Get current transcript
 */
export function getCurrentTranscript() {
    return currentTranscript;
}

// Store app state reference for auto-restart
let appState = null;
export function setAppState(state) {
    appState = state;
}

/**
 * Start recording transcripts for memory.
 * Collected transcripts will be accumulated until stopRecordingMemory() is called.
 */
export function startRecordingMemory() {
    isRecordingMemory = true;
    recordedTranscripts = []; // Reset accumulated transcripts
    console.log('Started recording memory - transcripts will be collected');
}

/**
 * Stop recording transcripts for memory.
 * 
 * @returns {string} Combined transcript of all collected transcripts
 */
export function stopRecordingMemory() {
    isRecordingMemory = false;
    const combinedTranscript = recordedTranscripts.join(' ').trim();
    recordedTranscripts = []; // Clear after getting the combined transcript
    console.log('Stopped recording memory. Collected transcript length:', combinedTranscript.length);
    return combinedTranscript;
}

/**
 * Get currently recorded transcripts (without stopping recording).
 * 
 * @returns {string} Combined transcript of all collected transcripts so far
 */
export function getRecordedTranscripts() {
    return recordedTranscripts.join(' ').trim();
}

/**
 * Check if currently recording memory.
 * 
 * @returns {boolean} True if recording memory
 */
export function isRecordingMemoryActive() {
    return isRecordingMemory;
}

/**
 * Set callback for final transcripts (useful for real-time memory recording).
 * 
 * @param {Function} callback - Callback function(transcript) called for each final transcript
 */
export function setFinalTranscriptCallback(callback) {
    finalTranscriptCallback = callback;
}
