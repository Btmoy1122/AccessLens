/**
 * Quick script to delete all data for a specific user
 * Useful for cleaning up before demos
 * 
 * Usage: node scripts/delete-user-data.js <userId>
 * 
 * Note: This script requires Node.js and Firebase Admin SDK or client SDK
 * For demo purposes, you can also use the Firebase Console directly
 */

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, query, where, getDocs, writeBatch, doc } from 'firebase/firestore';
import firebaseConfig from '../backend/config/firebase-config.js';

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function deleteUserData(userId) {
    try {
        console.log(`Starting deletion of data for user: ${userId}`);
        const batch = writeBatch(db);
        let count = 0;
        
        // Delete faces
        console.log('Finding faces...');
        const facesQuery = query(collection(db, 'faces'), where('userId', '==', userId));
        const facesSnapshot = await getDocs(facesQuery);
        facesSnapshot.forEach((doc) => {
            batch.delete(doc.ref);
            count++;
            console.log(`  - Face: ${doc.id} (${doc.data().name || 'Unknown'})`);
        });
        console.log(`Found ${facesSnapshot.size} faces to delete`);
        
        // Delete interactions
        console.log('Finding interactions...');
        const interactionsQuery = query(collection(db, 'interactions'), where('userId', '==', userId));
        const interactionsSnapshot = await getDocs(interactionsQuery);
        interactionsSnapshot.forEach((doc) => {
            batch.delete(doc.ref);
            count++;
        });
        console.log(`Found ${interactionsSnapshot.size} interactions to delete`);
        
        // Delete user profile
        console.log('Deleting user profile...');
        const userRef = doc(db, 'users', userId);
        batch.delete(userRef);
        count++;
        
        // Commit all deletions
        console.log(`Committing deletion of ${count} documents...`);
        await batch.commit();
        console.log(`✅ Successfully deleted ${count} documents for user: ${userId}`);
        
        console.log('\nNote: Firebase Auth account deletion must be done manually in Firebase Console:');
        console.log('1. Go to Firebase Console > Authentication > Users');
        console.log(`2. Find user with UID: ${userId}`);
        console.log('3. Click the three dots > Delete user');
        
    } catch (error) {
        console.error('❌ Error:', error);
        console.error('Error details:', error.message);
        process.exit(1);
    }
}

// Get userId from command line
const userId = process.argv[2];
if (!userId) {
    console.error('❌ Error: User ID is required');
    console.error('Usage: node scripts/delete-user-data.js <userId>');
    console.error('\nExample: node scripts/delete-user-data.js abc123xyz');
    process.exit(1);
}

// Confirm before deletion
console.log(`⚠️  WARNING: This will delete ALL data for user: ${userId}`);
console.log('This includes:');
console.log('  - User profile');
console.log('  - All registered faces');
console.log('  - All memories/interactions');
console.log('\nPress Ctrl+C to cancel, or wait 3 seconds to continue...');

// Wait 3 seconds before proceeding
setTimeout(() => {
    deleteUserData(userId).then(() => {
        console.log('\n✅ Deletion complete!');
        process.exit(0);
    });
}, 3000);

