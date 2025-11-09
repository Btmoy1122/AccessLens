/**
 * Voice Commands Module
 * 
 * Provides voice command recognition and execution for menu control
 * 
 * Features:
 * - Command recognition from speech input
 * - Menu control (open, close, toggle)
 * - Feature toggling via voice commands
 * - Extensible command system
 * - Independent speech recognition (works even when captions are off)
 */

// Command callbacks
let commandCallbacks = {};

// Shared speech recognition instance (will be set by speech-to-text module)
let sharedRecognition = null;
let commandCallback = null;

// Command patterns - map phrases to command names
const COMMAND_PATTERNS = {
    // Menu control commands
    'open menu': 'openMenu',
    'show menu': 'openMenu',
    'menu': 'openMenu',
    
    'open sidebar': 'openSidebar',
    'show sidebar': 'openSidebar',
    'sidebar': 'openSidebar',
    
    'close menu': 'closeMenu',
    'hide menu': 'closeMenu',
    
    'close sidebar': 'closeSidebar',
    'hide sidebar': 'closeSidebar',
    
    'toggle menu': 'toggleMenu',
    'toggle sidebar': 'toggleMenu',
    
    // Feature toggle commands
    'enable speech': 'toggleSpeech',
    'disable speech': 'toggleSpeech',
    'turn on speech': 'toggleSpeech',
    'turn off speech': 'toggleSpeech',
    'speech captions': 'toggleSpeech',
    'speech': 'toggleSpeech',
    
    'enable scene description': 'toggleScene',
    'disable scene description': 'toggleScene',
    'turn on scene description': 'toggleScene',
    'turn off scene description': 'toggleScene',
    'scene description': 'toggleScene',
    'scene': 'toggleScene',
    
    'enable face recognition': 'toggleFace',
    'disable face recognition': 'toggleFace',
    'turn on face recognition': 'toggleFace',
    'turn off face recognition': 'toggleFace',
    'face recognition': 'toggleFace',
    'face': 'toggleFace',
    
    // Camera mirror/flip commands
    'mirror camera': 'toggleMirrorCamera',
    'flip camera': 'toggleMirrorCamera',
    'toggle mirror camera': 'toggleMirrorCamera',
    'toggle flip camera': 'toggleMirrorCamera',
    'enable mirror camera': 'toggleMirrorCamera',
    'disable mirror camera': 'toggleMirrorCamera',
    'turn on mirror camera': 'toggleMirrorCamera',
    'turn off mirror camera': 'toggleMirrorCamera',
    'mirror': 'toggleMirrorCamera',
    'flip': 'toggleMirrorCamera',
    
    // Hand menu commands
    'enable hand menu': 'toggleHandMenu',
    'disable hand menu': 'toggleHandMenu',
    'turn on hand menu': 'toggleHandMenu',
    'turn off hand menu': 'toggleHandMenu',
    'hand menu': 'toggleHandMenu',
    'hand': 'toggleHandMenu',
    'close hand menu': 'closeHandMenu',
    'hide hand menu': 'closeHandMenu',
    'fix menu': 'fixHandMenu',
    'reset menu': 'fixHandMenu',
    'reset hand menu': 'fixHandMenu',
    'fix hand menu': 'fixHandMenu',
    'restore menu': 'fixHandMenu',
    
    // Help commands
    'help': 'showHelp',
    'what can I say': 'showHelp',
    'commands': 'showHelp',
    'voice commands': 'showHelp',
};

/**
 * Initialize voice commands
 */
export function initVoiceCommands() {
    console.log('Voice commands initialized');
    return true;
}

/**
 * Set the shared speech recognition instance
 * This allows voice commands to work with the same recognition instance as captions
 * @param {SpeechRecognition} recognition - The speech recognition instance
 */
export function setSharedRecognition(recognition) {
    sharedRecognition = recognition;
    console.log('Shared recognition instance set for voice commands');
}

/**
 * Process speech results for voice commands
 * This should be called from the speech-to-text module when it receives results
 * @param {string} text - Recognized speech text
 * @param {boolean} isFinal - Whether this is a final result
 */
export function processSpeechForCommands(text, isFinal) {
    // Only process final results for commands to avoid false triggers
    if (isFinal && text && text.trim()) {
        processVoiceCommand(text);
    }
}

/**
 * Set callback for a specific command
 * @param {string} commandName - Name of the command
 * @param {Function} callback - Callback function to execute
 */
export function setCommandCallback(commandName, callback) {
    commandCallbacks[commandName] = callback;
    console.log(`Command callback set for: ${commandName}`);
}

/**
 * Set multiple command callbacks at once
 * @param {Object} callbacks - Object mapping command names to callbacks
 */
export function setCommandCallbacks(callbacks) {
    Object.assign(commandCallbacks, callbacks);
    console.log('Command callbacks set:', Object.keys(callbacks));
}

/**
 * Process speech text and check for commands
 * @param {string} text - Recognized speech text
 * @returns {boolean} True if a command was recognized and executed
 */
export function processVoiceCommand(text) {
    if (!text || typeof text !== 'string') {
        return false;
    }
    
    // Normalize text: lowercase, trim, remove extra spaces
    const normalizedText = text.toLowerCase().trim().replace(/\s+/g, ' ');
    
    // Check for exact matches first
    if (COMMAND_PATTERNS[normalizedText]) {
        const commandName = COMMAND_PATTERNS[normalizedText];
        return executeCommand(commandName);
    }
    
    // Check for partial matches (commands that contain the text)
    for (const [pattern, commandName] of Object.entries(COMMAND_PATTERNS)) {
        if (normalizedText.includes(pattern) || pattern.includes(normalizedText)) {
            return executeCommand(commandName);
        }
    }
    
    // Check for command keywords at the start of the text
    const words = normalizedText.split(' ');
    if (words.length > 0) {
        const firstWord = words[0];
        const secondWord = words[1] || '';
        const twoWords = `${firstWord} ${secondWord}`;
        
        // Check two-word commands first
        if (COMMAND_PATTERNS[twoWords]) {
            return executeCommand(COMMAND_PATTERNS[twoWords]);
        }
        
        // Check single-word commands
        if (COMMAND_PATTERNS[firstWord]) {
            return executeCommand(COMMAND_PATTERNS[firstWord]);
        }
    }
    
    return false;
}

/**
 * Execute a command
 * @param {string} commandName - Name of the command to execute
 * @returns {boolean} True if command was executed successfully
 */
function executeCommand(commandName) {
    if (!commandName || !commandCallbacks[commandName]) {
        console.warn(`Command callback not found for: ${commandName}`);
        return false;
    }
    
    try {
        console.log(`Executing voice command: ${commandName}`);
        commandCallbacks[commandName]();
        return true;
    } catch (error) {
        console.error(`Error executing command ${commandName}:`, error);
        return false;
    }
}

/**
 * Get list of available commands
 * @returns {Array<string>} Array of command phrases
 */
export function getAvailableCommands() {
    return Object.keys(COMMAND_PATTERNS);
}

/**
 * Add a custom command pattern
 * @param {string} pattern - Text pattern to match
 * @param {string} commandName - Name of the command to execute
 */
export function addCommandPattern(pattern, commandName) {
    COMMAND_PATTERNS[pattern.toLowerCase()] = commandName;
    console.log(`Added command pattern: "${pattern}" -> ${commandName}`);
}

/**
 * Remove a command pattern
 * @param {string} pattern - Text pattern to remove
 */
export function removeCommandPattern(pattern) {
    delete COMMAND_PATTERNS[pattern.toLowerCase()];
    console.log(`Removed command pattern: "${pattern}"`);
}

