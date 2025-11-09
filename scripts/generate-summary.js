/**
 * Local Script: Generate Summary for Interaction
 * 
 * This script can be run locally to generate summaries for interactions
 * without needing to deploy Cloud Functions.
 * 
 * Usage:
 *   node scripts/generate-summary.js <interactionId>
 * 
 * Or run interactively:
 *   node scripts/generate-summary.js
 */

const OpenAI = require('openai');
const admin = require('firebase-admin');
const readline = require('readline');

// Initialize Firebase Admin
// Option 1: Use application default credentials (after firebase login)
// Option 2: Use service account key file
// Option 3: Use Firebase config (for client-side, less secure)

let db;
try {
  // Try application default credentials first
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
  });
  console.log('Firebase Admin initialized with application default credentials');
  db = admin.firestore();
} catch (error) {
  // If that fails, try initializing with Firebase config
  console.log('Trying Firebase config initialization...');
  try {
    const firebaseConfig = require('../backend/config/firebase-config.js').default;
    // For Admin SDK, we need service account or need to use client SDK
    // Let's use a different approach - use the Firebase client SDK
    console.error('Firebase Admin requires service account or application default credentials.');
    console.error('Please run: firebase login');
    console.error('Or set up service account key.');
    process.exit(1);
  } catch (configError) {
    console.error('Error initializing Firebase:', configError);
    process.exit(1);
  }
}

// Initialize OpenAI
// Get API key from environment variable
// Set it with: export OPENAI_API_KEY="your-key" (Linux/Mac)
// Or: $env:OPENAI_API_KEY="your-key" (PowerShell)
// Or: set OPENAI_API_KEY=your-key (CMD)
const openaiApiKey = process.env.OPENAI_API_KEY;

if (!openaiApiKey) {
  console.error('OpenAI API key not found. Set OPENAI_API_KEY environment variable.');
  process.exit(1);
}

const openai = new OpenAI({
  apiKey: openaiApiKey,
});

const db = admin.firestore();

/**
 * Generate summary for an interaction
 */
async function generateSummary(interactionId) {
  try {
    console.log(`Fetching interaction: ${interactionId}`);
    
    // Get the interaction document
    const interactionDoc = await db.collection('interactions').doc(interactionId).get();
    
    if (!interactionDoc.exists) {
      console.error(`Interaction ${interactionId} not found`);
      return;
    }
    
    const interactionData = interactionDoc.data();
    
    // Check if already summarized
    if (interactionData.summarized === true) {
      console.log('Interaction already summarized:');
      console.log('Summary:', interactionData.summary);
      return;
    }
    
    // Check if it has a transcript
    if (!interactionData.transcript || interactionData.transcript.trim().length === 0) {
      console.error('Interaction has no transcript');
      return;
    }
    
    console.log('Transcript:', interactionData.transcript);
    console.log('Generating summary...');
    
    // Generate summary using OpenAI
    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content: 'You are a helpful assistant that summarizes conversations. ' +
              'Provide a single, concise sentence (one line maximum) ' +
              'summarizing the key point or topic discussed. Keep it brief ' +
              'and focused on the most important information.',
        },
        {
          role: 'user',
          content: `Please summarize this conversation in one sentence:\n\n${interactionData.transcript}`,
        },
      ],
      max_tokens: 50,
      temperature: 0.7,
    });
    
    const firstChoice = completion.choices[0];
    const summary = (firstChoice && firstChoice.message &&
        firstChoice.message.content) || '';
    
    if (!summary) {
      console.error('Failed to generate summary');
      return;
    }
    
    console.log('Generated summary:', summary);
    
    // Update the interaction document
    await db.collection('interactions').doc(interactionId).update({
      summarized: true,
      summary: summary.trim(),
      summarizedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    
    console.log('✅ Summary saved successfully!');
    
  } catch (error) {
    console.error('Error generating summary:', error);
  }
}

// Main execution
const interactionId = process.argv[2];

if (interactionId) {
  // Interaction ID provided as argument
  generateSummary(interactionId)
      .then(() => {
        console.log('Done');
        process.exit(0);
      })
      .catch((error) => {
        console.error('Error:', error);
        process.exit(1);
      });
} else {
  // Interactive mode
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  
  rl.question('Enter interaction ID: ', (id) => {
    generateSummary(id)
        .then(() => {
          console.log('Done');
          rl.close();
          process.exit(0);
        })
        .catch((error) => {
          console.error('Error:', error);
          rl.close();
          process.exit(1);
        });
  });
}

