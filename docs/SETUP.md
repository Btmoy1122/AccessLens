# Setup Guide

## Initial Setup

### 1. Clone Repository
```bash
git clone <repository-url>
cd AccessLens
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Firebase Setup
1. Create a Firebase project at [Firebase Console](https://console.firebase.google.com/)
2. Enable Firestore Database
3. Copy your Firebase config to `backend/config/firebase-config.js`
4. See `docs/FIREBASE_SETUP.md` for detailed instructions

### 4. API Keys (if needed)
Create a `.env` file in the root directory:
```
FIREBASE_API_KEY=your_api_key
FIREBASE_PROJECT_ID=your_project_id
```

### 5. Run Development Server
```bash
npm run dev
```

Open `http://localhost:5173` in your browser (Vite default port).

**Note**: See `docs/FRONTEND_SETUP.md` for detailed frontend setup instructions.

## Development Workflow

### Frontend Development
- Main entry: `frontend/index.html`
- AR components: `frontend/ar/`
- UI components: `frontend/components/`

### ML Development
- Speech recognition: `ml/speech/`
- Hand gesture controls: `ml/sign-language/` (MediaPipe for hand detection)
- Face recognition: `ml/vision/face-recognition.js`
- Scene description: `ml/vision/scene-description.js`

### Backend Development
- Firebase config: `backend/config/`
- Services: `backend/services/`
- Authentication: `backend/auth/`

## Browser Requirements

- Chrome/Edge (recommended for Web Speech API)
- Camera access required
- HTTPS required for production (camera access)

## Troubleshooting

### Camera Not Working
- Ensure HTTPS (or localhost)
- Check browser permissions
- Verify camera is not in use by another app

### ML Models Not Loading
- Check model files in `ml/models/`
- Verify CDN links or local file paths
- Check browser console for errors

### Firebase Connection Issues
- Verify Firebase config is correct
- Check Firestore rules allow read/write
- Ensure proper authentication setup

