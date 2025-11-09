# Environment Variables Setup

This document explains how to set up environment variables for AccessLens.

## Overview

AccessLens uses environment variables to store sensitive configuration data, particularly Firebase credentials. Environment variables are loaded using Vite's built-in support.

## Setup Instructions

### 1. Create `.env` File

Copy the example environment file:

```bash
cp .env.example .env
```

### 2. Fill in Your Firebase Credentials

Edit `.env` and replace the placeholder values with your actual Firebase credentials:

```env
VITE_FIREBASE_API_KEY=your-actual-api-key
VITE_FIREBASE_AUTH_DOMAIN=your-project-id.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project-id.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=your-messaging-sender-id
VITE_FIREBASE_APP_ID=your-app-id
VITE_FIREBASE_MEASUREMENT_ID=your-measurement-id
```

### 3. Get Firebase Credentials

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project
3. Click on the gear icon ⚙️ > **Project Settings**
4. Scroll down to **Your apps** section
5. Copy the configuration values

## Important Notes

### VITE_ Prefix Requirement

All environment variables that need to be accessible in client-side code **must** be prefixed with `VITE_`. This is a Vite security requirement to prevent accidentally exposing server-side secrets.

**✅ Correct:**
```env
VITE_FIREBASE_API_KEY=your-key
```

**❌ Incorrect:**
```env
FIREBASE_API_KEY=your-key  # Won't be accessible in client code
```

### Security

- **Never commit `.env` file** to version control (already in `.gitignore`)
- The `.env.example` file is safe to commit (contains only placeholders)
- For production, set environment variables in your hosting platform (Vercel, Netlify, etc.)

### Fallback Values

The Firebase configuration file (`backend/config/firebase-config.js`) includes fallback values for development. If environment variables are not set, it will use the default values.

## Environment Variables Reference

| Variable | Description | Required |
|----------|-------------|----------|
| `VITE_FIREBASE_API_KEY` | Firebase API key | Yes |
| `VITE_FIREBASE_AUTH_DOMAIN` | Firebase authentication domain | Yes |
| `VITE_FIREBASE_PROJECT_ID` | Firebase project ID | Yes |
| `VITE_FIREBASE_STORAGE_BUCKET` | Firebase storage bucket | Yes |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Firebase messaging sender ID | Yes |
| `VITE_FIREBASE_APP_ID` | Firebase app ID | Yes |
| `VITE_FIREBASE_MEASUREMENT_ID` | Firebase Analytics measurement ID | No (optional) |

## Using Environment Variables in Code

Environment variables are accessed using `import.meta.env`:

```javascript
const apiKey = import.meta.env.VITE_FIREBASE_API_KEY;
```

## Troubleshooting

### Environment variables not loading

1. **Check the prefix**: Make sure all variables start with `VITE_`
2. **Restart dev server**: Environment variables are loaded when the server starts
3. **Check file location**: `.env` should be in the project root (not in `frontend/`)
4. **Check syntax**: Make sure there are no spaces around the `=` sign

### Values not updating

- Restart the development server after changing `.env` file
- Clear browser cache if needed

## Production Deployment

### Vercel

1. Go to your project settings
2. Navigate to **Environment Variables**
3. Add each variable with the `VITE_` prefix
4. Redeploy your application

### Netlify

1. Go to **Site settings** > **Environment variables**
2. Add each variable with the `VITE_` prefix
3. Redeploy your site

### Other Platforms

Check your hosting platform's documentation for setting environment variables. Make sure they are accessible during the build process.

---

**Last Updated**: 2024

