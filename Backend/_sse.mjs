// temporary: capture the raw SSE stream so we can see exactly what is sent
const threadId = "ssetest-" + Date.now();

const run = async (message) => {
  console.log(`\n--- "${message}" ---`);
  const res = await fetch("http://localhost:8080/api/chat/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ threadId, message }),
  });

  console.log("status:", res.status, res.headers.get("content-type"));

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });

    const frames = buf.split("\n\n");
    buf = frames.pop() ?? "";

    for (const f of frames) {
      const line = f.split("\n").find((l) => l.startsWith("data:"));
      if (!line) continue;
      const p = JSON.parse(line.slice(5).trim());
      if (p.type === "delta") console.log("  delta   :", JSON.stringify(p.text.slice(0, 120)));
      else if (p.type === "image") console.log("  image   :", (p.dataUrl.length / 1024).toFixed(0) + " KB");
      else if (p.type === "imageStart") console.log("  imgStart:", JSON.stringify(p.prompt.slice(0, 80)));
      else console.log("  " + p.type + (p.percent !== undefined ? " " + p.percent + "%" : ""), p.error ? "-> " + p.error : "");
    }
  }
};

await run("give me a random image");
await run("draw a picture of a red sports car");
await run("what is 2+2?");