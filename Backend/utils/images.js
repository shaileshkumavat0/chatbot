import { IMAGE_PROMPT_PREFIX } from "./gemini.js";

/**
 * Detects the IMAGE_PROMPT marker in a model reply.
 *
 * Gemini returns this as plain text, so we pull the description out and render
 * an actual image instead of showing the user the marker.
 *
 * Returns null when the reply is an ordinary text answer.
 */
export const extractImagePrompt = (text) => {
  const line = text
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.startsWith(IMAGE_PROMPT_PREFIX));

  if (!line) return null;

  const prompt = line.slice(IMAGE_PROMPT_PREFIX.length).trim();
  return prompt.length > 0 ? prompt : null;
};

const POLLINATIONS_URL = "https://image.pollinations.ai/prompt";
const TIMEOUT_MS = 45_000;
const MAX_ATTEMPTS = 3;

// The free endpoint returns 402 when it is momentarily saturated, which clears
// up on its own, so those responses are worth retrying.
const isRetryable = (status) => status === 402 || status === 429 || status >= 500;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const attempt = async (url, onProgress) => {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { Accept: "image/*" },
  });

  if (!response.ok || !response.body) {
    const error = new Error(`Image service returned ${response.status}`);
    error.status = response.status;
    throw error;
  }

  const total = Number(response.headers.get("content-length")) || 0;
  const reader = response.body.getReader();
  const chunks = [];
  let received = 0;

  if (total > 0) onProgress?.(0);

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;

    chunks.push(value);
    received += value.length;

    if (total > 0) {
      // Real progress: bytes received against the advertised size.
      onProgress?.(Math.min(99, Math.round((received / total) * 100)));
    } else {
      // No content-length to compare against, so pace the bar by bytes read.
      onProgress?.(Math.min(92, Math.round((received / 250_000) * 92)));
    }
  }

  if (received === 0) {
    throw new Error("Image service returned no data");
  }

  const mime = response.headers.get("content-type") || "image/jpeg";

  return {
    dataUrl: `data:${mime};base64,${Buffer.concat(chunks).toString("base64")}`,
  };
};

/**
 * Generates an image and returns it as a data URL so it can be pushed straight
 * down the existing stream without any extra hosting or API key.
 *
 * `onProgress` receives a 0-100 percentage measured from bytes received.
 */
export const generateImage = async (prompt, onProgress) => {
  const url = `${POLLINATIONS_URL}/${encodeURIComponent(prompt)}?width=1024&height=1024&nologo=true&model=flux`;

  let lastError;

  for (let n = 1; n <= MAX_ATTEMPTS; n++) {
    try {
      const { dataUrl } = await attempt(url, onProgress);
      onProgress?.(100);
      return { dataUrl, prompt };
    } catch (err) {
      lastError = err;
      if (!isRetryable(err.status) || n === MAX_ATTEMPTS) break;
      onProgress?.(0);
      await sleep(n * 2000);
    }
  }

  throw new Error(
    lastError?.status === 402 || lastError?.status === 429
      ? "The free image service is busy right now, please try again in a moment"
      : lastError?.message || "Image generation failed",
  );
};