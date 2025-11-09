# Firestore Security Rules Setup

## Overview

This guide explains how to set up proper Firestore security rules to ensure users can only access their own data.

## Current Security Issues Fixed

1. ✅ **Replaced `getAllFaces()` with `getFacesByUser()`** - Users now only fetch their own faces (server-side filtering)
2. ✅ **Created Firestore security rules** - Rules enforce data isolation at the database level
3. ✅ **Added user deletion functionality** - Users can delete their own accounts and all data

## Setting Up Firestore Security Rules

### Step 1: Deploy Security Rules

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project: **AccessLens (acceens-5f3ad)**
3. Navigate to: **Firestore Database** > **Rules** tab
4. Copy the contents of `firestore.rules` from this project
5. Paste into the Firebase Console Rules editor
6. Click **Publish**

### Step 2: Verify Rules

The security rules enforce:

- **Users collection**: Users can only read/write their own profile
- **Faces collection**: Users can only read/write faces they created
- **Interactions collection**: Users can only read/write their own interactions

### Step 3: Test Rules

1. Sign in as a user
2. Try to access data from another user (should fail)
3. Verify you can only see your own faces and interactions

## Security Rules Breakdown

```javascript
// Users can only access their own user document
match /users/{userId} {
  allow read, write: if request.auth.uid == userId;
}

// Faces - users can only access their own faces
match /faces/{faceId} {
  allow read: if request.auth != null && 
    (resource.data.userId == request.auth.uid || 
     resource.data.userId == 'default');
  allow create: if request.auth != null && 
    request.resource.data.userId == request.auth.uid;
  allow update, delete: if request.auth != null && 
    resource.data.userId == request.auth.uid;
}

// Interactions - users can only access their own interactions
match /interactions/{interactionId} {
  allow read, write: if request.auth != null && 
    resource.data.userId == request.auth.uid;
}
```

## Code Changes Made

### 1. Dashboard (`frontend/js/dashboard.js`)
- Changed from `getAllFaces()` to `getFacesByUser(currentUser.uid)`
- Server-side filtering ensures only user's faces are fetched

### 2. Settings (`frontend/js/settings.js`)
- Changed from `getAllFaces()` to `getFacesByUser(currentUser.uid)`
- Added delete account functionality

### 3. Face Recognition (`ml/vision/face-recognition.js`)
- Changed from `getAllFaces()` to `getFacesByUser(currentUserId)`
- Only loads faces for the current user

### 4. User Service (`backend/services/user-service.js`)
- Added `deleteUserAccount()` function
- Deletes all user data: faces, interactions, user profile
- Optionally deletes Firebase Auth account

## Deleting User Data for Demo

### Option 1: Use Settings Page (Recommended)

1. Sign in to your account
2. Go to Settings page
3. Scroll to "Danger Zone" section
4. Click "Delete Account"
5. Confirm deletion (type "DELETE")
6. All data will be deleted automatically

### Option 2: Use Firebase Console

1. Go to Firebase Console > Firestore Database
2. Manually delete documents:
   - `faces` collection: Delete all documents where `userId == your-user-id`
   - `interactions` collection: Delete all documents where `userId == your-user-id`
   - `users` collection: Delete document with ID = your-user-id
3. Go to Authentication > Users
4. Delete your Firebase Auth account

### Option 3: Use Cleanup Script (Advanced)

```bash
# Run the cleanup script
node scripts/delete-user-data.js <your-user-id>
```

**Note**: The script requires Node.js and will delete all Firestore data. Firebase Auth account deletion must be done manually in Firebase Console.

## Important Notes

⚠️ **Before Demo**:
1. Delete your account using the Settings page
2. Verify all data is deleted in Firebase Console
3. Delete your Firebase Auth account manually if needed
4. Test with a fresh account to ensure everything works

⚠️ **Security**:
- Security rules are enforced at the database level
- Even if client code is modified, rules prevent unauthorized access
- Always test rules after deploying them

⚠️ **Backward Compatibility**:
- Rules allow reading faces with `userId == 'default'` for backward compatibility
- New faces should always use the authenticated user's ID

## Testing Security

1. **Test Data Isolation**:
   - Create two test accounts
   - Register faces in each account
   - Verify each account can only see their own faces

2. **Test Rules**:
   - Try to access another user's data (should fail)
   - Verify error messages are appropriate

3. **Test Deletion**:
   - Delete an account
   - Verify all data is removed
   - Verify user cannot access deleted data

## Troubleshooting

### Rules Not Working
- Check that rules are published in Firebase Console
- Verify you're authenticated (check `request.auth.uid`)
- Check browser console for rule violation errors

### Cannot Delete Account
- Verify you're signed in
- Check Firebase Console for any errors
- Ensure Firestore rules allow deletion

### Data Still Visible After Deletion
- Check Firebase Console to verify deletion
- Clear browser cache
- Sign out and sign back in

---

**Security is critical for production!** Always test security rules thoroughly before deploying to production.

