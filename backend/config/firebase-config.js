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

// IMPORTANT: Remove hardcoded fallback values in production
// Use environment variables: VITE_FIREBASE_API_KEY, etc.
// Get values from: Firebase Console > Project Settings > Your apps
const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "",
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "",
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "",
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "",
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "",
    appId: import.meta.env.VITE_FIREBASE_APP_ID || "",
    measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || ""
};

// Validate that required config values are present
if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
    console.error('Firebase configuration is incomplete. Please check your environment variables.');
    console.error('Missing values:', {
        apiKey: !firebaseConfig.apiKey,
        projectId: !firebaseConfig.projectId
    });
    console.error('Make sure you have a .env file with VITE_FIREBASE_API_KEY and other required variables.');
    // Don't throw error - allow guest mode to work without Firebase
}

export default firebaseConfig;

