/**
 * Firebase Cloud Functions for AccessLens
 *
 * Functions:
 * - summarizePersonMemories: Summarizes ALL memories for a person
 *   and stores the combined summary in the faces collection
 */

const admin = require("firebase-admin");
const {onDocumentCreated} = require("firebase-functions/v2/firestore");
const {onRequest} = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const OpenAI = require("openai");

// Initialize Firebase Admin
admin.initializeApp();

// Initialize OpenAI client
// For v2 functions, we need to use environment variables or secrets
// The API key is set via: firebase functions:secrets:set OPENAI_API_KEY
let openai = null;

try {
  // Get OpenAI API key from environment variable
  // For v2 functions, use secrets:
  // firebase functions:secrets:set OPENAI_API_KEY
  const openaiApiKey = process.env.OPENAI_API_KEY ?
      process.env.OPENAI_API_KEY.trim() : null;

  if (openaiApiKey) {
    // Log key info for debugging (first 10 and last 4 chars only)
    const keyPreview = openaiApiKey.length > 14 ?
        `${openaiApiKey.substring(0, 10)}...${
          openaiApiKey.substring(openaiApiKey.length - 4)}` :
        "***";
    logger.info(`OpenAI key loaded: ${keyPreview}, ` +
        `length: ${openaiApiKey.length}`);
    openai = new OpenAI({
      apiKey: openaiApiKey,
    });
    logger.info("OpenAI client initialized successfully");
  } else {
    logger.error("OpenAI API key not found. " +
        "Please set it using: firebase functions:secrets:set OPENAI_API_KEY");
    logger.error("Cloud Function will not be able to generate summaries " +
        "until the API key is configured.");
  }
} catch (error) {
  logger.error("Error initializing OpenAI client:", error);
}

/**
 * Cloud Function: Summarize all memories for a person
 *
 * This function:
 * 1. Gets all interactions for a given faceId
 * 2. Combines all transcripts into one summary
 * 3. Stores the combined summary in the faces collection
 *
 * Triggered when a new interaction is created OR can be called manually
 */
exports.summarizePersonMemories = onDocumentCreated(
    {
      document: "interactions/{interactionId}",
      region: "us-central1",
      // Required for v2 functions to access the secret
      secrets: ["OPENAI_API_KEY"],
    },
    async (event) => {
      const interactionId = event.params.interactionId;
      const interactionData = event.data.data();

      logger.info(`New interaction created: ${interactionId}`);

      // Skip if OpenAI is not initialized
      if (!openai) {
        logger.warn("OpenAI client not initialized, skipping summarization");
        return null;
      }

      // Get the faceId from the interaction
      const faceId = interactionData.faceId;
      if (!faceId) {
        logger.warn(`Interaction ${interactionId} has no faceId, skipping`);
        return null;
      }

      try {
        // Get all interactions for this face
        // Note: Query by faceId only (no orderBy) to avoid
        // Firestore index requirement. We'll sort in memory instead.
        const interactionsSnapshot = await admin.firestore()
            .collection("interactions")
            .where("faceId", "==", faceId)
            .get();

        if (interactionsSnapshot.empty) {
          logger.warn(`No interactions found for faceId: ${faceId}`);
          return null;
        }

        // Collect all interactions and sort by creation date (newest first)
        const interactions = [];
        interactionsSnapshot.forEach((doc) => {
          const data = doc.data();
          interactions.push({
            transcript: data.rawTranscript || data.transcript || "",
            createdAt: data.createdAt,
          });
        });

        // Sort by creation date (newest first) in memory
        interactions.sort((a, b) => {
          if (!a.createdAt || !b.createdAt) return 0;
          const aTime = a.createdAt.toMillis ?
              a.createdAt.toMillis() : 0;
          const bTime = b.createdAt.toMillis ?
              b.createdAt.toMillis() : 0;
          return bTime - aTime;
        });

        // Extract transcripts
        const transcripts = [];
        interactions.forEach((interaction) => {
          const transcript = interaction.transcript;
          if (transcript && transcript.trim().length > 0) {
            transcripts.push(transcript.trim());
          }
        });

        if (transcripts.length === 0) {
          logger.warn(`No transcripts found for faceId: ${faceId}`);
          return null;
        }

        // Combine all transcripts
        const combinedTranscript = transcripts.join("\n\n");

        logger.info(`Summarizing ${transcripts.length} memories ` +
            `for faceId: ${faceId}`);

        // Create combined summary using OpenAI
        const completion = await openai.chat.completions.create({
          model: "gpt-3.5-turbo",
          messages: [
            {
              role: "system",
              content: "You are a helpful assistant that creates " +
                  "extremely concise summaries. Given multiple conversation " +
                  "transcripts, create a brief summary of EXACTLY 10 words " +
                  "or less that captures the most important information " +
                  "about this person. Focus on key facts, interests, or " +
                  "notable characteristics. Return only the summary, no " +
                  "explanations.",
            },
            {
              role: "user",
              content: `Create a 10-word-or-less summary of all ` +
                  `conversations:\n\n${combinedTranscript}`,
            },
          ],
          max_tokens: 30, // 10 words = ~15 tokens, 30 gives buffer
          temperature: 0.7,
        });

        const firstChoice = completion.choices[0];
        const combinedSummary = (firstChoice && firstChoice.message &&
            firstChoice.message.content) || "";

        if (!combinedSummary) {
          logger.warn(`No summary generated for faceId: ${faceId}`);
          return null;
        }

        // Update the face document with the combined summary
        const faceRef = admin.firestore().collection("faces").doc(faceId);
        await faceRef.update({
          memorySummary: combinedSummary.trim(),
          memorySummaryUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
          memoryCount: transcripts.length,
        });

        logger.info(`Successfully summarized ${transcripts.length} ` +
            `memories for faceId: ${faceId}`);
        return null;
      } catch (error) {
        logger.error(`Error summarizing memories for faceId ${faceId}:`,
            error);

        // Update face document to indicate summarization failed (optional)
        try {
          await admin.firestore()
              .collection("faces")
              .doc(faceId)
              .update({
                memorySummaryError: error.message,
                memorySummaryUpdatedAt:
                    admin.firestore.FieldValue.serverTimestamp(),
              });
        } catch (updateError) {
          logger.error(`Error updating face ${faceId} with error:`,
              updateError);
        }

        return null;
      }
    },
);

/**
 * HTTP Cloud Function: Manually trigger summarization for a person
 *
 * Useful for retrying failed summarizations or manually
 * triggering summaries for a specific person.
 *
 * Usage: POST /summarizePersonMemories
 * Body: { faceId: "..." }
 */
exports.triggerPersonSummary = onRequest(
    {
      region: "us-central1",
      cors: true,
      // Required for v2 functions to access the secret
      secrets: ["OPENAI_API_KEY"],
    },
    async (req, res) => {
      if (req.method !== "POST") {
        res.status(405).send("Method not allowed");
        return;
      }

      const {faceId} = req.body;

      if (!faceId) {
        res.status(400).json({error: "faceId is required"});
        return;
      }

      if (!openai) {
        res.status(503).json({error: "OpenAI client not initialized"});
        return;
      }

      try {
        // Get all interactions for this face
        // Note: Query by faceId only (no orderBy) to avoid index requirement
        // We'll sort in memory instead
        const interactionsSnapshot = await admin.firestore()
            .collection("interactions")
            .where("faceId", "==", faceId)
            .get();

        if (interactionsSnapshot.empty) {
          res.status(404).json({
            error: "No interactions found for this faceId",
          });
          return;
        }

        // Collect all transcripts and sort by creation date (newest first)
        const interactions = [];
        interactionsSnapshot.forEach((doc) => {
          const data = doc.data();
          interactions.push({
            transcript: data.rawTranscript || data.transcript || "",
            createdAt: data.createdAt,
          });
        });

        // Sort by creation date (newest first)
        interactions.sort((a, b) => {
          if (!a.createdAt || !b.createdAt) return 0;
          const aTime = a.createdAt.toMillis ? a.createdAt.toMillis() : 0;
          const bTime = b.createdAt.toMillis ? b.createdAt.toMillis() : 0;
          return bTime - aTime;
        });

        // Extract transcripts
        const transcripts = [];
        interactions.forEach((interaction) => {
          const transcript = interaction.transcript;
          if (transcript && transcript.trim().length > 0) {
            transcripts.push(transcript.trim());
          }
        });

        if (transcripts.length === 0) {
          res.status(400).json({error: "No transcripts found for this faceId"});
          return;
        }

        // Combine all transcripts
        const combinedTranscript = transcripts.join("\n\n");

        // Create combined summary using OpenAI
        const completion = await openai.chat.completions.create({
          model: "gpt-3.5-turbo",
          messages: [
            {
              role: "system",
              content: "You are a helpful assistant that creates " +
                  "extremely concise summaries. Given multiple conversation " +
                  "transcripts, create a brief summary of EXACTLY 10 words " +
                  "or less that captures the most important information " +
                  "about this person. Focus on key facts, interests, or " +
                  "notable characteristics. Return only the summary, no " +
                  "explanations.",
            },
            {
              role: "user",
              content: `Create a 10-word-or-less summary of all ` +
                  `conversations:\n\n${combinedTranscript}`,
            },
          ],
          max_tokens: 30, // 10 words = ~15 tokens, 30 gives buffer
          temperature: 0.7,
        });

        const firstChoice = completion.choices[0];
        const combinedSummary = (firstChoice && firstChoice.message &&
            firstChoice.message.content) || "";

        if (!combinedSummary) {
          res.status(500).json({error: "Failed to generate summary"});
          return;
        }

        // Update the face document
        await admin.firestore()
            .collection("faces")
            .doc(faceId)
            .update({
              memorySummary: combinedSummary.trim(),
              memorySummaryUpdatedAt:
                  admin.firestore.FieldValue.serverTimestamp(),
              memoryCount: transcripts.length,
            });

        res.json({
          success: true,
          faceId: faceId,
          summary: combinedSummary.trim(),
          memoryCount: transcripts.length,
        });
      } catch (error) {
        logger.error(`Error in triggerPersonSummary:`, error);
        res.status(500).json({error: error.message});
      }
    },
);
