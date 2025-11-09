# Data Model Explanation

## Understanding the Two Collections

There are **TWO separate collections** in Firebase that serve different purposes:

### 1. `faces` Collection (Person Profiles)

**Purpose:** Stores information about registered people (static profile data)

**Structure:**
```javascript
{
  id: "face-doc-id",           // Document ID
  name: "Alex",                // Person's name
  notes: "Friend from work",   // Static notes about the person
  embedding: [0.1, 0.2, ...], // Face embedding (128 numbers)
  userId: "default",
  createdAt: timestamp,
  updatedAt: timestamp
}
```

**What it's used for:**
- Face recognition (comparing embeddings)
- Displaying name and notes in face overlays (the tags next to faces)
- **This is STATIC data** - it doesn't change when you record memories

**When it's updated:**
- Only when you register a new face
- Only if you manually edit the person's profile

---

### 2. `interactions` Collection (Memories/Conversations)

**Purpose:** Stores conversation memories for each person (dynamic conversation data)

**Structure:**
```javascript
{
  id: "interaction-doc-id",    // Document ID
  faceId: "face-doc-id",       // Links to person in 'faces' collection
  transcript: "We discussed...", // Full conversation text
  summary: "Discussed project timeline", // One-sentence summary (auto-generated)
  summarized: true,            // Whether summary was generated
  summarizedAt: timestamp,     // When summary was created
  userId: "default",
  createdAt: timestamp,        // When memory was recorded
  updatedAt: timestamp
}
```

**What it's used for:**
- Storing recorded conversations
- Generating summaries (automatically via Cloud Function)
- Displaying in "View Memories" modal

**When it's updated:**
- Every time you click "Add Memory" and save a conversation
- Automatically gets a summary added by Cloud Function

---

## How They Work Together

```
Person Profile (faces collection)
    ↓
    ├── name: "Alex"
    ├── notes: "Friend from work"  ← Static, shown in face overlay
    └── embedding: [...]
            ↓
            Links to
            ↓
Memory 1 (interactions collection)
    ├── faceId: "alex-face-id"
    ├── transcript: "We discussed the project..."
    └── summary: "Discussed project timeline"  ← Dynamic, shown in View Memories

Memory 2 (interactions collection)
    ├── faceId: "alex-face-id"
    ├── transcript: "Alex mentioned moving..."
    └── summary: "Alex mentioned moving next month"  ← Dynamic, shown in View Memories
```

---

## What Gets Displayed Where

### Face Overlays (tags next to faces)
- **Data source:** `faces` collection
- **Shows:** Name and notes from person's profile
- **Example:** "Alex - Friend from work"
- **This does NOT change** when you record memories

### View Memories Modal
- **Data source:** `interactions` collection
- **Shows:** All saved conversations for that person
- **Each memory shows:**
  - Date and time
  - Summary (one sentence)
  - Full transcript
- **This updates** every time you save a new memory

---

## Common Confusion

### ❌ WRONG: "Recording memories updates the notes field"

**Why this is wrong:**
- The `notes` field in `faces` collection is static profile data
- It's only shown in face overlays
- Recording memories doesn't change it

### ✅ CORRECT: "Recording memories creates new documents in interactions collection"

**Why this is correct:**
- Each memory is a separate document in `interactions` collection
- Each memory gets its own summary
- All memories are shown in "View Memories" modal

---

## Example Flow

1. **Register a person:**
   - Creates document in `faces` collection
   - Stores: name="Alex", notes="Friend from work", embedding=[...]
   - Face overlay shows: "Alex - Friend from work"

2. **Record Memory 1:**
   - Creates document in `interactions` collection
   - Stores: faceId="alex-id", transcript="We discussed project..."
   - Cloud Function generates: summary="Discussed project timeline"
   - **Face overlay still shows:** "Alex - Friend from work" (unchanged)
   - **View Memories shows:** Memory 1 with summary

3. **Record Memory 2:**
   - Creates NEW document in `interactions` collection
   - Stores: faceId="alex-id", transcript="Alex mentioned moving..."
   - Cloud Function generates: summary="Alex mentioned moving next month"
   - **Face overlay still shows:** "Alex - Friend from work" (unchanged)
   - **View Memories shows:** Memory 1 AND Memory 2 with summaries

---

## How to Verify It's Working

### Check if memory was saved:

1. **Open Firebase Console:**
   - Go to Firestore Database
   - Open `interactions` collection
   - You should see a new document with:
     - `faceId`: Links to the person
     - `transcript`: The conversation text
     - `summarized`: Should be `true` after a few seconds
     - `summary`: One-sentence summary

2. **Check browser console:**
   - Look for: "Memory saved successfully: [interactionId]"
   - Copy the interactionId
   - Check Firebase Console to verify it exists

### Check if summary was generated:

1. **Wait 10-30 seconds** after saving memory
2. **Check Firebase Console:**
   - Open the interaction document
   - `summarized` should be `true`
   - `summary` should have text

### Check if View Memories works:

1. **Point camera at recognized person**
2. **"View Memories" button should appear** in sidebar
3. **Click button** → Should show all memories for that person

---

## Troubleshooting

### Memory not saving?

- Check browser console for errors
- Verify Firebase connection
- Check that face is recognized (face overlay should show name)
- Verify Speech Captions is enabled

### Summary not generating?

- Check Cloud Functions are deployed
- Check Firebase Console > Functions for errors
- Verify OpenAI API key is set
- Check function logs: `firebase functions:log`

### View Memories button not showing?

- Check that face recognition is enabled
- Check that person is recognized (face overlay visible)
- Check browser console for errors
- Verify `updateViewMemoriesButton()` is being called

---

## Key Takeaways

1. **Two separate collections:**
   - `faces`: Static person profiles
   - `interactions`: Dynamic conversation memories

2. **Recording memories does NOT update notes:**
   - Notes are static profile data
   - Memories are separate documents
   - Each memory has its own summary

3. **View Memories shows interactions, not faces:**
   - Modal queries `interactions` collection
   - Filters by `faceId` to find all memories for a person
   - Shows summaries and transcripts

4. **Face overlays show faces data, not interactions:**
   - Overlays show name and notes from `faces` collection
   - This is static and doesn't change with memories

