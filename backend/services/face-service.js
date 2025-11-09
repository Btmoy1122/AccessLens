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
    getDoc,
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
        console.log('🔄 addFace called:', {
            name: faceData.name,
            userId: faceData.userId,
            isSelf: faceData.isSelf,
            hasEmbedding: !!faceData.embedding,
            embeddingLength: faceData.embedding?.length
        });
        
        // Validate input
        if (!faceData.name) {
            throw new Error('Face name is required');
        }
        if (!faceData.embedding) {
            throw new Error('Face embedding is required');
        }
        if (!faceData.userId) {
            console.warn('⚠️ No userId provided, using "default"');
        }
        
        // Convert Float32Array to regular array for Firestore storage
        const embeddingArray = Array.from(faceData.embedding);
        console.log(`🔄 Converting embedding to array (length: ${embeddingArray.length})`);
        
        const faceDoc = {
            name: faceData.name,
            notes: faceData.notes || '',
            embedding: embeddingArray,
            userId: faceData.userId || 'default',
            isSelf: faceData.isSelf || false, // Flag to mark user's own face
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        };
        
        console.log('🔄 Adding face to Firestore:', {
            name: faceDoc.name,
            userId: faceDoc.userId,
            isSelf: faceDoc.isSelf,
            embeddingLength: faceDoc.embedding.length
        });
        
        const docRef = await addDoc(collection(db, 'faces'), faceDoc);
        
        console.log('✅ Face added successfully to Firestore:', {
            name: faceData.name,
            id: docRef.id,
            isSelf: faceData.isSelf || false,
            userId: faceData.userId || 'default'
        });
        
        return docRef.id;
    } catch (error) {
        console.error('❌ Error adding face to Firestore:', error);
        console.error('Error details:', {
            message: error.message,
            code: error.code,
            stack: error.stack,
            faceData: {
                name: faceData.name,
                userId: faceData.userId,
                isSelf: faceData.isSelf,
                hasEmbedding: !!faceData.embedding
            }
        });
        
        // Provide more helpful error messages
        if (error.code === 'permission-denied') {
            throw new Error('Permission denied. Please check Firestore security rules allow creating faces for your userId.');
        } else if (error.code === 'unauthenticated') {
            throw new Error('Authentication required. Please sign in again.');
        }
        
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
                memorySummary: data.memorySummary || null, // Combined summary of all memories
                embedding: new Float32Array(data.embedding),
                userId: data.userId || 'default',
                isSelf: data.isSelf || false, // Flag to mark user's own face
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
                isSelf: data.isSelf || false, // Flag to mark user's own face
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

/**
 * Add a conversation interaction/memory for a face
 * 
 * @param {Object} interactionData - Interaction data object
 * @param {string} interactionData.faceId - Face ID of the person
 * @param {string} interactionData.rawTranscript - Raw conversation transcript (from speech-to-text)
 * @param {string} [interactionData.userId] - Optional user ID for multi-user support
 * @returns {Promise<string>} Document ID of the added interaction
 */
export async function addInteraction(interactionData) {
    try {
        const docRef = await addDoc(collection(db, 'interactions'), {
            faceId: interactionData.faceId,
            rawTranscript: interactionData.rawTranscript || '',
            userId: interactionData.userId || 'default',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            // Summary will be generated automatically by Cloud Function
            summary: null,
            summarized: false
        });
        
        console.log('Interaction added successfully for face:', interactionData.faceId, 'ID:', docRef.id);
        return docRef.id;
    } catch (error) {
        console.error('Error adding interaction:', error);
        throw error;
    }
}

/**
 * Get interactions for a specific face
 * 
 * @param {string} faceId - Face ID to get interactions for
 * @returns {Promise<Array>} Array of interaction objects
 */
export async function getInteractionsByFace(faceId) {
    try {
        const q = query(collection(db, 'interactions'), where('faceId', '==', faceId));
        const querySnapshot = await getDocs(q);
        const interactions = [];
        
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            // Support both 'rawTranscript' (new) and 'transcript' (legacy) for backward compatibility
            const rawTranscript = data.rawTranscript || data.transcript || '';
            interactions.push({
                id: doc.id,
                faceId: data.faceId,
                rawTranscript: rawTranscript,
                transcript: rawTranscript, // Alias for backward compatibility
                userId: data.userId || 'default',
                createdAt: data.createdAt,
                updatedAt: data.updatedAt,
                summarized: data.summarized || false,
                summary: data.summary || null,
                summarizedAt: data.summarizedAt || null
            });
        });
        
        // Sort by creation date (newest first)
        interactions.sort((a, b) => {
            if (!a.createdAt || !b.createdAt) return 0;
            return b.createdAt.toMillis() - a.createdAt.toMillis();
        });
        
        console.log(`Fetched ${interactions.length} interactions for face:`, faceId);
        return interactions;
    } catch (error) {
        console.error('Error fetching interactions:', error);
        throw error;
    }
}

/**
 * Get interactions for a specific face (alias for getInteractionsByFace)
 * Provided for consistency with naming conventions
 * 
 * @param {string} faceId - Face ID to get interactions for
 * @returns {Promise<Array>} Array of interaction objects
 */
export async function getInteractions(faceId) {
    return getInteractionsByFace(faceId);
}

/**
 * Check if user has registered their own face
 * 
 * @param {string} userId - User ID to check
 * @returns {Promise<boolean>} True if user has registered their own face
 */
export async function hasSelfFace(userId) {
    try {
        const q = query(
            collection(db, 'faces'), 
            where('userId', '==', userId),
            where('isSelf', '==', true)
        );
        const querySnapshot = await getDocs(q);
        return !querySnapshot.empty;
    } catch (error) {
        console.error('Error checking self face:', error);
        return false;
    }
}

/**
 * Get user's own face (self face)
 * 
 * @param {string} userId - User ID
 * @returns {Promise<Object|null>} User's self face or null if not found
 */
export async function getSelfFace(userId) {
    try {
        const q = query(
            collection(db, 'faces'), 
            where('userId', '==', userId),
            where('isSelf', '==', true)
        );
        const querySnapshot = await getDocs(q);
        
        if (querySnapshot.empty) {
            return null;
        }
        
        const doc = querySnapshot.docs[0];
        const data = doc.data();
        return {
            id: doc.id,
            name: data.name,
            notes: data.notes || '',
            embedding: new Float32Array(data.embedding),
            userId: data.userId,
            isSelf: data.isSelf || false,
            createdAt: data.createdAt,
            updatedAt: data.updatedAt
        };
    } catch (error) {
        console.error('Error fetching self face:', error);
        return null;
    }
}

/**
 * Get the memory summary for a specific face from the faces collection
 * This is the combined summary of all memories for this person
 * 
 * @param {string} faceId - Face ID to get memory summary for
 * @returns {Promise<string|null>} Memory summary text or null if no summary exists
 */
export async function getFaceMemorySummary(faceId) {
    try {
        const faceDoc = await getDoc(doc(db, 'faces', faceId));
        if (!faceDoc.exists()) {
            return null;
        }
        
        const faceData = faceDoc.data();
        return faceData.memorySummary || null;
    } catch (error) {
        console.error('Error fetching face memory summary:', error);
        return null;
    }
}

/**
 * Get the latest interaction summary for a specific face
 * Returns the most recent summarized interaction's summary text
 * 
 * @deprecated Use getFaceMemorySummary instead - it returns the combined summary
 * @param {string} faceId - Face ID to get latest summary for
 * @returns {Promise<string|null>} Latest summary text or null if no summary exists
 */
export async function getLatestInteractionSummary(faceId) {
    // Use the memory summary from faces collection instead
    return getFaceMemorySummary(faceId);
}

