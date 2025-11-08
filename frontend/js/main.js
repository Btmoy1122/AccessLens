/**
 * AccessLens - Main Application Entry Point
 * 
 * This file initializes the AR scene, camera, and UI components
 */

// Import feature modules
import { 
    initSpeechToText, 
    startListening, 
    stopListening, 
    setCaptionCallback,
    setAppState 
} from '@ml/speech/speech-to-text.js';
// import { initSignRecognition } from '@ml/sign-language/sign-recognition.js';
import { 
    initSceneDescription, 
    startDescription, 
    stopDescription,
    setVideoElement 
} from '@ml/vision/scene-description.js';
// import { initFaceRecognition } from '@ml/vision/face-recognition.js';

// Application State
const appState = {
    sidebarOpen: false,
    cameraReady: false,
    cameraStream: null,
    features: {
        speech: { enabled: false },
        sign: { enabled: false },
        scene: { enabled: false },
        face: { enabled: false }
    }
};

// DOM Elements
let sidebar, sidebarToggle, sidebarClose, sidebarOverlay;
let cameraStatus, statusDot, statusText;
let captionsContainer, captionsText;

/**
 * Initialize the application
 */
document.addEventListener('DOMContentLoaded', () => {
    console.log('AccessLens initialized');
    
    // Ensure body has black background
    document.body.style.backgroundColor = '#000';
    document.documentElement.style.backgroundColor = '#000';
    
    // Get DOM elements
    initializeDOMElements();
    
    // Initialize sidebar
    initializeSidebar();
    
    // Initialize draggable captions
    initializeDraggableCaptions();
    
    // Initialize camera first (most important)
    initializeCamera();
    
    // Initialize feature toggles
    initializeFeatureToggles();
    
    // Initialize ML modules (speech-to-text, scene description, etc.)
    initializeMLModules();
    
    // AR scene initialization deferred - A-Frame not loaded yet
    // initializeARScene();
    
    // Debug: Log video element state
    setTimeout(() => {
        const video = document.getElementById('camera-video');
        if (video) {
            console.log('Video element state:', {
                display: window.getComputedStyle(video).display,
                visibility: window.getComputedStyle(video).visibility,
                opacity: window.getComputedStyle(video).opacity,
                srcObject: !!video.srcObject,
                paused: video.paused,
                readyState: video.readyState,
                videoWidth: video.videoWidth,
                videoHeight: video.videoHeight
            });
        }
    }, 1000);
});

/**
 * Get and cache DOM elements
 */
function initializeDOMElements() {
    sidebar = document.getElementById('sidebar');
    sidebarToggle = document.getElementById('sidebar-toggle');
    sidebarClose = document.getElementById('sidebar-close');
    sidebarOverlay = document.getElementById('sidebar-overlay');
    cameraStatus = document.getElementById('camera-status');
    statusDot = cameraStatus?.querySelector('.status-dot');
    statusText = cameraStatus?.querySelector('.status-text');
    captionsContainer = document.getElementById('captions-container');
    captionsText = document.getElementById('captions-text');
}

/**
 * Initialize draggable captions
 */
function initializeDraggableCaptions() {
    if (!captionsContainer) return;
    
    let isDragging = false;
    let currentX = 0;
    let currentY = 0;
    let initialX = 0;
    let initialY = 0;
    let xOffset = 0;
    let yOffset = 0;
    
    // Load saved position from localStorage
    const savedPosition = localStorage.getItem('captionsPosition');
    if (savedPosition) {
        try {
            const { x, y } = JSON.parse(savedPosition);
            xOffset = x;
            yOffset = y;
            // Wait for container to be rendered before setting position
            setTimeout(() => {
                setCaptionsPosition(xOffset, yOffset);
            }, 100);
        } catch (e) {
            console.warn('Failed to load saved captions position:', e);
        }
    } else {
        // Calculate initial position from current CSS position
        setTimeout(() => {
            const rect = captionsContainer.getBoundingClientRect();
            xOffset = rect.left;
            yOffset = rect.top;
        }, 100);
    }
    
    // Set initial position
    function setCaptionsPosition(x, y) {
        const container = captionsContainer;
        const rect = container.getBoundingClientRect();
        const containerWidth = rect.width;
        const containerHeight = rect.height;
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        
        // Allow positioning all the way to edges
        // Constrain so at least part of the container is visible
        const minX = -(containerWidth - 50); // Allow 50px to stick out on left
        const maxX = viewportWidth - 50; // Allow 50px to stick out on right
        const minY = 0;
        const maxY = viewportHeight - containerHeight;
        
        x = Math.max(minX, Math.min(x, maxX));
        y = Math.max(minY, Math.min(y, maxY));
        
        container.style.left = x + 'px';
        container.style.top = y + 'px';
        container.style.bottom = 'auto';
        container.style.right = 'auto';
        container.style.transform = 'none';
        
        xOffset = x;
        yOffset = y;
    }
    
    // Save position to localStorage
    function saveCaptionsPosition() {
        localStorage.setItem('captionsPosition', JSON.stringify({
            x: xOffset,
            y: yOffset
        }));
    }
    
    // Mouse events
    captionsContainer.addEventListener('mousedown', dragStart);
    document.addEventListener('mousemove', drag);
    document.addEventListener('mouseup', dragEnd);
    
    // Touch events for mobile
    captionsContainer.addEventListener('touchstart', dragStart, { passive: false });
    document.addEventListener('touchmove', drag, { passive: false });
    document.addEventListener('touchend', dragEnd);
    
    function dragStart(e) {
        // Don't start dragging if clicking on text (allow text selection)
        if (e.target === captionsText && captionsText.textContent.trim()) {
            // Check if user is trying to select text
            const selection = window.getSelection();
            if (selection.toString().length > 0) {
                return;
            }
        }
        
        // Get current position from container
        const rect = captionsContainer.getBoundingClientRect();
        xOffset = rect.left;
        yOffset = rect.top;
        
        if (e.type === 'touchstart') {
            initialX = e.touches[0].clientX - xOffset;
            initialY = e.touches[0].clientY - yOffset;
        } else {
            initialX = e.clientX - xOffset;
            initialY = e.clientY - yOffset;
        }
        
        if (captionsContainer.contains(e.target) || e.target === captionsContainer) {
            isDragging = true;
            captionsContainer.classList.add('dragging');
            e.preventDefault();
        }
    }
    
    function drag(e) {
        if (!isDragging) return;
        
        e.preventDefault();
        
        if (e.type === 'touchmove') {
            currentX = e.touches[0].clientX - initialX;
            currentY = e.touches[0].clientY - initialY;
        } else {
            currentX = e.clientX - initialX;
            currentY = e.clientY - initialY;
        }
        
        setCaptionsPosition(currentX, currentY);
    }
    
    function dragEnd(e) {
        if (isDragging) {
            isDragging = false;
            captionsContainer.classList.remove('dragging');
            saveCaptionsPosition();
        }
    }
    
    // Double-click to reset position
    captionsContainer.addEventListener('dblclick', () => {
        // Reset to default position (bottom center)
        const container = captionsContainer;
        container.style.left = '50%';
        container.style.top = 'auto';
        container.style.bottom = '80px';
        container.style.right = 'auto';
        container.style.transform = 'translateX(-50%)';
        
        xOffset = 0;
        yOffset = 0;
        saveCaptionsPosition();
    });
}

/**
 * Initialize sidebar functionality
 */
function initializeSidebar() {
    // Toggle sidebar open/close
    if (sidebarToggle) {
        sidebarToggle.addEventListener('click', toggleSidebar);
    }
    
    // Close sidebar button
    if (sidebarClose) {
        sidebarClose.addEventListener('click', closeSidebar);
    }
    
    // Close sidebar when clicking overlay (mobile)
    if (sidebarOverlay) {
        sidebarOverlay.addEventListener('click', closeSidebar);
    }
    
    // Close sidebar on Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && appState.sidebarOpen) {
            closeSidebar();
        }
    });
}

/**
 * Toggle sidebar open/close
 */
function toggleSidebar() {
    appState.sidebarOpen = !appState.sidebarOpen;
    updateSidebarState();
}

/**
 * Close sidebar
 */
function closeSidebar() {
    appState.sidebarOpen = false;
    updateSidebarState();
}

/**
 * Update sidebar visual state
 */
function updateSidebarState() {
    if (sidebar) {
        if (appState.sidebarOpen) {
            sidebar.classList.add('open');
            if (sidebarOverlay) {
                sidebarOverlay.classList.add('active');
            }
        } else {
            sidebar.classList.remove('open');
            if (sidebarOverlay) {
                sidebarOverlay.classList.remove('active');
            }
        }
    }
}

/**
 * Initialize camera and check permissions
 */
async function initializeCamera() {
    updateCameraStatus('Requesting camera access...', false);
    
    try {
        // Check if getUserMedia is available
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            throw new Error('Camera API not supported in this browser');
        }
        
        // Request camera access
        const constraints = {
            video: { 
                facingMode: 'environment', // Use back camera on mobile (preferred)
                width: { ideal: 1280 },
                height: { ideal: 720 }
            } 
        };
        
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        
        // Get video element
        const video = document.getElementById('camera-video');
        if (!video) {
            throw new Error('Video element not found');
        }
        
        // Set video source to camera stream
        video.srcObject = stream;
        video.muted = true; // Required for autoplay in most browsers
        
        // Wait for video metadata to load
        const playVideo = () => {
            video.play().then(() => {
                // Camera feed is ready
                appState.cameraReady = true;
                appState.cameraStream = stream;
                updateCameraStatus('Camera ready', true);
                console.log('Camera initialized successfully');
                console.log('Video dimensions:', video.videoWidth, 'x', video.videoHeight);
                console.log('Video playing:', !video.paused);
                
                // Ensure video is visible
                video.style.display = 'block';
                video.style.opacity = '1';
                
                // Set video element for scene description module (when video is actually playing)
                setVideoElement(video);
            }).catch(err => {
                console.error('Error playing video:', err);
                handleCameraError(err);
            });
        };
        
        // Try to play immediately
        if (video.readyState >= 2) {
            // Video metadata already loaded
            playVideo();
        } else {
            // Wait for metadata
            video.onloadedmetadata = () => {
                console.log('Video metadata loaded');
                playVideo();
            };
            
            // Fallback: try to play after a short delay
            setTimeout(() => {
                if (!appState.cameraReady) {
                    console.log('Attempting to play video after delay');
                    playVideo();
                }
            }, 500);
        }
        
    } catch (error) {
        console.error('Camera initialization error:', error);
        handleCameraError(error);
    }
}

/**
 * Update camera status indicator
 */
function updateCameraStatus(text, ready = false) {
    if (statusText) {
        statusText.textContent = text;
    }
    
    if (cameraStatus) {
        if (ready) {
            cameraStatus.classList.add('ready');
        } else {
            cameraStatus.classList.remove('ready');
        }
    }
}

/**
 * Handle camera errors
 */
function handleCameraError(error) {
    let errorMessage = 'Camera error';
    
    if (error.name === 'NotAllowedError') {
        errorMessage = 'Camera permission denied';
    } else if (error.name === 'NotFoundError') {
        errorMessage = 'No camera found';
    } else if (error.name === 'NotReadableError') {
        errorMessage = 'Camera in use';
    } else {
        errorMessage = `Camera error: ${error.message}`;
    }
    
    updateCameraStatus(errorMessage, false);
    
    // Show user-friendly error message
    setTimeout(() => {
        alert(`Camera Error: ${errorMessage}\n\nPlease grant camera permissions and refresh the page.`);
    }, 1000);
}

/**
 * Initialize feature toggles
 */
function initializeFeatureToggles() {
    // Speech Captions Toggle
    const toggleSpeech = document.getElementById('toggle-speech');
    if (toggleSpeech) {
        toggleSpeech.addEventListener('click', () => toggleFeature('speech'));
    }
    
    // Sign Language Toggle
    const toggleSign = document.getElementById('toggle-sign');
    if (toggleSign) {
        toggleSign.addEventListener('click', () => toggleFeature('sign'));
    }
    
    // Scene Description Toggle
    const toggleScene = document.getElementById('toggle-scene');
    if (toggleScene) {
        toggleScene.addEventListener('click', () => toggleFeature('scene'));
    }
    
    // Face Recognition Toggle
    const toggleFace = document.getElementById('toggle-face');
    if (toggleFace) {
        toggleFace.addEventListener('click', () => toggleFeature('face'));
    }
    
    // Settings Button
    const settingsBtn = document.getElementById('settings-btn');
    if (settingsBtn) {
        settingsBtn.addEventListener('click', () => {
            alert('Settings panel - Coming soon!');
        });
    }
    
    // Help Button
    const helpBtn = document.getElementById('help-btn');
    if (helpBtn) {
        helpBtn.addEventListener('click', () => {
            alert('AccessLens Help\n\nToggle features on/off using the sidebar.\n\nFeatures:\n• Speech Captions - Real-time speech to text\n• Sign Language - ASL gesture recognition\n• Scene Description - Audio narration\n• Face Recognition - Recognize saved faces');
        });
    }
}

/**
 * Toggle a feature on/off
 */
function toggleFeature(featureName) {
    appState.features[featureName].enabled = !appState.features[featureName].enabled;
    updateFeatureUI(featureName);
    
    console.log(`Feature ${featureName}: ${appState.features[featureName].enabled ? 'enabled' : 'disabled'}`);
    
    // Handle feature-specific logic
    if (featureName === 'speech') {
        if (appState.features.speech.enabled) {
            startSpeechRecognition();
        } else {
            stopSpeechRecognition();
        }
    } else if (featureName === 'scene') {
        if (appState.features.scene.enabled) {
            startSceneDescription();
        } else {
            stopSceneDescription();
        }
    }
    // TODO: Add other feature handlers
    // else if (featureName === 'sign') { ... }
    // else if (featureName === 'face') { ... }
}

/**
 * Update feature UI state
 */
function updateFeatureUI(featureName) {
    const button = document.getElementById(`toggle-${featureName}`);
    const status = document.getElementById(`status-${featureName}`);
    
    if (button && status) {
        if (appState.features[featureName].enabled) {
            button.classList.add('active');
            status.textContent = 'On';
        } else {
            button.classList.remove('active');
            status.textContent = 'Off';
        }
    }
}

/**
 * Initialize AR Scene
 */
function initializeARScene() {
    // Don't initialize A-Frame scene immediately
    // We'll show it when we have AR content to display
    const arContainer = document.getElementById('ar-container');
    
    // Keep AR container hidden for now
    // It will be shown when we add AR overlays
    if (arContainer) {
        arContainer.style.display = 'none';
    }
    
    // Initialize A-Frame scene later when needed
    // For now, we just use the video feed
    console.log('AR scene initialization deferred - using video feed only');
}

/**
 * Initialize all ML modules
 */
function initializeMLModules() {
    // Initialize Speech-to-Text module
    initializeSpeechToText();
    
    // Initialize Scene Description module
    initializeSceneDescription();
    
    // TODO: Initialize other ML modules
    // initializeSignRecognition();
    // initializeFaceRecognition();
}

/**
 * Initialize Speech-to-Text module
 */
function initializeSpeechToText() {
    // Set app state reference for speech module
    setAppState(appState);
    
    // Initialize speech recognition
    const initialized = initSpeechToText();
    if (!initialized) {
        console.warn('Speech recognition not available in this browser');
        // Update UI to show it's not available
        const speechToggle = document.getElementById('toggle-speech');
        if (speechToggle) {
            speechToggle.disabled = true;
            speechToggle.title = 'Speech recognition not supported in this browser';
        }
        return;
    }
    
    // Set up caption callback
    setCaptionCallback((text, isInterim) => {
        updateCaptions(text, isInterim);
    });
    
    console.log('Speech-to-text module initialized');
}

/**
 * Initialize Scene Description module
 */
function initializeSceneDescription() {
    // Initialize scene description model
    initSceneDescription().then(success => {
        if (success) {
            console.log('Scene description module initialized');
        } else {
            console.warn('Scene description not available');
            // Update UI to show it's not available
            const sceneToggle = document.getElementById('toggle-scene');
            if (sceneToggle) {
                sceneToggle.disabled = true;
                sceneToggle.title = 'Scene description not supported in this browser';
            }
        }
    }).catch(error => {
        console.error('Error initializing scene description:', error);
        const sceneToggle = document.getElementById('toggle-scene');
        if (sceneToggle) {
            sceneToggle.disabled = true;
            sceneToggle.title = 'Scene description initialization failed';
        }
    });
}

/**
 * Start speech recognition
 */
function startSpeechRecognition() {
    if (!appState.cameraReady) {
        console.warn('Camera not ready, waiting...');
        // Wait for camera to be ready
        const checkCamera = setInterval(() => {
            if (appState.cameraReady) {
                clearInterval(checkCamera);
                startSpeechRecognition();
            }
        }, 500);
        return;
    }
    
    const started = startListening();
    if (started) {
        console.log('Speech recognition started');
        updateCaptions('Listening...', false);
    } else {
        console.error('Failed to start speech recognition');
        updateCaptions('Failed to start speech recognition', true);
        // Disable the feature if it fails
        appState.features.speech.enabled = false;
        updateFeatureUI('speech');
    }
}

/**
 * Stop speech recognition
 */
function stopSpeechRecognition() {
    stopListening();
    updateCaptions('', false);
    console.log('Speech recognition stopped');
}

/**
 * Start scene description
 */
function startSceneDescription() {
    if (!appState.cameraReady) {
        console.warn('Camera not ready, waiting...');
        // Wait for camera to be ready
        const checkCamera = setInterval(() => {
            if (appState.cameraReady) {
                clearInterval(checkCamera);
                startSceneDescription();
            }
        }, 500);
        return;
    }
    
    startDescription();
    console.log('Scene description started');
}

/**
 * Stop scene description
 */
function stopSceneDescription() {
    stopDescription();
    console.log('Scene description stopped');
}

/**
 * Update captions display
 */
function updateCaptions(text, isInterim = false) {
    if (!captionsText) return;
    
    if (!text || text.trim() === '') {
        // Hide captions
        captionsText.classList.remove('show', 'interim', 'error');
        captionsText.textContent = '';
        return;
    }
    
    // Show captions
    captionsText.classList.add('show');
    captionsText.textContent = text;
    
    // Update styling based on state
    if (text.toLowerCase().includes('error') || text.toLowerCase().includes('denied') || text.toLowerCase().includes('failed')) {
        captionsText.classList.add('error');
        captionsText.classList.remove('interim');
    } else if (isInterim) {
        captionsText.classList.add('interim');
        captionsText.classList.remove('error');
    } else {
        captionsText.classList.remove('interim', 'error');
    }
}

/**
 * Show AR container when we have content
 */
function showARContainer() {
    const arContainer = document.getElementById('ar-container');
    if (arContainer) {
        arContainer.style.display = 'block';
    }
}

/**
 * Cleanup camera stream on page unload
 */
window.addEventListener('beforeunload', () => {
    if (appState.cameraStream) {
        appState.cameraStream.getTracks().forEach(track => track.stop());
    }
});

// Export for use in other modules (if needed)
export { appState, toggleSidebar, closeSidebar };
