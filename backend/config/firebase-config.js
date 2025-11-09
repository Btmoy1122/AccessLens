/**
 * Firebase Configuration
 * 
 * Loads Firebase configuration from environment variables with fallback to default values.
 * 
 * IMPORTANT: 
 * - For security, use environment variables in production
 * - Never commit .env file to version control (already in .gitignore)
 * - Get values from Firebase Console > Project Settings > Your apps
 * 
 * Environment variables must be prefixed with VITE_ to be accessible in client-side code (Vite requirement)
 */

const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyBVt34mIMaY3lodiRlS-qh0XmVDP9XkqwQ",
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "acceens-5f3ad.firebaseapp.com",
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "acceens-5f3ad",
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "acceens-5f3ad.firebasestorage.app",
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "384687344035",
    appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:384687344035:web:e129c33106e4a7849eb216",
    measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "G-4K07SBY9RL"
};

// Validate that required config values are present
if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
    console.warn('Firebase configuration is incomplete. Please check your environment variables.');
}

export default firebaseConfig;

