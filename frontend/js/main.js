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
    isRecordingMemoryActive
} from '@ml/speech/speech-to-text.js';
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
    loadButtonPositions
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
    getAllRecognizedFaces
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

/**
 * Initialize the application
 */
document.addEventListener('DOMContentLoaded', () => {
    try {
        console.log('AccessLens initialized');
        
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
        
        // Initialize ML modules (speech-to-text, scene description, etc.)
        initializeMLModules();
        
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
                setSignVideoElement(video);
                
                // Set click registry for pinch-to-click functionality
                // This allows direct handler invocation, bypassing browser security restrictions
                setClickRegistry(elementClickRegistry, getClickHandler);
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
            alert('AccessLens Help\n\nToggle features on/off using the sidebar.\n\nFeatures:\n• Speech Captions - Real-time speech to text\n• Sign Language - ASL gesture recognition\n• Scene Description - Audio narration\n• Face Recognition - Recognize saved faces\n\nSettings:\n• Mirror Camera - Flip video horizontally\n• Pinch to Click - Use pinch gesture to click');
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
 */
function togglePinchToClick() {
    // Only enable if sign language is enabled
    if (!appState.features.sign.enabled) {
        alert('Please enable Sign Language feature first to use Pinch to Click.');
        return;
    }
    
    const currentState = isPinchToClickEnabled();
    const newState = !currentState;
    
    setPinchToClickEnabled(newState);
    updatePinchClickUI(newState);
    
    console.log('Pinch-to-click toggled:', newState ? 'enabled' : 'disabled');
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
    } else if (featureName === 'sign') {
        if (appState.features.sign.enabled) {
            startSignRecognition();
        } else {
            stopSignRecognition();
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
    
    // Note: Sign language recognition is lazy-loaded when enabled (see initializeSignRecognition)
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
<<<<<<< HEAD
 * Initialize Sign Language Recognition module (lazy-loaded)
 */
async function initializeSignRecognition() {
    // Initialize sign language recognition module
    const initialized = await initSignRecognition();
    if (!initialized) {
        console.warn('Sign language recognition not available');
        // Update UI to show it's not available
        const signToggle = document.getElementById('toggle-sign');
        if (signToggle) {
            signToggle.disabled = true;
            signToggle.title = 'Sign language recognition not available';
        }
        return false;
    }
    
    // Set up display callback (reuse captions container)
    setSignDisplayCallback((text, isInterim) => {
        updateCaptions(text, isInterim);
    });
    
    console.log('Sign language recognition module initialized');
    return true;
}

/**
 * Start sign language recognition
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
    
    // Lazy-load module if not initialized
    if (!isSignInitialized()) {
        console.log('Lazy-loading sign language recognition...');
        updateCaptions('⏳ Loading MediaPipe from CDN... (30-60 seconds)', false);
        
        try {
            const initialized = await initializeSignRecognition();
            if (!initialized) {
                console.error('Failed to initialize sign language recognition');
                updateCaptions('❌ MediaPipe failed to load. CDN files may not be downloading. Open Network tab in DevTools to check.', true);
                // Disable the feature if it fails
                appState.features.sign.enabled = false;
                updateFeatureUI('sign');
                return;
            }
            
            updateCaptions('✅ MediaPipe loaded! Starting detection...', false);
            setTimeout(() => {
                if (appState.features.sign.enabled) {
                    updateCaptions('', false);
                }
            }, 2000);
        } catch (error) {
            console.error('Error initializing sign language recognition:', error);
            const errorMsg = error.message || error.toString();
            if (errorMsg.includes('assets not loading') || errorMsg.includes('CDN')) {
                updateCaptions('❌ MediaPipe CDN issue: Files not loading. Check Network tab - look for .data and .tflite files. If they show errors, CDN is blocked.', true);
            } else {
                updateCaptions('❌ MediaPipe initialization failed. See console for details.', true);
            }
            appState.features.sign.enabled = false;
            updateFeatureUI('sign');
            return;
        }
    }
    
    // Ensure click registry is set before starting detection
    // This is critical for pinch-to-click functionality
    try {
        setClickRegistry(elementClickRegistry, getClickHandler);
        console.log('Click registry set for pinch-to-click');
    } catch (error) {
        console.warn('Failed to set click registry:', error);
    }
    
    // Start detection
    try {
        await startDetection();
        console.log('Sign language recognition started');
        updateCaptions('✋ Sign language detection active', false);
        
        // Clear status message after a moment
        setTimeout(() => {
            if (appState.features.sign.enabled) {
                updateCaptions('', false);
            }
        }, 2000);
    } catch (error) {
        console.error('Error starting sign language detection:', error);
        updateCaptions('❌ Cannot start: MediaPipe not ready. Disable and re-enable the feature.', true);
        appState.features.sign.enabled = false;
        updateFeatureUI('sign');
    }
}

/**
 * Stop sign language recognition
 */
function stopSignRecognition() {
    stopDetection();
    updateCaptions('', false);
    
    // Disable pinch-to-click when sign language is disabled
    if (isPinchToClickEnabled()) {
        setPinchToClickEnabled(false);
        updatePinchClickUI(false);
    }
    
    console.log('Sign language recognition stopped');
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
<<<<<<< HEAD
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
        console.log('Pinch click: Toggling sign language');
        toggleFeature('sign');
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
