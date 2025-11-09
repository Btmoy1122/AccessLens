# Scripts Directory

This directory contains utility scripts for AccessLens.

## Firebase Configuration

**IMPORTANT**: Before using any scripts that require Firebase, you must configure your Firebase credentials.

### Setup

1. Copy the example config file:
   ```bash
   cp scripts/firebase-config.json.example scripts/firebase-config.json
   ```

2. Get your Firebase configuration from:
   - Firebase Console > Project Settings > Your apps
   - Copy the config values from the Firebase SDK setup

3. Edit `scripts/firebase-config.json` and fill in your values:
   ```json
   {
     "apiKey": "your-api-key",
     "authDomain": "your-project.firebaseapp.com",
     "projectId": "your-project-id",
     "storageBucket": "your-project.appspot.com",
     "messagingSenderId": "123456789",
     "appId": "1:123456789:web:abcdef",
     "measurementId": "G-XXXXXXXXXX"
   }
   ```

4. **Never commit `firebase-config.json`** - it's already in `.gitignore`

### Security Notes

- Firebase client API keys are **public** and meant for client-side use
- They work with Firestore security rules to protect your data
- However, it's still best practice to not hardcode them in version control
- The `firebase-config.json` file is gitignored for security

## Scripts

### generate-summary.html

A standalone HTML tool for manually generating summaries for interactions.

**Usage:**
1. Open `scripts/generate-summary.html` in a browser
2. Enter an interaction ID from Firebase Console
3. Enter your OpenAI API key (never hardcoded)
4. Click "Generate Summary"

**Requirements:**
- Firebase config file (see above)
- OpenAI API key (entered in the form)

### generate-summary.js

Node.js script for generating summaries from the command line.

**Usage:**
```bash
OPENAI_API_KEY="your-key" node scripts/generate-summary.js <interactionId>
```

**Requirements:**
- Node.js
- Firebase Admin SDK credentials (application default credentials)
- OpenAI API key as environment variable

### generate-summary-simple.js

Simplified Node.js script for generating summaries.

**Usage:**
```bash
OPENAI_API_KEY="your-key" node scripts/generate-summary-simple.js <interactionId>
```

