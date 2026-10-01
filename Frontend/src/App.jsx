import "./App.css";
import ChatWindow from "./ChatWindow.jsx";
import { MyContext } from "./MyContext.jsx";
import { useState } from "react";
import { v1 as uuidv1 } from "uuid";

function App() {
  const [prompt, setPrompt] = useState("");
  const [currThreadId, setCurrThreadId] = useState(uuidv1());
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const providerValues = {
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
  };
  return (
    <div className="app">
      <MyContext.Provider value={providerValues}>
        <ChatWindow></ChatWindow>
      </MyContext.Provider>
    </div>
  );
}

export default App;
