/**
 * User Service
 * 
 * Handles user profile and preference management
 */

import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import firebaseConfig from '../config/firebase-config.js';

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

/**
 * Get user preferences
 */
export async function getUserPreferences(userId) {
    try {
        // TODO: Fetch user document from Firestore
        // const userDoc = await getDoc(doc(db, 'users', userId));
        // if (userDoc.exists()) {
        //     return userDoc.data().preferences;
        // }
        // return getDefaultPreferences();
        
        console.log('User preferences fetched:', userId);
        return getDefaultPreferences();
    } catch (error) {
        console.error('Error fetching user preferences:', error);
        return getDefaultPreferences();
    }
}

/**
 * Update user preferences
 */
export async function updateUserPreferences(userId, preferences) {
    try {
        // TODO: Update user document in Firestore
        // await updateDoc(doc(db, 'users', userId), {
        //     preferences: preferences,
        //     updatedAt: new Date()
        // });
        
        console.log('User preferences updated:', userId);
    } catch (error) {
        console.error('Error updating user preferences:', error);
        throw error;
    }
}

/**
 * Create new user profile
 */
export async function createUser(userId, preferences = {}) {
    try {
        // TODO: Create user document in Firestore
        // await setDoc(doc(db, 'users', userId), {
        //     preferences: { ...getDefaultPreferences(), ...preferences },
        //     createdAt: new Date()
        // });
        
        console.log('User created:', userId);
    } catch (error) {
        console.error('Error creating user:', error);
        throw error;
    }
}

/**
 * Get default user preferences
 */
function getDefaultPreferences() {
    return {
        fontSize: 'medium',
        speechSpeed: 1.0,
        enabledFeatures: {
            speech: true,
            sign: true,
            scene: true,
            face: true
        },
        highContrast: false,
        language: 'en-US'
    };
}

