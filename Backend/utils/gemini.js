import "dotenv/config";
import { GoogleGenAI } from "@google/genai";

// Free tier limits are tight and differ per model (gemini-3.8-flash allows only
// 20 requests/day). We try each in turn so a chat is never dead just because
// one model is over quota.
const MODELS = (process.env.GEMINI_MODELS || "gemini-3-flash-preview,gemini-3.5-flash")
  .split(",")
  .map((model) => model.trim())
  .filter(Boolean);

const MAX_ATTEMPTS = 3;

// Without this the model drifts into ReAct-agent mode and replies with raw JSON
// like {"action": "...", "thought": "..."} instead of talking to the user.
const SYSTEM_INSTRUCTION = `You are Sigma, a friendly and helpful AI chatbot.

Rules you must always follow:
- Reply directly to the user in plain conversational text or Markdown.
- NEVER reply with JSON, and never use keys such as "action", "action_input", or "thought".
- Keep answers short and clear unless the user asks for detail or explanation.
- If the user asks you to create, generate, draw, show, or make an image, picture,
  illustration, or photo, reply with exactly one line in this format and nothing else:
  IMAGE_PROMPT: <a vivid, detailed English description of the picture to generate>
  The description must be a complete standalone scene, not a request.`;

/** Marker the model uses to ask us for a generated image. */
export const IMAGE_PROMPT_PREFIX = "IMAGE_PROMPT:";

let client;

// Lazy init so the server can boot even if the key is missing,
// and so a rotated key is picked up without a restart.
const getClient = () => {
  if (!client) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is missing from Backend/.env");
    }
    client = new GoogleGenAI({ apiKey });
  }
  return client;
};

// Rate limits and capacity spikes are temporary, so they are worth retrying.
const isRetryable = (err) => {
  const status = err?.status;
  return status === 429 || status === 503 || (status >= 500 && status < 600);
};

const describe = (err) => {
  switch (err?.status) {
    case 400:
      return "Gemini rejected the request (check GEMINI_MODELS in Backend/.env)";
    case 401:
    case 403:
      return "Gemini API key is invalid or does not have access to this model";
    case 429:
      return "Gemini rate limit reached, please try again shortly";
    case 503:
      return "Gemini is busy right now, please try again";
    default:
      return err?.message || "Gemini request failed";
  }
};

const buildPayload = (model, message, previousInteractionId) => {
  const payload = { model, input: message, system_instruction: SYSTEM_INSTRUCTION };
  if (previousInteractionId) {
    payload.previous_interaction_id = previousInteractionId;
  }
  return payload;
};

// A conversation id belongs to one model, so it cannot carry over to a fallback.
const dropConversation = (payload) => {
  if (payload.previous_interaction_id) {
    delete payload.previous_interaction_id;
    return true;
  }
  return false;
};

/**
 * Sends a message to Gemini and returns the reply plus the interaction id.
 *
 * The id is what gives the model memory: pass it back as `previousInteractionId`
 * on the next turn and Gemini keeps the context server-side.
 */
export const getGeminiAPIResponse = async (message, previousInteractionId = null) => {
  let lastError;

  for (const model of MODELS) {
    const payload = buildPayload(model, message, previousInteractionId);

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const interaction = await getClient().interactions.create(payload);
        const text = interaction.output_text?.trim();

        if (!text) {
          throw new Error("Gemini returned an empty response");
        }

        return { text, interactionId: interaction.id ?? null };
      } catch (err) {
        lastError = err;

        // A previous interaction id can go stale (free tier keeps them 1 day).
        // Drop it and continue without it instead of failing the whole chat.
        if (dropConversation(payload) && (err?.status === 400 || err?.status === 404)) {
          continue;
        }

        if (!isRetryable(err) || attempt === MAX_ATTEMPTS) break;

        await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
      }
    }
  }

  throw new Error(describe(lastError));
};

/**
 * Streams a reply from Gemini, calling `onChunk` with each piece of text as it
 * arrives. Resolves once the whole reply is done.
 *
 * The caller gets tokens as they are produced instead of waiting for the full
 * answer, which is what makes the chat feel fast.
 */
export const streamGeminiResponse = async (
  message,
  previousInteractionId,
  onChunk,
) => {
  let lastError;

  for (const model of MODELS) {
    const payload = { ...buildPayload(model, message, previousInteractionId), stream: true };
    let interactionId = null;
    let receivedText = false;

    try {
      const stream = await getClient().interactions.create(payload);

      for await (const event of stream) {
        if (event.event_type === "step.delta") {
          if (event.delta?.type === "text" && event.delta.text) {
            receivedText = true;
            onChunk(event.delta.text);
          }
          continue;
        }

        if (event.interaction?.id) {
          interactionId = event.interaction.id;
        } else if (event.event_type === "interaction.status_update" && event.interaction_id) {
          interactionId = event.interaction_id;
        }
      }

      if (!receivedText) {
        throw new Error("Gemini returned an empty response");
      }

      return { interactionId };
    } catch (err) {
      lastError = err;

      // Only worth retrying if the user has not seen any text yet, otherwise
      // they would watch the answer repeat from the beginning.
      if (receivedText) break;

      if (dropConversation(payload) && (err?.status === 400 || err?.status === 404)) {
        continue;
      }

      if (!isRetryable(err)) break;

      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  }

  throw new Error(describe(lastError));
};