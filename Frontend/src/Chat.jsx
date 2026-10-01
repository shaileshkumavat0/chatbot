import "./Chat.css";
import { useContext } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { MyContext } from "./MyContext";

function Chat() {
  const { messages, loading } = useContext(MyContext);

  if (messages.length === 0) {
    return (
      <div className="emptyState">
        <div className="emptyIcon" aria-hidden="true">
          <i className="fa-regular fa-comment-dots"></i>
        </div>
        <h2>Start a new chat</h2>
        <p>Ask a question and I&apos;ll get back to you right away.</p>
      </div>
    );
  }

  return (
    <div className="chats">
      {messages.map((msg, i) => {
        const waitingForFirstWord = msg.streaming && !msg.content && !msg.image;

        return (
          <div key={msg.id ?? i} className={msg.role === "user" ? "userDiv" : "assistantDiv"}>
            {msg.role !== "user" && (
              <div className="avatar" aria-hidden="true">
                <i className="fa-solid fa-robot"></i>
              </div>
            )}
            <div
              className={
                msg.failed
                  ? "bubble failed"
                  : waitingForFirstWord
                    ? "bubble typing"
                    : msg.streaming
                      ? "bubble streaming"
                      : "bubble"
              }
            >
              {msg.failed ? (
                <span className="failedText">Message could not be sent.</span>
              ) : msg.role === "assistant" ? (
                waitingForFirstWord ? (
                  <>
                    <span></span>
                    <span></span>
                    <span></span>
                  </>
                ) : (
                  <div className="markdown">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {msg.content}
                    </ReactMarkdown>
                  </div>
                )
              ) : (
                msg.content
              )}

              {msg.image?.done ? (
                <figure className="generatedImage">
                  <img src={msg.image.src} alt={msg.image.prompt || "Generated image"} />
                  <figcaption>{msg.image.prompt}</figcaption>
                </figure>
              ) : msg.image ? (
                <div className="imageProgress">
                  <div className="progressRow">
                    <span>Generating image</span>
                    <span className="progressPercent">{msg.image.percent}%</span>
                  </div>
                  <div
                    className="progressTrack"
                    role="progressbar"
                    aria-valuenow={msg.image.percent}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  >
                    <div
                      className="progressFill"
                      style={{ width: `${Math.max(msg.image.percent, 3)}%` }}
                    ></div>
                  </div>
                  <p className="progressPrompt">{msg.image.prompt}</p>
                </div>
              ) : null}
            </div>
          </div>
        );
      })}

      {loading && !messages.some((m) => m.streaming) && (
        <div className="assistantDiv">
          <div className="avatar" aria-hidden="true">
            <i className="fa-solid fa-robot"></i>
          </div>
          <div className="bubble typing" aria-label="Assistant is typing">
            <span></span>
            <span></span>
            <span></span>
          </div>
        </div>
      )}
    </div>
  );
}

export default Chat;