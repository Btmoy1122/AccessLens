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
    reloadKnownFaces
} from '@ml/vision/face-recognition.js';
import {
    initFaceOverlays,
    updateFaceOverlay,
    removeFaceOverlay,
    clearAllFaceOverlays,
    updateAllOverlayPositions,
    cleanupInvisibleOverlays
} from './face-overlays.js';

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
let faceRegistrationModal, faceModalClose, faceRegisterBtn, faceSkipBtn, faceNameInput, faceNotesInput;

// Face registration state
let currentPendingDetection = null; // Stores detection data for pending registration

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
        
        // Initialize camera first (most important)
        initializeCamera();
        
        // Initialize feature toggles
        initializeFeatureToggles();
        
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
                
                // If video isn't playing, show an error
                if (!video.srcObject && video.readyState === 0) {
                    console.error('Video element not initialized - camera may have failed');
                    updateCameraStatus('Camera failed to initialize', false);
                }
            } else {
                console.error('Video element not found in DOM');
            }
        }, 1000);
    } catch (error) {
        console.error('Fatal error during initialization:', error);
        
        // Show error message on screen
        const errorDiv = document.createElement('div');
        errorDiv.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(255, 0, 0, 0.9);
            color: white;
            padding: 20px;
            border-radius: 8px;
            z-index: 10000;
            max-width: 500px;
            text-align: center;
        `;
        errorDiv.innerHTML = `
            <h2>Initialization Error</h2>
            <p>${error.message}</p>
            <p style="font-size: 12px; margin-top: 10px;">Check the browser console (F12) for more details.</p>
        `;
        document.body.appendChild(errorDiv);
        
        alert(`Error initializing AccessLens: ${error.message}\n\nPlease check the console (F12) for more details.`);
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
                video.style.visibility = 'visible';
                
                // Set video element for ML modules (when video is actually playing)
                setSceneVideoElement(video);
                setFaceVideoElement(video);
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
    } else if (featureName === 'face') {
        if (appState.features.face.enabled) {
            startFaceRecognition();
        } else {
            stopFaceRecognition();
        }
    }
    // TODO: Add other feature handlers
    // else if (featureName === 'sign') { ... }
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
    
    // TODO: Initialize other ML modules
    // initializeSignRecognition();
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
    onFaceUpdate((faces) => {
        const video = document.getElementById('camera-video');
        if (!video || !appState.features.face.enabled) {
            return;
        }
        
        // Track which faces are currently visible
        const visibleFaceKeys = new Set();
        
        // Update overlays for all active faces
        for (const face of faces) {
            if (face.detection && face.faceData) {
                visibleFaceKeys.add(face.faceKey);
                updateFaceOverlay(
                    face.faceKey,
                    face.faceData,
                    face.detection,
                    video
                );
            }
        }
        
        // Remove overlays for faces that are no longer visible
        // This prevents old tags from accumulating when faces move
        cleanupInvisibleOverlays(visibleFaceKeys);
    });
    
    // Callback when a face is removed from cache
    onFaceRemoved((faceKey) => {
        removeFaceOverlay(faceKey);
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

// Export for use in other modules (if needed)
export { appState, toggleSidebar, closeSidebar };
