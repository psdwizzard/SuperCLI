const state = require('./state');

let inputField = null;
let numberedListBtn = null;
let sendCommandCb = null;

// --- Mic / Whisper Integration ---
const WHISPER_ENDPOINT = 'http://localhost:8000/transcribe';
const WHISPER_HEALTH = 'http://localhost:8000/health';

let micMediaRecorder = null;
let micAudioChunks = [];
let micStream = null;
let micActive = false;
let micStarting = false;
let micRecordingStartTime = 0;
let micMonitorContext = null;
let micMonitorAnalyser = null;
let micMonitorSource = null;
let micMonitorRaf = null;
let micDetectedSignal = false;

function setMicStatus(message, color = '#858585') {
  const info = document.getElementById('inputInfo');
  if (!info) return;
  info.textContent = message;
  info.style.color = color;
}

function toggleMic() {
  if (micActive) {
    stopMic();
  } else {
    startMic();
  }
}

function releaseMediaStream() {
  if (micStream) {
    try {
      for (const track of micStream.getTracks()) {
        track.stop();
      }
    } catch (_) { /* ignore */ }
    micStream = null;
  }
}

function stopMicSignalMonitor() {
  if (micMonitorRaf) {
    cancelAnimationFrame(micMonitorRaf);
    micMonitorRaf = null;
  }
  if (micMonitorSource) {
    try { micMonitorSource.disconnect(); } catch (_) {}
    micMonitorSource = null;
  }
  if (micMonitorAnalyser) {
    try { micMonitorAnalyser.disconnect(); } catch (_) {}
    micMonitorAnalyser = null;
  }
  if (micMonitorContext) {
    try { micMonitorContext.close(); } catch (_) {}
    micMonitorContext = null;
  }
}

function startMicSignalMonitor(stream) {
  stopMicSignalMonitor();
  micDetectedSignal = false;

  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return;

  try {
    micMonitorContext = new AudioCtx();
    micMonitorSource = micMonitorContext.createMediaStreamSource(stream);
    micMonitorAnalyser = micMonitorContext.createAnalyser();
    micMonitorAnalyser.fftSize = 2048;
    micMonitorSource.connect(micMonitorAnalyser);

    const samples = new Uint8Array(micMonitorAnalyser.fftSize);
    const signalThreshold = 0.004;
    const tick = () => {
      if (!micMonitorAnalyser || !micActive) return;
      micMonitorAnalyser.getByteTimeDomainData(samples);
      let sumSquares = 0;
      for (let i = 0; i < samples.length; i++) {
        const normalized = (samples[i] - 128) / 128;
        sumSquares += normalized * normalized;
      }
      const rms = Math.sqrt(sumSquares / samples.length);
      if (rms > signalThreshold) {
        micDetectedSignal = true;
      }
      micMonitorRaf = requestAnimationFrame(tick);
    };
    micMonitorRaf = requestAnimationFrame(tick);
  } catch (_) {
    stopMicSignalMonitor();
  }
}

function insertTranscription(text) {
  const field = document.getElementById('inputField');
  if (!field || !text) return;
  const cursorPos = field.selectionStart;
  const before = field.value.substring(0, cursorPos);
  const after = field.value.substring(field.selectionEnd);
  const sep = before.length > 0 && !before.endsWith(' ') && !before.endsWith('\n') ? ' ' : '';
  field.value = before + sep + text.trim() + after;
  const newPos = cursorPos + sep.length + text.trim().length;
  field.setSelectionRange(newPos, newPos);
  field.dispatchEvent(new Event('input'));
}

function extractTranscript(payload) {
  if (!payload || typeof payload !== 'object') return '';

  const direct = [payload.transcription, payload.text, payload.transcript, payload.result, payload.message];
  for (const value of direct) {
    if (typeof value === 'string' && value.trim()) return value;
  }

  if (payload.data && typeof payload.data === 'object') {
    const nested = [payload.data.transcription, payload.data.text, payload.data.transcript, payload.data.result, payload.data.message];
    for (const value of nested) {
      if (typeof value === 'string' && value.trim()) return value;
    }
  }

  return '';
}

function isNoSpeechTranscript(text) {
  const normalized = String(text || '').trim();
  if (!normalized) return true;
  return /no\s+(speech|voice)\s+(detected|is\s+detected)/i.test(normalized);
}

async function requestTranscription(audioBlob, filename) {
  let last422Detail = '';
  for (const fieldName of ['audio', 'file', 'audio_file']) {
    const formData = new FormData();
    formData.append(fieldName, audioBlob, filename);

    const res = await fetch(WHISPER_ENDPOINT, { method: 'POST', body: formData });
    if (res.status === 422) {
      try { last422Detail = JSON.stringify(await res.json()); } catch (_) { last422Detail = String(await res.text().catch(() => '')); }
      continue;
    }
    if (!res.ok) {
      let errBody = '';
      try { errBody = await res.text(); } catch (_) {}
      throw new Error(`Whisper error ${res.status}: ${errBody.slice(0, 200)}`);
    }

    const data = await res.json();
    return {
      transcript: extractTranscript(data),
      data
    };
  }

  throw new Error(`Server rejected request (422): ${last422Detail}`);
}

async function startMic() {
  if (micStarting) return;
  micStarting = true;
  const micBtn = document.getElementById('micBtn');

  // Check Whisper server health before recording
  try {
    const healthRes = await fetch(WHISPER_HEALTH, { method: 'GET', signal: AbortSignal.timeout(3000) });
    if (!healthRes.ok) {
      setMicStatus('Whisper server not available (health check failed)', '#f48771');
      micStarting = false;
      return;
    }
  } catch (_) {
    setMicStatus('Whisper server not available', '#f48771');
    micStarting = false;
    return;
  }

  // Check Windows mic privacy before attempting getUserMedia
  try {
    const api = require('./api');
    const micCheck = await api.checkMicAccess();
    if (micCheck && micCheck.appDecision === false) {
      setMicStatus('Mic permission denied in SuperCLI prompt', '#f48771');
      if (micBtn) micBtn.title = 'Mic permission denied by app';
      micStarting = false;
      return;
    }
    if (micCheck && (micCheck.status === 'denied' || micCheck.status === 'restricted')) {
      setMicStatus('Mic blocked by Windows ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â Settings > Privacy > Microphone', '#f48771');
      if (micBtn) micBtn.title = 'Mic blocked by Windows privacy settings';
      micStarting = false;
      return;
    }
  } catch (_) { /* non-fatal ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â continue to getUserMedia */ }

  // Request mic access
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    setMicStatus('Media devices not available', '#f48771');
    micStarting = false;
    return;
  }

  try {
    const constraintAttempts = [
      {
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: { ideal: 1 }
        }
      },
      { audio: true }
    ];
    let lastConstraintError = null;
    for (const constraints of constraintAttempts) {
      try {
        micStream = await navigator.mediaDevices.getUserMedia(constraints);
        if (micStream) break;
      } catch (err) {
        lastConstraintError = err;
      }
    }
    if (!micStream) {
      throw lastConstraintError || new Error('Unable to access microphone');
    }
  } catch (err) {
    const msg = (err && err.message) || '';
    if (msg.includes('NotAllowedError') || msg.includes('Permission')) {
      setMicStatus('Mic denied ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â check Windows Settings > Privacy > Microphone', '#f48771');
    } else if (msg.includes('NotFoundError') || msg.includes('Requested device not found')) {
      setMicStatus('No microphone found ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â check audio input device', '#f48771');
    } else {
      setMicStatus('Microphone error: ' + msg.slice(0, 60), '#f48771');
    }
    if (micBtn) micBtn.title = 'Microphone unavailable';
    micStarting = false;
    return;
  }

  // Validate track state (catches Windows mic privacy blocks)
  const audioTrack = micStream.getAudioTracks()[0];
  if (!audioTrack || audioTrack.readyState !== 'live' || !audioTrack.enabled || audioTrack.muted) {
    releaseMediaStream();
    setMicStatus('Mic blocked ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â check Windows mic privacy settings', '#f48771');
    if (micBtn) micBtn.title = 'Mic blocked by OS';
    micStarting = false;
    return;
  }

  // Create MediaRecorder
  micAudioChunks = [];
  const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm';
  try {
    micMediaRecorder = new MediaRecorder(micStream, { mimeType });
  } catch (_) {
    releaseMediaStream();
    setMicStatus('Unable to create audio recorder', '#f48771');
    micStarting = false;
    return;
  }

  micMediaRecorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) {
      micAudioChunks.push(e.data);
    }
  };

  micMediaRecorder.onstop = async () => {
    const micBtn = document.getElementById('micBtn');
    if (micBtn) {
      micBtn.classList.remove('recording');
      micBtn.classList.add('transcribing');
    }
    setMicStatus('Transcribing...', '#dcdcaa');
    stopMicSignalMonitor();
    releaseMediaStream();

    // Reject recordings shorter than 0.5 seconds
    const recordingDuration = Date.now() - micRecordingStartTime;
    if (recordingDuration < 500) {
      if (micBtn) micBtn.classList.remove('transcribing');
      setMicStatus('Recording too short ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â hold mic for at least 1 second', '#f9c97a');
      micAudioChunks = [];
      micMediaRecorder = null;
      setTimeout(() => setMicStatus('Ready', '#858585'), 3000);
      return;
    }

    if (micAudioChunks.length === 0) {
      if (micBtn) micBtn.classList.remove('transcribing');
      setMicStatus('No audio recorded', '#f48771');
      return;
    }

    const rawBlob = new Blob(micAudioChunks, { type: mimeType });
    micAudioChunks = [];

    // Check blob size ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â very small blobs mean mic is silent/blocked
    if (rawBlob.size < 256) {
      if (micBtn) micBtn.classList.remove('transcribing');
      setMicStatus('Mic captured silence ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â check Windows mic privacy settings', '#f48771');
      micMediaRecorder = null;
      setTimeout(() => setMicStatus('Ready', '#858585'), 4000);
      return;
    }
    try {
      let result;
      try {
        result = await requestTranscription(rawBlob, 'recording.webm');
      } catch (webmErr) {
        // If WebM was rejected, try WAV conversion as fallback
        if (webmErr.message && webmErr.message.includes('422')) {
          console.warn('WebM rejected (422), retrying with WAV conversion...');
          setMicStatus('Converting to WAV...', '#dcdcaa');
          const wavBlob = await convertBlobToWav(rawBlob);
          result = await requestTranscription(wavBlob, 'recording.wav');
        } else {
          throw webmErr;
        }
      }
      const { transcript } = result;
      if (!isNoSpeechTranscript(transcript)) {
        insertTranscription(transcript);
        setMicStatus('Transcription inserted', '#4ec9b0');
      } else {
        setMicStatus('No speech detected', '#f9c97a');
      }
    } catch (err) {
      console.error('Whisper transcription error:', err);
      setMicStatus('Transcription failed: ' + (err.message || 'unknown error'), '#f48771');
    }
    if (micBtn) micBtn.classList.remove('transcribing');
    micMediaRecorder = null;
    setTimeout(() => setMicStatus('Ready', '#858585'), 3000);
  };

  micMediaRecorder.onerror = () => {
    const micBtn = document.getElementById('micBtn');
    if (micBtn) {
      micBtn.classList.remove('recording');
      micBtn.classList.remove('transcribing');
    }
    releaseMediaStream();
    stopMicSignalMonitor();
    micActive = false;
    micStarting = false;
    micMediaRecorder = null;
    setMicStatus('Recording error. Click mic to retry.', '#f48771');
  };

  try {
    micMediaRecorder.start(250); // timeslice: accumulate chunks during recording
    micRecordingStartTime = Date.now();
    micActive = true;
    micStarting = false;
    startMicSignalMonitor(micStream);
    if (micBtn) micBtn.classList.add('recording');
    setMicStatus('Recording... Click mic to stop.', '#4ec9b0');
  } catch (_) {
    releaseMediaStream();
    stopMicSignalMonitor();
    micStarting = false;
    micMediaRecorder = null;
    setMicStatus('Unable to start recording', '#f48771');
  }
}

function stopMic() {
  micActive = false;
  micStarting = false;
  if (micMediaRecorder && micMediaRecorder.state !== 'inactive') {
    try { micMediaRecorder.stop(); } catch (_) {}
  } else {
    // If recorder already stopped, just clean up
    const micBtn = document.getElementById('micBtn');
    if (micBtn) {
      micBtn.classList.remove('recording');
      micBtn.classList.remove('transcribing');
    }
    releaseMediaStream();
    stopMicSignalMonitor();
    micMediaRecorder = null;
    setMicStatus('Ready', '#858585');
  }
}

function init(callbacks) {
  inputField = document.getElementById('inputField');
  numberedListBtn = document.getElementById('numberedListBtn');
  if (callbacks) {
    sendCommandCb = callbacks.sendCommand;
  }
}

function handleInputFieldKeyDown(e) {
  const key = e.key || '';
  const code = e.code || '';
  const isEnterKey = key === 'Enter' || code === 'Enter' || code === 'NumpadEnter';
  const hasModifier = e.shiftKey || e.altKey || e.metaKey || e.ctrlKey || e.isComposing;

  if (!isEnterKey || hasModifier) {
    return;
  }

  e.preventDefault();

  if (state.numberedListMode) {
    insertNumberedListLine();
    return;
  }

  if (inputField && /\r?\n$/.test(inputField.value)) {
    inputField.value = inputField.value.replace(/\r?\n$/, '');
  }

  if (sendCommandCb) sendCommandCb();
}

function toggleNumberedListMode() {
  setNumberedListMode(!state.numberedListMode);
  inputField?.focus();
}

function setNumberedListMode(enabled) {
  state.numberedListMode = Boolean(enabled);
  if (numberedListBtn) {
    numberedListBtn.classList.toggle('active', state.numberedListMode);
  }
  if (state.numberedListMode) {
    seedNumberedListAtCursor();
  }
}

function seedNumberedListAtCursor() {
  if (!inputField) return;
  const value = inputField.value || '';
  const start = inputField.selectionStart ?? value.length;
  const { lineText } = getLineAtPosition(value, start);
  if (/^\s*\d+\.\s/.test(lineText)) {
    return;
  }

  const nextIndex = getNextNumberedListIndex(value, start);
  const trimmedLine = lineText.trim();
  const insertText = trimmedLine.length === 0 ? `${nextIndex}. ` : `\n${nextIndex}. `;
  const newValue = value.slice(0, start) + insertText + value.slice(start);
  inputField.value = newValue;
  const newPos = start + insertText.length;
  inputField.setSelectionRange(newPos, newPos);
  inputField.dispatchEvent(new Event('input'));
}

function insertNumberedListLine() {
  if (!inputField) return;
  const value = inputField.value || '';
  const start = inputField.selectionStart ?? value.length;
  const end = inputField.selectionEnd ?? start;
  const nextIndex = getNextNumberedListIndex(value, start);
  const insertText = `\n${nextIndex}. `;
  const newValue = value.slice(0, start) + insertText + value.slice(end);
  inputField.value = newValue;
  const newPos = start + insertText.length;
  inputField.setSelectionRange(newPos, newPos);
  inputField.dispatchEvent(new Event('input'));
}

function getNextNumberedListIndex(text, position) {
  const before = text.slice(0, position);
  const lines = before.split(/\r?\n/);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const match = lines[i].match(/^\s*(\d+)\.\s/);
    if (match) {
      return Number(match[1]) + 1;
    }
  }
  return 1;
}

function getLineAtPosition(text, position) {
  const start = text.lastIndexOf('\n', Math.max(0, position - 1)) + 1;
  const end = text.indexOf('\n', position);
  const lineEnd = end === -1 ? text.length : end;
  return {
    start,
    end: lineEnd,
    lineText: text.slice(start, lineEnd)
  };
}

function isEditableTarget(target) {
  if (!target) return false;
  const tag = (target.tagName || '').toLowerCase();
  if (tag === 'textarea' || tag === 'input') return true;
  if (target.isContentEditable) return true;
  return false;
}

function handleGlobalTerminalScroll(event) {
  const key = event.key || '';
  const code = event.code || '';
  const ctrlOrCmd = event.ctrlKey || event.metaKey;

  const isScrollKey = (
    code === 'PageUp' || key === 'PageUp' ||
    code === 'PageDown' || key === 'PageDown' ||
    ((code === 'Home' || key === 'Home') && ctrlOrCmd) ||
    ((code === 'End' || key === 'End') && ctrlOrCmd)
  );

  if (isEditableTarget(event.target) && !isScrollKey) {
    return;
  }

  const terminal = state.terminals.get(state.activeTerminalId);
  if (!terminal || !terminal.xterm) return;

  if (code === 'PageUp' || key === 'PageUp') {
    const lines = Math.max(1, (terminal.xterm.rows || 24) - 1);
    terminal.xterm.scrollLines(-lines);
    event.preventDefault?.();
    return;
  }
  if (code === 'PageDown' || key === 'PageDown') {
    const lines = Math.max(1, (terminal.xterm.rows || 24) - 1);
    terminal.xterm.scrollLines(lines);
    event.preventDefault?.();
    return;
  }
  if ((code === 'Home' || key === 'Home') && ctrlOrCmd) {
    terminal.xterm.scrollToTop();
    event.preventDefault?.();
    return;
  }
  if ((code === 'End' || key === 'End') && ctrlOrCmd) {
    terminal.xterm.scrollToBottom();
    event.preventDefault?.();
    return;
  }
}

// --- WAV Conversion Helpers ---

async function convertBlobToWav(blob) {
  const arrayBuffer = await blob.arrayBuffer();
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
  try {
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    // Mix down to mono
    const samples = audioBuffer.numberOfChannels > 1
      ? mixToMono(audioBuffer)
      : audioBuffer.getChannelData(0);
    const wavBuffer = encodeWav(samples, audioBuffer.sampleRate);
    return new Blob([wavBuffer], { type: 'audio/wav' });
  } finally {
    audioCtx.close().catch(() => {});
  }
}

function mixToMono(audioBuffer) {
  const length = audioBuffer.length;
  const mixed = new Float32Array(length);
  const channels = audioBuffer.numberOfChannels;
  for (let ch = 0; ch < channels; ch++) {
    const data = audioBuffer.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      mixed[i] += data[i] / channels;
    }
  }
  return mixed;
}

function encodeWav(samples, sampleRate) {
  const numSamples = samples.length;
  const buffer = new ArrayBuffer(44 + numSamples * 2);
  const view = new DataView(buffer);

  // RIFF header
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + numSamples * 2, true);
  writeString(view, 8, 'WAVE');

  // fmt chunk
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);           // chunk size
  view.setUint16(20, 1, true);            // PCM format
  view.setUint16(22, 1, true);            // mono
  view.setUint32(24, sampleRate, true);   // sample rate
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true);            // block align
  view.setUint16(34, 16, true);           // bits per sample

  // data chunk
  writeString(view, 36, 'data');
  view.setUint32(40, numSamples * 2, true);

  // PCM samples ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â clamp float32 to int16
  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    offset += 2;
  }

  return buffer;
}

function writeString(view, offset, string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

module.exports = {
  init,
  handleInputFieldKeyDown,
  toggleNumberedListMode,
  setNumberedListMode,
  handleGlobalTerminalScroll,
  toggleMic
};

