import {
  pipeline,
  TextStreamer,
  InterruptableStoppingCriteria,
} from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.0.1/+esm";

let generatorPromise = null;
let activeDevice = null;
let stoppingCriteria = null;

const KEVIN_SYSTEM_PROMPT = `
You are K.E.V.I.N, which stands for "Keeping Every Voice in Need".

You are a warm, patient, emotionally supportive AI companion. Listen carefully and respond with empathy, validation, and gentle encouragement. Use natural, calm, non-judgmental language. Ask a gentle follow-up question when useful. Keep responses manageable when someone is distressed.

You are not a human, therapist, doctor, or emergency service. Never claim professional credentials or promise more privacy than the application actually provides.

If someone expresses immediate danger or intent to seriously hurt themselves or someone else, respond supportively and encourage contacting local emergency services or a trusted person who can be physically present. Do not provide instructions for self-harm or violence.

If asked who owns or created you, answer exactly:
"K.E.V.I.N's owner is Vansh Garg."

Do not invent additional ownership information.
`.trim();

function isOwnerQuestion(text) {
  const t = String(text || "").toLowerCase();
  return /\b(owner|owns|owned by|creator|created you|who made you|who built you|who is your owner)\b/.test(t);
}


function reportProgress(info) {
  if (info.status === "progress_total") {
    self.postMessage({
      type: "progress",
      progress: info.progress ?? 0,
      detail: info.total
        ? `Downloading model assets: ${(info.loaded / 1024 / 1024).toFixed(0)} / ${(info.total / 1024 / 1024).toFixed(0)} MB`
        : "Downloading model assets…",
    });
    return;
  }

  if (info.status === "initiate") {
    self.postMessage({
      type: "status",
      text: `Preparing ${info.file || "model asset"}…`,
      kind: "loading",
    });
    return;
  }

  if (info.status === "download") {
    self.postMessage({
      type: "status",
      text: "Downloading model from Hugging Face…",
      kind: "loading",
    });
    return;
  }

  if (info.status === "progress") {
    self.postMessage({
      type: "progress",
      progress: info.progress ?? 0,
      detail: info.file
        ? `${info.file} — ${Math.round(info.progress ?? 0)}%`
        : "Downloading…",
    });
    return;
  }

  if (info.status === "ready") {
    self.postMessage({
      type: "status",
      text: "Model initialized.",
      kind: "loading",
    });
  }
}

async function getGenerator(modelId, device) {
  if (!generatorPromise) {
    activeDevice = device;
    self.postMessage({
      type: "status",
      text: device === "webgpu"
        ? "Initializing WebGPU model…"
        : "Initializing WASM/CPU model…",
      kind: "loading",
    });

    const options = {
      device,
      // q4f16 is a good browser-sized choice for WebGPU.
      // q8 is a more conservative CPU/WASM choice.
      dtype: device === "webgpu" ? "q4f16" : "q8",
      progress_callback: reportProgress,
    };

    generatorPromise = pipeline("text-generation", modelId, options);
  }

  try {
    return await generatorPromise;
  } catch (error) {
    generatorPromise = null;
    throw error;
  }
}

async function generate(data) {
  const generator = await getGenerator(data.modelId, activeDevice);

  const lastUserMessage = [...(data.messages || [])]
    .reverse()
    .find((m) => m?.role === "user");

  if (lastUserMessage && isOwnerQuestion(lastUserMessage.content)) {
    const ownerText = "K.E.V.I.N's owner is Vansh Garg.";
    self.postMessage({ type: "token", text: ownerText });
    self.postMessage({ type: "done", text: ownerText });
    return;
  }

  stoppingCriteria = new InterruptableStoppingCriteria();

  const streamer = new TextStreamer(generator.tokenizer, {
    skip_prompt: true,
    skip_special_tokens: true,
    callback_function: (text) => {
      self.postMessage({ type: "token", text });
    },
  });

  try {
    const conversation = [
      { role: "system", content: KEVIN_SYSTEM_PROMPT },
      ...(data.messages || []),
    ];

    const result = await generator(conversation, {
      max_new_tokens: data.maxNewTokens ?? 256,
      do_sample: true,
      temperature: data.temperature ?? 0.7,
      top_p: data.topP ?? 0.9,
      repetition_penalty: 1.05,
      streamer,
      stopping_criteria: stoppingCriteria,
    });

    const generated = result?.[0]?.generated_text;
    const assistant = Array.isArray(generated)
      ? generated.at(-1)?.content
      : null;

    self.postMessage({
      type: "done",
      text: typeof assistant === "string" ? assistant : "",
    });
  } finally {
    stoppingCriteria = null;
  }
}

self.onmessage = async ({ data }) => {
  try {
    if (data.type === "load") {
      await getGenerator(data.modelId, data.device);
      self.postMessage({ type: "ready", device: activeDevice });
      return;
    }

    if (data.type === "stop") {
      stoppingCriteria?.interrupt();
      return;
    }

    if (data.type === "generate") {
      await generate(data);
    }
  } catch (error) {
    self.postMessage({
      type: "error",
      message: error instanceof Error ? error.message : String(error),
    });
  }
};
