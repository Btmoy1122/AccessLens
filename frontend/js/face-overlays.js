/**
 * Face Overlays Manager
 * 
 * Manages visual overlays showing face names and notes next to detected faces
 */

// Store active face overlays
const faceOverlays = new Map(); // Key: faceId, Value: { element, faceData, detection }

/**
 * Initialize face overlays container
 */
export function initFaceOverlays() {
    const container = document.getElementById('face-overlays');
    if (!container) {
        console.error('Face overlays container not found');
        return false;
    }
    return true;
}

/**
 * Update or create face overlay
 * 
 * @param {string} faceId - Unique ID for the face
 * @param {Object} faceData - Face data { name, notes, id }
 * @param {Object} detection - Face detection with box coordinates
 * @param {HTMLVideoElement} videoElement - Video element for coordinate conversion
 */
export function updateFaceOverlay(faceId, faceData, detection, videoElement) {
    if (!videoElement || !detection || !detection.detection) {
        return;
    }
    
    const container = document.getElementById('face-overlays');
    if (!container) {
        return;
    }
    
    // Get face box coordinates
    const box = detection.detection.box;
    const videoRect = videoElement.getBoundingClientRect();
    
    // Calculate position relative to viewport
    // Video might be scaled/fitted, so we need to account for that
    const videoAspect = videoElement.videoWidth / videoElement.videoHeight;
    const displayAspect = videoRect.width / videoRect.height;
    
    let scaleX = 1;
    let scaleY = 1;
    let offsetX = 0;
    let offsetY = 0;
    
    if (videoAspect > displayAspect) {
        // Video is wider - letterboxed vertically
        scaleY = videoRect.height / videoElement.videoHeight;
        scaleX = scaleY;
        offsetX = (videoRect.width - videoElement.videoWidth * scaleX) / 2;
    } else {
        // Video is taller - letterboxed horizontally
        scaleX = videoRect.width / videoElement.videoWidth;
        scaleY = scaleX;
        offsetY = (videoRect.height - videoElement.videoHeight * scaleY) / 2;
    }
    
    // Convert video coordinates to screen coordinates
    let x = videoRect.left + offsetX + (box.x * scaleX);
    const y = videoRect.top + offsetY + (box.y * scaleY);
    
    // Check if camera is flipped/mirrored
    // When video is flipped with CSS scaleX(-1), we need to mirror the x coordinate
    const isFlipped = videoElement.classList.contains('flipped');
    if (isFlipped) {
        // Calculate x position relative to video element
        const xRelativeToVideo = x - videoRect.left;
        // Mirror it: if video width is W and face is at position p from left,
        // after flipping it should be at (W - p) from left
        const xFlippedRelativeToVideo = videoRect.width - xRelativeToVideo;
        // Convert back to screen coordinates
        x = videoRect.left + xFlippedRelativeToVideo;
    }
    
    // Get or create overlay element
    let overlay = faceOverlays.get(faceId);
    if (!overlay) {
        overlay = createFaceOverlayElement(faceId, faceData);
        container.appendChild(overlay.element);
        faceOverlays.set(faceId, overlay);
    }
    
    // Update overlay data
    overlay.faceData = faceData;
    overlay.detection = detection;
    
    // Update position - place tag above the face
    overlay.element.style.left = `${x}px`;
    overlay.element.style.top = `${Math.max(10, y - 40)}px`; // 40px above face, min 10px from top
    
    // Update content
    updateOverlayContent(overlay.element, faceData);
    
    // Show overlay
    overlay.element.classList.remove('hidden');
}

/**
 * Create a new face overlay element
 * 
 * @param {string} faceId - Unique ID
 * @param {Object} faceData - Face data
 * @returns {Object} Overlay object with element
 */
function createFaceOverlayElement(faceId, faceData) {
    const element = document.createElement('div');
    element.className = 'face-tag';
    element.id = `face-tag-${faceId}`;
    element.setAttribute('data-face-id', faceId);
    
    // Create name element
    const nameElement = document.createElement('div');
    nameElement.className = 'face-tag-name';
    nameElement.textContent = faceData.name || 'Unknown';
    
    // Create notes element
    const notesElement = document.createElement('div');
    notesElement.className = 'face-tag-notes';
    if (faceData.notes) {
        notesElement.textContent = faceData.notes;
    }
    
    element.appendChild(nameElement);
    element.appendChild(notesElement);
    
    return {
        element: element,
        faceData: faceData,
        detection: null
    };
}

/**
 * Update overlay content
 * 
 * @param {HTMLElement} element - Overlay element
 * @param {Object} faceData - Face data
 */
function updateOverlayContent(element, faceData) {
    const nameElement = element.querySelector('.face-tag-name');
    const notesElement = element.querySelector('.face-tag-notes');
    
    if (nameElement) {
        nameElement.textContent = faceData.name || 'Unknown';
    }
    
    if (notesElement) {
        // Priority: memorySummary > latestSummary > notes > nothing
        // Show combined memory summary if available, otherwise show static notes
        const displayText = faceData.memorySummary || faceData.latestSummary || faceData.notes;
        
        if (displayText) {
            notesElement.textContent = displayText;
            notesElement.style.display = 'block';
        } else {
            notesElement.style.display = 'none';
        }
    }
    
    // Update class based on recognition status
    if (faceData.id) {
        element.classList.add('recognized');
        element.classList.remove('unknown');
    } else {
        element.classList.add('unknown');
        element.classList.remove('recognized');
    }
}

/**
 * Remove face overlay
 * 
 * @param {string} faceId - Face ID to remove
 */
export function removeFaceOverlay(faceId) {
    const overlay = faceOverlays.get(faceId);
    if (overlay) {
        overlay.element.classList.add('hidden');
        // Remove after animation
        setTimeout(() => {
            if (overlay.element.parentNode) {
                overlay.element.parentNode.removeChild(overlay.element);
            }
            faceOverlays.delete(faceId);
        }, 300);
    }
}

/**
 * Clear all face overlays
 */
export function clearAllFaceOverlays() {
    for (const [faceId, overlay] of faceOverlays.entries()) {
        if (overlay.element.parentNode) {
            overlay.element.parentNode.removeChild(overlay.element);
        }
    }
    faceOverlays.clear();
}

/**
 * Update all face overlay positions
 * Call this when video resizes or viewport changes
 * 
 * @param {HTMLVideoElement} videoElement - Video element
 */
export function updateAllOverlayPositions(videoElement) {
    for (const [faceId, overlay] of faceOverlays.entries()) {
        if (overlay.detection) {
            updateFaceOverlay(faceId, overlay.faceData, overlay.detection, videoElement);
        }
    }
}

/**
 * Hide overlay for unknown face
 * 
 * @param {string} faceId - Face ID
 */
export function hideUnknownFaceOverlay(faceId) {
    const overlay = faceOverlays.get(faceId);
    if (overlay) {
        overlay.element.classList.add('hidden');
    }
}

/**
 * Clean up overlays that are no longer visible
 * Removes overlays for faces that are not in the visible set
 * 
 * @param {Set<string>} visibleFaceKeys - Set of face keys that are currently visible
 */
export function cleanupInvisibleOverlays(visibleFaceKeys) {
    const facesToRemove = [];
    
    // Find all overlays that are not in the visible set
    for (const [faceId, overlay] of faceOverlays.entries()) {
        if (!visibleFaceKeys.has(faceId)) {
            facesToRemove.push(faceId);
        }
    }
    
    // Remove overlays that are no longer visible
    for (const faceId of facesToRemove) {
        removeFaceOverlay(faceId);
    }
}

/**
 * Get all currently active overlay face IDs
 * 
 * @returns {Set<string>} Set of active face IDs
 */
export function getActiveOverlayIds() {
    return new Set(faceOverlays.keys());
}

