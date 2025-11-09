# API Keys Setup Guide for AccessLens

## 🚨 CRITICAL SECURITY WARNING

**⚠️ YOUR OPENAI API KEY HAS BEEN EXPOSED**

If you shared your OpenAI API key in plain text, you **MUST**:

1. **Rotate it immediately**: 
   - Go to https://platform.openai.com/api-keys
   - Delete the exposed key
   - Create a new key
   
2. **Never share API keys in plain text** - Use secure methods (password managers, encrypted messages)

3. **Set up the new key** using the instructions below

## Quick Setup for Team Members

### Step 1: Firebase Configuration (Safe to Share)

Firebase API keys are **PUBLIC** and safe to share. Add these to your `.env` file:

```env
VITE_FIREBASE_API_KEY=AIzaSyDXMFwcfwe-vtwP52hQiisy0dxzjc2d1nQ
VITE_FIREBASE_AUTH_DOMAIN=acceens-5f3ad.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=acceens-5f3ad
VITE_FIREBASE_STORAGE_BUCKET=acceens-5f3ad.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=384687344035
VITE_FIREBASE_APP_ID=1:384687344035:web:e129c33106e4a7849eb216
VITE_FIREBASE_MEASUREMENT_ID=G-4K07SBY9RL
```

### Step 2: OpenAI API Key Setup (PRIVATE - Do NOT Share)

#### For Cloud Functions (Production):

```bash
# Install Firebase CLI (if not already installed)
npm install -g firebase-tools

# Login to Firebase
firebase login

# Set OpenAI API key as a secret (SECURE METHOD)
firebase functions:secrets:set OPENAI_API_KEY
# When prompted, paste your OpenAI API key and press Enter

# Deploy functions
cd functions
npm install
firebase deploy --only functions
```

#### For Local Development:

Create a `.env` file in the project root (already in .gitignore):

```env
OPENAI_API_KEY=your-api-key-here
```

**⚠️ Never commit this file!**

#### For Local Scripts:

```bash
# Linux/Mac
export OPENAI_API_KEY="your-api-key-here"

# Windows PowerShell
$env:OPENAI_API_KEY="your-api-key-here"

# Windows CMD
set OPENAI_API_KEY=your-api-key-here
```

## Complete Setup Checklist

- [ ] Clone the repository
- [ ] Run `npm install`
- [ ] Create `.env` file
- [ ] Add Firebase configuration to `.env` (values above)
- [ ] Get your own OpenAI API key from https://platform.openai.com/api-keys
- [ ] Set OpenAI key locally (for development)
- [ ] Get access to Firebase project (ask team lead)
- [ ] Run `npm run dev`
- [ ] Test the application

## Firebase Project Access

To give teammates access to the Firebase project:

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select project: **AccessLens (acceens-5f3ad)**
3. Go to: **Project Settings > Users and permissions**
4. Click **Add member**
5. Enter teammate's email
6. Assign role: **Editor** (for development) or **Viewer** (read-only)
7. Click **Add**

## Security Best Practices

### ✅ Safe to Share:
- Firebase API keys (they're public)
- Firebase project configuration
- Setup instructions

### ❌ Never Share:
- OpenAI API keys (private, expensive)
- Personal `.env` files
- Service account keys

### 🔐 Secure Sharing Methods:
- Password managers (1Password, LastPass)
- Encrypted messages
- Secure team channels
- Environment variable management tools

## Troubleshooting

### "OpenAI API key not found"
- Check that `.env` file exists and has `OPENAI_API_KEY=your-key`
- Verify environment variable is set: `echo $OPENAI_API_KEY`
- Restart terminal/IDE after setting environment variables

### "Firebase permission denied"
- Ask team lead to add you to Firebase project
- Verify you're logged in: `firebase login`

### "Cloud Functions not working"
- Check that OpenAI secret is set: `firebase functions:secrets:access OPENAI_API_KEY`
- Check function logs: `firebase functions:log`
- Redeploy functions: `firebase deploy --only functions`

## Getting Help

- See [OpenAI API Key Setup Guide](./docs/OPENAI_API_KEY_SETUP.md) for detailed instructions
- See [Environment Setup Guide](./docs/ENVIRONMENT_SETUP.md) for Firebase setup
- See [Firebase Setup Guide](./docs/FIREBASE_SETUP.md) for Firebase configuration

## Cost Management

- Monitor OpenAI usage: https://platform.openai.com/usage
- Set spending limits: https://platform.openai.com/account/billing/limits
- Use GPT-3.5-turbo (cheaper) for summaries

---

**Remember**: Never share OpenAI API keys in plain text. Always use secure methods!

