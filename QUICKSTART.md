# Quick Start Guide

Get AccessLens running in 5 minutes!

## Prerequisites

- Node.js (v16+) installed
- Modern web browser (Chrome/Edge recommended)
- Camera access on your device

## Setup Steps

### 1. Install Dependencies
```bash
npm install
```

### 2. Start Development Server
```bash
npm run dev
```

### 3. Open in Browser
Open `http://localhost:5173` in your browser (Vite dev server)

### 4. Grant Camera Permissions
Allow camera access when prompted

### 5. Test AR View
You should see the camera feed with AR overlay ready

## Next Steps

### For Frontend Developers
1. See `docs/FRONTEND_SETUP.md` for detailed Vite setup
2. Open `frontend/index.html`
3. Check `frontend/js/main.js` for initialization
4. Review `frontend/components/controls.js` for UI
5. Start dev server: `npm run dev`

### For ML Developers
1. Check `ml/` directory for modules
2. Review `ml/README.md` for setup
3. Download ML models to `assets/ml-models/`

### For Backend Developers
1. Set up Firebase (see `docs/FIREBASE_SETUP.md`)
2. Update `backend/config/firebase-config.js`
3. Review `backend/services/` for database operations

## Troubleshooting

### Camera Not Working
- Ensure you're on HTTPS or localhost
- Check browser permissions
- Verify camera isn't in use by another app

### Models Not Loading
- Check `assets/ml-models/` directory
- Verify model file paths
- Check browser console for errors

### Firebase Connection Issues
- Verify Firebase config is correct
- Check Firestore is enabled
- Review `docs/FIREBASE_SETUP.md`

## Feature Development

### Enable a Feature
1. Uncomment imports in `frontend/js/main.js`
2. Initialize feature module
3. Add UI toggle in `frontend/components/controls.js`
4. Test feature

### Current Phase
Check `docs/TIMELINE.md` for current development phase and priorities.

## Need Help?

- Read `docs/SETUP.md` for detailed setup
- Check `docs/FEATURES.md` for feature documentation
- Review `TEAM.md` for team contacts
- See `CONTRIBUTING.md` for development workflow

Happy hacking! 🚀

