/**
 * Simple Script: Generate Summary for Interaction
 * 
 * Uses Firebase Client SDK (no Admin SDK needed)
 * Can be run with Node.js or in browser
 * 
 * Usage (Node.js):
 *   OPENAI_API_KEY="your-key" node scripts/generate-summary-simple.js <interactionId>
 * 
 * Usage (Browser):
 *   Open scripts/generate-summary.html in browser
 */

// This uses ES modules, so it needs to be run with: node --input-type=module
// Or convert to CommonJS

import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import firebaseConfig from '../backend/config/firebase-config.js';
import OpenAI from 'openai';

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Initialize OpenAI
const openaiApiKey = process.env.OPENAI_API_KEY;
if (!openaiApiKey) {
  console.error('OpenAI API key not found. Set OPENAI_API_KEY environment variable.');
  process.exit(1);
}

const openai = new OpenAI({
  apiKey: openaiApiKey,
});

/**
 * Generate summary for an interaction
 */
async function generateSummary(interactionId) {
  try {
    console.log(`Fetching interaction: ${interactionId}`);
    
    // Get the interaction document
    const interactionRef = doc(db, 'interactions', interactionId);
    const interactionDoc = await getDoc(interactionRef);
    
    if (!interactionDoc.exists()) {
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
    await updateDoc(interactionRef, {
      summarized: true,
      summary: summary.trim(),
      summarizedAt: serverTimestamp(),
    });
    
    console.log('✅ Summary saved successfully!');
    
  } catch (error) {
    console.error('Error generating summary:', error);
    throw error;
  }
}

// Main execution
const interactionId = process.argv[2];

if (!interactionId) {
  console.error('Usage: OPENAI_API_KEY="your-key" node scripts/generate-summary-simple.js <interactionId>');
  process.exit(1);
}

generateSummary(interactionId)
    .then(() => {
      console.log('Done');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Error:', error);
      process.exit(1);
    });

