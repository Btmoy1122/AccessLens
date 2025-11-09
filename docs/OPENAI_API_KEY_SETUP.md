# OpenAI API Key Setup Guide

## 🚨 SECURITY WARNING

**⚠️ IMPORTANT**: OpenAI API keys are PRIVATE and should NEVER be:
- Shared in plain text in chat/email
- Committed to version control
- Stored in client-side code
- Exposed in public repositories

If you've shared your API key, **rotate it immediately**:
1. Go to https://platform.openai.com/api-keys
2. Delete the exposed key
3. Create a new key
4. Update it in Firebase (see below)

## Setup Methods

### Method 1: Firebase Secrets (Recommended for Cloud Functions)

This is the **secure way** to store your OpenAI API key for Cloud Functions.

#### Step 1: Install Firebase CLI
```bash
npm install -g firebase-tools
```

#### Step 2: Login to Firebase
```bash
firebase login
```

#### Step 3: Set the OpenAI API Key as a Secret
```bash
firebase functions:secrets:set OPENAI_API_KEY
```

When prompted, paste your OpenAI API key and press Enter.

**Note**: The key will be hidden as you type (for security).

#### Step 4: Verify the Secret is Set
```bash
firebase functions:secrets:access OPENAI_API_KEY
```

This will display a preview of the key (first and last few characters).

#### Step 5: Deploy Cloud Functions
```bash
cd functions
npm install
firebase deploy --only functions
```

### Method 2: Environment Variables (For Local Development)

For local development and testing, you can use environment variables.

#### For Linux/Mac:
```bash
export OPENAI_API_KEY="your-api-key-here"
```

#### For Windows PowerShell:
```powershell
$env:OPENAI_API_KEY="your-api-key-here"
```

#### For Windows CMD:
```cmd
set OPENAI_API_KEY=your-api-key-here
```

#### For Local Testing:
```bash
OPENAI_API_KEY="your-api-key-here" npm run serve
```

### Method 3: .env File (For Local Scripts)

Create a `.env` file in the project root (already in .gitignore):

```env
OPENAI_API_KEY=your-api-key-here
```

**⚠️ Warning**: Never commit this file to version control!

## Usage in Code

### Cloud Functions (functions/index.js)

The Cloud Functions automatically use the Firebase secret:

```javascript
// The key is automatically available as process.env.OPENAI_API_KEY
// when deployed to Firebase
const openaiApiKey = process.env.OPENAI_API_KEY;

if (openaiApiKey) {
  openai = new OpenAI({
    apiKey: openaiApiKey,
  });
}
```

### Local Scripts (scripts/generate-summary.js)

Local scripts use environment variables:

```javascript
const openaiApiKey = process.env.OPENAI_API_KEY;

if (!openaiApiKey) {
  console.error('OpenAI API key not found. Set OPENAI_API_KEY environment variable.');
  process.exit(1);
}

const openai = new OpenAI({
  apiKey: openaiApiKey,
});
```

## Setting Up for Team Members

### Option 1: Each Person Uses Their Own Key (Recommended)

1. Each team member gets their own OpenAI API key
2. Each person sets it locally using Method 2 or 3 above
3. For Cloud Functions, use a shared key via Firebase Secrets (Method 1)

### Option 2: Shared Team Key (Less Secure)

1. One person sets the key in Firebase Secrets
2. Team members can test locally using their own keys
3. Deployed functions use the shared key

**⚠️ Warning**: Sharing API keys increases security risk. Rotate keys regularly.

## Verifying Setup

### Check Cloud Functions Logs
```bash
firebase functions:log
```

Look for:
```
OpenAI key loaded: sk-proj-***...***, length: 51
OpenAI client initialized successfully
```

### Test Cloud Function
```bash
curl -X POST https://us-central1-acceens-5f3ad.cloudfunctions.net/triggerPersonSummary \
  -H "Content-Type: application/json" \
  -d '{"faceId":"test-face-id"}'
```

## Troubleshooting

### "OpenAI API key not found"
- Verify the secret is set: `firebase functions:secrets:access OPENAI_API_KEY`
- Check function logs: `firebase functions:log`
- Redeploy functions: `firebase deploy --only functions`

### "OpenAI client not initialized"
- Check that the secret is correctly set in Firebase
- Verify the key is valid (not expired/revoked)
- Check function logs for errors

### Local Development Issues
- Verify environment variable is set: `echo $OPENAI_API_KEY`
- Check .env file exists and has the key
- Restart your terminal/IDE after setting environment variables

## Security Best Practices

1. **Never commit API keys** - Already in .gitignore
2. **Use Firebase Secrets** - For production Cloud Functions
3. **Rotate keys regularly** - Especially if shared
4. **Monitor usage** - Check OpenAI dashboard for unexpected usage
5. **Use separate keys** - One for development, one for production
6. **Set usage limits** - In OpenAI dashboard to prevent abuse

## Getting an OpenAI API Key

1. Go to https://platform.openai.com/api-keys
2. Click "Create new secret key"
3. Give it a name (e.g., "AccessLens Production")
4. Copy the key immediately (you won't see it again)
5. Set it in Firebase or as an environment variable

## Cost Management

OpenAI API usage is charged per token. Monitor usage:
- OpenAI Dashboard: https://platform.openai.com/usage
- Set spending limits: https://platform.openai.com/account/billing/limits
- Use GPT-3.5-turbo (cheaper) instead of GPT-4 for summaries

## Related Documentation

- [Firebase Setup](./FIREBASE_SETUP.md)
- [Environment Setup](./ENVIRONMENT_SETUP.md)
- [Testing Memory Features](./TESTING_MEMORY_FEATURES.md)

