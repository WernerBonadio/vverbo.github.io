(() => {
  const email = "werner.bonadio@wernerbot.com";
  const emailReveal = document.getElementById("email-reveal");
  const copyEmail = document.getElementById("copy-email");
  const closeEmail = document.getElementById("close-email");

  document.querySelectorAll("[data-contact-open]").forEach((button) => {
    button.addEventListener("click", () => {
      emailReveal.hidden = false;
    });
  });

  closeEmail.addEventListener("click", () => {
    emailReveal.hidden = true;
  });

  emailReveal.addEventListener("click", (event) => {
    if (event.target === emailReveal) emailReveal.hidden = true;
  });

  copyEmail.addEventListener("click", async () => {
    await navigator.clipboard.writeText(email);
    copyEmail.textContent = "Copied";
    window.setTimeout(() => {
      copyEmail.textContent = "Copy address";
    }, 1800);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") emailReveal.hidden = true;
  });

  const chatBubble = document.getElementById("webpage-bot");
  const chatPanel = document.getElementById("chat-panel");
  const chatClose = document.getElementById("chat-close");
  const chatForm = document.getElementById("chat-form");
  const chatInput = document.getElementById("chat-text");
  const chatSend = document.getElementById("chat-send");
  const chatMessages = document.getElementById("chat-messages");
  let sending = false;

  function openChat() {
    chatPanel.hidden = false;
    voicePanel.hidden = true;
    chatInput.focus();
  }

  function toggleChat() {
    if (chatPanel.hidden) openChat();
    else chatPanel.hidden = true;
  }

  function addMessage(text, role, id) {
    const message = document.createElement("div");
    message.className = role === "user" ? "user-message" : "bot-message";
    if (id) message.id = id;
    if (role === "bot" && window.marked) message.innerHTML = window.marked.parse(text);
    else message.textContent = text;
    chatMessages.appendChild(message);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    return message;
  }

  chatBubble.addEventListener("click", toggleChat);
  chatClose.addEventListener("click", () => {
    chatPanel.hidden = true;
  });

  chatForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const text = chatInput.value.trim();
    if (!text || sending) return;
    addMessage(text, "user");
    chatInput.value = "";
    sending = true;
    chatSend.disabled = true;
    const reply = addMessage("Thinking…", "bot");
    let fullText = "";

    try {
      const response = await fetch("https://wernerbotapp-218955992134.europe-west4.run.app/chat/stream", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "text/event-stream"
        },
        body: JSON.stringify({ message: text })
      });
      if (!response.ok || !response.body) throw new Error("The assistant is temporarily unavailable.");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() || "";

        for (const item of events) {
          const dataLine = item.split("\n").find((line) => line.startsWith("data: "));
          if (!dataLine) continue;
          let payload;
          try {
            payload = JSON.parse(dataLine.slice(6));
          } catch {
            continue;
          }
          if (payload.type === "delta" && payload.text) {
            fullText += payload.text;
            if (window.marked) reply.innerHTML = window.marked.parse(fullText);
            else reply.textContent = fullText;
          }
          if (payload.type === "error") throw new Error(payload.message);
          chatMessages.scrollTop = chatMessages.scrollHeight;
        }
      }
    } catch (error) {
      reply.textContent = error.message || "The assistant is temporarily unavailable.";
    } finally {
      sending = false;
      chatSend.disabled = false;
    }
  });

  const voiceBubble = document.getElementById("voice-bot");
  const voicePanel = document.getElementById("voice-panel");
  const voiceClose = document.getElementById("voice-close");
  const voiceStart = document.getElementById("voice-start");
  const voiceStop = document.getElementById("voice-stop");
  const voiceStatus = document.getElementById("voice-status");
  const voiceError = document.getElementById("voice-error");
  const voiceOrb = document.getElementById("voice-orb");
  const voiceAudio = document.getElementById("voice-audio");
  let peer = null;
  let mic = null;

  function setVoiceStatus(status) {
    voiceStatus.textContent = status;
    voiceOrb.classList.toggle("voice-listening", status === "listening");
  }

  function stopVoice() {
    if (peer) peer.close();
    peer = null;
    if (mic) mic.getTracks().forEach((track) => track.stop());
    mic = null;
    voiceAudio.srcObject = null;
    setVoiceStatus("idle");
    voiceStart.disabled = false;
    voiceStop.disabled = true;
  }

  async function startVoice() {
    try {
      voiceError.textContent = "";
      setVoiceStatus("starting…");
      voiceStart.disabled = true;

      const tokenResponse = await fetch(
        "https://wernerbotapp-audio-218955992134.europe-west4.run.app/realtime/token",
        { method: "POST" }
      );
      if (!tokenResponse.ok) throw new Error("Voice connection is unavailable.");
      const token = await tokenResponse.json();
      if (!token.value) throw new Error("Voice connection is unavailable.");

      mic = await navigator.mediaDevices.getUserMedia({ audio: true });
      peer = new RTCPeerConnection();
      peer.addTrack(mic.getTracks()[0]);
      peer.ontrack = async (event) => {
        voiceAudio.srcObject = event.streams[0];
        await voiceAudio.play().catch(() => undefined);
      };

      const channel = peer.createDataChannel("oai-events");
      channel.addEventListener("open", () => {
        setVoiceStatus("listening");
        voiceStop.disabled = false;
      });

      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      const sdpResponse = await fetch("https://api.openai.com/v1/realtime/calls", {
        method: "POST",
        body: offer.sdp,
        headers: {
          "Authorization": `Bearer ${token.value}`,
          "Content-Type": "application/sdp"
        }
      });
      if (!sdpResponse.ok) throw new Error("Voice connection is unavailable.");
      await peer.setRemoteDescription({ type: "answer", sdp: await sdpResponse.text() });
    } catch (error) {
      stopVoice();
      setVoiceStatus("error");
      voiceError.textContent = error.message || "Voice connection is unavailable.";
    }
  }

  voiceBubble.addEventListener("click", () => {
    voicePanel.hidden = !voicePanel.hidden;
    chatPanel.hidden = true;
  });
  voiceClose.addEventListener("click", () => {
    stopVoice();
    voicePanel.hidden = true;
  });
  voiceStart.addEventListener("click", startVoice);
  voiceStop.addEventListener("click", stopVoice);

  function openFromHash() {
    if (window.location.hash === "#webpage-bot") openChat();
    if (window.location.hash === "#voice-bot") {
      voicePanel.hidden = false;
      chatPanel.hidden = true;
    }
  }

  window.addEventListener("hashchange", openFromHash);
  openFromHash();
})();
