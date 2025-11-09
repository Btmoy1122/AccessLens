/**
 * Mobile Detection Utility
 * 
 * Provides utilities to detect mobile devices and adjust functionality accordingly
 */

/**
 * Check if the current device is a mobile device
 * @returns {boolean} True if mobile device
 */
export function isMobileDevice() {
    // Check user agent for mobile indicators
    const userAgent = navigator.userAgent || navigator.vendor || window.opera;
    
    // Mobile device patterns
    const mobilePatterns = [
        /android/i,
        /webos/i,
        /iphone/i,
        /ipad/i,
        /ipod/i,
        /blackberry/i,
        /windows phone/i,
        /mobile/i
    ];
    
    // Check if any pattern matches
    if (mobilePatterns.some(pattern => pattern.test(userAgent))) {
        return true;
    }
    
    // Also check screen size as a fallback (useful for responsive design)
    // Consider devices with width <= 768px as mobile
    if (window.innerWidth <= 768) {
        return true;
    }
    
    // Check for touch support (mobile devices typically have touch)
    if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
        // But only consider it mobile if screen is also small
        // (some laptops have touch screens)
        if (window.innerWidth <= 1024) {
            return true;
        }
    }
    
    return false;
}

/**
 * Check if the current device is iOS
 * @returns {boolean} True if iOS device
 */
export function isIOSDevice() {
    const userAgent = navigator.userAgent || navigator.vendor || window.opera;
    return /iPad|iPhone|iPod/.test(userAgent) && !window.MSStream;
}

/**
 * Check if the current device is Android
 * @returns {boolean} True if Android device
 */
export function isAndroidDevice() {
    const userAgent = navigator.userAgent || navigator.vendor || window.opera;
    return /android/i.test(userAgent);
}

/**
 * Check if Web Speech API is supported and usable on this device
 * @returns {boolean} True if speech recognition is supported
 */
export function isSpeechRecognitionSupported() {
    // Check for Web Speech API support
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
        return false;
    }
    
    // On mobile, especially iOS, speech recognition may have limitations
    // Return true if API exists, but note that it may require user interaction
    return true;
}

/**
 * Check if speech recognition works reliably on mobile
 * Note: This is a heuristic - Web Speech API on mobile (especially iOS) often
 * requires user interaction and may not work continuously
 * @returns {boolean} True if speech recognition is reliable
 */
export function isSpeechRecognitionReliable() {
    // Desktop browsers generally have better support
    if (!isMobileDevice()) {
        return true;
    }
    
    // Android Chrome generally supports Web Speech API
    if (isAndroidDevice()) {
        return true;
    }
    
    // iOS Safari has limited/restricted support for Web Speech API
    // It often requires user interaction and may not work continuously
    if (isIOSDevice()) {
        return false; // iOS has limited support
    }
    
    // For other mobile devices, assume it might work but with limitations
    return false;
}

/**
 * Get device info for debugging
 * @returns {Object} Device information
 */
export function getDeviceInfo() {
    return {
        isMobile: isMobileDevice(),
        isIOS: isIOSDevice(),
        isAndroid: isAndroidDevice(),
        screenWidth: window.innerWidth,
        screenHeight: window.innerHeight,
        hasTouch: 'ontouchstart' in window || navigator.maxTouchPoints > 0,
        userAgent: navigator.userAgent,
        speechRecognitionSupported: isSpeechRecognitionSupported(),
        speechRecognitionReliable: isSpeechRecognitionReliable()
    };
}
