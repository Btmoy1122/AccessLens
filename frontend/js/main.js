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
    setAppState,
    startRecordingMemory,
    stopRecordingMemory,
    isRecordingMemoryActive,
    setVoiceCommandProcessor
} from '@ml/speech/speech-to-text.js';
import {
    initVoiceCommands,
    setCommandCallbacks,
    processVoiceCommand
} from '@ml/speech/voice-commands.js';
import { 
    initSignRecognition,
    startDetection,
    stopDetection,
    setVideoElement as setSignVideoElement,
    setDisplayCallback as setSignDisplayCallback,
    isModuleInitialized as isSignInitialized,
    setPinchToClickEnabled,
    isPinchToClickEnabled,
    setClickRegistry,
    loadButtonPositions,
    setHandMenuMode,
    unlockHandMenu,
    updateAllHandMenuButtonStates,
    setHandMenuToDefaultPosition
} from '@ml/sign-language/sign-recognition.js';
import { 
    initSceneDescription, 
    startDescription, 
    stopDescription,
    setVideoElement as setSceneVideoElement
} from '@ml/vision/scene-description.js';
import { 
    initFaceRecognition,
    startRecognition,
    stopRecognition,
    setVideoElement as setFaceVideoElement,
    registerFace,
    onFaceRecognized,
    onNewFace,
    onFaceUpdate,
    onFaceRemoved,
    getPendingRegistration,
    clearPendingRegistration,
    reloadKnownFaces,
    getPrimaryFaceOnScreen,
    getAllRecognizedFaces,
    getPrimaryFaceWithDetection,
    getMouthPosition
} from '@ml/vision/face-recognition.js';
import {
    initFaceOverlays,
    updateFaceOverlay,
    removeFaceOverlay,
    clearAllFaceOverlays,
    updateAllOverlayPositions,
    cleanupInvisibleOverlays
} from './face-overlays.js';
import { addInteraction, getInteractions, getFaceMemorySummary } from '@backend/services/face-service.js';

// Application State
const appState = {
    sidebarOpen: false,
    cameraReady: false,
    cameraStream: null,
    cameraFlipped: false, // Camera mirror/flip state
    availableCameras: [], // List of available camera devices
    selectedCameraId: null, // Currently selected camera device ID
    handMenuMode: false, // Hand menu mode state
    features: {
        speech: { enabled: false },
        sign: { enabled: true }, // Hand Detection always enabled by default
        scene: { enabled: false },
        face: { enabled: false }
    }
};

// DOM Elements
let sidebar, sidebarToggle, sidebarClose, sidebarOverlay;
let cameraStatus, statusDot, statusText;
let captionsContainer, captionsText;
let faceRegistrationModal, faceModalClose, faceRegisterBtn, faceSkipBtn, faceNameInput, faceNotesInput;
let memoryBtn, memoryStatus;
let viewMemoriesBtn, memoriesModal, memoriesModalClose, memoriesModalTitle, memoriesList, memoriesLoading, memoriesEmpty;
let faceSelectionModal, faceSelectionModalClose, faceSelectionList, faceSelectionCancelBtn;

// Face registration state
let currentPendingDetection = null; // Stores detection data for pending registration

// Memory recording state
let isMemoryRecording = false; // Whether memory recording is active
let memoryStartTime = null; // Timestamp when memory recording started
let selectedFaceForMemory = null; // Selected face for current memory recording session { faceId, name, faceKey }

// Cache for latest summaries to avoid fetching on every frame
// Shared across all face recognition callbacks
const latestSummaryCache = new Map(); // Key: faceId, Value: { summary, timestamp }
const SUMMARY_CACHE_TIMEOUT = 10000; // Refresh summary every 10 seconds

// Speech bubble tracking state
let speechBubbleTrackingActive = false; // Whether speech bubble should track face
let speechBubbleUpdateAnimationFrame = null; // Animation frame ID for continuous updates
let lastMouthPosition = null; // Last known mouth position for smoothing
let positionHistory = []; // History of positions for smoothing (max 5)
const MAX_POSITION_HISTORY = 5; // Keep last 5 positions for smoothing

/**
 * Initialize the application
 */
document.addEventListener('DOMContentLoaded', () => {
    try {
        console.log('AccessLens initialized');
        
        // Suppress WebGL errors on Mac - they're expected and handled gracefully
        if (navigator.platform.toUpperCase().indexOf('MAC') >= 0) {
            // Override global error handler to suppress WebGL errors
            const originalErrorHandler = window.onerror;
            window.onerror = function(msg, url, line, col, error) {
                const errorMsg = msg || (error && error.message) || '';
                // Suppress WebGL canvas context errors on Mac
                if (errorMsg.includes('WebGL') || errorMsg.includes('canvas context')) {
                    console.warn('Suppressed WebGL error (Mac compatibility):', errorMsg);
                    return true; // Prevent default error handling
                }
                // Call original error handler for other errors
                if (originalErrorHandler) {
                    return originalErrorHandler.call(this, msg, url, line, col, error);
                }
                return false;
            };
            
            // Also catch unhandled promise rejections
            window.addEventListener('unhandledrejection', function(event) {
                const errorMsg = event.reason && (event.reason.message || event.reason.toString()) || '';
                if (errorMsg.includes('WebGL') || errorMsg.includes('canvas context')) {
                    console.warn('Suppressed WebGL promise rejection (Mac compatibility):', errorMsg);
                    event.preventDefault(); // Prevent default error handling
                }
            });
        }
        
        // Ensure body has black background
        document.body.style.backgroundColor = '#000';
        document.documentElement.style.backgroundColor = '#000';
        
        // Get DOM elements
        initializeDOMElements();
        
        // Initialize sidebar
        initializeSidebar();
        
        // Load saved button positions
        loadButtonPositions();
        
        // Initialize camera first (most important)
        initializeCamera();
        
        // Initialize feature toggles
        initializeFeatureToggles();
        
        // Initialize camera flip toggle
        initializeCameraFlip();
        
    // Initialize camera selector (will be populated after cameras are enumerated)
    initializeCameraSelector();
    
    // Initialize hand menu mode toggle
    initializeHandMenuToggle();
    
        // Initialize ML modules (speech-to-text, scene description, etc.)
        initializeMLModules();
        
        // Start speech recognition for voice commands (always runs in background)
        // This allows voice commands to work even when captions are off
        setTimeout(() => {
            if (appState.cameraReady) {
                startListening(); // Start recognition for voice commands
                console.log('Voice command recognition started');
            } else {
                // Wait for camera to be ready
                const checkCamera = setInterval(() => {
                    if (appState.cameraReady) {
                        clearInterval(checkCamera);
                        startListening();
                        console.log('Voice command recognition started');
                    }
                }, 500);
            }
        }, 1000);
        
        // Initialize MediaPipe on app startup (non-blocking)
        initializeMediaPipeOnStartup();
        
        // Update UI to reflect that Hand Detection is enabled by default
        updateFeatureUI('sign');
        
        // Enable pinch-to-click by default (always on)
        setPinchToClickEnabled(true);
        updatePinchClickUI(true);
        
        // Initialize face overlays
        try {
            initFaceOverlays();
        } catch (error) {
            console.error('Error initializing face overlays:', error);
        }
        
        // Initialize face registration modal
        try {
            initializeFaceRegistrationModal();
        } catch (error) {
            console.error('Error initializing face registration modal:', error);
        }
        
        // Initialize memory recording
        try {
            initializeMemoryRecording();
        } catch (error) {
            console.error('Error initializing memory recording:', error);
        }
        
        // Initialize face selection modal
        try {
            initializeFaceSelectionModal();
        } catch (error) {
            console.error('Error initializing face selection modal:', error);
        }
        
        // Initialize view memories
        try {
            initializeViewMemories();
        } catch (error) {
            console.error('Error initializing view memories:', error);
        }
        
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
    } catch (error) {
        console.error('Error initializing AccessLens:', error);
    }
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
    
    // Face registration modal elements
    faceRegistrationModal = document.getElementById('face-registration-modal');
    faceModalClose = document.getElementById('face-modal-close');
    faceRegisterBtn = document.getElementById('face-register-btn');
    faceSkipBtn = document.getElementById('face-skip-btn');
    faceNameInput = document.getElementById('face-name');
    faceNotesInput = document.getElementById('face-notes');
    
    // Memory recording button elements
    memoryBtn = document.getElementById('add-memory-btn');
    memoryStatus = document.getElementById('status-memory');
    
    // View Memories button and modal elements
    viewMemoriesBtn = document.getElementById('view-memories-btn');
    memoriesModal = document.getElementById('memories-modal');
    memoriesModalClose = document.getElementById('memories-modal-close');
    memoriesModalTitle = document.getElementById('memories-modal-title');
    memoriesList = document.getElementById('memories-list');
    memoriesLoading = document.getElementById('memories-loading');
    memoriesEmpty = document.getElementById('memories-empty');
    
    // Face selection modal elements
    faceSelectionModal = document.getElementById('face-selection-modal');
    faceSelectionModalClose = document.getElementById('face-selection-modal-close');
    faceSelectionList = document.getElementById('face-selection-list');
    faceSelectionCancelBtn = document.getElementById('face-selection-cancel-btn');
    
    // Ensure sidebar toggle is visible (should always be visible)
    if (sidebarToggle) {
        sidebarToggle.style.display = 'flex';
        sidebarToggle.style.visibility = 'visible';
        sidebarToggle.style.opacity = '1';
        console.log('Sidebar toggle button found and made visible');
    } else {
        console.error('Sidebar toggle button not found!');
    }
    
    // Ensure camera status is visible
    if (cameraStatus) {
        cameraStatus.style.display = 'flex';
        cameraStatus.style.visibility = 'visible';
        console.log('Camera status indicator found and made visible');
    } else {
        console.error('Camera status indicator not found!');
    }
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
 * Open sidebar
 */
function openSidebar() {
    appState.sidebarOpen = true;
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
/**
 * Enumerate available cameras
 * @param {boolean} skipPermissionCheck - Skip permission request if we already have a stream
 */
async function enumerateCameras(skipPermissionCheck = false) {
    try {
        // If we don't have permission yet, request it first (required for enumerateDevices to show labels)
        if (!skipPermissionCheck) {
            try {
                const tempStream = await navigator.mediaDevices.getUserMedia({ video: true });
                // Stop the temporary stream
                tempStream.getTracks().forEach(track => track.stop());
            } catch (error) {
                console.warn('Could not request permission for camera enumeration:', error);
            }
        }
        
        // Now enumerate devices
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(device => device.kind === 'videoinput');
        
        appState.availableCameras = videoDevices;
        console.log('Available cameras:', videoDevices.map(d => ({ id: d.deviceId, label: d.label })));
        
        // Load saved camera preference only if we haven't set one yet
        if (!appState.selectedCameraId) {
            const savedCameraId = localStorage.getItem('selectedCameraId');
            if (savedCameraId && videoDevices.find(d => d.deviceId === savedCameraId)) {
                appState.selectedCameraId = savedCameraId;
            } else if (videoDevices.length > 0) {
                // Use first camera as default, or prefer back camera on mobile
                const backCamera = videoDevices.find(d => 
                    d.label.toLowerCase().includes('back') || 
                    d.label.toLowerCase().includes('rear') ||
                    d.label.toLowerCase().includes('environment')
                );
                appState.selectedCameraId = backCamera ? backCamera.deviceId : videoDevices[0].deviceId;
            }
        }
        
        // Update camera selector UI
        updateCameraSelector();
        
        return videoDevices;
    } catch (error) {
        console.error('Error enumerating cameras:', error);
        return [];
    }
}

async function initializeCamera() {
    updateCameraStatus('Requesting camera access...', false);
    
    try {
        // Check if getUserMedia is available
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            throw new Error('Camera API not supported in this browser');
        }
        
        // Enumerate cameras first (only if we haven't done it yet)
        if (appState.availableCameras.length === 0) {
            await enumerateCameras(false);
        } else {
            // If we already have cameras, just update the list (skip permission check since we already have a stream)
            await enumerateCameras(true);
        }
        
        // Request camera access with selected camera
        const constraints = {
            video: { 
                width: { ideal: 1280 },
                height: { ideal: 720 }
            } 
        };
        
        // Use specific camera if selected, otherwise use facingMode fallback
        if (appState.selectedCameraId) {
            constraints.video.deviceId = { exact: appState.selectedCameraId };
        } else {
            constraints.video.facingMode = 'environment'; // Fallback: Use back camera on mobile
        }
        
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        
        // Store stream in app state
        appState.cameraStream = stream;
        
        // Now that we have a stream, re-enumerate cameras to get proper labels
        // (cameras won't have labels until after permission is granted and a stream is active)
        await enumerateCameras(true); // Skip permission check since we already have a stream
        
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
                // Camera feed is ready (stream already stored in appState.cameraStream above)
                appState.cameraReady = true;
                updateCameraStatus('Camera ready', true);
                console.log('Camera initialized successfully');
                console.log('Video dimensions:', video.videoWidth, 'x', video.videoHeight);
                console.log('Video playing:', !video.paused);
                
                // Ensure video is visible
                video.style.display = 'block';
                video.style.opacity = '1';
                video.style.visibility = 'visible';
                
                // Apply saved camera flip preference
                applyCameraFlip();
                
                // Set video element for ML modules (when video is actually playing)
                setSceneVideoElement(video);
                setFaceVideoElement(video);
                
                // Set video element for hand detection (MediaPipe will use it when initialized)
                // Also set click registry if MediaPipe is already initialized
                if (isSignInitialized()) {
                    setSignVideoElement(video);
                    setClickRegistry(elementClickRegistry, getClickHandler);
                } else {
                    // MediaPipe not initialized yet, but set video element anyway
                    // It will be used when MediaPipe initializes
                    setSignVideoElement(video);
                }
            }).catch(err => {
                console.error('Error playing video:', err);
                handleCameraError(err);
            });
        };
        
        // Ensure video element is visible from the start
        video.style.display = 'block';
        video.style.opacity = '1';
        video.style.visibility = 'visible';
        
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
    
    // Show error message in captions area as well
    updateCaptions(`⚠️ ${errorMessage}. Please grant camera permissions and refresh the page.`, false);
    
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
    
    // Hand Detection Toggle (always enabled)
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
            alert('AccessLens Help\n\nToggle features on/off using the sidebar.\n\nFeatures:\n• Speech Captions - Real-time speech to text\n• Hand Detection - Hand tracking and gesture recognition (always on)\n• Scene Description - Audio narration\n• Face Recognition - Recognize saved faces\n\nSettings:\n• Mirror Camera - Flip video horizontally\n• Pinch to Click - Use pinch gesture to click (always on)');
        });
    }
    
    // Pinch to Click Toggle
    const togglePinchClick = document.getElementById('toggle-pinch-click');
    if (togglePinchClick) {
        togglePinchClick.addEventListener('click', togglePinchToClick);
    }
}

/**
 * Toggle pinch-to-click feature
 * Note: Pinch-to-click is always enabled when Hand Detection is active
 */
function togglePinchToClick() {
    // Pinch-to-click is always enabled when Hand Detection is active
    // Just ensure it's enabled and show feedback
    setPinchToClickEnabled(true);
    updatePinchClickUI(true);
    
    console.log('Pinch-to-click is always enabled');
}

/**
 * Update pinch-to-click button UI
 */
function updatePinchClickUI(enabled) {
    const toggleButton = document.getElementById('toggle-pinch-click');
    const statusElement = document.getElementById('status-pinch-click');
    
    if (toggleButton && statusElement) {
        if (enabled) {
            toggleButton.classList.add('active');
            statusElement.textContent = 'On';
        } else {
            toggleButton.classList.remove('active');
            statusElement.textContent = 'Off';
        }
    }
    
    // Update hand menu button states to reflect the change
    if (typeof updateAllHandMenuButtonStates === 'function') {
        updateAllHandMenuButtonStates();
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
        // Voice commands always work - only captions are toggled
        if (appState.features.speech.enabled) {
            startSpeechRecognition();
        } else {
            // Only stop captions, not recognition (voice commands need it)
            stopSpeechRecognition();
        }
        // Ensure voice commands are always running
        // Recognition continues in background for voice commands even when captions are off
        if (appState.cameraReady) {
            // Ensure recognition is running for voice commands
            startListening();
        }
    } else if (featureName === 'sign') {
        // Hand Detection is always enabled - prevent disabling
        if (!appState.features.sign.enabled) {
            // Re-enable it immediately
            appState.features.sign.enabled = true;
            updateFeatureUI('sign');
            alert('Hand Detection is always enabled and cannot be turned off.');
            return;
        }
        if (appState.features.sign.enabled) {
            startSignRecognition();
        }
    } else if (featureName === 'scene') {
        if (appState.features.scene.enabled) {
            startSceneDescription();
        } else {
            stopSceneDescription();
        }
    } else if (featureName === 'face') {
        if (appState.features.face.enabled) {
            startFaceRecognition();
        } else {
            stopFaceRecognition();
        }
    }
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
    
    // Update hand menu button states to reflect the change
    if (typeof updateAllHandMenuButtonStates === 'function') {
        updateAllHandMenuButtonStates();
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
    try {
        // Initialize Speech-to-Text module
        initializeSpeechToText();
    } catch (error) {
        console.error('Error initializing speech-to-text:', error);
    }
    
    try {
        // Initialize Scene Description module
        initializeSceneDescription();
    } catch (error) {
        console.error('Error initializing scene description:', error);
    }
    
    try {
        // Initialize Face Recognition module
        initializeFaceRecognition();
    } catch (error) {
        console.error('Error initializing face recognition:', error);
    }
    
    // Note: Hand Detection (MediaPipe Hands) is initialized on app startup (see initializeMediaPipeOnStartup)
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
    
    // Initialize voice commands
    console.log('Initializing voice commands...');
    initVoiceCommands();
    console.log('Voice commands initialized');
    
    // Set up voice command callbacks
    console.log('Setting up voice command callbacks...');
    setCommandCallbacks({
        openMenu: () => {
            console.log('Voice command: Open menu');
            // Only open hand menu at default position
            openHandMenuAtDefaultPosition();
        },
        openSidebar: () => {
            console.log('Voice command: Open sidebar');
            openSidebar();
        },
        closeMenu: () => {
            console.log('Voice command: Close menu');
            // Only close hand menu
            closeHandMenu();
        },
        closeSidebar: () => {
            console.log('Voice command: Close sidebar');
            // Only close sidebar
            closeSidebar();
        },
        toggleMenu: () => {
            console.log('Voice command: Toggle menu');
            toggleSidebar();
        },
        toggleSpeech: () => {
            console.log('Voice command: Toggle speech');
            toggleFeature('speech');
        },
        toggleSign: () => {
            console.log('Voice command: Toggle sign language');
            toggleFeature('sign');
        },
        toggleScene: () => {
            console.log('Voice command: Toggle scene description');
            toggleFeature('scene');
        },
        toggleFace: () => {
            console.log('Voice command: Toggle face recognition');
            toggleFeature('face');
        },
        toggleMirrorCamera: () => {
            console.log('Voice command: Toggle mirror camera');
            toggleCameraFlip();
        },
        toggleHandMenu: () => {
            console.log('Voice command: Toggle hand menu');
            toggleHandMenuMode();
        },
        closeHandMenu: () => {
            console.log('Voice command: Close hand menu');
            closeHandMenu();
        },
        fixHandMenu: () => {
            console.log('Voice command: Fix/Reset hand menu');
            fixHandMenu();
        },
        showHelp: () => {
            console.log('Voice command: Show help');
            // Show help dialog or list available commands
            const commands = [
                'Open menu', 'Close menu', 'Toggle menu',
                'Enable speech', 'Enable sign language',
                'Enable scene description', 'Enable face recognition',
                'Enable hand menu', 'Fix menu', 'Reset menu', // Updated help
                'Mirror camera', 'Flip camera' // Updated help
            ];
            alert(`Available Voice Commands:\n\n${commands.join('\n')}`);
        }
    });
    
    // Set up voice command processor to receive speech results
    // This allows commands to work even when captions are off
    console.log('Setting up voice command processor...');
    setVoiceCommandProcessor((text, isFinal) => {
        console.log('Voice command processor called:', text, 'isFinal:', isFinal);
        if (isFinal && text && text.trim()) {
            console.log('Processing voice command:', text);
            processVoiceCommand(text);
        }
    });
    console.log('Voice command processor set up');
    
    // Set up caption callback (only for displaying captions)
    setCaptionCallback((text, isInterim) => {
        updateCaptions(text, isInterim);
    });
    
    console.log('Speech-to-text module initialized with voice commands');
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
 * Initialize Face Recognition module
 */
function initializeFaceRecognition() {
    // Show loading status
    console.log('Initializing face recognition...');
    
    // Initialize face recognition models
    initFaceRecognition().then(success => {
        if (success) {
            console.log('Face recognition module initialized successfully');
            
            // Set up callbacks for face recognition events
            setupFaceRecognitionCallbacks();
        } else {
            console.warn('Face recognition not available');
            // Update UI to show it's not available
            const faceToggle = document.getElementById('toggle-face');
            if (faceToggle) {
                faceToggle.disabled = true;
                faceToggle.title = 'Face recognition not supported in this browser. Models may have failed to load.';
            }
        }
    }).catch(error => {
        console.error('Error initializing face recognition:', error);
        const faceToggle = document.getElementById('toggle-face');
        if (faceToggle) {
            faceToggle.disabled = true;
            faceToggle.title = `Face recognition initialization failed: ${error.message}`;
        }
        
        // Show error in UI
        updateCaptions('❌ Face recognition failed to initialize. Check console for details.', true);
        setTimeout(() => {
            updateCaptions('', false);
        }, 5000);
    });
}

/**
 * Set up callbacks for face recognition events
 */
function setupFaceRecognitionCallbacks() {
    // Callback when a face is recognized (first time)
    onFaceRecognized((faceData, detection, faceKey) => {
        console.log(`Recognized: ${faceData.name} - ${faceData.notes || 'No notes'}`);
        
        // Update overlay will be handled by onFaceUpdate callback
        // Just show a brief notification
        updateCaptions(`👋 ${faceData.name}`, false);
        setTimeout(() => {
            const currentText = captionsText?.textContent;
            if (currentText === `👋 ${faceData.name}`) {
                updateCaptions('', false);
            }
        }, 2000);
    });
    
    // Callback when a new (unknown) face is detected
    onNewFace((detection, faceKey) => {
        console.log('New face detected - ready for registration', { faceKey });
        
        // Store the detection for registration
        currentPendingDetection = { detection, faceKey };
        
        // Show unknown face overlay
        const video = document.getElementById('camera-video');
        if (video && detection) {
            updateFaceOverlay(faceKey, { name: 'Unknown', notes: 'Tap to register' }, detection, video);
        }
        
        // Show modal after a short delay (so user can see the face)
        setTimeout(() => {
            showFaceRegistrationModal();
        }, 1000);
    });
    
    // Callback for face updates (every frame) - update overlays
    onFaceUpdate(async (faces) => {
        const video = document.getElementById('camera-video');
        if (!video || !appState.features.face.enabled) {
            return;
        }
        
        // Track which faces are currently visible
        const visibleFaceKeys = new Set();
        const now = Date.now();
        
        // Update overlays for all active faces
        for (const face of faces) {
            if (face.detection && face.faceData) {
                visibleFaceKeys.add(face.faceKey);
                
                // If this is a recognized face (has faceId), try to get latest summary
                if (face.faceData.id) {
                    const faceId = face.faceData.id;
                    const cached = latestSummaryCache.get(faceId);
                    
                    // Check if we need to refresh the summary
                    const shouldRefresh = !cached || (now - cached.timestamp) > SUMMARY_CACHE_TIMEOUT;
                    
                    if (shouldRefresh) {
                        // Fetch memory summary asynchronously
                        getFaceMemorySummary(faceId).then(summary => {
                            // Update cache
                            latestSummaryCache.set(faceId, {
                                summary: summary,
                                timestamp: now
                            });
                            
                            // Update the faceData with memory summary
                            const updatedFaceData = {
                                ...face.faceData,
                                memorySummary: summary,
                                latestSummary: summary // Keep for backward compatibility
                            };
                            
                            // Update overlay with new summary
                            updateFaceOverlay(
                                face.faceKey,
                                updatedFaceData,
                                face.detection,
                                video
                            );
                        }).catch(error => {
                            console.error('Error fetching latest summary for face:', faceId, error);
                            // Fall back to current faceData
                            updateFaceOverlay(
                                face.faceKey,
                                face.faceData,
                                face.detection,
                                video
                            );
                        });
                    } else if (cached) {
                        // Use cached summary
                        const updatedFaceData = {
                            ...face.faceData,
                            memorySummary: cached.summary,
                            latestSummary: cached.summary // Keep for backward compatibility
                        };
                        updateFaceOverlay(
                            face.faceKey,
                            updatedFaceData,
                            face.detection,
                            video
                        );
                    } else {
                        // No cache, update with current faceData
                        updateFaceOverlay(
                            face.faceKey,
                            face.faceData,
                            face.detection,
                            video
                        );
                    }
                } else {
                    // Unknown face, just update overlay normally
                    updateFaceOverlay(
                        face.faceKey,
                        face.faceData,
                        face.detection,
                        video
                    );
                }
            }
        }
        
        // Remove overlays for faces that are no longer visible
        // This prevents old tags from accumulating when faces move
        cleanupInvisibleOverlays(visibleFaceKeys);
        
        // Update View Memories button visibility based on recognized faces
        updateViewMemoriesButton();
        
        // Speech bubble position is now updated continuously via requestAnimationFrame
        // when speechBubbleTrackingActive is true, so we don't need to update here
        // This reduces redundant updates and improves performance
    });
    
    // Callback when a face is removed from cache
    onFaceRemoved((faceKey) => {
        removeFaceOverlay(faceKey);
        // Update button visibility when face is removed
        updateViewMemoriesButton();
    });
}

/**
 * Initialize face registration modal
 */
function initializeFaceRegistrationModal() {
    if (!faceRegistrationModal) {
        return;
    }
    
    // Close modal handlers
    if (faceModalClose) {
        faceModalClose.addEventListener('click', () => {
            hideFaceRegistrationModal();
        });
    }
    
    if (faceSkipBtn) {
        faceSkipBtn.addEventListener('click', () => {
            hideFaceRegistrationModal();
        });
    }
    
    // Register face handler
    if (faceRegisterBtn) {
        faceRegisterBtn.addEventListener('click', () => {
            handleFaceRegistration();
        });
    }
    
    // Allow Enter key to submit
    if (faceNameInput) {
        faceNameInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                handleFaceRegistration();
            }
        });
    }
    
    // Close modal when clicking outside
    if (faceRegistrationModal) {
        faceRegistrationModal.addEventListener('click', (e) => {
            if (e.target === faceRegistrationModal) {
                hideFaceRegistrationModal();
            }
        });
    }
}

/**
 * Initialize memory recording button and functionality
 */
function initializeMemoryRecording() {
    if (!memoryBtn) {
        console.warn('Memory button not found');
        return;
    }
    
    // Handle memory button click
    memoryBtn.addEventListener('click', toggleMemoryRecording);
    
    // Update initial state
    updateMemoryRecordingUI();
}

/**
 * Toggle memory recording on/off
 */
function toggleMemoryRecording() {
    if (isMemoryRecording) {
        stopMemoryRecording();
    } else {
        startMemoryRecording();
    }
}

/**
 * Start memory recording
 */
function startMemoryRecording() {
    if (isMemoryRecording) {
        return; // Already recording
    }
    
    // Check if speech recognition is enabled
    if (!appState.features.speech.enabled) {
        alert('Please enable Speech Captions first to record memories.');
        return;
    }
    
    // Get all recognized faces on screen
    const recognizedFaces = getAllRecognizedFaces();
    
    if (recognizedFaces.length === 0) {
        alert('No recognized face detected. Please ensure face recognition is enabled and a registered person is visible on camera.');
        return;
    }
    
    // If only one face, use it automatically
    if (recognizedFaces.length === 1) {
        selectedFaceForMemory = recognizedFaces[0];
        startRecordingForFace(selectedFaceForMemory);
        return;
    }
    
    // Multiple faces detected - show selection modal
    showFaceSelectionModal(recognizedFaces);
}

/**
 * Stop memory recording and save
 */
async function stopMemoryRecording() {
    if (!isMemoryRecording) {
        return; // Not recording
    }
    
    // Stop recording and get transcript
    const transcript = stopRecordingMemory();
    
    console.log('Stopped recording. Transcript length:', transcript?.length || 0);
    console.log('Transcript content:', transcript);
    
    if (!transcript || transcript.trim().length === 0) {
        // No transcript collected
        isMemoryRecording = false;
        selectedFaceForMemory = null; // Clear selected face
        updateMemoryRecordingUI();
        updateCaptions('⚠️ No speech detected during recording. Make sure Speech Captions is enabled and you spoke clearly.', false);
        console.warn('No transcript collected - memory not saved');
        setTimeout(() => {
            updateCaptions('', false);
        }, 4000);
        return;
    }
    
    // Use the selected face (set when recording started)
    const faceForMemory = selectedFaceForMemory;
    if (!faceForMemory) {
        // Fallback: try to get primary face
        const primaryFace = getPrimaryFaceOnScreen();
        if (!primaryFace) {
            console.warn('No face selected and no face detected when stopping memory recording');
            isMemoryRecording = false;
            selectedFaceForMemory = null;
            updateMemoryRecordingUI();
            updateCaptions('⚠️ Face not detected. Memory not saved.', false);
            setTimeout(() => {
                updateCaptions('', false);
            }, 3000);
            return;
        }
        // Use primary face as fallback
        selectedFaceForMemory = primaryFace;
    }
    
    // Save to Firebase
    try {
        updateCaptions('💾 Saving memory...', false);
        const interactionId = await addInteraction({
            faceId: selectedFaceForMemory.faceId,
            rawTranscript: transcript, // Raw transcript - Cloud Function will generate summary
            userId: 'default' // TODO: Get from app state or auth
        });
        
        console.log('Memory saved successfully:', interactionId);
        console.log('Memory details:', {
            faceId: selectedFaceForMemory.faceId,
            faceName: selectedFaceForMemory.name,
            transcriptLength: transcript.length,
            interactionId: interactionId
        });
        updateCaptions(`✅ Memory saved for ${selectedFaceForMemory.name}. Summary will be generated automatically.`, false);
        
        // Clear message after 3 seconds
        setTimeout(() => {
            updateCaptions('', false);
        }, 3000);
    } catch (error) {
        console.error('Error saving memory:', error);
        updateCaptions('❌ Error saving memory. Please try again.', true);
        setTimeout(() => {
            updateCaptions('', false);
        }, 3000);
    }
    
    // Reset state
    isMemoryRecording = false;
    memoryStartTime = null;
    selectedFaceForMemory = null; // Clear selected face after saving
    updateMemoryRecordingUI();
}

/**
 * Update memory recording UI state
 */
function updateMemoryRecordingUI() {
    if (!memoryBtn || !memoryStatus) {
        return;
    }
    
    if (isMemoryRecording) {
        memoryBtn.classList.add('active');
        memoryStatus.textContent = 'Recording...';
        memoryStatus.style.color = '#ff6b6b';
    } else {
        memoryBtn.classList.remove('active');
        memoryStatus.textContent = 'Ready';
        memoryStatus.style.color = '';
    }
}

/**
 * Start recording memory for a specific face
 * 
 * @param {Object} face - Face object with { faceId, name, faceKey }
 */
function startRecordingForFace(face) {
    selectedFaceForMemory = face;
    isMemoryRecording = true;
    memoryStartTime = Date.now();
    startRecordingMemory();
    
    console.log('Memory recording started for:', face.name);
    updateMemoryRecordingUI();
    
    // Show feedback
    updateCaptions(`💾 Recording memory for ${face.name}...`, false);
    setTimeout(() => {
        const currentText = captionsText?.textContent;
        if (currentText && currentText.includes('Recording memory')) {
            updateCaptions('', false);
        }
    }, 2000);
}

/**
 * Show face selection modal when multiple faces are detected
 * 
 * @param {Array} faces - Array of face objects with { faceId, name, faceKey }
 */
function showFaceSelectionModal(faces) {
    if (!faceSelectionModal || !faceSelectionList) {
        console.error('Face selection modal elements not found');
        return;
    }
    
    // Clear previous list
    faceSelectionList.innerHTML = '';
    
    // Create buttons for each face
    faces.forEach((face) => {
        const button = document.createElement('button');
        button.className = 'face-selection-btn';
        button.style.cssText = 'width: 100%; padding: 15px; margin: 10px 0; font-size: 16px; text-align: left; background: #f0f0f0; border: 2px solid #ddd; border-radius: 8px; cursor: pointer; transition: all 0.2s;';
        button.innerHTML = `<strong>${face.name}</strong>`;
        button.addEventListener('click', () => {
            hideFaceSelectionModal();
            startRecordingForFace(face);
        });
        button.addEventListener('mouseenter', () => {
            button.style.background = '#e0e0e0';
            button.style.borderColor = '#4CAF50';
        });
        button.addEventListener('mouseleave', () => {
            button.style.background = '#f0f0f0';
            button.style.borderColor = '#ddd';
        });
        faceSelectionList.appendChild(button);
    });
    
    // Show modal
    faceSelectionModal.style.display = 'flex';
    setTimeout(() => {
        if (faceSelectionModal) {
            faceSelectionModal.classList.add('show');
        }
    }, 10);
}

/**
 * Hide face selection modal
 */
function hideFaceSelectionModal() {
    if (!faceSelectionModal) {
        return;
    }
    faceSelectionModal.classList.remove('show');
    setTimeout(() => {
        if (faceSelectionModal) {
            faceSelectionModal.style.display = 'none';
        }
    }, 300);
}

/**
 * Initialize face selection modal
 */
function initializeFaceSelectionModal() {
    if (!faceSelectionModal) {
        console.warn('Face selection modal not found');
        return;
    }
    
    // Close button
    if (faceSelectionModalClose) {
        faceSelectionModalClose.addEventListener('click', () => {
            hideFaceSelectionModal();
        });
    }
    
    // Cancel button
    if (faceSelectionCancelBtn) {
        faceSelectionCancelBtn.addEventListener('click', () => {
            hideFaceSelectionModal();
        });
    }
    
    // Close on backdrop click
    if (faceSelectionModal) {
        faceSelectionModal.addEventListener('click', (e) => {
            if (e.target === faceSelectionModal) {
                hideFaceSelectionModal();
            }
        });
    }
}

/**
 * Initialize view memories functionality
 */
function initializeViewMemories() {
    if (!viewMemoriesBtn) {
        console.warn('View memories button not found');
        return;
    }
    
    // Handle view memories button click
    viewMemoriesBtn.addEventListener('click', async () => {
        const primaryFace = getPrimaryFaceOnScreen();
        if (!primaryFace) {
            alert('No recognized face detected. Please ensure a registered person is visible on camera.');
            return;
        }
        
        await showMemoriesModal(primaryFace.faceId, primaryFace.name);
    });
    
    // Handle modal close button
    if (memoriesModalClose) {
        memoriesModalClose.addEventListener('click', () => {
            hideMemoriesModal();
        });
    }
    
    // Close modal when clicking outside
    if (memoriesModal) {
        memoriesModal.addEventListener('click', (e) => {
            if (e.target === memoriesModal) {
                hideMemoriesModal();
            }
        });
    }
}

/**
 * Update View Memories button visibility based on recognized faces
 */
function updateViewMemoriesButton() {
    if (!viewMemoriesBtn) {
        return;
    }
    
    // Only show button if face recognition is enabled
    if (!appState.features.face.enabled) {
        viewMemoriesBtn.style.display = 'none';
        return;
    }
    
    const primaryFace = getPrimaryFaceOnScreen();
    
    if (primaryFace) {
        // Show button when a recognized face is on screen
        viewMemoriesBtn.style.display = 'flex';
        console.log('View Memories button shown for:', primaryFace.name);
    } else {
        // Hide button when no recognized face
        viewMemoriesBtn.style.display = 'none';
    }
}

/**
 * Show memories modal with interactions for a specific face
 */
async function showMemoriesModal(faceId, faceName) {
    if (!memoriesModal || !memoriesList) {
        console.error('Memories modal elements not found');
        return;
    }
    
    // Show modal
    memoriesModal.style.display = 'flex';
    setTimeout(() => {
        memoriesModal.classList.add('show');
    }, 10);
    
    // Set title
    if (memoriesModalTitle) {
        memoriesModalTitle.textContent = `Memories: ${faceName}`;
    }
    
    // Show loading state
    if (memoriesLoading) {
        memoriesLoading.style.display = 'block';
    }
    if (memoriesEmpty) {
        memoriesEmpty.style.display = 'none';
    }
    memoriesList.innerHTML = '';
    
    try {
        // Fetch interactions
        const interactions = await getInteractions(faceId);
        console.log(`Fetched ${interactions.length} interactions for face:`, faceId);
        
        // Hide loading
        if (memoriesLoading) {
            memoriesLoading.style.display = 'none';
        }
        
        if (interactions.length === 0) {
            // Show empty state
            if (memoriesEmpty) {
                memoriesEmpty.style.display = 'block';
            }
            return;
        }
        
        // Display interactions
        interactions.forEach((interaction) => {
            const item = document.createElement('div');
            item.className = 'memory-item';
            
            // Header with date
            const header = document.createElement('div');
            header.className = 'memory-header';
            
            const date = document.createElement('div');
            date.className = 'memory-date';
            if (interaction.createdAt) {
                const dateObj = interaction.createdAt.toDate();
                date.textContent = dateObj.toLocaleString();
            } else {
                date.textContent = 'Unknown date';
            }
            header.appendChild(date);
            item.appendChild(header);
            
            // Summary (if available)
            if (interaction.summary) {
                const summary = document.createElement('div');
                summary.className = 'memory-summary';
                summary.textContent = interaction.summary;
                item.appendChild(summary);
            }
            
            // Transcript (support both rawTranscript and transcript for backward compatibility)
            const transcriptText = interaction.rawTranscript || interaction.transcript;
            if (transcriptText) {
                const transcriptLabel = document.createElement('div');
                transcriptLabel.className = 'memory-transcript-label';
                transcriptLabel.textContent = 'Full Conversation';
                item.appendChild(transcriptLabel);
                
                const transcript = document.createElement('div');
                transcript.className = 'memory-transcript';
                transcript.textContent = transcriptText;
                item.appendChild(transcript);
            }
            
            memoriesList.appendChild(item);
        });
    } catch (error) {
        console.error('Error fetching memories:', error);
        if (memoriesLoading) {
            memoriesLoading.style.display = 'none';
        }
        memoriesList.innerHTML = '<p style="color: #ff6b6b;">Error loading memories. Please try again.</p>';
    }
}

/**
 * Hide memories modal
 */
function hideMemoriesModal() {
    if (!memoriesModal) {
        return;
    }
    
    memoriesModal.classList.remove('show');
    setTimeout(() => {
        memoriesModal.style.display = 'none';
    }, 300);
}

/**
 * Show face registration modal
 */
function showFaceRegistrationModal() {
    if (!faceRegistrationModal || !currentPendingDetection) {
        return;
    }
    
    // Reset form
    if (faceNameInput) {
        faceNameInput.value = '';
    }
    if (faceNotesInput) {
        faceNotesInput.value = '';
    }
    
    // Show modal
    faceRegistrationModal.style.display = 'flex';
    setTimeout(() => {
        faceRegistrationModal.classList.add('show');
    }, 10);
    
    // Focus on name input
    if (faceNameInput) {
        setTimeout(() => {
            faceNameInput.focus();
        }, 100);
    }
}

/**
 * Hide face registration modal
 */
function hideFaceRegistrationModal() {
    if (!faceRegistrationModal) {
        return;
    }
    
    faceRegistrationModal.classList.remove('show');
    setTimeout(() => {
        faceRegistrationModal.style.display = 'none';
    }, 300);
    
    // Clear pending registration
    clearPendingRegistration();
    currentPendingDetection = null;
}

/**
 * Handle face registration form submission
 */
function handleFaceRegistration() {
    if (!currentPendingDetection) {
        return;
    }
    
    // Get form values
    const name = faceNameInput?.value.trim();
    if (!name) {
        // Show error
        if (faceNameInput) {
            faceNameInput.focus();
            faceNameInput.style.borderColor = '#ff6b6b';
            setTimeout(() => {
                faceNameInput.style.borderColor = '';
            }, 2000);
        }
        return;
    }
    
    const notes = faceNotesInput?.value.trim() || '';
    
    // Disable form during submission
    if (faceRegisterBtn) {
        faceRegisterBtn.disabled = true;
        faceRegisterBtn.textContent = 'Saving...';
    }
    
    // Register the face
    updateCaptions('💾 Saving face...', false);
    registerFace(name, notes, currentPendingDetection.detection)
        .then(async (faceId) => {
            console.log(`Face registered successfully: ${name} (ID: ${faceId})`);
            updateCaptions(`✅ Face registered: ${name}`, false);
            
            // Reload known faces from Firebase
            await reloadKnownFaces();
            
            // Hide modal
            hideFaceRegistrationModal();
            
            // Clear message after 2 seconds
            setTimeout(() => {
                updateCaptions('', false);
            }, 2000);
        })
        .catch(error => {
            console.error('Error registering face:', error);
            updateCaptions('❌ Error registering face. Please try again.', true);
            
            // Re-enable form
            if (faceRegisterBtn) {
                faceRegisterBtn.disabled = false;
                faceRegisterBtn.textContent = 'Register Face';
            }
            
            // Show error alert
            alert(`Error registering face: ${error.message}\n\nPlease check:\n1. Firebase Firestore is enabled\n2. Firestore security rules allow read/write\n3. Check browser console for details`);
            
            // Clear error after 5 seconds
            setTimeout(() => {
                updateCaptions('', false);
            }, 5000);
        });
}

/**
 * Start speech recognition
 * Note: Recognition always runs for voice commands, but captions only show when enabled
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
        // Only show "Listening..." caption if speech feature is enabled
        if (appState.features.speech.enabled) {
            updateCaptions('Listening...', false);
        }
    } else {
        console.error('Failed to start speech recognition');
        // Only show error caption if speech feature is enabled
        if (appState.features.speech.enabled) {
            updateCaptions('Failed to start speech recognition', true);
        }
        // Disable the feature if it fails
        appState.features.speech.enabled = false;
        updateFeatureUI('speech');
    }
}

/**
 * Stop speech recognition
 * Note: We don't actually stop recognition when captions are off,
 * because voice commands need it to keep running
 */
function stopSpeechRecognition() {
    // Only stop if we really want to stop (e.g., user explicitly disabled)
    // For now, we keep recognition running for voice commands
    // But we clear the captions display
    updateCaptions('', false);
    console.log('Speech captions stopped (recognition continues for voice commands)');
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
 * Initialize MediaPipe on app startup (non-blocking)
 */
async function initializeMediaPipeOnStartup() {
    console.log('Initializing MediaPipe Hands on app startup...');
    
    // Show loading status
    updateCaptions('⏳ Loading Hand Detection (MediaPipe)...', false);
    updateCameraStatus('Loading Hand Detection...', false);
    
    // Initialize MediaPipe in the background
    // Don't wait for it to complete, let it load asynchronously
    initSignRecognition().then(initialized => {
        if (initialized) {
            console.log('✅ MediaPipe Hands initialized on startup');
            
            // Update status to show it's ready
            updateCaptions('✅ Hand Detection ready!', false);
            updateCameraStatus('Hand Detection: Ready', true);
            
            // Clear status message after a moment
            setTimeout(() => {
                updateCaptions('', false);
            }, 2000);
            
            // Set up display callback
            setSignDisplayCallback((text, isInterim) => {
                updateCaptions(text, isInterim);
            });
            
            // Set video element if camera is already ready
            if (appState.cameraReady) {
                const video = document.getElementById('camera-video');
                if (video) {
                    setSignVideoElement(video);
                    console.log('Video element set for MediaPipe');
                }
            }
            
            // Set click registry for pinch-to-click
            try {
                setClickRegistry(elementClickRegistry, getClickHandler);
                console.log('Click registry set for pinch-to-click');
            } catch (error) {
                console.warn('Failed to set click registry:', error);
            }
            
            // Enable pinch-to-click (always on)
            try {
                setPinchToClickEnabled(true);
                updatePinchClickUI(true);
                console.log('Pinch-to-click enabled (always on)');
            } catch (error) {
                console.warn('Failed to enable pinch-to-click:', error);
            }
            
            // Start hand detection immediately (since it's always on)
            if (appState.features.sign.enabled) {
                startSignRecognition();
            }
            
            // Automatically enable hand menu mode after MediaPipe is loaded
            if (!appState.handMenuMode) {
                console.log('Auto-enabling hand menu mode after MediaPipe initialization');
                appState.handMenuMode = true;
                
                // Update UI
                const handMenuToggle = document.getElementById('hand-menu-toggle');
                if (handMenuToggle) {
                    handMenuToggle.classList.add('active');
                }
                
                // Update state in sign recognition module
                updateHandMenuMode();
                
                // Save preference to localStorage
                localStorage.setItem('handMenuMode', 'true');
            }
        } else {
            console.warn('MediaPipe initialization failed on startup');
            updateCaptions('❌ Hand Detection failed to load', true);
            updateCameraStatus('Hand Detection: Failed', false);
        }
    }).catch(error => {
        console.error('Error initializing MediaPipe on startup:', error);
        updateCaptions('❌ Hand Detection error: ' + error.message, true);
        updateCameraStatus('Hand Detection: Error', false);
    });
}

/**
 * Initialize Hand Detection module (MediaPipe Hands)
 */
async function initializeSignRecognition() {
    // Check if already initialized
    if (isSignInitialized()) {
        console.log('Hand Detection already initialized');
        return true;
    }
    // Initialize hand detection module (MediaPipe Hands)
    const initialized = await initSignRecognition();
    if (!initialized) {
        console.warn('Hand Detection not available');
        // Update UI to show it's not available
        const signToggle = document.getElementById('toggle-sign');
        if (signToggle) {
            signToggle.disabled = true;
            signToggle.title = 'Hand Detection not available';
        }
        return false;
    }
    
    // Set up display callback (reuse captions container)
    setSignDisplayCallback((text, isInterim) => {
        updateCaptions(text, isInterim);
    });
    
    console.log('Hand Detection module initialized');
    return true;
}

/**
 * Start hand detection
 */
async function startSignRecognition() {
    if (!appState.cameraReady) {
        console.warn('Camera not ready, waiting...');
        // Wait for camera to be ready
        const checkCamera = setInterval(() => {
            if (appState.cameraReady) {
                clearInterval(checkCamera);
                startSignRecognition();
            }
        }, 500);
        return;
    }
    
    // Check if module is initialized, if not wait for it
    if (!isSignInitialized()) {
        console.log('MediaPipe not yet initialized, waiting...');
        updateCaptions('⏳ Waiting for MediaPipe to initialize...', false);
        
        // Wait for MediaPipe to initialize (with timeout)
        let waitCount = 0;
        const maxWait = 120; // 60 seconds max wait (120 * 500ms)
        
        const waitForInit = setInterval(() => {
            waitCount++;
            if (isSignInitialized()) {
                clearInterval(waitForInit);
                updateCaptions('✅ MediaPipe ready! Starting detection...', false);
                setTimeout(() => {
                    startSignRecognition();
                }, 500);
            } else if (waitCount >= maxWait) {
                clearInterval(waitForInit);
                console.error('MediaPipe initialization timeout');
                updateCaptions('❌ MediaPipe initialization timeout. Please refresh the page.', true);
                updateCameraStatus('Hand Detection: Timeout', false);
                // Don't disable Hand Detection - keep it enabled and wait
            }
        }, 500);
        return;
    }
    
    // Ensure click registry is set before starting detection
    // This is critical for pinch-to-click functionality
    try {
        setClickRegistry(elementClickRegistry, getClickHandler);
        console.log('Click registry set for pinch-to-click');
    } catch (error) {
        console.warn('Failed to set click registry:', error);
    }
    
    // Enable pinch-to-click (always on)
    try {
        setPinchToClickEnabled(true);
        console.log('Pinch-to-click enabled (always on)');
        // Update UI to reflect enabled state
        updatePinchClickUI(true);
    } catch (error) {
        console.warn('Failed to enable pinch-to-click:', error);
    }
    
    // Start detection
    try {
        await startDetection();
        console.log('Hand Detection started');
        updateCaptions('✋ Hand Detection active', false);
        updateCameraStatus('Hand Detection: Active', true);
        
        // Clear status message after a moment
        setTimeout(() => {
            if (appState.features.sign.enabled) {
                updateCaptions('', false);
            }
        }, 2000);
    } catch (error) {
        console.error('Error starting hand detection:', error);
        updateCaptions('❌ Cannot start: MediaPipe not ready. Please wait a moment and try again.', true);
        updateCameraStatus('Hand Detection: Waiting...', false);
        // Don't disable Hand Detection - it should always be enabled
        // Just log the error and wait for MediaPipe to be ready
    }
}

/**
 * Stop hand detection
 * Note: Hand Detection should not be stopped normally, but this function is kept for compatibility
 */
function stopSignRecognition() {
    stopDetection();
    updateCaptions('', false);
    
    // Don't disable pinch-to-click - it's always enabled when Hand Detection is active
    // Keep it enabled even if detection stops temporarily
    
    console.log('Hand Detection stopped (should not normally happen)');
}

/**
 * Start face recognition
 */
function startFaceRecognition() {
    if (!appState.cameraReady) {
        console.warn('Camera not ready, waiting...');
        updateCaptions('⏳ Waiting for camera...', false);
        // Wait for camera to be ready
        const checkCamera = setInterval(() => {
            if (appState.cameraReady) {
                clearInterval(checkCamera);
                startFaceRecognition();
            }
        }, 500);
        return;
    }
    
    startRecognition();
    console.log('Face recognition started');
    updateCaptions('👁️ Face recognition active - Looking for faces...', false);
    
    // Clear status message after 2 seconds
    setTimeout(() => {
        updateCaptions('', false);
    }, 2000);
}

/**
 * Stop face recognition
 */
function stopFaceRecognition() {
    stopRecognition();
    console.log('Face recognition stopped');
    updateCaptions('👁️ Face recognition stopped', false);
    
    // Clear all face overlays
    clearAllFaceOverlays();
    
    // Hide registration modal if open
    hideFaceRegistrationModal();
    
    // Clear message after 1 second
    setTimeout(() => {
        updateCaptions('', false);
    }, 1000);
}

/**
 * Update captions display
 */
function updateCaptions(text, isInterim = false) {
    if (!captionsText || !captionsContainer) return;
    
    if (!text || text.trim() === '') {
        // Hide captions
        captionsText.classList.remove('show', 'interim', 'error');
        captionsText.textContent = '';
        // Stop tracking
        speechBubbleTrackingActive = false;
        stopSpeechBubbleTracking();
        // Clear position history
        positionHistory = [];
        lastMouthPosition = null;
        // Reset to default position
        resetCaptionsToDefaultPosition();
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
    
    // Position speech bubble near mouth of speaker (if face recognition is enabled and face is detected)
    // Only position for final results (not interim), and only for actual speech (not system messages)
    if (appState.features.face.enabled && !isInterim && 
        !text.includes('⏳') && !text.includes('✅') && !text.includes('❌') && 
        !text.includes('💾') && !text.includes('👋') && !text.includes('👁️') &&
        !text.includes('⚠️') && !text.includes('Listening') && text.trim().length > 0) {
        // Enable speech bubble tracking
        speechBubbleTrackingActive = true;
        startSpeechBubbleTracking();
        // Position speech bubble near mouth immediately when speech is detected
        positionSpeechBubbleNearMouth();
    } else {
        // Disable speech bubble tracking for system messages
        speechBubbleTrackingActive = false;
        stopSpeechBubbleTracking();
        // Clear position history when disabling tracking
        positionHistory = [];
        lastMouthPosition = null;
        // Reset to default position for system messages or when conditions aren't met
        if (isInterim || text.trim().length === 0 || 
            text.includes('⏳') || text.includes('✅') || text.includes('❌') || 
            text.includes('💾') || text.includes('👋') || text.includes('👁️') ||
            text.includes('⚠️') || text.includes('Listening')) {
            resetCaptionsToDefaultPosition();
        }
    }
}

/**
 * Start continuous speech bubble tracking
 * Updates position whenever face detection updates (every ~1 second)
 * Uses smooth CSS transitions to follow face movement
 */
function startSpeechBubbleTracking() {
    // Stop any existing tracking
    stopSpeechBubbleTracking();
    
    if (!speechBubbleTrackingActive) {
        return;
    }
    
    // Update position immediately
    updateSpeechBubblePosition();
    
    // Set up a moderate-frequency update loop for smooth tracking
    // Update every 50ms (20fps) which is smooth and responsive
    let lastUpdateTime = 0;
    const UPDATE_INTERVAL = 50; // Update every 50ms (20fps)
    
    function updateLoop(currentTime) {
        if (!speechBubbleTrackingActive || !captionsContainer || !captionsText || 
            !captionsText.classList.contains('show') || !appState.features.face.enabled) {
            speechBubbleTrackingActive = false;
            return;
        }
        
        // Throttle updates to every 50ms for smoother tracking (20fps)
        if (currentTime - lastUpdateTime >= UPDATE_INTERVAL) {
            updateSpeechBubblePosition();
            lastUpdateTime = currentTime;
        }
        
        speechBubbleUpdateAnimationFrame = requestAnimationFrame(updateLoop);
    }
    
    // Start the loop
    speechBubbleUpdateAnimationFrame = requestAnimationFrame(updateLoop);
}

/**
 * Stop continuous speech bubble tracking
 */
function stopSpeechBubbleTracking() {
    if (speechBubbleUpdateAnimationFrame !== null) {
        cancelAnimationFrame(speechBubbleUpdateAnimationFrame);
        speechBubbleUpdateAnimationFrame = null;
    }
}

/**
 * Position speech bubble near the mouth of the primary face
 */
function positionSpeechBubbleNearMouth() {
    updateSpeechBubblePosition();
}

/**
 * Update speech bubble position based on current face detection
 * This is called when speech is detected and also during face updates to track face movement
 */
function updateSpeechBubblePosition() {
    if (!captionsContainer || !captionsText) {
        return;
    }
    
    try {
        // Get primary face with detection
        const primaryFace = getPrimaryFaceWithDetection();
        
        if (!primaryFace || !primaryFace.detection) {
            // No face detected - don't update position (keep bubble where it is)
            return;
        }
        
        const video = document.getElementById('camera-video');
        if (!video) {
            return;
        }
        
        // Get mouth position from face landmarks
        // The detection object structure from face-api.js:
        // - detection.landmarks (landmarks object)
        // - detection.detection.box (face bounding box)
        // We need to pass the full detection object to getMouthPosition
        const detection = primaryFace.detection;
        
        // Try to get mouth position from landmarks
        const mouthPos = getMouthPosition(detection, video);
        
        if (!mouthPos) {
            // No mouth position from landmarks - use face box as fallback
            // The box might be at detection.detection.box or detection.box
            const box = (detection.detection && detection.detection.box) || detection.box;
            if (box) {
                const videoRect = video.getBoundingClientRect();
                const videoAspect = video.videoWidth / video.videoHeight;
                const displayAspect = videoRect.width / videoRect.height;
                
                let scaleX = 1;
                let scaleY = 1;
                let offsetX = 0;
                let offsetY = 0;
                
                if (videoAspect > displayAspect) {
                    scaleY = videoRect.height / video.videoHeight;
                    scaleX = scaleY;
                    offsetX = (videoRect.width - video.videoWidth * scaleX) / 2;
                } else {
                    scaleX = videoRect.width / video.videoWidth;
                    scaleY = scaleX;
                    offsetY = (videoRect.height - video.videoHeight * scaleY) / 2;
                }
                
                // Use center of face box, at mouth level (approximately 60% down the face)
                const faceCenterX = videoRect.left + offsetX + (box.x + box.width / 2) * scaleX;
                const faceCenterY = videoRect.top + offsetY + (box.y + box.height * 0.65) * scaleY; // 65% down = mouth area
                
                positionSpeechBubbleAt(faceCenterX, faceCenterY);
            }
            return;
        }
        
        // Position speech bubble above the mouth with smoothing
        const smoothedPos = smoothMouthPosition(mouthPos);
        positionSpeechBubbleAt(smoothedPos.x, smoothedPos.y);
        
    } catch (error) {
        console.error('Error updating speech bubble position:', error);
    }
}

/**
 * Smooth mouth position to reduce jitter
 * Uses exponential moving average for smooth tracking
 * 
 * @param {Object} newPos - New mouth position { x, y }
 * @returns {Object} Smoothed position { x, y }
 */
function smoothMouthPosition(newPos) {
    if (!newPos || typeof newPos.x !== 'number' || typeof newPos.y !== 'number') {
        // Return last known position if new position is invalid
        return lastMouthPosition || newPos;
    }
    
    // Add to history
    positionHistory.push({ x: newPos.x, y: newPos.y, timestamp: Date.now() });
    
    // Keep only recent positions
    if (positionHistory.length > MAX_POSITION_HISTORY) {
        positionHistory.shift();
    }
    
    // Remove old positions (older than 200ms)
    const now = Date.now();
    positionHistory = positionHistory.filter(p => now - p.timestamp < 200);
    
    if (positionHistory.length === 0) {
        lastMouthPosition = newPos;
        return newPos;
    }
    
    // Use weighted average - give more weight to recent positions
    let totalWeight = 0;
    let smoothedX = 0;
    let smoothedY = 0;
    
    for (let i = 0; i < positionHistory.length; i++) {
        const pos = positionHistory[i];
        // Exponential weighting: more recent = higher weight
        const age = now - pos.timestamp;
        const weight = Math.exp(-age / 100); // Decay over 100ms
        
        smoothedX += pos.x * weight;
        smoothedY += pos.y * weight;
        totalWeight += weight;
    }
    
    if (totalWeight > 0) {
        smoothedX = smoothedX / totalWeight;
        smoothedY = smoothedY / totalWeight;
    } else {
        smoothedX = newPos.x;
        smoothedY = newPos.y;
    }
    
    // Update last known position
    lastMouthPosition = { x: smoothedX, y: smoothedY };
    
    return lastMouthPosition;
}

/**
 * Position speech bubble at specific screen coordinates
 * @param {number} x - X coordinate in screen pixels
 * @param {number} y - Y coordinate in screen pixels
 */
function positionSpeechBubbleAt(x, y) {
    if (!captionsContainer) {
        return;
    }
    
    // Get container dimensions immediately (don't wait for requestAnimationFrame)
    const containerRect = captionsContainer.getBoundingClientRect();
    const containerWidth = containerRect.width > 0 ? containerRect.width : 300;
    const containerHeight = containerRect.height > 0 ? containerRect.height : 60;
    
    // Position bubble above the mouth
    // Calculate optimal offset based on container size
    // Place bubble close to mouth but with enough space for readability
    const offsetAboveMouth = Math.max(containerHeight + 12, 50); // At least 12px gap, min 50px from mouth
    const bubbleX = x - containerWidth / 2; // Center bubble horizontally on mouth
    const bubbleY = y - offsetAboveMouth; // Position above mouth
    
    // Constrain to viewport (keep bubble visible)
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    const minX = 10;
    const maxX = viewportWidth - containerWidth - 10;
    const minY = 10;
    const maxY = viewportHeight - containerHeight - 10;
    
    // If bubble would go off screen, adjust position
    let constrainedX = Math.max(minX, Math.min(bubbleX, maxX));
    let constrainedY = Math.max(minY, Math.min(bubbleY, maxY));
    
    // If we had to adjust Y position, try to keep it near the face horizontally
    if (Math.abs(constrainedY - bubbleY) > 10) {
        // Bubble was constrained vertically - adjust X to stay near face
        constrainedX = Math.max(minX, Math.min(x - containerWidth / 2, maxX));
    }
    
    // Apply position with smooth transition for smooth following
    captionsContainer.style.position = 'fixed';
    captionsContainer.style.left = constrainedX + 'px';
    captionsContainer.style.top = constrainedY + 'px';
    captionsContainer.style.transform = 'none';
    captionsContainer.style.width = 'auto';
    captionsContainer.style.maxWidth = '400px';
    captionsContainer.style.transition = 'left 0.08s linear, top 0.08s linear'; // Very responsive, linear for predictability
    captionsContainer.classList.add('speech-bubble');
}

/**
 * Reset captions to default position (bottom center)
 */
function resetCaptionsToDefaultPosition() {
    if (!captionsContainer) return;
    
    captionsContainer.style.position = 'fixed';
    captionsContainer.style.top = '85%';
    captionsContainer.style.left = '50%';
    captionsContainer.style.transform = 'translateX(-50%)';
    captionsContainer.style.width = '90%';
    captionsContainer.style.maxWidth = '800px';
    captionsContainer.classList.remove('speech-bubble');
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
 * Initialize camera flip toggle
 */
function initializeCameraFlip() {
    // Load saved preference from localStorage
    const savedFlipState = localStorage.getItem('cameraFlipped');
    if (savedFlipState === 'true') {
        appState.cameraFlipped = true;
    }
    
    // Get toggle button
    const flipButton = document.getElementById('toggle-flip-camera');
    if (!flipButton) {
        return;
    }
    
    // Update button state
    updateFlipCameraUI();
    
    // Add click event listener
    flipButton.addEventListener('click', toggleCameraFlip);
}

/**
 * Toggle camera flip/mirror state
 */
function toggleCameraFlip() {
    appState.cameraFlipped = !appState.cameraFlipped;
    
    // Save preference to localStorage
    localStorage.setItem('cameraFlipped', appState.cameraFlipped.toString());
    
    // Apply flip to video
    applyCameraFlip();
    
    // Update UI
    updateFlipCameraUI();
    
    console.log('Camera flip toggled:', appState.cameraFlipped ? 'mirrored' : 'normal');
}

/**
 * Apply camera flip to video element
 */
function applyCameraFlip() {
    const video = document.getElementById('camera-video');
    if (!video) {
        return;
    }
    
    if (appState.cameraFlipped) {
        video.classList.add('flipped');
    } else {
        video.classList.remove('flipped');
    }
}

/**
 * Update flip camera button UI
 */
function updateFlipCameraUI() {
    const flipButton = document.getElementById('toggle-flip-camera');
    const statusElement = document.getElementById('status-flip-camera');
    
    if (flipButton && statusElement) {
        if (appState.cameraFlipped) {
            flipButton.classList.add('active');
            statusElement.textContent = 'On';
        } else {
            flipButton.classList.remove('active');
            statusElement.textContent = 'Off';
        }
    }
    
    // Update hand menu button states to reflect the change
    if (typeof updateAllHandMenuButtonStates === 'function') {
        updateAllHandMenuButtonStates();
    }
}

/**
 * Update camera selector dropdown
 */
function updateCameraSelector() {
    const cameraSelect = document.getElementById('camera-select');
    if (!cameraSelect) {
        return;
    }
    
    // Clear existing options
    cameraSelect.innerHTML = '';
    
    if (appState.availableCameras.length === 0) {
        cameraSelect.innerHTML = '<option value="">No cameras found</option>';
        return;
    }
    
    // Add cameras to dropdown
    appState.availableCameras.forEach((camera, index) => {
        const option = document.createElement('option');
        option.value = camera.deviceId;
        option.textContent = camera.label || `Camera ${index + 1}`;
        if (camera.deviceId === appState.selectedCameraId) {
            option.selected = true;
        }
        cameraSelect.appendChild(option);
    });
}

/**
 * Initialize camera selector
 */
function initializeCameraSelector() {
    const cameraSelect = document.getElementById('camera-select');
    if (!cameraSelect) {
        return;
    }
    
    // Add change event listener
    cameraSelect.addEventListener('change', async (e) => {
        const selectedCameraId = e.target.value;
        if (selectedCameraId && selectedCameraId !== appState.selectedCameraId) {
            console.log('Switching camera to:', selectedCameraId);
            await switchCamera(selectedCameraId);
        }
    });
}

/**
 * Switch to a different camera
 */
async function switchCamera(deviceId) {
    if (!deviceId) {
        console.error('No device ID provided');
        return;
    }
    
    updateCameraStatus('Switching camera...', false);
    
    // Stop current stream
    if (appState.cameraStream) {
        appState.cameraStream.getTracks().forEach(track => track.stop());
        appState.cameraStream = null;
    }
    
    // Update selected camera
    appState.selectedCameraId = deviceId;
    localStorage.setItem('selectedCameraId', deviceId);
    
    // Reinitialize camera
    await initializeCamera();
}

/**
 * Handle window resize - update overlay positions
 */
window.addEventListener('resize', () => {
    if (appState.features.face.enabled) {
        const video = document.getElementById('camera-video');
        if (video) {
            updateAllOverlayPositions(video);
        }
    }
});

/**
 * Initialize hand menu mode toggle
 */
function initializeHandMenuToggle() {
    const handMenuToggle = document.getElementById('hand-menu-toggle');
    if (!handMenuToggle) {
        return;
    }
    
    // Hand menu mode should be OFF by default (don't load from localStorage)
    appState.handMenuMode = false;
    
    // Add click event listener
    handMenuToggle.addEventListener('click', toggleHandMenuMode);
    
    // Update state in sign recognition module (will set to disabled)
    updateHandMenuMode();
}

/**
 * Toggle hand menu mode
 */
function toggleHandMenuMode() {
    appState.handMenuMode = !appState.handMenuMode;
    
    // Save preference to localStorage
    localStorage.setItem('handMenuMode', appState.handMenuMode.toString());
    
    // Update UI
    const handMenuToggle = document.getElementById('hand-menu-toggle');
    if (handMenuToggle) {
        if (appState.handMenuMode) {
            handMenuToggle.classList.add('active');
        } else {
            handMenuToggle.classList.remove('active');
        }
    }
    
    // Update state in sign recognition module
    updateHandMenuMode();
    
    // Hide hand menu overlay if mode is disabled
    if (!appState.handMenuMode) {
        hideHandMenuOverlay();
        const prompt = document.getElementById('hand-menu-prompt');
        if (prompt) {
            prompt.classList.add('hidden');
        }
    } else {
        // Hand Detection is always enabled, so hand menu should work
        // No need to check or enable it
    }
    
    console.log('Hand menu mode toggled:', appState.handMenuMode ? 'enabled' : 'disabled');
}

/**
 * Open hand menu at default position in center of screen
 */
function openHandMenuAtDefaultPosition() {
    console.log('openHandMenuAtDefaultPosition called');
    // Enable hand menu mode if not already enabled
    if (!appState.handMenuMode) {
        appState.handMenuMode = true;
        
        // Update UI
        const handMenuToggle = document.getElementById('hand-menu-toggle');
        if (handMenuToggle) {
            handMenuToggle.classList.add('active');
        }
        
        // Update state in sign recognition module
        updateHandMenuMode();
    }
    
    // Set hand menu to default position (centered)
    if (typeof setHandMenuToDefaultPosition === 'function') {
        console.log('Calling setHandMenuToDefaultPosition...');
        setHandMenuToDefaultPosition();
        console.log('Hand menu set to default position');
    } else {
        console.error('setHandMenuToDefaultPosition function not available!');
    }
}

/**
 * Close hand menu (unlock and hide)
 */
function closeHandMenu() {
    // Unlock the hand menu if it's locked
    if (typeof unlockHandMenu === 'function') {
        unlockHandMenu();
    }
    
    // Hide the hand menu overlay
    hideHandMenuOverlay();
    
    // Optionally disable hand menu mode
    // Uncomment the following lines if you want to disable the mode when closing
    // appState.handMenuMode = false;
    // updateHandMenuMode();
    // const handMenuToggle = document.getElementById('hand-menu-toggle');
    // if (handMenuToggle) {
    //     handMenuToggle.classList.remove('active');
    // }
    
    console.log('Hand menu closed');
}

/**
 * Fix/Reset hand menu to default position
 * Only resets if menu is already open, doesn't open it if closed
 */
function fixHandMenu() {
    // Only fix menu if it's already open/enabled
    if (!appState.handMenuMode) {
        console.log('Hand menu is not open - fix menu only works when menu is already open');
        return;
    }
    
    // Check if menu overlay is visible
    const handMenuOverlay = document.getElementById('hand-menu-overlay');
    if (handMenuOverlay && handMenuOverlay.style.display === 'none') {
        console.log('Hand menu overlay is not visible - fix menu only works when menu is visible');
        return;
    }
    
    // Unlock the hand menu first if it's locked
    if (typeof unlockHandMenu === 'function') {
        unlockHandMenu();
    }
    
    // Reset hand menu to default position (centered)
    if (typeof setHandMenuToDefaultPosition === 'function') {
        setHandMenuToDefaultPosition();
        console.log('Hand menu reset to default position');
    } else {
        console.warn('setHandMenuToDefaultPosition function not available');
    }
}

/**
 * Update hand menu mode in sign recognition module
 */
function updateHandMenuMode() {
    if (typeof setHandMenuMode === 'function') {
        setHandMenuMode(appState.handMenuMode);
    }
    
    // Show/hide prompt based on mode and hand detection
    updateHandMenuPrompt();
}

/**
 * Update hand menu prompt visibility
 */
function updateHandMenuPrompt() {
    const prompt = document.getElementById('hand-menu-prompt');
    if (!prompt) {
        return;
    }
    
    if (appState.handMenuMode && appState.features.sign.enabled) {
        // Show prompt initially, will be hidden when hands are detected
        // The sign recognition module will control this based on hand detection
        prompt.classList.remove('hidden');
    } else {
        prompt.classList.add('hidden');
    }
}

/**
 * Hide hand menu overlay (called from main.js)
 */
function hideHandMenuOverlay() {
    const handMenuOverlay = document.getElementById('hand-menu-overlay');
    if (handMenuOverlay) {
        handMenuOverlay.style.display = 'none';
    }
}

/**
 * Cleanup camera stream on page unload
 */
window.addEventListener('beforeunload', () => {
    if (appState.cameraStream) {
        appState.cameraStream.getTracks().forEach(track => track.stop());
    }
    // Clear face overlays
    clearAllFaceOverlays();
});

/**
 * Element Registry for Pinch-to-Click
 * Maps element IDs/selectors to their click handlers
 * This allows direct handler invocation, bypassing browser security restrictions
 */
export const elementClickRegistry = {
    // Sidebar controls
    'sidebar-toggle': () => {
        console.log('Pinch click: Toggling sidebar');
        toggleSidebar();
    },
    'sidebar-close': () => {
        console.log('Pinch click: Closing sidebar');
        closeSidebar();
    },
    'sidebar-overlay': () => {
        console.log('Pinch click: Closing sidebar via overlay');
        closeSidebar();
    },
    
    // Feature toggles
    'toggle-speech': () => {
        console.log('Pinch click: Toggling speech captions');
        toggleFeature('speech');
    },
    'toggle-sign': () => {
        console.log('Pinch click: Hand Detection is always on');
        // Hand Detection is always enabled - just show a message
        alert('Hand Detection is always enabled and cannot be turned off.');
    },
    'toggle-scene': () => {
        console.log('Pinch click: Toggling scene description');
        toggleFeature('scene');
    },
    'toggle-face': () => {
        console.log('Pinch click: Toggling face recognition');
        toggleFeature('face');
    },
    
    // Settings
    'toggle-flip-camera': () => {
        console.log('Pinch click: Toggling camera flip');
        toggleCameraFlip();
    },
    'toggle-pinch-click': () => {
        console.log('Pinch click: Toggling pinch-to-click');
        togglePinchToClick();
    },
    'settings-btn': () => {
        console.log('Pinch click: Opening settings');
        alert('Settings panel - Coming soon!');
    },
    'help-btn': () => {
        console.log('Pinch click: Opening help');
        alert('AccessLens Help\n\nToggle features on/off using the sidebar.\n\nFeatures:\n• Speech Captions - Real-time speech to text\n• Sign Language - ASL gesture recognition\n• Scene Description - Audio narration\n• Face Recognition - Recognize saved faces\n\nSettings:\n• Mirror Camera - Flip video horizontally\n• Pinch to Click - Use pinch gesture to click');
    },
    'hand-menu-unlock-button': () => {
        console.log('Pinch click: Unlocking hand menu');
        unlockHandMenu();
    }
};

/**
 * Get click handler for an element
 * Checks element ID, then class names, then tag name
 * @param {HTMLElement} element - Element to get handler for
 * @returns {Function|null} Handler function or null
 */
export function getClickHandler(element) {
    if (!element) return null;
    
    // Check by ID first (most specific)
    if (element.id && elementClickRegistry[element.id]) {
        console.log('  ✓ Found handler by element ID:', element.id);
        return elementClickRegistry[element.id];
    }
    
    // Check by class name (if element has specific classes)
    if (element.className) {
        const classes = element.className.split(' ').filter(c => c.trim());
        for (const className of classes) {
            if (elementClickRegistry[className]) {
                console.log('  ✓ Found handler by element class:', className);
                return elementClickRegistry[className];
            }
        }
    }
    
    // Check parent elements (for nested elements like buttons with spans)
    let parent = element.parentElement;
    let depth = 0;
    while (parent && depth < 5) { // Check up to 5 levels up (increased from 3)
        if (parent.id && elementClickRegistry[parent.id]) {
            console.log(`  ✓ Found handler by parent ID (depth ${depth + 1}):`, parent.id);
            return elementClickRegistry[parent.id];
        }
        // Also check parent classes
        if (parent.className) {
            const parentClasses = parent.className.split(' ').filter(c => c.trim());
            for (const className of parentClasses) {
                if (elementClickRegistry[className]) {
                    console.log(`  ✓ Found handler by parent class (depth ${depth + 1}):`, className);
                    return elementClickRegistry[className];
                }
            }
        }
        parent = parent.parentElement;
        depth++;
    }
    
    return null;
}

// Export for use in other modules (if needed)
export { appState, toggleSidebar, closeSidebar };
