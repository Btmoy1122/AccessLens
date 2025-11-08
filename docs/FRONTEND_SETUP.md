# Frontend Setup Guide

## Overview

The AccessLens frontend uses **Vite** as the build tool and development server. Vite provides:
- ⚡ **Fast HMR (Hot Module Replacement)** - Instant updates during development
- 📦 **ES Modules** - Native ES6+ module support
- 🔧 **Zero Config** - Works out of the box with sensible defaults
- 🚀 **Optimized Builds** - Fast production builds with Rollup

## Tech Stack

- **Vite** - Build tool and dev server
- **A-Frame** - AR framework
- **AR.js** - Markerless AR support
- **Vanilla JavaScript** - No framework overhead (faster for hackathon)

## Project Structure

```
frontend/
├── index.html          # Main HTML entry point
├── js/
│   └── main.js        # Application entry point
├── components/         # UI components
│   └── controls.js    # Feature toggle controls
└── styles/
    └── main.css       # Main stylesheet
```

## Setup Steps

### 1. Install Dependencies

```bash
npm install
```

This will install:
- `vite` - Development server and build tool
- `aframe` - AR framework
- `ar.js` - AR.js library
- `firebase` - Backend SDK

### 2. Start Development Server

```bash
npm run dev
```

Vite will start the dev server at `http://localhost:5173`

You should see:
```
  VITE v5.0.8  ready in 500 ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: http://192.168.x.x:5173/
  ➜  press h + enter to show help
```

### 3. Open in Browser

Open `http://localhost:5173` in your browser (Chrome/Edge recommended).

**Important**: Grant camera permissions when prompted - this is required for AR features.

### 4. Test Camera Access

You should see:
- Camera feed displayed in the AR scene
- A-Frame scene initialized
- Console log: "AccessLens initialized"

## Development Workflow

### Hot Module Replacement (HMR)

Vite automatically updates your changes without full page reload:

1. Edit any file in `frontend/`
2. Save the file
3. Browser automatically updates (no refresh needed!)

**Note**: Some changes (like HTML structure) may require a manual refresh.

### File Structure

```
frontend/
├── index.html              # Main entry - A-Frame scene setup
├── js/
│   └── main.js            # App initialization & module coordination
├── components/
│   └── controls.js        # UI controls (feature toggles)
└── styles/
    └── main.css           # Global styles
```

### Importing Modules

With Vite, you can use ES6 imports:

```javascript
// In main.js or any module
import { initSpeechToText } from '../../ml/speech/speech-to-text.js';
import { initControls } from './components/controls.js';
```

Or use path aliases (configured in `vite.config.js`):

```javascript
import { initSpeechToText } from '@ml/speech/speech-to-text.js';
import { initControls } from '@/components/controls.js';
```

## Vite Configuration

The `vite.config.js` file is located in the project root and configures:

- **Root Directory**: `frontend/` folder
- **Dev Server**: Port 5173, allows external connections (for mobile testing)
- **Build Output**: `dist/` folder
- **Path Aliases**: `@/`, `@ml/`, `@backend/`, `@assets/`
- **Public Assets**: `assets/` folder served as static files

### Key Configuration Options

```javascript
// vite.config.js
export default defineConfig({
  root: 'frontend',           // Frontend is the root
  server: {
    port: 5173,               // Dev server port
    host: true,               // Allow external connections
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'frontend'),
      '@ml': resolve(__dirname, 'ml'),
      // ... more aliases
    },
  },
});
```

## Building for Production

### Build Command

```bash
npm run build
```

This creates an optimized production build in the `dist/` folder.

### Preview Production Build

```bash
npm run preview
```

This serves the production build locally for testing.

### Deploying

The `dist/` folder contains the production build. Deploy this folder to:
- **Vercel**: `vercel deploy dist`
- **Netlify**: Drag and drop `dist/` folder
- **GitHub Pages**: Push `dist/` to `gh-pages` branch

## Troubleshooting

### Camera Not Working

**Issue**: Camera permission denied or not accessible

**Solutions**:
- Ensure you're on `localhost` or `https://` (required for camera)
- Check browser permissions (Chrome: Settings > Privacy > Camera)
- Verify no other app is using the camera
- Try refreshing the page

### Port Already in Use

**Issue**: Port 5173 is already in use

**Solutions**:
```bash
# Vite will automatically try the next available port
# Or specify a different port:
npm run dev -- --port 3000
```

### Module Not Found Errors

**Issue**: Import errors or module resolution issues

**Solutions**:
- Check file paths are correct
- Use path aliases (`@/`, `@ml/`) for cleaner imports
- Ensure file extensions are included (`.js`)
- Restart dev server: `Ctrl+C` then `npm run dev`

### HMR Not Working

**Issue**: Changes not updating automatically

**Solutions**:
- Check browser console for errors
- Try manual refresh: `F5` or `Ctrl+R`
- Restart dev server
- Clear browser cache

### AR.js Not Loading

**Issue**: AR scene not initializing

**Solutions**:
- Check browser console for errors
- Verify A-Frame and AR.js scripts are loaded
- Ensure camera permissions are granted
- Check `index.html` script tags are correct

## Mobile Testing

### Option 1: Network Access

1. Start dev server: `npm run dev`
2. Note the Network URL (e.g., `http://192.168.x.x:5173`)
3. Connect phone to same Wi-Fi network
4. Open Network URL on phone browser

### Option 2: ngrok (External Access)

```bash
# Install ngrok
npm install -g ngrok

# Start dev server
npm run dev

# In another terminal, expose localhost
ngrok http 5173
```

Use the ngrok URL on your phone.

## Next Steps

1. ✅ Frontend is set up and running
2. ➡️ Set up Firebase (see `docs/FIREBASE_SETUP.md`)
3. ➡️ Start implementing features (see `docs/FEATURES.md`)
4. ➡️ Review timeline (see `docs/TIMELINE.md`)

## Useful Commands

```bash
# Development
npm run dev          # Start dev server

# Production
npm run build        # Build for production
npm run preview      # Preview production build

# Help
npm run dev -- --help  # Vite CLI help
```

## Resources

- [Vite Documentation](https://vitejs.dev/)
- [A-Frame Documentation](https://aframe.io/docs/)
- [AR.js Documentation](https://ar-js-org.github.io/AR.js-Docs/)

