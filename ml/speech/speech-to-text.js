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
    console.log('Speech recognition started successfully (voice commands always active)');
    // Only show "Listening..." caption if speech feature is enabled
    if (captionCallback && appState?.features?.speech?.enabled) {
        captionCallback('Listening...', false);
    }
}

// Import voice commands processor
let processVoiceCommand = null;

/**
 * Set voice command processor callback
 */
export function setVoiceCommandProcessor(processor) {
    processVoiceCommand = processor;
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
        
        // Process voice commands from final transcript
        if (processVoiceCommand) {
            console.log('Processing voice command:', currentTranscript);
            processVoiceCommand(currentTranscript, true);
        } else {
            console.warn('Voice command processor not set!');
        }
        
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
    // Only show captions if speech feature is enabled
    // But always process for voice commands
    if (captionCallback && appState?.features?.speech?.enabled) {
        captionCallback(text, isInterim);
    }
}

/**
 * Handle speech recognition error
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

    // Always try to restart for voice commands (voice commands must always work)
    // Only skip restart for permission errors
    if (event.error !== 'not-allowed' && event.error !== 'aborted') {
        setTimeout(() => {
            if (recognition && !isListening) {
                try {
                    recognition.start();
                    isListening = true;
                    console.log('Speech recognition restarted after error (voice commands always active)');
                } catch (e) {
                    console.error('Failed to restart recognition:', e);
                    // Retry after a longer delay
                    setTimeout(() => {
                        if (recognition && !isListening) {
                            try {
                                recognition.start();
                                isListening = true;
                                console.log('Speech recognition restarted after error retry');
                            } catch (retryError) {
                                console.error('Failed to restart recognition after retry:', retryError);
                            }
                        }
                    }, 2000);
                }
            }
        }, 1000);
    }
}

/**
 * Handle speech recognition end
 * Always auto-restart for voice commands (voice commands must always work)
 */
function handleSpeechEnd() {
    isListening = false;
    console.log('Speech recognition ended - auto-restarting for voice commands');
    
    // Always auto-restart for voice commands (voice commands must always work)
    // This ensures voice commands are always available regardless of caption settings
    setTimeout(() => {
        if (recognition && !isListening) {
            try {
                recognition.start();
                isListening = true;
                console.log('Speech recognition auto-restarted for voice commands');
            } catch (e) {
                // Recognition might already be starting
                if (e.name !== 'InvalidStateError') {
                    console.error('Failed to restart recognition after end:', e);
                    // Retry after a longer delay
                    setTimeout(() => {
                        if (recognition && !isListening) {
                            try {
                                recognition.start();
                                isListening = true;
                                console.log('Speech recognition restarted after retry');
                            } catch (retryError) {
                                console.error('Failed to restart recognition after retry:', retryError);
                            }
                        }
                    }, 1000);
                }
            }
        }
    }, 100);
}

/**
 * Change recognition language
 * @param {string} lang - Language code (e.g., 'en-US', 'es-ES', 'fr-FR', 'zh-CN', 'ja-JP')
 */
export function setLanguage(lang) {
    if (recognition) {
        recognition.lang = lang;
        console.log('Speech recognition language set to:', lang);
    }
}

/**
 * Get current recognition language
 * @returns {string} Current language code
 */
export function getLanguage() {
    if (recognition) {
        return recognition.lang || 'en-US';
    }
    return 'en-US';
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
