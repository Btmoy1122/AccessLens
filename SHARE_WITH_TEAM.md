# What to Share with Your Teammates

## ✅ Share This Information (Safe to Share)

### 1. Firebase API Key and Configuration

**⚠️ Important**: Firebase client API keys are PUBLIC and safe to share. They work with Firestore security rules to protect your data.

**Firebase Configuration (copy this entire block):**
```env
# Get these values from Firebase Console > Project Settings > Your apps
VITE_FIREBASE_API_KEY=YOUR_FIREBASE_API_KEY_HERE
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=your-sender-id
VITE_FIREBASE_APP_ID=your-app-id
VITE_FIREBASE_MEASUREMENT_ID=your-measurement-id
```

**Project Details:**
- **Project ID**: `acceens-5f3ad`
- **Project Name**: AccessLens
- **Firebase Console**: https://console.firebase.google.com/project/acceens-5f3ad

### 2. Setup Instructions

**Quick Setup:**
1. Clone the repo: `git clone https://github.com/Btmoy1122/AccessLens.git`
2. Install dependencies: `npm install`
3. Create `.env` file: `cp .env.example .env`
4. Copy the Firebase configuration above into `.env`
5. Run the app: `npm run dev`

### 3. Firebase Console Access

**Give teammates access to Firebase project:**
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select project: **AccessLens (acceens-5f3ad)**
3. Go to: **Project Settings > Users and permissions**
4. Click **Add member**
5. Enter teammate's email
6. Assign role: **Editor** (for development) or **Viewer** (read-only)
7. Click **Add**

### 4. OpenAI API Key (For Cloud Functions - Optional)

**⚠️ Important**: OpenAI API keys are PRIVATE and should be shared securely.

If teammates need to deploy or test Cloud Functions:
- **Option 1 (Recommended)**: Each person uses their own OpenAI API key
- **Option 2**: Share the team's OpenAI API key via secure method (password manager, encrypted message)
- Set it via: `firebase functions:secrets:set OPENAI_API_KEY`
- **Never share OpenAI keys in plain text in chat/email**

## ❌ DO NOT Share

1. **Your personal `.env` file** - Each person creates their own
2. **API keys in plain text in public channels** - Use secure sharing methods
3. **Firebase service account keys** - Not needed for client-side development

## 📋 Complete Setup Checklist for Teammates

Send this checklist to your teammates:

```
Setup Checklist:
[ ] Clone the repository
[ ] Run `npm install`
[ ] Create `.env` file from `.env.example`
[ ] Add Firebase configuration to `.env` (values provided above)
[ ] Get access to Firebase project (you'll add them)
[ ] Run `npm run dev`
[ ] Test the application

Optional (for Cloud Functions):
[ ] Install Firebase CLI: `npm install -g firebase-tools`
[ ] Login to Firebase: `firebase login`
[ ] Get OpenAI API key (if needed)
[ ] Set OpenAI secret: `firebase functions:secrets:set OPENAI_API_KEY`
```

## 🔐 Security Notes

1. **✅ Firebase API keys are PUBLIC** - Safe to share in team chat/docs (they work with Firestore security rules)
2. **❌ OpenAI API keys are PRIVATE** - Share securely if needed (password manager, encrypted)
3. **❌ Never commit `.env` file** - Already in `.gitignore`
4. **✅ Use Firebase project access** - Add teammates to Firebase project for console access
5. **✅ API key restrictions** - Make sure HTTP referrer and API restrictions are set in Google Cloud Console

## 📝 Quick Copy-Paste for Teammates

**Firebase Config for .env:**
```
# Get these values from Firebase Console > Project Settings > Your apps
VITE_FIREBASE_API_KEY=YOUR_FIREBASE_API_KEY_HERE
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=your-sender-id
VITE_FIREBASE_APP_ID=your-app-id
VITE_FIREBASE_MEASUREMENT_ID=your-measurement-id
```

## 🆘 Troubleshooting

**If teammates have issues:**
1. Check that `.env` file exists and has correct values
2. Verify they have access to Firebase project
3. Check browser console for errors
4. Make sure they ran `npm install`
5. Restart dev server after changing `.env`

## 📚 Additional Resources

- See `docs/ENVIRONMENT_SETUP.md` for environment variable details
- See `docs/FIREBASE_SETUP.md` for Firebase setup
- See `SETUP_NEW_API_KEY.md` for API key setup instructions

