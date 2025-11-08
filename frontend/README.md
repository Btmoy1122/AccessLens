# Frontend Directory

This directory contains the frontend AR interface and UI components.

## Structure

```
frontend/
├── index.html          # Main HTML entry point
├── js/                 # JavaScript modules
│   └── main.js
├── ar/                 # A-Frame AR components (to be created)
├── components/         # UI components
│   └── controls.js
└── styles/             # CSS stylesheets
    └── main.css
```

## Files

### `index.html`
Main entry point for the application. Sets up A-Frame scene and AR.js.

### `js/main.js`
Main application logic. Initializes AR scene and coordinates feature modules.

### `components/controls.js`
UI controls for feature toggles and user settings.

### `styles/main.css`
Main stylesheet for UI and AR overlays.

## AR Framework

- **A-Frame**: AR scene framework
- **AR.js**: Markerless AR support

## Development

1. Start development server: `npm run dev`
2. Open `http://localhost:8080`
3. Grant camera permissions when prompted

## Camera Access

- Requires HTTPS (or localhost)
- User must grant camera permissions
- Test on mobile devices for best experience

