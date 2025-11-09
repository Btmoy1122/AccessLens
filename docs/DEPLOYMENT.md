# Deployment Guide - AccessLens

## How Deployment Works

### For End Users (No Keys Needed!)

**End users don't need any API keys or configuration.** They just:
1. Visit your deployed website
2. Use the app - it works automatically
3. All Firebase connections happen automatically using the public API key

### What Gets Deployed

#### ✅ Public (Bundled into Frontend)
- **Firebase API Key** - Gets bundled into the JavaScript code during build
- **Firebase Configuration** - All Firebase config values are in the deployed code
- This is **safe and expected** - Firebase client API keys are meant to be public

#### 🔒 Private (Backend Only)
- **OpenAI API Key** - Stays in Firebase Functions secrets, never exposed to users
- Only Cloud Functions can access it
- End users never see or need it

## Deployment Process

### Step 1: Set Environment Variables for Build

Before building for production, set your environment variables:

```bash
# Option 1: Use .env file (recommended for local builds)
# The .env file values will be used during build

# Option 2: Set environment variables directly
# Get these values from Firebase Console > Project Settings > Your apps
export VITE_FIREBASE_API_KEY=YOUR_FIREBASE_API_KEY_HERE
export VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
export VITE_FIREBASE_PROJECT_ID=your-project-id
export VITE_FIREBASE_STORAGE_BUCKET=your-project.firebasestorage.app
export VITE_FIREBASE_MESSAGING_SENDER_ID=your-sender-id
export VITE_FIREBASE_APP_ID=your-app-id
export VITE_FIREBASE_MEASUREMENT_ID=your-measurement-id
```

### Step 2: Build for Production

```bash
npm run build
```

This creates a `dist/` folder with:
- All your code bundled
- Firebase configuration embedded
- No `.env` file needed (values are baked into the code)

### Step 3: Deploy Frontend

**Option A: Vercel (Recommended)**
```bash
# Install Vercel CLI
npm install -g vercel

# Deploy
vercel

# Set environment variables in Vercel dashboard:
# - Go to Project Settings > Environment Variables
# - Add all VITE_FIREBASE_* variables
# - Redeploy
```

**Option B: Netlify**
```bash
# Install Netlify CLI
npm install -g netlify-cli

# Deploy
netlify deploy --prod

# Set environment variables in Netlify dashboard:
# - Go to Site Settings > Build & Deploy > Environment
# - Add all VITE_FIREBASE_* variables
```

**Option C: Firebase Hosting**
```bash
# Install Firebase CLI
npm install -g firebase-tools

# Build
npm run build

# Deploy
firebase deploy --only hosting

# Environment variables are set in firebase.json or .env
```

**Option D: GitHub Pages / Static Hosting**
```bash
# Build
npm run build

# The dist/ folder contains everything
# Upload dist/ contents to your hosting provider
```

### Step 4: Deploy Cloud Functions (Backend)

```bash
# Make sure OpenAI key is set in Firebase secrets
firebase functions:secrets:set OPENAI_API_KEY

# Deploy functions
firebase deploy --only functions
```

## How It Works for End Users

### User Flow

1. **User visits your website**
   - No login required
   - No API keys needed
   - App loads immediately

2. **App connects to Firebase**
   - Uses the Firebase API key embedded in the code
   - Connects to your Firestore database
   - Firestore security rules control access

3. **User uses features**
   - Face recognition: Stores faces in Firestore
   - Memory recording: Saves interactions to Firestore
   - Scene description: Works locally (no backend needed)

4. **Memory summarization happens automatically**
   - When user saves a memory, it's stored in Firestore
   - Cloud Function automatically triggers
   - Uses OpenAI API key (backend only, user never sees it)
   - Summary is saved back to Firestore
   - User sees the summary in the app

## Security Architecture

### Frontend (Public)
```
User's Browser
  ↓
Deployed Website (Vercel/Netlify/etc)
  ↓
Firebase Client SDK
  ↓
Firebase API Key (public, in code)
  ↓
Firestore Database
  ↓
Security Rules (protect data)
```

### Backend (Private)
```
User saves memory
  ↓
Stored in Firestore
  ↓
Cloud Function triggers
  ↓
OpenAI API Key (secret, backend only)
  ↓
OpenAI API
  ↓
Summary saved to Firestore
  ↓
User sees summary
```

## Environment Variables in Production

### For Frontend Deployment

**Vercel/Netlify/etc:**
- Set environment variables in hosting platform dashboard
- They get embedded during build
- Users never see them (they're in the code, but that's expected for Firebase keys)

**Example (Vercel):**
1. Go to Project Settings > Environment Variables
2. Add:
   - `VITE_FIREBASE_API_KEY`
   - `VITE_FIREBASE_AUTH_DOMAIN`
   - `VITE_FIREBASE_PROJECT_ID`
   - etc.
3. Redeploy

### For Backend (Cloud Functions)

**Firebase Secrets:**
- Set via: `firebase functions:secrets:set OPENAI_API_KEY`
- Only Cloud Functions can access it
- Never exposed to users
- Already set up in your project

## Firestore Security Rules

**Critical:** Set up security rules to protect your data:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Allow anyone to read/write (for now - customize as needed)
    match /{document=**} {
      allow read, write: if true;
    }
    
    // Or more secure rules:
    // match /faces/{faceId} {
    //   allow read: if request.auth != null;
    //   allow write: if request.auth != null;
    // }
  }
}
```

## API Key Restrictions

### Firebase API Key
- **Application restrictions**: Add your production domain
  - `https://yourdomain.com/*`
  - `https://your-app.vercel.app/*`
- **API restrictions**: Restrict to only needed APIs
  - Cloud Firestore API
  - Firebase Authentication API (if using)

### OpenAI API Key
- Stays in Firebase Functions secrets
- No restrictions needed (backend only)
- Never exposed to users

## Testing Deployment Locally

```bash
# Build for production
npm run build

# Preview production build
npm run preview

# Test that Firebase connects
# Test that features work
# Test that Cloud Functions trigger
```

## Deployment Checklist

- [ ] Set environment variables in hosting platform
- [ ] Build production version: `npm run build`
- [ ] Deploy frontend to hosting platform
- [ ] Deploy Cloud Functions: `firebase deploy --only functions`
- [ ] Set up Firestore security rules
- [ ] Add API key restrictions for production domain
- [ ] Test deployed app
- [ ] Test memory recording and summarization
- [ ] Monitor Firebase Console for usage
- [ ] Set up billing alerts (if needed)

## Common Deployment Platforms

### Vercel
- **Best for**: React/Vite apps
- **Environment variables**: Set in dashboard
- **Auto-deploy**: From GitHub
- **Free tier**: Yes

### Netlify
- **Best for**: Static sites
- **Environment variables**: Set in dashboard
- **Auto-deploy**: From GitHub
- **Free tier**: Yes

### Firebase Hosting
- **Best for**: Firebase projects
- **Environment variables**: Set in firebase.json
- **Auto-deploy**: From GitHub
- **Free tier**: Yes

### GitHub Pages
- **Best for**: Simple static sites
- **Environment variables**: Not supported (use build-time values)
- **Auto-deploy**: From GitHub Actions
- **Free tier**: Yes

## Troubleshooting

### Firebase Connection Issues
- Check that environment variables are set in hosting platform
- Verify Firebase API key restrictions include your domain
- Check browser console for errors
- Verify Firestore security rules allow access

### Cloud Functions Not Working
- Check that OpenAI key is set: `firebase functions:secrets:list`
- Check Cloud Functions logs in Firebase Console
- Verify functions are deployed: `firebase functions:list`
- Check that functions have proper permissions

### Environment Variables Not Working
- Restart dev server after changing `.env`
- Rebuild after changing environment variables
- Verify variables start with `VITE_` prefix
- Check hosting platform environment variable settings

## Summary

**For End Users:**
- ✅ No API keys needed
- ✅ No configuration needed
- ✅ Just visit the website and use it
- ✅ Everything works automatically

**For Developers:**
- ✅ Set environment variables in hosting platform
- ✅ Build and deploy frontend
- ✅ Deploy Cloud Functions
- ✅ Set up security rules
- ✅ Add API key restrictions

**Security:**
- ✅ Firebase API key: Public (safe, works with security rules)
- ✅ OpenAI API key: Private (backend only, never exposed)
- ✅ Firestore security rules: Protect your data
- ✅ API key restrictions: Limit access by domain

