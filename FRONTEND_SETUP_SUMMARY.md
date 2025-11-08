# Frontend Setup Summary

## What We're Using: Vite

**Vite** is our build tool and development server. Here's why it's perfect for this hackathon:

✅ **Lightning Fast** - Instant server start, no bundling during development  
✅ **Hot Module Replacement (HMR)** - Changes appear instantly without page reload  
✅ **ES Modules** - Native JavaScript modules, no complex configuration  
✅ **Optimized Builds** - Fast production builds with Rollup  
✅ **Zero Config** - Works out of the box with sensible defaults  

## Quick Setup (3 Steps)

### Step 1: Install Dependencies
```bash
npm install
```

This installs:
- `vite` - Development server
- `aframe` - AR framework  
- `ar.js` - AR capabilities
- `firebase` - Backend SDK

### Step 2: Start Dev Server
```bash
npm run dev
```

Vite starts at `http://localhost:5173`

### Step 3: Open Browser
Open `http://localhost:5173` and grant camera permissions.

**That's it!** Your frontend is running. ✨

## Project Structure

```
AccessLens/
├── vite.config.js          # Vite configuration
├── frontend/               # Frontend source code (Vite root)
│   ├── index.html         # Main entry point
│   ├── js/
│   │   └── main.js       # App initialization
│   ├── components/        # UI components
│   └── styles/           # CSS files
├── ml/                    # ML modules (imported by frontend)
├── backend/               # Backend services (imported by frontend)
└── assets/                # Static assets (served by Vite)
```

## How Vite Works

### Development Mode (`npm run dev`)

1. **Vite Server** starts on port 5173
2. **No Bundling** - Serves files as ES modules
3. **HMR** - Updates changes instantly
4. **Fast Refresh** - Preserves application state

### Production Build (`npm run build`)

1. **Bundles** all code with Rollup
2. **Optimizes** for production
3. **Outputs** to `dist/` folder
4. **Ready** for deployment

## Key Features

### Path Aliases

Use clean imports throughout the project:

```javascript
// Instead of:
import { initSpeech } from '../../../ml/speech/speech-to-text.js';

// Use:
import { initSpeech } from '@ml/speech/speech-to-text.js';
```

Available aliases:
- `@/` → `frontend/`
- `@ml/` → `ml/`
- `@backend/` → `backend/`
- `@assets/` → `assets/`

### Hot Module Replacement

Edit any file and see changes instantly:

1. Edit `frontend/js/main.js`
2. Save file
3. Browser updates automatically (no refresh!)

### ES Modules

Use modern JavaScript imports:

```javascript
// In any .js file
import { functionName } from './other-file.js';
export function myFunction() { ... }
```

## Configuration

The `vite.config.js` file configures:

- **Root**: `frontend/` folder is the entry point
- **Port**: 5173 (auto-increments if busy)
- **Host**: Allows external connections (for mobile testing)
- **Aliases**: Path shortcuts for imports
- **Public**: `assets/` folder served as static files

## Development Workflow

### 1. Start Development
```bash
npm run dev
```

### 2. Make Changes
- Edit files in `frontend/`
- Changes appear instantly (HMR)
- Check browser console for errors

### 3. Test Features
- Grant camera permissions
- Test AR features
- Check mobile devices (use network URL)

### 4. Build for Production
```bash
npm run build
```

Output: `dist/` folder (ready to deploy)

## Common Commands

```bash
# Development
npm run dev          # Start dev server
npm run dev -- --port 3000  # Custom port

# Production
npm run build        # Build for production
npm run preview      # Preview production build

# Help
npm run dev -- --help  # Vite CLI help
```

## Troubleshooting

### Port Already in Use
Vite automatically tries the next port, or specify one:
```bash
npm run dev -- --port 3000
```

### Module Not Found
- Check file paths
- Use path aliases (`@/`, `@ml/`)
- Include file extensions (`.js`)
- Restart dev server

### Camera Not Working
- Ensure `localhost` or `https://`
- Check browser permissions
- Verify no other app uses camera

### HMR Not Working
- Check browser console for errors
- Try manual refresh (F5)
- Restart dev server

## Mobile Testing

### Option 1: Network URL
1. Start dev server: `npm run dev`
2. Note Network URL: `http://192.168.x.x:5173`
3. Connect phone to same Wi-Fi
4. Open URL on phone

### Option 2: ngrok (External)
```bash
npm install -g ngrok
ngrok http 5173
```
Use ngrok URL on your phone.

## Next Steps

1. ✅ **Frontend Setup Complete**
2. ➡️ **Set up Firebase** (see `docs/FIREBASE_SETUP.md`)
3. ➡️ **Implement Features** (see `docs/FEATURES.md`)
4. ➡️ **Test on Mobile** (important for AR!)

## Resources

- **Vite Docs**: https://vitejs.dev/
- **A-Frame Docs**: https://aframe.io/docs/
- **AR.js Docs**: https://ar-js-org.github.io/AR.js-Docs/
- **Detailed Setup**: `docs/FRONTEND_SETUP.md`
- **Architecture**: `docs/FRONTEND_ARCHITECTURE.md`

---

**Happy Coding! 🚀**

