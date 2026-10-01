import express from "express";
import Thread from "../models/Thread.js";
import { getGeminiAPIResponse, streamGeminiResponse, IMAGE_PROMPT_PREFIX } from "../utils/gemini.js";
import { extractImagePrompt, generateImage } from "../utils/images.js";

const router = express.Router();

/**
 * The model signals an image request with an IMAGE_PROMPT text marker. That
 * marker must never reach the browser, so the opening characters are held back
 * until we know whether this reply is an image request or ordinary text.
 */
const createPrefixGate = (prefix) => {
  let head = "";
  let decided = false;
  let isImageReply = false;

  const decide = () => {
    if (decided) return;
    decided = true;
    isImageReply = head.trimStart().toUpperCase().startsWith(prefix.toUpperCase());
  };

  return {
    get isImage() {
      return isImageReply;
    },
    // Text that is safe to forward downstream ("" while still undecided).
    push(chunk) {
      if (decided) return isImageReply ? "" : chunk;

      head += chunk;
      if (head.trimStart().length < prefix.length) return "";

      decide();
      return isImageReply ? "" : head;
    },
    // Called once the reply is complete, in case it was shorter than the marker
    // and was therefore never released. Text already forwarded must not repeat.
    flush() {
      if (decided) return "";
      decide();
      return isImageReply ? "" : head;
    },
  };
};

//test
router.post("/test", async (req, res) => {
  try {
    const thread = new Thread({
      threadId: "46564sadbh",
      title: "hello",
    });
    const response = await thread.save();
    res.send(response);
  } catch (err) {
    console.log(err);
    res.status(500).json({ err: "Failed to save in DB" });
  }
});

//Get all threads
router.get("/thread", async (req, res) => {
  try {
    const threads = await Thread.find({}).sort({ updatedAt: -1 });
    res.json(threads);
  } catch (err) {
    console.log(err);
    res.status(500).json({ err: "Failed to fetch threads" });
  }
});

router.get("/thread/:threadId", async (req, res) => {
  const { thredId } = req.params;

  try {
    const thread = await Thread.findOne({ threadId });

    if (!thread) {
      res.status(404).json({ error: "Thread not found" });
    }
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "Failed to fetch chat" });
  }
});

router.delete("/thread/:threadId", async (req, res) => {
  const { threadId } = req.params;
  try {
    const deletedThread = await Thread.findOneAndDelete({threadId});
    console.log(deletedThread);
    if (!deletedThread) {
      res.status(404).json({ error: "Thread not found" });
    }
    res.status(200).json({ success: "Thread deleted successffully" });
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "Failed to delete thread" });
  }
});

router.post("/chat", async (req, res) => {
  const { threadId, message } = req.body;

  if (!threadId || !message) {
    return res.status(400).json({ error: "missing required fields" });
  }

  try {
    let thread = await Thread.findOne({ threadId });

    if (!thread) {
      thread = new Thread({ threadId, title: message, messages: [] });
    }

    // The last interaction id is what gives Gemini the earlier context.
    const { text, interactionId } = await getGeminiAPIResponse(
      message,
      thread.interactionId,
    );

    const imagePrompt = extractImagePrompt(text);
    const reply = imagePrompt ? `Generated an image: ${imagePrompt}` : text;

    if (imagePrompt) {
      const { dataUrl } = await generateImage(imagePrompt);
      thread.messages.push({ role: "user", content: message });
      thread.messages.push({ role: "assistant", content: reply });
      thread.interactionId = interactionId ?? thread.interactionId;
      thread.updatedAt = new Date();
      await thread.save();
      return res.json({ reply, imagePrompt, dataUrl });
    }

    thread.messages.push({ role: "user", content: message });
    thread.messages.push({ role: "assistant", content: reply });
    thread.interactionId = interactionId ?? thread.interactionId;
    thread.updatedAt = new Date();

    await thread.save();
    res.json({ reply });
  } catch (err) {
    console.log("chat error:", err.message);
    res.status(500).json({ error: err.message || "something went wrong" });
  }
});

// Streaming version of /chat. Text is pushed to the client piece by piece so the
// user starts reading immediately instead of waiting for the full answer.
router.post("/chat/stream", async (req, res) => {
  const { threadId, message } = req.body;

  if (!threadId || !message) {
    return res.status(400).json({ error: "missing required fields" });
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    // Stops proxies from holding the response back until it is complete.
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders?.();

  const send = (payload) => {
    // The browser may have navigated away mid-reply; writing then throws.
    if (!res.writableEnded) res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  try {
    let thread = await Thread.findOne({ threadId });
    if (!thread) {
      thread = new Thread({ threadId, title: message, messages: [] });
    }

    const gate = createPrefixGate(IMAGE_PROMPT_PREFIX);
    let reply = "";

    const { interactionId } = await streamGeminiResponse(
      message,
      thread.interactionId,
      (chunk) => {
        reply += chunk;
        const safe = gate.push(chunk);
        if (safe) send({ type: "delta", text: safe });
      },
    );

    // Anything held back while waiting to identify an image request.
    const tail = gate.flush();
    if (tail) send({ type: "delta", text: tail });

    const imagePrompt = extractImagePrompt(reply);

    if (imagePrompt) {
      // The marker text is an internal instruction, so it is replaced with a
      // short caption in the transcript.
      reply = `Generated an image: ${imagePrompt}`;

      send({ type: "imageStart", prompt: imagePrompt });

      try {
        const { dataUrl } = await generateImage(imagePrompt, (percent) =>
          send({ type: "imageProgress", percent }),
        );
        send({ type: "image", dataUrl });
      } catch (imgErr) {
        console.log("image error:", imgErr.message);
        send({
          type: "imageError",
          error: imgErr.message || "Could not generate the image",
        });
      }
    }

    thread.messages.push({ role: "user", content: message });
    thread.messages.push({ role: "assistant", content: reply });
    thread.interactionId = interactionId ?? thread.interactionId;
    thread.updatedAt = new Date();

    await thread.save();
    send({ type: "done" });
  } catch (err) {
    console.log("stream error:", err.message);
    send({ type: "error", error: err.message || "something went wrong" });
  }

  res.end();
});

export default router;
