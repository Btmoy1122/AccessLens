/**
 * User Service
 * 
 * Handles user profile and preference management
 */

import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc, setDoc, updateDoc, serverTimestamp, collection, query, where, getDocs, writeBatch } from 'firebase/firestore';
import { getAuth, deleteUser as deleteAuthUser } from 'firebase/auth';
import firebaseConfig from '../config/firebase-config.js';

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

/**
 * Get user preferences
 * 
 * @param {string} userId - User ID
 * @returns {Promise<Object>} User preferences object
 */
export async function getUserPreferences(userId) {
    try {
        const userDoc = await getDoc(doc(db, 'users', userId));
        if (userDoc.exists()) {
            const data = userDoc.data();
            return data.preferences || getDefaultPreferences();
        }
        // Create user with default preferences if doesn't exist
        await createUser(userId);
        return getDefaultPreferences();
    } catch (error) {
        console.error('Error fetching user preferences:', error);
        return getDefaultPreferences();
    }
}

/**
 * Update user preferences
 * 
 * @param {string} userId - User ID
 * @param {Object} preferences - Preferences object to update
 * @returns {Promise<void>}
 */
export async function updateUserPreferences(userId, preferences) {
    try {
        const userRef = doc(db, 'users', userId);
        const userDoc = await getDoc(userRef);
        
        if (userDoc.exists()) {
            // Update existing user
            await updateDoc(userRef, {
                preferences: preferences,
                updatedAt: serverTimestamp()
            });
        } else {
            // Create user if doesn't exist
            await createUser(userId, preferences);
        }
        
        console.log('User preferences updated:', userId);
    } catch (error) {
        console.error('Error updating user preferences:', error);
        throw error;
    }
}

/**
 * Create new user profile
 * 
 * @param {string} userId - User ID
 * @param {Object} preferences - Initial preferences (optional)
 * @returns {Promise<void>}
 */
export async function createUser(userId, preferences = {}) {
    try {
        const userRef = doc(db, 'users', userId);
        const userDoc = await getDoc(userRef);
        
        if (!userDoc.exists()) {
            await setDoc(userRef, {
                preferences: { ...getDefaultPreferences(), ...preferences },
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            });
            console.log('User created:', userId);
        } else {
            console.log('User already exists:', userId);
        }
    } catch (error) {
        console.error('Error creating user:', error);
        throw error;
    }
}

/**
 * Get user profile
 * 
 * @param {string} userId - User ID
 * @returns {Promise<Object|null>} User profile or null if not found
 */
export async function getUserProfile(userId) {
    try {
        const userDoc = await getDoc(doc(db, 'users', userId));
        if (userDoc.exists()) {
            return {
                id: userDoc.id,
                ...userDoc.data()
            };
        }
        return null;
    } catch (error) {
        console.error('Error fetching user profile:', error);
        return null;
    }
}

/**
 * Get default user preferences
 * 
 * @returns {Object} Default preferences object
 */
function getDefaultPreferences() {
    return {
        // Accessibility profile
        accessibilityProfile: null, // 'blind', 'deaf', 'low-vision', 'hard-of-hearing', 'none'
        
        // Feature preferences
        enabledFeatures: {
            speech: true,
            sign: true,
            scene: true,
            face: true
        },
        
        // UI preferences
        fontSize: 'medium', // 'small', 'medium', 'large', 'x-large'
        highContrast: false,
        language: 'en-US',
        
        // Audio preferences
        speechSpeed: 1.0,
        narrationEnabled: true
    };
}

/**
 * Delete user account and all associated data
 * 
 * @param {string} userId - User ID to delete
 * @param {boolean} deleteAuthAccount - Whether to also delete the Firebase Auth account (default: true)
 * @returns {Promise<Object>} Object with success status and deleted count
 */
export async function deleteUserAccount(userId, deleteAuthAccount = true) {
    try {
        const batch = writeBatch(db);
        let deletedCount = 0;
        
        // 1. Delete all faces for this user
        const facesQuery = query(collection(db, 'faces'), where('userId', '==', userId));
        const facesSnapshot = await getDocs(facesQuery);
        facesSnapshot.forEach((doc) => {
            batch.delete(doc.ref);
            deletedCount++;
        });
        console.log(`Deleting ${facesSnapshot.size} faces for user: ${userId}`);
        
        // 2. Delete all interactions for this user
        const interactionsQuery = query(collection(db, 'interactions'), where('userId', '==', userId));
        const interactionsSnapshot = await getDocs(interactionsQuery);
        interactionsSnapshot.forEach((doc) => {
            batch.delete(doc.ref);
            deletedCount++;
        });
        console.log(`Deleting ${interactionsSnapshot.size} interactions for user: ${userId}`);
        
        // 3. Delete user profile
        const userRef = doc(db, 'users', userId);
        batch.delete(userRef);
        deletedCount++;
        console.log(`Deleting user profile: ${userId}`);
        
        // Commit all deletions
        await batch.commit();
        console.log(`Successfully deleted ${deletedCount} documents for user: ${userId}`);
        
        // 4. Delete Firebase Auth account if requested
        if (deleteAuthAccount) {
            try {
                const auth = getAuth();
                const user = auth.currentUser;
                if (user && user.uid === userId) {
                    await deleteAuthUser(user);
                    console.log(`Deleted Firebase Auth account: ${userId}`);
                } else {
                    console.warn('Cannot delete Auth account: user is not the current user. Auth account deletion skipped.');
                }
            } catch (authError) {
                console.warn('Error deleting Auth account (may need to be done manually):', authError);
                // Don't throw - data is deleted, Auth deletion is secondary
            }
        }
        
        return { success: true, deletedCount };
    } catch (error) {
        console.error('Error deleting user account:', error);
        throw error;
    }
}

