# K.E.V.I.N — Keeping Every Voice in Need

A static, browser-only emotional-support AI chat app using:

- HTML/CSS/vanilla JavaScript
- Transformers.js 4.0.1
- `HuggingFaceTB/SmolLM2-360M-Instruct`
- WebGPU when available
- WASM/CPU fallback
- No application backend
- No API key
- No model files in this repository

## How it works

The page creates a Web Worker. The worker imports Transformers.js from jsDelivr and calls:

```js
pipeline("text-generation", "HuggingFaceTB/SmolLM2-360M-Instruct", {
  device: "webgpu",
  dtype: "q4f16"
});
```

When WebGPU is unavailable, it uses:

```js
{
  device: "wasm",
  dtype: "q8"
}
```

Transformers.js downloads the model assets directly from the Hugging Face Hub at runtime and caches browser-loadable assets. The model is not included in this repository.

The chat uses the model's native chat template through the text-generation pipeline.

## K.E.V.I.N identity

K.E.V.I.N means:

**Keeping Every Voice in Need**

The assistant is configured with a warm, patient, non-judgmental emotional-support persona.

If asked who owns or created K.E.V.I.N, it responds:

`K.E.V.I.N's owner is Vansh Garg.`

The identity/persona instruction is sent to the local model as a system message. It does not require a backend.

## Local development

Because browser workers and module imports are most reliable over HTTP(S), serve the folder with any static HTTP server.

For example, if you have Node installed:

```bash
npx serve .
```

Then open the local URL shown by the command.

You do not need a backend server. The local server is only serving static files during development.

## Vercel

This project has no API routes and no server-side inference.

You can either:

1. Push the folder to GitHub and import the repository into Vercel.
2. Or deploy the repository from the Vercel dashboard.

No environment variables are required.

No build command is required. Vercel can serve `index.html` as a static site.

## Browser support

### Desktop Chrome / Chromium

Use a recent Chrome/Chromium release for WebGPU. If WebGPU is unavailable or the adapter cannot be created, the app automatically uses WASM/CPU.

### Android Chrome

Use a recent Chrome release and a device with enough free memory. The model download and runtime memory requirements can be significant. If WebGPU is not available on a particular device/browser configuration, the app uses WASM/CPU.

### Safari

Recent Safari versions may support WebGPU, but support is version/device dependent. The WASM fallback is used when WebGPU cannot be used.

## Model download size

The Hugging Face repository contains several ONNX variants. This app requests:

- WebGPU: `q4f16`
- WASM/CPU: `q8`

The browser only downloads the assets required by the selected runtime/dtype, rather than copying the model into this GitHub repository.

## Troubleshooting

### "WebGPU unavailable"

This is not fatal. The app switches to WASM/CPU.

If you want WebGPU:

- Update Chrome/Chromium.
- Update GPU drivers on desktop.
- Make sure hardware acceleration is enabled.
- Avoid private/restricted browser profiles that disable GPU features.
- On Safari, update to a recent OS/browser combination.

### Android is slow or crashes

The CPU/WASM path can be substantially slower than WebGPU.

Try:

- Closing other memory-heavy tabs/apps.
- Using a recent Chrome version.
- Ensuring several hundred MB of free device memory/storage.
- Reloading after the initial model cache is complete.
- Using a device with WebGPU support.

If the page reloads during model initialization, the device may not have enough available memory for the selected runtime.

### Model loading error

Open DevTools/Chrome remote debugging and inspect the console.

Common causes:

- Temporary Hugging Face/CDN connectivity issue.
- Browser storage/cache restrictions.
- An extension blocking model or CDN requests.
- Insufficient memory.
- Unsupported browser/runtime.

Refresh and try again. If a partially cached asset is corrupted, clearing the site's stored data and reloading can force a clean download.

### CORS / local file errors

Do not open `index.html` with a `file://` URL. Serve the folder over HTTP during development.

### Hugging Face model changes

This app intentionally uses the model ID:

`HuggingFaceTB/SmolLM2-360M-Instruct`

and lets Transformers.js resolve the runtime-compatible ONNX assets from the repository. The model files are never committed to this project.

## Security/privacy note

Inference is local to the browser after the model assets have been downloaded. The app itself has no AI backend and no API key.

The browser still needs network access for the first model download and for the Transformers.js CDN. After assets are cached, subsequent loads can be much faster, subject to browser cache/storage policies.


## Voice input and output

K.E.V.I.N includes optional browser-native voice features.

### Voice input

The **Voice** button uses the browser's Web Speech recognition API when available.

- The browser asks for microphone permission.
- Speech is converted to text.
- The text is placed in the message box.
- The user can review/edit it before sending.
- No separate speech-to-text backend is used by this application.

Browser support varies. Chromium-based browsers generally provide the broadest support.

### Voice output

When **Voice On** is enabled, K.E.V.I.N reads completed responses using the browser's native `speechSynthesis` API.

The voice is generated by the browser/operating system rather than by the SmolLM2 model.

Voice output can be disabled at any time.

### Privacy note

Voice input availability and processing behavior can vary by browser implementation. This application does not add a speech API server of its own. Review the browser's microphone permissions and speech-recognition behavior for the browser/device you use.



## Version notes

- Voice input removed.
- Voice output removed.
- ElevenLabs integration removed.
- Added a K.E.V.I.N favicon.
- Chat inference remains browser-side with Transformers.js.
- The Stop button terminates the active inference worker and restarts it using cached model assets when possible.
