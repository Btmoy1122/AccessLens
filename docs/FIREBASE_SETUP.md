# Firebase Setup Guide

## Step 1: Create Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click "Add project"
3. Enter project name: "AccessLens"
4. Follow setup wizard

## Step 2: Enable Firestore

1. In Firebase Console, go to "Firestore Database"
2. Click "Create database"
3. Start in **test mode** (for hackathon)
4. Choose a location

## Step 3: Get Firebase Config

1. Go to Project Settings (gear icon)
2. Scroll to "Your apps"
3. Click "Web" icon (`</>`)
4. Register app (nickname: "AccessLens Web")
5. Copy the config object

## Step 4: Add Config to Project

1. Create `backend/config/firebase-config.js`
2. Paste your Firebase config:

```javascript
const firebaseConfig = {
  apiKey: "your-api-key",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "your-app-id"
};

export default firebaseConfig;
```

## Step 5: Firestore Structure

### Collections

#### `faces`
```javascript
{
  id: "face-id",
  name: "Alex",
  embedding: [0.1, 0.2, ...], // face-api.js embedding
  notes: "Volunteer medic",
  createdAt: timestamp,
  userId: "user-id"
}
```

#### `users`
```javascript
{
  id: "user-id",
  preferences: {
    fontSize: "large",
    speechSpeed: 1.0,
    enabledFeatures: ["speech", "sign", "scene", "face"]
  },
  createdAt: timestamp
}
```

## Step 6: Security Rules

**⚠️ IMPORTANT**: Use the security rules from `firestore.rules` file in the project root.

1. Go to Firebase Console > Firestore Database > Rules
2. Copy the contents of `firestore.rules` from this project
3. Paste into the Rules editor
4. Click **Publish**

The security rules ensure:
- Users can only access their own data
- Faces are isolated per user
- Interactions are isolated per user
- Prevents unauthorized data access

**⚠️ Note**: The old test mode rules (`allow read, write: if true`) are insecure. Always use the proper security rules from `firestore.rules`.

See `docs/SECURITY_RULES_SETUP.md` for detailed security rules documentation.

## Step 7: Install Firebase SDK

```bash
npm install firebase
```

## Troubleshooting

### Config Not Loading
- Check file path: `backend/config/firebase-config.js`
- Verify config object structure
- Check browser console for errors

### Permission Denied
- Verify Firestore rules allow read/write
- Check authentication (if enabled)

### Connection Issues
- Verify internet connection
- Check Firebase project status
- Verify API keys are correct

