(() => {
  const locale = document.documentElement.lang.slice(0, 2).toLowerCase();
  const messages = {
    en: {
      copied: "Copied",
      copyAddress: "Copy address",
      thinking: "Thinking…",
      assistantUnavailable: "The assistant is temporarily unavailable.",
      voiceUnavailable: "Voice connection is unavailable.",
      voiceStatus: { idle: "idle", starting: "starting…", listening: "listening", error: "error" }
    },
    it: {
      copied: "Copiato",
      copyAddress: "Copia indirizzo",
      thinking: "Sto pensando…",
      assistantUnavailable: "L’assistente è temporaneamente non disponibile.",
      voiceUnavailable: "La connessione vocale non è disponibile.",
      voiceStatus: { idle: "inattivo", starting: "avvio…", listening: "in ascolto", error: "errore" }
    },
    de: {
      copied: "Kopiert",
      copyAddress: "Adresse kopieren",
      thinking: "Denke nach…",
      assistantUnavailable: "Der Assistent ist vorübergehend nicht verfügbar.",
      voiceUnavailable: "Die Sprachverbindung ist nicht verfügbar.",
      voiceStatus: { idle: "inaktiv", starting: "wird gestartet…", listening: "hört zu", error: "Fehler" }
    }
  };
  const ui = messages[locale] || messages.en;
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
    copyEmail.textContent = ui.copied;
    window.setTimeout(() => {
      copyEmail.textContent = ui.copyAddress;
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

  const chatSessionKey = "wernerbot_web_session_id";
  let chatSessionId;
  try {
    chatSessionId = window.localStorage.getItem(chatSessionKey);
    if (!chatSessionId) {
      chatSessionId = window.crypto.randomUUID();
      window.localStorage.setItem(chatSessionKey, chatSessionId);
    }
  } catch {
    chatSessionId = window.crypto.randomUUID();
  }

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
    const reply = addMessage(ui.thinking, "bot");
    let fullText = "";

    try {
      const response = await fetch("https://wernerbotapp-218955992134.europe-west4.run.app/chat/stream", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "text/event-stream"
        },
        body: JSON.stringify({ message: text, session_id: chatSessionId })
      });
      if (!response.ok || !response.body) throw new Error(ui.assistantUnavailable);

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
          if (payload.type === "error") throw new Error(payload.message || ui.assistantUnavailable);
          chatMessages.scrollTop = chatMessages.scrollHeight;
        }
      }
    } catch (error) {
      reply.textContent = error.message || ui.assistantUnavailable;
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

  function setVoiceStatus(state) {
    voiceStatus.dataset.state = state;
    voiceStatus.textContent = ui.voiceStatus[state] || state;
    voiceOrb.classList.toggle("voice-listening", state === "listening");
  }

  setVoiceStatus("idle");

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
      if (!tokenResponse.ok) throw new Error(ui.voiceUnavailable);
      const token = await tokenResponse.json();
      if (!token.value) throw new Error(ui.voiceUnavailable);

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
      if (!sdpResponse.ok) throw new Error(ui.voiceUnavailable);
      await peer.setRemoteDescription({ type: "answer", sdp: await sdpResponse.text() });
    } catch (error) {
      stopVoice();
      setVoiceStatus("error");
      voiceError.textContent = error.message || ui.voiceUnavailable;
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
