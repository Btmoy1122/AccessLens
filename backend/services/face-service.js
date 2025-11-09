/**
 * Face Service
 * 
 * Handles face data operations with Firebase Firestore
 */

import { initializeApp } from 'firebase/app';
import { 
    getFirestore, 
    collection, 
    addDoc, 
    getDocs, 
    query, 
    where, 
    updateDoc, 
    deleteDoc, 
    doc,
    serverTimestamp 
} from 'firebase/firestore';
import firebaseConfig from '../config/firebase-config.js';

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

/**
 * Add a new face to the database
 * 
 * @param {Object} faceData - Face data object
 * @param {string} faceData.name - Name of the person
 * @param {string} faceData.notes - Additional notes about the person
 * @param {Float32Array|Array} faceData.embedding - Face embedding (128-dimensional vector)
 * @param {string} [faceData.userId] - Optional user ID for multi-user support
 * @returns {Promise<string>} Document ID of the added face
 */
export async function addFace(faceData) {
    try {
        // Convert Float32Array to regular array for Firestore storage
        const embeddingArray = Array.from(faceData.embedding);
        
        const docRef = await addDoc(collection(db, 'faces'), {
            name: faceData.name,
            notes: faceData.notes || '',
            embedding: embeddingArray,
            userId: faceData.userId || 'default',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        });
        
        console.log('Face added successfully:', faceData.name, 'ID:', docRef.id);
        return docRef.id;
    } catch (error) {
        console.error('Error adding face:', error);
        throw error;
    }
}

/**
 * Get all faces from the database
 * 
 * @returns {Promise<Array>} Array of face objects with id, name, notes, embedding, etc.
 */
export async function getAllFaces() {
    try {
        const querySnapshot = await getDocs(collection(db, 'faces'));
        const faces = [];
        
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            // Convert array back to Float32Array for face-api.js comparison
            faces.push({
                id: doc.id,
                name: data.name,
                notes: data.notes || '',
                embedding: new Float32Array(data.embedding),
                userId: data.userId || 'default',
                createdAt: data.createdAt,
                updatedAt: data.updatedAt
            });
        });
        
        console.log(`Fetched ${faces.length} faces from database`);
        return faces;
    } catch (error) {
        console.error('Error fetching faces:', error);
        throw error;
    }
}

/**
 * Get faces for a specific user
 * 
 * @param {string} userId - User ID to filter faces
 * @returns {Promise<Array>} Array of face objects for the specified user
 */
export async function getFacesByUser(userId) {
    try {
        const q = query(collection(db, 'faces'), where('userId', '==', userId));
        const querySnapshot = await getDocs(q);
        const faces = [];
        
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            faces.push({
                id: doc.id,
                name: data.name,
                notes: data.notes || '',
                embedding: new Float32Array(data.embedding),
                userId: data.userId || 'default',
                createdAt: data.createdAt,
                updatedAt: data.updatedAt
            });
        });
        
        console.log(`Fetched ${faces.length} faces for user:`, userId);
        return faces;
    } catch (error) {
        console.error('Error fetching user faces:', error);
        throw error;
    }
}

/**
 * Update face data
 * 
 * @param {string} faceId - Document ID of the face to update
 * @param {Object} updates - Object with fields to update
 * @returns {Promise<void>}
 */
export async function updateFace(faceId, updates) {
    try {
        const updateData = {
            ...updates,
            updatedAt: serverTimestamp()
        };
        
        // Convert embedding if provided
        if (updateData.embedding && updateData.embedding instanceof Float32Array) {
            updateData.embedding = Array.from(updateData.embedding);
        }
        
        await updateDoc(doc(db, 'faces', faceId), updateData);
        console.log('Face updated successfully:', faceId);
    } catch (error) {
        console.error('Error updating face:', error);
        throw error;
    }
}

/**
 * Delete face from database
 * 
 * @param {string} faceId - Document ID of the face to delete
 * @returns {Promise<void>}
 */
export async function deleteFace(faceId) {
    try {
        await deleteDoc(doc(db, 'faces', faceId));
        console.log('Face deleted successfully:', faceId);
    } catch (error) {
        console.error('Error deleting face:', error);
        throw error;
    }
}

