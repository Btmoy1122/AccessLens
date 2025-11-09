/**
 * Authentication Service
 * 
 * Handles Firebase Authentication (Google Sign-In, Email/Password)
 */

import { initializeApp } from 'firebase/app';
import { 
    getAuth, 
    signInWithPopup, 
    GoogleAuthProvider, 
    signOut,
    onAuthStateChanged,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword
} from 'firebase/auth';
import firebaseConfig from '../config/firebase-config.js';

// Initialize Firebase (only if config is valid)
let app = null;
let auth = null;

try {
    if (firebaseConfig.apiKey && firebaseConfig.projectId) {
        app = initializeApp(firebaseConfig);
        auth = getAuth(app);
    } else {
        console.warn('Firebase config incomplete - authentication disabled. Guest mode available.');
    }
} catch (error) {
    console.error('Firebase initialization error:', error);
    console.warn('Authentication disabled. Guest mode available.');
}

// Google Auth Provider (only if auth is initialized)
let googleProvider = null;
if (auth) {
    googleProvider = new GoogleAuthProvider();
    // Add additional scopes if needed
    googleProvider.addScope('email');
    googleProvider.addScope('profile');
    // Set custom parameters
    googleProvider.setCustomParameters({
        prompt: 'select_account'
    });
}

/**
 * Sign in with Google
 * 
 * @returns {Promise<Object>} User object with uid, email, displayName
 */
export async function signInWithGoogle() {
    if (!auth || !googleProvider) {
        throw new Error('Firebase not configured. Please set up your .env file with Firebase credentials.');
    }
    try {
        const result = await signInWithPopup(auth, googleProvider);
        const user = result.user;
        return {
            uid: user.uid,
            email: user.email,
            displayName: user.displayName,
            photoURL: user.photoURL
        };
    } catch (error) {
        console.error('Error signing in with Google:', error);
        
        // Provide helpful error messages
        if (error.code === 'auth/popup-closed-by-user') {
            throw new Error('Sign-in was cancelled. Please try again.');
        } else if (error.code === 'auth/unauthorized-domain') {
            throw new Error('This domain is not authorized. Please check Firebase Console > Authentication > Settings > Authorized domains.');
        } else if (error.code === 'auth/operation-not-allowed') {
            throw new Error('Google Sign-In is not enabled. Please enable it in Firebase Console > Authentication > Sign-in method.');
        } else if (error.code === 'auth/popup-blocked') {
            throw new Error('Popup was blocked. Please allow popups for this site and try again.');
        } else if (error.message && error.message.includes('invalid')) {
            throw new Error('Sign-in configuration error. Please check:\n1. Google Sign-In is enabled in Firebase Console\n2. OAuth consent screen is configured in Google Cloud Console\n3. Authorized domains include localhost');
        }
        
        throw error;
    }
}

/**
 * Sign in with email and password
 * 
 * @param {string} email - User email
 * @param {string} password - User password
 * @returns {Promise<Object>} User object
 */
export async function signInWithEmail(email, password) {
    if (!auth) {
        throw new Error('Firebase not configured. Please set up your .env file with Firebase credentials.');
    }
    try {
        const result = await signInWithEmailAndPassword(auth, email, password);
        const user = result.user;
        return {
            uid: user.uid,
            email: user.email,
            displayName: user.displayName
        };
    } catch (error) {
        console.error('Error signing in with email:', error);
        throw error;
    }
}

/**
 * Create account with email and password
 * 
 * @param {string} email - User email
 * @param {string} password - User password
 * @returns {Promise<Object>} User object
 */
export async function createAccountWithEmail(email, password) {
    if (!auth) {
        throw new Error('Firebase not configured. Please set up your .env file with Firebase credentials.');
    }
    try {
        const result = await createUserWithEmailAndPassword(auth, email, password);
        const user = result.user;
        return {
            uid: user.uid,
            email: user.email,
            displayName: user.displayName
        };
    } catch (error) {
        console.error('Error creating account:', error);
        throw error;
    }
}

/**
 * Sign out current user
 * 
 * @returns {Promise<void>}
 */
export async function signOutUser() {
    if (!auth) {
        return; // Nothing to sign out from
    }
    try {
        await signOut(auth);
    } catch (error) {
        console.error('Error signing out:', error);
        throw error;
    }
}

/**
 * Get current user
 * 
 * @returns {Object|null} Current user object or null if not signed in
 */
export function getCurrentUser() {
    if (!auth) {
        return null;
    }
    return auth.currentUser;
}

/**
 * Listen to authentication state changes
 * 
 * @param {Function} callback - Callback function(user) called when auth state changes
 * @returns {Function} Unsubscribe function
 */
export function onAuthStateChange(callback) {
    if (!auth) {
        // Firebase not configured - call callback with null immediately
        // This allows guest mode to work
        callback(null);
        // Return a no-op unsubscribe function
        return () => {};
    }
    return onAuthStateChanged(auth, (user) => {
        if (user) {
            callback({
                uid: user.uid,
                email: user.email,
                displayName: user.displayName,
                photoURL: user.photoURL
            });
        } else {
            callback(null);
        }
    });
}

/**
 * Check if user is authenticated
 * 
 * @returns {boolean} True if user is signed in
 */
export function isAuthenticated() {
    if (!auth) {
        return false;
    }
    return auth.currentUser !== null;
}

