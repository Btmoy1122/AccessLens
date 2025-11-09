# Testing Memory Features Guide

This guide will walk you through testing the new memory features: Confidence Buffer, Memory Recording, and Memory Playback.

## Prerequisites

1. **Firebase Functions Deployed** (for automatic summarization)
2. **Face Recognition Enabled** (for testing)
3. **Speech Captions Enabled** (for memory recording)
4. **At least one registered face** in the system

## Step 1: Deploy Cloud Functions (First Time Only)

If you haven't deployed the Cloud Functions yet:

```bash
# Navigate to project root
cd C:\Users\Brandon-School\AccessLens

# Install function dependencies (if not already done)
cd functions
npm install
cd ..

# Deploy functions
firebase deploy --only functions
```

**Expected Output:**
- Functions should deploy successfully
- You should see: `✔  functions[summarizeInteraction] Successful create operation.`
- You should see: `✔  functions[triggerSummarization] Successful create operation.`

## Step 2: Test Confidence Buffer for Face Registration

### Test 1: Unknown Face Detection with Buffer

1. **Start the app:**
   ```bash
   npm run dev
   ```

2. **Enable Face Recognition:**
   - Open the sidebar
   - Click "Face Recognition" to enable it
   - Wait for models to load

3. **Test the buffer:**
   - Point camera at an **unknown person** (not registered)
   - **Wait 4 seconds** - The system should NOT prompt immediately
   - After 4 seconds of consistent detection, you should see the registration modal
   - **Before 4 seconds**: Move your face away quickly - no prompt should appear (buffer resets)

4. **Test buffer reset:**
   - Point camera at unknown face
   - Wait 2 seconds
   - Point camera at a **known face** (already registered)
   - The buffer should reset automatically (no prompt for unknown face)

**Expected Behavior:**
- ✅ No immediate prompts on unknown faces
- ✅ Prompt appears only after 4 seconds of consistent detection
- ✅ Buffer resets when known face is recognized

## Step 3: Test Memory Recording

### Test 2: Record a Memory

1. **Prerequisites:**
   - Face Recognition must be **enabled**
   - Speech Captions must be **enabled**
   - A **recognized face** must be visible on camera

2. **Start Recording:**
   - Open sidebar
   - Click "Add Memory" button
   - Status should change to "Recording..."
   - You should see: "💾 Recording memory for [Person Name]..."

3. **Record Conversation:**
   - Speak naturally for 10-30 seconds
   - The speech will be transcribed in real-time
   - Transcripts are being collected in the background

4. **Stop Recording:**
   - Click "Add Memory" button again
   - Status should change back to "Ready"
   - You should see: "💾 Saving memory..." then "✅ Memory saved for [Person Name]"

5. **Verify in Console:**
   - Open browser DevTools (F12)
   - Check Console tab
   - You should see: "Memory saved successfully: [interactionId]"

**Expected Behavior:**
- ✅ Button shows "Recording..." when active
- ✅ Speech is captured and saved
- ✅ Success message appears after saving
- ✅ Memory is saved to Firebase

## Step 4: Test Automatic Summarization

### Test 3: Verify Summary Generation

1. **Wait for Summarization:**
   - After saving a memory, wait 5-10 seconds
   - The Cloud Function should automatically trigger
   - OpenAI will generate a summary

2. **Check Firebase Console:**
   - Go to [Firebase Console](https://console.firebase.google.com/)
   - Select your project
   - Go to Firestore Database
   - Open the `interactions` collection
   - Find your newly created interaction

3. **Verify Summary:**
   - Check the `summarized` field (should be `true`)
   - Check the `summary` field (should contain a one-sentence summary)
   - Check the `summarizedAt` timestamp

**Expected Behavior:**
- ✅ Summary appears within 5-30 seconds
- ✅ Summary is one sentence
- ✅ Summary is relevant to the conversation

### Test 4: Manual Summarization (Optional)

If automatic summarization doesn't work, you can test manually:

```bash
# Get your interaction ID from Firebase Console
# Then call the HTTP function (replace INTERACTION_ID)
curl -X POST https://us-central1-YOUR-PROJECT-ID.cloudfunctions.net/triggerSummarization \
  -H "Content-Type: application/json" \
  -d '{"interactionId": "YOUR_INTERACTION_ID"}'
```

Or use Postman/Insomnia to test the HTTP endpoint.

## Step 5: Test Memory Playback

### Test 5: View Memories

1. **Prerequisites:**
   - Face Recognition must be **enabled**
   - At least one memory must be saved for the person

2. **View Memories:**
   - Point camera at a **recognized person** (someone with saved memories)
   - The "View Memories" button should **automatically appear** in the sidebar
   - Click "View Memories" button

3. **Verify Memory Display:**
   - Modal should open showing "Memories: [Person Name]"
   - You should see a list of saved memories
   - Each memory should show:
     - Date and time
     - Summary (one sentence)
     - Full conversation transcript

4. **Test Empty State:**
   - Point camera at a person with **no memories**
   - Click "View Memories"
   - Should show: "No memories found for this person."

**Expected Behavior:**
- ✅ Button appears automatically when recognized face is detected
- ✅ Button hides automatically when no face is detected
- ✅ Memories display with summaries and transcripts
- ✅ Empty state shows when no memories exist

## Step 6: End-to-End Test

### Test 6: Complete Flow

1. **Register a new face:**
   - Point camera at unknown person
   - Wait for registration modal (after 4 seconds)
   - Enter name and notes
   - Click "Register Face"

2. **Record a memory:**
   - Point camera at the registered person
   - Click "Add Memory"
   - Speak for 10-20 seconds
   - Click "Add Memory" again to stop

3. **Wait for summarization:**
   - Wait 10-30 seconds
   - Check Firebase Console to verify summary was generated

4. **View memories:**
   - Point camera at the same person
   - Click "View Memories"
   - Verify the memory appears with summary

**Expected Behavior:**
- ✅ Complete flow works end-to-end
- ✅ Summary appears automatically
- ✅ Memory can be viewed later

## Troubleshooting

### Issue: Summarization not working

**Check:**
1. Are Cloud Functions deployed?
   ```bash
   firebase functions:list
   ```

2. Check function logs:
   ```bash
   firebase functions:log
   ```

3. Verify OpenAI API key is set:
   ```bash
   firebase functions:config:get
   ```
   Should show: `openai.key`

4. Check Firebase Console > Functions for errors

### Issue: View Memories button not showing

**Check:**
1. Is Face Recognition enabled?
2. Is a recognized face visible on camera?
3. Check browser console for errors
4. Verify `getPrimaryFaceOnScreen()` is working

### Issue: Memory not saving

**Check:**
1. Is Speech Captions enabled?
2. Is a recognized face visible?
3. Check browser console for errors
4. Verify Firebase connection (check Network tab)

### Issue: Confidence buffer not working

**Check:**
1. Is Face Recognition enabled?
2. Check browser console for logs
3. Verify `unknownFacesBuffer` is being populated
4. Check that 4 seconds have passed

## Quick Test Checklist

- [ ] Cloud Functions deployed
- [ ] Face Recognition enabled
- [ ] Speech Captions enabled
- [ ] At least one face registered
- [ ] Confidence buffer delays prompts (4 seconds)
- [ ] Memory recording works
- [ ] Memory saves to Firebase
- [ ] Summary generates automatically (check Firebase Console)
- [ ] View Memories button appears when face detected
- [ ] Memories display correctly with summaries

## Testing in Production

Once everything works locally:

1. **Deploy functions:**
   ```bash
   firebase deploy --only functions
   ```

2. **Deploy frontend:**
   ```bash
   npm run build
   firebase deploy --only hosting
   ```

3. **Test on deployed site:**
   - All features should work the same
   - Summarization may take slightly longer (network latency)

## Next Steps

After testing:
- Monitor Firebase Console for function execution
- Check OpenAI usage/costs in OpenAI dashboard
- Review saved memories for quality
- Adjust confidence buffer time if needed (currently 4 seconds)

