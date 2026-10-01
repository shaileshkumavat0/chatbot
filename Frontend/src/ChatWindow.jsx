import "./ChatWindow.css";
import Chat from "./Chat.jsx";
import { useContext, useEffect, useRef } from "react";
import { v4 as uuidv4 } from "uuid";
import { MyContext } from "./MyContext.jsx";

function ChatWindow() {
  const {
    prompt,
    setPrompt,
    currThreadId,
    setCurrThreadId,
    messages,
    setMessages,
    loading,
    setLoading,
    error,
    setError,
  } = useContext(MyContext);

  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  // keep the latest message in view
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, loading]);

  // focus the input on mount and after a reply
  useEffect(() => {
    if (!loading) inputRef.current?.focus();
  }, [loading]);

  // grow the input with the content, up to a limit
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [prompt]);

  const startNewChat = () => {
    setCurrThreadId(uuidv4());
    setMessages([]);
    setPrompt("");
    setError(null);
  };

  const getReply = async () => {
    const message = prompt.trim();
    if (!message || loading) return;

    setPrompt("");
    setError(null);

    // The assistant bubble is added up front and filled in as text arrives, so
    // the reply appears in place rather than popping in at the end.
    const replyId = uuidv4();
    setMessages((prev) => [
      ...prev,
      { id: uuidv4(), role: "user", content: message },
      { id: replyId, role: "assistant", content: "", streaming: true },
    ]);
    setLoading(true);

    const patchReply = (patch) => {
      setMessages((prev) =>
        prev.map((m) => (m.id === replyId ? { ...m, ...patch } : m)),
      );
    };

    const appendToReply = (chunk) => {
      setMessages((prev) =>
        prev.map((m) => (m.id === replyId ? { ...m, content: m.content + chunk } : m)),
      );
    };

    const finishReply = (patch) => {
      patchReply({ streaming: false, ...patch });
    };

    try {
      const response = await fetch("http://localhost:8080/api/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, threadId: currThreadId }),
      });

      if (!response.ok || !response.body) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || "Something went wrong");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // SSE frames are separated by a blank line; the tail may be partial.
        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";

        for (const frame of frames) {
          const line = frame.split("\n").find((l) => l.startsWith("data:"));
          if (!line) continue;

          const payload = JSON.parse(line.slice(5).trim());

          if (payload.type === "delta") appendToReply(payload.text);
          else if (payload.type === "imageStart") {
            patchReply({ image: { prompt: payload.prompt, percent: 0, done: false } });
          } else if (payload.type === "imageProgress") {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === replyId && m.image
                  ? { ...m, image: { ...m.image, percent: payload.percent } }
                  : m,
              ),
            );
          } else if (payload.type === "image") {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === replyId
                  ? {
                      ...m,
                      content: m.content || "Here is the image you asked for.",
                      image: { prompt: m.image?.prompt ?? "", src: payload.dataUrl, done: true },
                    }
                  : m,
              ),
            );
          } else if (payload.type === "imageError") {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === replyId
                  ? {
                      ...m,
                      image: null,
                      content: m.content || `Image could not be generated: ${payload.error}`,
                    }
                  : m,
              ),
            );
          } else if (payload.type === "error") throw new Error(payload.error);
        }
      }

      finishReply({});
    } catch (err) {
      // Keep any text that already streamed in, otherwise mark it as failed.
      setMessages((prev) =>
        prev.map((m) =>
          m.id === replyId
            ? { ...m, streaming: false, ...(m.content ? {} : { failed: true }) }
            : m,
        ),
      );
      setError(err.message || "Could not reach the server");
    } finally {
      setLoading(false);
    }
  };

  const onKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      getReply();
    }
  };

  return (
    <div className="chatWindow">
      <header className="topbar">
        <div className="brand">
          <span className="brandDot" aria-hidden="true"></span>
          <h1>Chatbot</h1>
        </div>
        <button className="newChatBtn" onClick={startNewChat} type="button">
          New Chat
        </button>
      </header>

      <main className="messages" ref={scrollRef}>
        <Chat />
      </main>

      <div className="composer">
        {error && <p className="error">{error}</p>}

        <div className="chatInput">
          <textarea
            ref={inputRef}
            rows={1}
            placeholder="Send a message"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={onKeyDown}
          />
          <button
            id="submit"
            type="button"
            onClick={getReply}
            disabled={!prompt.trim() || loading}
            aria-label="Send message"
          >
            <i className="fa-solid fa-arrow-up" aria-hidden="true"></i>
          </button>
        </div>

        <p className="hint">Enter to send · Shift + Enter for a new line</p>
      </div>
    </div>
  );
}

export default ChatWindow;