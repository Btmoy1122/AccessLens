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
let pendingRestart = null; // Track pending restart timeout to prevent multiple restarts
let lastRestartTime = 0; // Track when we last tried to restart
let consecutiveAborts = 0; // Track rapid consecutive aborts
const MAX_CONSECUTIVE_ABORTS = 3; // Max rapid aborts before cooldown
let restartCooldown = false; // Cooldown flag to prevent rapid restart loops

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
        
        // On mobile (especially iOS), speech recognition may have limitations
        // Note: Some mobile browsers require user interaction to start recognition
        const isMobile = window.innerWidth <= 768 || ('ontouchstart' in window && window.innerWidth <= 1024);
        if (isMobile) {
            console.log('Mobile device detected - speech recognition configured with mobile considerations');
            // On mobile, we still try continuous mode, but it may not work on all devices
            // iOS Safari typically requires user interaction to start
        }
        
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
    
    // Don't start if we're in cooldown
    if (restartCooldown) {
        console.log('Speech recognition in cooldown, not starting');
        return false;
    }
    
    // Check if already listening
    if (isListening) {
        // Check recognition state if available
        if (recognition.state) {
            if (recognition.state === 'starting' || recognition.state === 'listening') {
                return true; // Already active
            } else {
                // State says not active, update our state
                isListening = false;
            }
        } else {
            return true; // Assume working if we can't check state
        }
    }
    
    try {
        // Check recognition state before attempting to start
        if (recognition.state) {
            if (recognition.state === 'starting' || recognition.state === 'listening') {
                isListening = true;
                return true;
            }
        }
        
        // Update restart time before starting
        lastRestartTime = Date.now();
        
        recognition.start();
        isListening = true;
        consecutiveAborts = 0; // Reset abort counter on successful start
        console.log('Speech recognition started');
        return true;
    } catch (error) {
        // Recognition might already be running
        if (error.name === 'InvalidStateError') {
            // Recognition is already running - update our state
            isListening = true;
            return true;
        } else {
            console.error('Error starting speech recognition:', error);
            return false;
        }
    }
}

/**
 * Stop listening for speech
 */
export function stopListening() {
    // Clear any pending restart
    if (pendingRestart) {
        clearTimeout(pendingRestart);
        pendingRestart = null;
    }
    
    if (recognition && isListening) {
        try {
            recognition.stop();
            isListening = false;
            currentTranscript = '';
            consecutiveAborts = 0; // Reset when manually stopped
            restartCooldown = false;
            lastRestartTime = 0;
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
            isListening = false;
        }
    }
}

/**
 * Handle speech recognition start
 */
function handleSpeechStart() {
    console.log('Speech recognition started successfully (voice commands always active)');
    // Reset abort counter and cooldown on successful start
    consecutiveAborts = 0;
    restartCooldown = false;
    lastRestartTime = Date.now();
    
    // Clear any pending restart since we successfully started
    if (pendingRestart) {
        clearTimeout(pendingRestart);
        pendingRestart = null;
    }
    
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
    
    // Reset abort counter when we get results (recognition is working)
    consecutiveAborts = 0;
    restartCooldown = false;
    
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
    // Don't log "no-speech" as an error - it's just silence
    if (event.error !== 'no-speech' && event.error !== 'aborted') {
        console.error('Speech recognition error:', event.error);
    }

    let errorMessage = '';
    switch (event.error) {
        case 'no-speech':
            // No speech detected - not really an error, just silence
            consecutiveAborts = 0; // Reset on no-speech (normal operation)
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
            // User or system aborted - track rapid aborts
            const now = Date.now();
            const timeSinceStart = lastRestartTime > 0 ? now - lastRestartTime : Infinity;
            
            if (timeSinceStart < 1000) {
                // Aborted very quickly after start - this is problematic
                consecutiveAborts++;
                console.warn(`Speech recognition aborted quickly after ${timeSinceStart}ms (count: ${consecutiveAborts})`);
                
                // Enter cooldown if too many rapid aborts
                if (consecutiveAborts >= MAX_CONSECUTIVE_ABORTS) {
                    console.error('Too many rapid aborts, entering cooldown');
                    restartCooldown = true;
                    // Clear any pending restart
                    if (pendingRestart) {
                        clearTimeout(pendingRestart);
                        pendingRestart = null;
                    }
                    // Wait before allowing restart
                    setTimeout(() => {
                        restartCooldown = false;
                        consecutiveAborts = 0;
                        console.log('Abort cooldown cleared');
                    }, 10000); // 10 second cooldown
                }
            } else {
                // Normal abort after running for a while
                if (timeSinceStart > 3000) {
                    consecutiveAborts = 0;
                }
            }
            // Don't restart here - let onend handle it
            return;
        default:
            errorMessage = `Speech recognition error: ${event.error}`;
    }

    if (errorMessage && captionCallback) {
        captionCallback(errorMessage, true);
    }

    // Always try to restart for voice commands (voice commands must always work)
    // Only skip restart for permission errors and when in cooldown
    if (event.error !== 'not-allowed' && event.error !== 'aborted' && !restartCooldown) {
        setTimeout(() => {
            if (recognition && !isListening && !restartCooldown) {
                try {
                    recognition.start();
                    isListening = true;
                    consecutiveAborts = 0;
                    console.log('Speech recognition restarted after error (voice commands always active)');
                } catch (e) {
                    if (e.name === 'InvalidStateError') {
                        isListening = true;
                        return;
                    }
                    console.error('Failed to restart recognition:', e);
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
    
    // Clear any pending restart to prevent multiple restarts
    if (pendingRestart) {
        clearTimeout(pendingRestart);
        pendingRestart = null;
    }
    
    // Always auto-restart for voice commands (voice commands must always work)
    // But respect cooldown to prevent restart loops
    if (restartCooldown) {
        console.log('Speech recognition restart on cooldown, skipping auto-restart');
        return;
    }
    
    // Check if enough time has passed since last restart
    const now = Date.now();
    const timeSinceLastRestart = now - lastRestartTime;
    
    // Reset abort counter if recognition ran for a while
    if (timeSinceLastRestart > 5000) {
        consecutiveAborts = 0;
    }
    
    // Use longer delay to give browser time to clean up
    // This is critical - browsers need time between stop and start
    let restartDelay = 500; // Base 500ms delay
    if (consecutiveAborts > 0) {
        // Add extra delay if we've had recent aborts
        restartDelay = Math.min(500 + (consecutiveAborts * 300), 2000);
    }
    
    console.log(`Speech recognition ended - will restart in ${restartDelay}ms`);
    
    pendingRestart = setTimeout(() => {
        pendingRestart = null;
        
        // Double-check conditions before restarting
        if (!recognition || isListening || restartCooldown) {
            return;
        }
        
        try {
            // Check recognition state before starting
            if (recognition.state) {
                if (recognition.state === 'starting' || recognition.state === 'listening') {
                    console.log('Recognition already active, skipping restart');
                    isListening = true;
                    return;
                }
            }
            
            // Update restart time before attempting start
            lastRestartTime = Date.now();
            
            recognition.start();
            isListening = true;
            console.log('Speech recognition auto-restarted for voice commands');
        } catch (e) {
            // Recognition might already be starting
            if (e.name === 'InvalidStateError') {
                // Recognition is already running - update our state
                console.log('Recognition already active (InvalidStateError), updating state');
                isListening = true;
                lastRestartTime = Date.now();
            } else {
                console.error('Failed to restart recognition after end:', e);
                // Don't retry immediately - wait for next natural end
            }
        }
    }, restartDelay);
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
