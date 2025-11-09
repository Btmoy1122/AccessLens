# Security Fix - Firebase API Key Exposure

## Issue
Firebase API key was exposed in public GitHub repository. Even though Firebase client API keys are "public" by design, they should have proper restrictions and not be hardcoded in source code.

## Immediate Actions Required

### 1. Regenerate the API Key (DO THIS FIRST)

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select project: **AccessLens (acceens-5f3ad)**
3. Navigate to: **APIs & Services > Credentials**
4. Find the API key: `AIzaSyBVt34mIMaY3lodiRlS-qh0XmVDP9XkqwQ`
5. Click **Edit** (pencil icon)
6. Click **Regenerate Key**
7. **Copy the new key** - you'll need it for step 2

### 2. Add API Key Restrictions

While editing the key (or after regenerating):

1. Under **Application restrictions**:
   - Select **HTTP referrers (web sites)**
   - Add your domains:
     - `http://localhost:*` (for development)
     - `https://yourdomain.com/*` (for production)
     - `file://*` (for local HTML files if needed)

2. Under **API restrictions**:
   - Select **Restrict key**
   - Select only the APIs you need:
     - Cloud Firestore API
     - Firebase Authentication API (if using)
     - Any other Firebase APIs you use

3. Click **Save**

### 3. Update Your Environment Variables

1. Create/update `.env` file in project root:
   ```bash
   VITE_FIREBASE_API_KEY=your-new-regenerated-key
   VITE_FIREBASE_AUTH_DOMAIN=acceens-5f3ad.firebaseapp.com
   VITE_FIREBASE_PROJECT_ID=acceens-5f3ad
   VITE_FIREBASE_STORAGE_BUCKET=acceens-5f3ad.firebasestorage.app
   VITE_FIREBASE_MESSAGING_SENDER_ID=384687344035
   VITE_FIREBASE_APP_ID=1:384687344035:web:e129c33106e4a7849eb216
   VITE_FIREBASE_MEASUREMENT_ID=G-4K07SBY9RL
   ```

2. For the scripts, create `scripts/firebase-config.json`:
   ```json
   {
     "apiKey": "your-new-regenerated-key",
     "authDomain": "acceens-5f3ad.firebaseapp.com",
     "projectId": "acceens-5f3ad",
     "storageBucket": "acceens-5f3ad.firebasestorage.app",
     "messagingSenderId": "384687344035",
     "appId": "1:384687344035:web:e129c33106e4a7849eb216",
     "measurementId": "G-4K07SBY9RL"
   }
   ```

### 4. Verify Firestore Security Rules

Make sure your Firestore security rules are properly configured:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Only allow authenticated users or specific conditions
    match /faces/{faceId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null;
    }
    match /interactions/{interactionId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null;
    }
  }
}
```

### 5. Remove Key from Git History (Optional but Recommended)

The key is still in git history. To remove it:

```bash
# WARNING: This rewrites git history
git filter-branch --force --index-filter \
  "git rm --cached --ignore-unmatch scripts/generate-summary.html backend/config/firebase-config.js" \
  --prune-empty --tag-name-filter cat -- --all

# Force push (be careful!)
git push origin --force --all
```

**Note**: Only do this if you're the only one working on the repo, or coordinate with your team.

### 6. Monitor API Usage

1. Go to Google Cloud Console > APIs & Services > Dashboard
2. Monitor for unusual activity
3. Set up billing alerts
4. Review Cloud Logging for abuse notifications

## Prevention

1. **Never commit API keys** - Always use environment variables
2. **Use .env files** - Already in .gitignore
3. **Review before committing** - Check for keys in `git diff`
4. **Use secrets management** - For production, use Google Secret Manager
5. **Add pre-commit hooks** - To detect keys before committing

## Status

- ✅ Removed hardcoded keys from source files
- ✅ Added firebase-config.json.example template
- ✅ Updated .gitignore to exclude firebase-config.json
- ⏳ **YOU NEED TO**: Regenerate the API key
- ⏳ **YOU NEED TO**: Add API key restrictions
- ⏳ **YOU NEED TO**: Update environment variables with new key

## Important Notes

- Firebase client API keys ARE meant to be public (in client-side code)
- However, they MUST have proper restrictions (HTTP referrers, API restrictions)
- Firestore security rules are your main defense, not the API key
- The API key just identifies your project - security comes from rules and restrictions

