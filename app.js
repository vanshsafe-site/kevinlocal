const MODEL_ID = "HuggingFaceTB/SmolLM2-360M-Instruct";

const els = {
  loadButton: document.querySelector("#loadButton"),
  clearButton: document.querySelector("#clearButton"),
  statusBadge: document.querySelector("#statusBadge"),
  deviceBadge: document.querySelector("#deviceBadge"),
  loadingPanel: document.querySelector("#loadingPanel"),
  loadingText: document.querySelector("#loadingText"),
  progressText: document.querySelector("#progressText"),
  progressBar: document.querySelector("#progressBar"),
  loadingDetail: document.querySelector("#loadingDetail"),
  chat: document.querySelector("#chat"),
  emptyState: document.querySelector("#emptyState"),
  composer: document.querySelector("#composer"),
  messageInput: document.querySelector("#messageInput"),
  sendButton: document.querySelector("#sendButton"),
  stopButton: document.querySelector("#stopButton"),
};

let worker = null;
let modelReady = false;
let generating = false;
let messages = [];
let currentAssistantText = "";
let currentAssistantBody = null;
let selectedDevice = "wasm";

function setStatus(text, kind = "idle") {
  els.statusBadge.textContent = text;
  els.statusBadge.className = `status-badge ${kind}`;
}

function setProgress(value, detail = "") {
  const safe = Math.max(0, Math.min(100, Number(value) || 0));
  els.progressBar.style.width = `${safe}%`;
  els.progressText.textContent = `${Math.round(safe)}%`;
  if (detail) els.loadingDetail.textContent = detail;
}

function showLoading(show) {
  els.loadingPanel.classList.toggle("hidden", !show);
}

function setChatEnabled(enabled) {
  els.messageInput.disabled = !enabled || generating;
  els.sendButton.disabled = !enabled || generating;
}

function scrollToBottom() {
  els.chat.scrollTop = els.chat.scrollHeight;
}

function removeEmptyState() {
  els.emptyState?.remove();
}

function addMessage(role, content = "") {
  removeEmptyState();

  const wrapper = document.createElement("div");
  wrapper.className = `message ${role}`;

  const bubble = document.createElement("div");
  bubble.className = "message-bubble";

  const label = document.createElement("div");
  label.className = "message-label";
  label.textContent = role === "user" ? "You" : "K.E.V.I.N";

  const body = document.createElement("div");
  body.className = "message-body";
  body.textContent = content;

  bubble.append(label, body);
  wrapper.appendChild(bubble);
  els.chat.appendChild(wrapper);
  scrollToBottom();

  return { wrapper, body };
}

function setGeneratingUI(active) {
  generating = active;
  els.stopButton.classList.toggle("hidden", !active);
  els.sendButton.classList.toggle("hidden", active);
  els.sendButton.disabled = active || !modelReady;
  els.messageInput.disabled = active || !modelReady;
}

function makeWorker() {
  if (worker) return worker;

  worker = new Worker("./worker.js", { type: "module" });

  worker.onmessage = ({ data }) => {
    switch (data.type) {
      case "status":
        setStatus(data.text, data.kind || "loading");
        if (data.text) els.loadingText.textContent = data.text;
        break;

      case "progress":
        setProgress(data.progress ?? 0, data.detail || "");
        break;

      case "ready":
        modelReady = true;
        showLoading(false);
        setStatus("Ready", "ready");
        els.deviceBadge.textContent = `Backend: ${data.device}`;
        els.loadButton.textContent = "Model Ready";
        els.loadButton.disabled = true;
        setChatEnabled(true);
        els.messageInput.focus();
        break;

      case "token":
        if (currentAssistantBody) {
          currentAssistantText += data.text;
          currentAssistantBody.textContent += data.text;
          scrollToBottom();
        }
        break;

      case "done": {
        const finalText = (
          data.text ||
          currentAssistantText ||
          currentAssistantBody?.textContent ||
          ""
        ).trim();

        if (currentAssistantBody) {
          currentAssistantBody.querySelector(".cursor")?.remove();
          if (finalText) {
            currentAssistantBody.textContent = finalText;
            messages.push({ role: "assistant", content: finalText });
          }
        }

        currentAssistantText = "";
        currentAssistantBody = null;
        setGeneratingUI(false);
        setStatus("Ready", "ready");
        break;
      }

      case "error":
        showLoading(false);
        modelReady = false;
        setGeneratingUI(false);
        els.loadButton.disabled = false;
        els.loadButton.textContent = "Load Model";
        setStatus("Error", "error");
        addError(data.message);
        break;
    }
  };

  worker.onerror = (event) => {
    if (!generating) {
      setStatus("Worker error", "error");
      addError(event.message || "The browser worker failed.");
    }
  };

  return worker;
}

function addError(message) {
  removeEmptyState();

  const el = document.createElement("div");
  el.className = "message assistant";

  const bubble = document.createElement("div");
  bubble.className = "message-bubble";

  const label = document.createElement("div");
  label.className = "message-label";
  label.textContent = "Error";

  const body = document.createElement("div");
  body.textContent = message;

  bubble.append(label, body);
  el.appendChild(bubble);
  els.chat.appendChild(el);
  scrollToBottom();
}

async function hasWebGPU() {
  if (!("gpu" in navigator)) return false;

  try {
    const adapter = await navigator.gpu.requestAdapter();
    return !!adapter;
  } catch {
    return false;
  }
}

async function loadModel() {
  if (modelReady) return;

  showLoading(true);
  setStatus("Checking browser support", "loading");
  els.loadButton.disabled = true;
  els.loadingText.textContent = "Checking browser support…";
  setProgress(0, "WebGPU will be used when the browser exposes a usable adapter.");

  const useWebGPU = await hasWebGPU();
  selectedDevice = useWebGPU ? "webgpu" : "wasm";

  els.deviceBadge.textContent = `Backend: ${selectedDevice.toUpperCase()}`;
  els.loadingText.textContent = useWebGPU
    ? "WebGPU available — loading with GPU acceleration…"
    : "WebGPU unavailable — using WASM/CPU fallback…";

  makeWorker().postMessage({
    type: "load",
    modelId: MODEL_ID,
    device: selectedDevice,
  });
}

function sendMessage() {
  const text = els.messageInput.value.trim();
  if (!text || !modelReady || generating) return;

  els.messageInput.value = "";
  autoResize();

  messages.push({ role: "user", content: text });
  addMessage("user", text);

  const assistant = addMessage("assistant", "");
  assistant.body.innerHTML = '<span class="cursor" aria-hidden="true"></span>';

  currentAssistantBody = assistant.body;
  currentAssistantText = "";

  setGeneratingUI(true);

  worker.postMessage({
    type: "generate",
    messages,
    maxNewTokens: 256,
    temperature: 0.7,
    topP: 0.9,
  });
}

/*
 * A running Transformers.js inference call can keep the worker busy.
 * Terminating the worker guarantees that Stop actually interrupts generation.
 * The model assets remain browser-cached, so the replacement worker can load them again.
 */
function stopGeneration() {
  if (!generating) return;

  const partial = currentAssistantText.trim();

  if (worker) {
    try {
      worker.terminate();
    } catch (_) {}
    worker = null;
  }

  generating = false;
  modelReady = false;

  if (currentAssistantBody) {
    currentAssistantBody.querySelector(".cursor")?.remove();
    if (partial) currentAssistantBody.textContent = partial;
  }

  setGeneratingUI(false);
  setStatus("Stopped — restarting model…", "loading");

  els.loadButton.disabled = true;
  els.loadButton.textContent = "Restarting…";
  showLoading(true);
  els.loadingText.textContent = "Restarting K.E.V.I.N…";
  setProgress(0, "Reusing browser-cached model files when available.");

  setTimeout(() => {
    makeWorker().postMessage({
      type: "load",
      modelId: MODEL_ID,
      device: selectedDevice,
    });
  }, 50);
}

function clearChat() {
  if (generating) stopGeneration();

  currentAssistantBody = null;
  currentAssistantText = "";
  messages = [];

  els.chat.innerHTML = `
    <div id="emptyState" class="empty-state">
      <div class="empty-icon">✦</div>
      <h2>A quiet place to talk</h2>
      <p>Click <b>Load Model</b>, then talk to K.E.V.I.N about what is on your mind. Your conversation is processed locally in your browser.</p>
      <div class="privacy-note">K.E.V.I.N is designed to listen with patience, warmth, and without judgment.</div>
    </div>
  `;
}

function autoResize() {
  const input = els.messageInput;
  input.style.height = "auto";
  input.style.height = `${Math.min(input.scrollHeight, 180)}px`;
}

els.loadButton.addEventListener("click", loadModel);
els.clearButton.addEventListener("click", clearChat);
els.stopButton.addEventListener("click", stopGeneration);

els.composer.addEventListener("submit", (event) => {
  event.preventDefault();
  sendMessage();
});

els.messageInput.addEventListener("input", autoResize);

els.messageInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    sendMessage();
  }
});

setStatus("Not loaded", "idle");
