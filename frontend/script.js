/* ============================================================
   PneumoAI — frontend logic
   Talks to the existing FastAPI backend:
     GET  /health   -> { status, model_loaded }
     POST /predict  -> multipart field "file"
     POST /chat     -> { message, severity }
   ============================================================ */

// Same origin when served by FastAPI (http://localhost:8000/app/), otherwise localhost:8000.
const API_BASE = (location.protocol.startsWith('http') && location.port === '8000')
  ? location.origin
  : 'http://localhost:8000';

// The backend accepts PNG and JPEG uploads, so the UI validates the same set.
const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/jpg'];
const ACCEPTED_EXT = /\.(png|jpe?g)$/i;
const MAX_BYTES = 12 * 1024 * 1024;
const DEFAULT_THRESHOLD = 0.55;
const GRADCAM_UNAVAILABLE = 'Grad-CAM is unavailable for this model.';

const SEVERITY_LEVELS = {
  'Normal': 'normal',
  'Mild Pneumonia': 'mild',
  'Moderate Pneumonia': 'moderate',
  'Severe Pneumonia': 'severe'
};

const $ = (id) => document.getElementById(id);
const el = {
  status: $('modelStatus'),
  fileInput: $('fileInput'),
  dropzone: $('dropzone'),
  fileCard: $('fileCard'),
  previewImg: $('previewImg'),
  fileName: $('fileName'),
  fileSize: $('fileSize'),
  removeBtn: $('removeBtn'),
  uploadError: $('uploadError'),
  analyzeBtn: $('analyzeBtn'),
  resultsPanel: $('resultsPanel'),
  emptyState: $('emptyState'),
  loadingState: $('loadingState'),
  result: $('result'),
  resultBanner: $('resultBanner'),
  bannerIcon: $('bannerIcon'),
  bannerLabel: $('bannerLabel'),
  bannerSub: $('bannerSub'),
  predClass: $('predClass'),
  predConfidence: $('predConfidence'),
  pneumoProb: $('pneumoProb'),
  probBar: $('probBarLabel'),
  probFill: $('probFill'),
  sevChip: $('sevChip'),
  uploadWarning: $('uploadWarning'),
  xrayWarning: $('xrayWarning'),
  xrayWarningText: $('xrayWarningText'),
  originalBox: $('originalBox'),
  originalImg: $('originalImg'),
  viewerCanvas: $('viewerCanvas'),
  viewerUnavailable: $('viewerUnavailable'),
  viewerTitle: $('viewerTitle'),
  viewerNote: $('viewerNote'),
  toggleHeat: $('toggleHeat'),
  toggleBox: $('toggleBox'),
  opacityRange: $('opacityRange'),
  claheBox: $('claheBox'),
  claheImg: $('claheImg'),
  heatmapBox: $('heatmapBox'),
  heatmapImg: $('heatmapImg'),
  overlayBox: $('overlayBox'),
  overlayImg: $('overlayImg'),
  botLauncher: $('botLauncher'),
  botBadge: $('botBadge'),
  botPanel: $('botPanel'),
  botClose: $('botClose'),
  botMessages: $('botMessages'),
  botChips: $('botChips'),
  botForm: $('botForm'),
  botInput: $('botInput'),
  botSend: $('botSend')
};

const state = {
  file: null,
  previewUrl: null,
  busy: false,
  severity: 'Normal',
  chatBusy: false,
  xrayIssue: null,
  viewer: null   // { base, heat, box, isPneumonia } for the overlay viewer
};

const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------------- Helpers ---------------- */

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
const pct = (v) => `${clamp(v, 0, 100).toFixed(2)}%`;

function showError(message) {
  el.uploadError.textContent = message;
  el.uploadError.classList.remove('hidden');
}

function clearError() {
  el.uploadError.textContent = '';
  el.uploadError.classList.add('hidden');
}

async function fetchWithTimeout(url, options = {}, ms = 120000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...options, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

// Turn an HTTP error into a safe, user-friendly message (no server internals for 5xx).
async function friendlyHttpError(res) {
  let detail = '';
  try {
    const body = await res.json();
    if (typeof body.detail === 'string') detail = body.detail;
  } catch (_) { /* non-JSON body */ }

  if (res.status === 503) return 'The model is not loaded on the server. Restart the backend and try again.';
  if (res.status >= 500) return 'The model could not process this image. Please try a different chest X-ray.';
  if (res.status === 413) return 'File is too large. Maximum size is 12 MB.';
  return detail || `Request failed (${res.status}). Please try again.`;
}

function networkMessage(err) {
  if (err && err.name === 'AbortError') return 'The analysis took too long. Please try again.';
  return 'Cannot reach the PneumoAI server. Make sure the backend is running on port 8000, then retry.';
}

/* ---------------- Model status ---------------- */

function setStatus(stateName, text) {
  el.status.dataset.state = stateName;
  el.status.querySelector('.status-text').textContent = text;
}

let healthTimer = null;
async function checkHealth() {
  let ready = false;
  try {
    const res = await fetchWithTimeout(`${API_BASE}/health`, { cache: 'no-store' }, 6000);
    const data = await res.json();
    ready = res.ok && data.model_loaded === true;
    setStatus(ready ? 'ready' : 'unavailable', ready ? 'Model ready' : 'Model unavailable');
  } catch (_) {
    setStatus('offline', 'Server unavailable');
  }
  clearTimeout(healthTimer);
  healthTimer = setTimeout(checkHealth, ready ? 30000 : 5000);
}

/* ---------------- File selection ---------------- */

function updateAnalyzeButton() {
  el.analyzeBtn.disabled = !state.file || state.busy;
}

function selectFile(file) {
  clearError();
  if (!file) return;

  if (!(ACCEPTED_TYPES.includes(file.type) || ACCEPTED_EXT.test(file.name))) {
    showError('Please choose a PNG or JPG image.');
    return;
  }
  if (file.size > MAX_BYTES) {
    showError('File is too large. Maximum size is 12 MB.');
    return;
  }

  state.file = file;
  if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
  state.previewUrl = URL.createObjectURL(file);

  el.previewImg.src = state.previewUrl;
  el.previewImg.alt = `Preview of selected X-ray ${file.name}`;
  el.fileName.textContent = file.name;
  el.fileName.title = file.name;
  el.fileSize.textContent = formatBytes(file.size);
  el.dropzone.classList.add('hidden');
  el.fileCard.classList.remove('hidden');
  updateAnalyzeButton();

  state.xrayIssue = null;
  el.uploadWarning.classList.add('hidden');
  const selected = file;
  checkLooksLikeXray(state.previewUrl).then((issue) => {
    if (state.file !== selected) return;
    state.xrayIssue = issue;
    el.uploadWarning.textContent = issue ? `This may not be a chest X-ray: ${issue} Results on non-X-ray images are not meaningful.` : '';
    el.uploadWarning.classList.toggle('hidden', !issue);
  });
}

// Lightweight sanity check: chest X-rays are greyscale, not mostly white, and roughly square-ish.
// It only warns; the analysis can still be run.
function checkLooksLikeXray(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const w = img.naturalWidth, h = img.naturalHeight;
        const size = 128;
        const c = document.createElement('canvas');
        c.width = size; c.height = size;
        const ctx = c.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, size, size);
        const px = ctx.getImageData(0, 0, size, size).data;
        let colored = 0, white = 0;
        const n = size * size;
        for (let i = 0; i < px.length; i += 4) {
          const mx = Math.max(px[i], px[i + 1], px[i + 2]);
          const mn = Math.min(px[i], px[i + 1], px[i + 2]);
          if (mx - mn > 28) colored++;
          if (mn > 235) white++;
        }
        const aspect = w / h;
        if (colored / n > 0.08) return resolve('the image contains colour, but X-rays are greyscale.');
        if (white / n > 0.30) return resolve('the image is mostly white, like a screenshot or document.');
        if (aspect < 0.55 || aspect > 1.8) return resolve(`its shape (${w} × ${h}) is unusual for a chest X-ray.`);
        resolve(null);
      } catch (_) {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function removeFile() {
  if (state.busy) return;
  state.file = null;
  if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
  state.previewUrl = null;
  el.previewImg.removeAttribute('src');
  el.fileCard.classList.add('hidden');
  el.dropzone.classList.remove('hidden');
  el.fileInput.value = '';
  state.xrayIssue = null;
  el.uploadWarning.classList.add('hidden');
  clearError();
  updateAnalyzeButton();
  el.dropzone.focus();
}

el.dropzone.addEventListener('click', () => el.fileInput.click());
el.dropzone.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    el.fileInput.click();
  }
});
el.fileInput.addEventListener('change', (e) => {
  selectFile(e.target.files[0]);
  e.target.value = '';
});
el.removeBtn.addEventListener('click', removeFile);

['dragenter', 'dragover'].forEach((evt) => el.dropzone.addEventListener(evt, (e) => {
  e.preventDefault();
  el.dropzone.classList.add('dragover');
}));
['dragleave', 'dragend', 'drop'].forEach((evt) => el.dropzone.addEventListener(evt, (e) => {
  e.preventDefault();
  el.dropzone.classList.remove('dragover');
}));
el.dropzone.addEventListener('drop', (e) => selectFile(e.dataTransfer && e.dataTransfer.files[0]));
// Stop the browser from navigating to an image dropped outside the zone
['dragover', 'drop'].forEach((evt) => window.addEventListener(evt, (e) => e.preventDefault()));

/* ---------------- Results panel views ---------------- */

function showView(view) {
  el.emptyState.classList.toggle('hidden', view !== 'empty');
  el.loadingState.classList.toggle('hidden', view !== 'loading');
  el.result.classList.toggle('hidden', view !== 'result');
}

function setBusy(busy) {
  state.busy = busy;
  el.analyzeBtn.querySelector('.btn-text').textContent = busy ? 'Analyzing image…' : 'Analyze X-ray';
  el.analyzeBtn.setAttribute('aria-busy', String(busy));
  el.removeBtn.disabled = busy;
  updateAnalyzeButton();
}

/* ---------------- Analysis ---------------- */

el.analyzeBtn.addEventListener('click', analyze);

async function analyze() {
  if (!state.file || state.busy) return;
  clearError();
  setBusy(true);
  showView('loading');

  const form = new FormData();
  form.append('file', state.file, state.file.name);

  try {
    const res = await fetchWithTimeout(`${API_BASE}/predict`, { method: 'POST', body: form });
    if (!res.ok) throw new Error(await friendlyHttpError(res));
    const data = await res.json();
    if (typeof data.prediction !== 'string') throw new Error('The server returned an unexpected response. Please try again.');
    await renderResult(data);
    showView('result');
    el.resultsPanel.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
    announceToBot(data);
  } catch (err) {
    showView('empty');
    showError(err instanceof TypeError || err.name === 'AbortError' ? networkMessage(err) : err.message);
    checkHealth();
  } finally {
    setBusy(false);
  }
}

function readProbability(data) {
  if (typeof data.pneumonia_probability === 'number') return data.pneumonia_probability > 1 ? data.pneumonia_probability / 100 : data.pneumonia_probability;
  if (typeof data.probability === 'number') return data.probability;
  if (typeof data.confidence === 'number') return data.confidence / 100;
  return null;
}

async function renderResult(data) {
  const isPneumonia = data.prediction === 'Pneumonia';
  const threshold = typeof data.threshold === 'number' ? data.threshold : DEFAULT_THRESHOLD;
  const prob = readProbability(data);
  const probPct = prob === null ? null : prob * 100;
  const confidencePct = probPct === null ? null : (isPneumonia ? probPct : 100 - probPct);

  // Banner (text + icon, so colour is not the only indicator)
  el.resultBanner.classList.toggle('is-pneumonia', isPneumonia);
  el.resultBanner.classList.toggle('is-normal', !isPneumonia);
  el.bannerIcon.textContent = isPneumonia ? '!' : '✓';
  el.bannerLabel.textContent = data.prediction;
  el.bannerSub.textContent = isPneumonia
    ? 'Model score meets the configured pneumonia threshold.'
    : 'Model score is below the configured classification threshold.';

  // Scores
  el.predClass.textContent = data.prediction;
  el.predConfidence.textContent = confidencePct === null ? '—' : pct(confidencePct);
  el.pneumoProb.textContent = probPct === null ? '—' : pct(probPct);

  el.probBar.classList.toggle('is-pneumonia', isPneumonia);
  el.probBar.setAttribute('aria-label', probPct === null
    ? 'Pneumonia probability unavailable'
    : `Pneumonia probability ${pct(probPct)}, threshold ${(threshold * 100).toFixed(0)}%`);
  el.probBar.querySelector('.prob-threshold').style.left = `${clamp(threshold * 100, 0, 100)}%`;
  el.probBar.querySelector('.prob-threshold span').textContent = `Threshold ${threshold.toFixed(2)}`;
  el.probFill.style.width = '0%';
  requestAnimationFrame(() => requestAnimationFrame(() => {
    el.probFill.style.width = probPct === null ? '0%' : `${clamp(probPct, 0, 100)}%`;
  }));

  // Severity — exactly what the backend returned
  const sev = typeof data.severity === 'string' && data.severity ? data.severity : null;
  state.severity = sev || 'Normal';
  el.sevChip.textContent = sev || 'Unavailable';
  el.sevChip.dataset.level = sev ? (SEVERITY_LEVELS[sev] || 'unavailable') : 'unavailable';

  // Not-an-X-ray warning
  el.xrayWarning.classList.toggle('hidden', !state.xrayIssue);
  el.xrayWarningText.textContent = state.xrayIssue ? `Reason: ${state.xrayIssue}` : '';

  // Images
  const note = data.gradcam_note || GRADCAM_UNAVAILABLE;
  const originalSrc = data.original_image ? toDataUrl(data.original_image) : state.previewUrl;
  setImage(el.originalBox, el.originalImg, originalSrc, 'Original image unavailable.', true);
  setImage(el.claheBox, el.claheImg, data.clahe_image, 'CLAHE output was not returned.');
  const heatmapB64 = data.gradcam_heatmap || data.gradcam_image;
  const overlayB64 = data.gradcam_overlay || data.overlay_image;
  const heatmapSrc = heatmapB64 ? await colorizeHeatmap(toDataUrl(heatmapB64)) : null;
  setImage(el.heatmapBox, el.heatmapImg, heatmapSrc, note, true);
  setImage(el.overlayBox, el.overlayImg, overlayB64, note);

  await buildViewer(originalSrc, heatmapB64 ? toDataUrl(heatmapB64) : null, isPneumonia, note);
}

/* ---------------- Overlay viewer (original X-ray + Grad-CAM) ---------------- */

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function jet(v) {
  return [
    255 * clamp(1.5 - Math.abs(4 * v - 3), 0, 1),
    255 * clamp(1.5 - Math.abs(4 * v - 2), 0, 1),
    255 * clamp(1.5 - Math.abs(4 * v - 1), 0, 1)
  ];
}

// The backend resizes the whole image to 224 × 224 (no crop), so heatmap coordinates scale
// directly back onto the original image in each axis.
async function buildViewer(originalSrc, heatmapSrc, isPneumonia, unavailableNote) {
  state.viewer = null;
  try {
    const base = await loadImage(originalSrc);
    let heat = null;
    let box = null;

    if (heatmapSrc) {
      const hm = await loadImage(heatmapSrc);
      const hw = hm.naturalWidth, hh = hm.naturalHeight;
      const hc = document.createElement('canvas');
      hc.width = hw; hc.height = hh;
      const hctx = hc.getContext('2d', { willReadFrequently: true });
      hctx.drawImage(hm, 0, 0);
      const frame = hctx.getImageData(0, 0, hw, hh);
      const px = frame.data;

      const vals = new Float32Array(hw * hh);
      let maxV = 0, maxI = 0;
      for (let i = 0; i < vals.length; i++) {
        vals[i] = px[i * 4] / 255;
        if (vals[i] > maxV) { maxV = vals[i]; maxI = i; }
      }

      // Colour layer with alpha rising with attention, so low-attention areas stay clear
      for (let i = 0; i < vals.length; i++) {
        const v = vals[i];
        const [r, g, b] = jet(v);
        px[i * 4] = r; px[i * 4 + 1] = g; px[i * 4 + 2] = b;
        px[i * 4 + 3] = 255 * clamp((v - 0.15) / 0.85, 0, 1);
      }
      hctx.putImageData(frame, 0, 0);
      heat = hc;

      // Region boxes: every connected area where attention ≥ 60% of the peak (ignoring tiny specks),
      // strongest first, at most 3.
      if (maxV > 0) {
        const t = 0.6 * maxV;
        const seen = new Uint8Array(vals.length);
        const regions = [];
        for (let s = 0; s < vals.length; s++) {
          if (seen[s] || vals[s] < t) continue;
          const stack = [s];
          seen[s] = 1;
          let x0 = hw, y0 = hh, x1 = 0, y1 = 0, area = 0, peak = 0;
          while (stack.length) {
            const i = stack.pop();
            const x = i % hw, y = (i / hw) | 0;
            area++;
            if (vals[i] > peak) peak = vals[i];
            if (x < x0) x0 = x; if (x > x1) x1 = x;
            if (y < y0) y0 = y; if (y > y1) y1 = y;
            const nb = [x > 0 ? i - 1 : -1, x < hw - 1 ? i + 1 : -1, y > 0 ? i - hw : -1, y < hh - 1 ? i + hw : -1];
            for (const j of nb) {
              if (j >= 0 && !seen[j] && vals[j] >= t) { seen[j] = 1; stack.push(j); }
            }
          }
          if (area >= vals.length * 0.005) {
            regions.push({ x: x0 / hw, y: y0 / hh, w: (x1 - x0 + 1) / hw, h: (y1 - y0 + 1) / hh, peak });
          }
        }
        regions.sort((a, b) => b.peak - a.peak);
        box = regions.slice(0, 3);
      }
    }

    state.viewer = { base, heat, box, isPneumonia };
  } catch (_) {
    state.viewer = null;
  }

  const hasHeat = !!(state.viewer && state.viewer.heat);
  el.viewerUnavailable.textContent = unavailableNote;
  el.viewerUnavailable.classList.toggle('hidden', hasHeat);
  el.toggleHeat.disabled = !hasHeat;
  el.opacityRange.disabled = !hasHeat;
  el.toggleBox.disabled = !(hasHeat && isPneumonia);
  el.toggleBox.parentElement.classList.toggle('hidden', !isPneumonia);
  el.viewerTitle.textContent = isPneumonia ? 'Original X-ray · likely opacity region highlighted' : 'Original X-ray with Grad-CAM overlay';
  el.viewerNote.textContent = !hasHeat ? '' : isPneumonia
    ? 'Boxed areas are where Grad-CAM responds most strongly (≥ 60% of its peak), i.e. the regions that most increased the pneumonia score, likely lung opacity. They are approximate visual cues, not a clinical localization.'
    : 'The prediction is Normal, so no region is flagged. The heatmap only shows where the model looked; it does not indicate disease.';
  drawViewer();
}

function drawViewer() {
  const v = state.viewer;
  const canvas = el.viewerCanvas;
  const ctx = canvas.getContext('2d');
  if (!v) {
    canvas.width = 0; canvas.height = 0;
    return;
  }
  const scale = Math.min(1, 1000 / Math.max(v.base.naturalWidth, v.base.naturalHeight));
  const W = Math.round(v.base.naturalWidth * scale);
  const H = Math.round(v.base.naturalHeight * scale);
  canvas.width = W; canvas.height = H;
  ctx.drawImage(v.base, 0, 0, W, H);

  if (v.heat && el.toggleHeat.checked) {
    ctx.save();
    ctx.globalAlpha = Number(el.opacityRange.value) / 100 + 0.1;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(v.heat, 0, 0, W, H);
    ctx.restore();
  }

  if (v.box && v.box.length && v.isPneumonia && el.toggleBox.checked) {
    v.box.forEach((r, idx) => drawRegion(ctx, r, W, H, idx === 0 ? 'Highest Grad-CAM response' : 'High response'));
  }
}

function drawRegion(ctx, r, W, H, label) {
  {
    const x = r.x * W, y = r.y * H, w = r.w * W, h = r.h * H;
    const lw = Math.max(2, Math.round(W / 300));
    ctx.save();
    ctx.lineWidth = lw;
    ctx.strokeStyle = '#ffffff';
    ctx.setLineDash([lw * 4, lw * 3]);
    ctx.shadowColor = 'rgba(0,0,0,.6)';
    ctx.shadowBlur = lw * 2;
    ctx.strokeRect(x, y, w, h);
    ctx.setLineDash([]);
    const fs = Math.max(12, Math.round(W / 45));
    ctx.font = `700 ${fs}px "DM Sans", sans-serif`;
    const tw = ctx.measureText(label).width + fs;
    const ly = y - fs * 1.7 >= 0 ? y - fs * 1.7 : y + h + 4;
    const lx = clamp(x, 0, W - tw);
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(16, 45, 56, .88)';
    ctx.fillRect(lx, ly, tw, fs * 1.6);
    ctx.fillStyle = '#ffffff';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, lx + fs / 2, ly + fs * 0.8);
    ctx.restore();
  }
}

el.toggleHeat.addEventListener('change', drawViewer);
el.toggleBox.addEventListener('change', drawViewer);
el.opacityRange.addEventListener('input', drawViewer);

function toDataUrl(b64) {
  return b64.startsWith('data:') ? b64 : `data:image/png;base64,${b64}`;
}

function setImage(box, img, src, unavailableNote, isDataUrl = false) {
  if (!src) {
    box.classList.add('unavailable');
    box.dataset.note = unavailableNote;
    img.removeAttribute('src');
    return;
  }
  box.classList.remove('unavailable');
  img.src = isDataUrl ? src : toDataUrl(src);
}

// The backend returns the Grad-CAM heatmap as single-channel intensity (0–255).
// Map it to the same JET colour scale used by the overlay so the two views read consistently.
function colorizeHeatmap(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const px = frame.data;
        for (let i = 0; i < px.length; i += 4) {
          const v = px[i] / 255;
          px[i] = 255 * clamp(1.5 - Math.abs(4 * v - 3), 0, 1);
          px[i + 1] = 255 * clamp(1.5 - Math.abs(4 * v - 2), 0, 1);
          px[i + 2] = 255 * clamp(1.5 - Math.abs(4 * v - 1), 0, 1);
          px[i + 3] = 255;
        }
        ctx.putImageData(frame, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      } catch (_) {
        resolve(src); // fall back to the raw grayscale heatmap
      }
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/* ---------------- PneumoBot ---------------- */

function isBotOpen() {
  return !el.botPanel.classList.contains('hidden');
}

function toggleBot(open) {
  el.botPanel.classList.toggle('hidden', !open);
  el.botLauncher.setAttribute('aria-expanded', String(open));
  if (open) {
    el.botBadge.classList.add('hidden');
    el.botMessages.scrollTop = el.botMessages.scrollHeight;
    el.botInput.focus();
  } else {
    el.botLauncher.focus();
  }
}

function addMessage(text, who = 'bot') {
  const div = document.createElement('div');
  div.className = `msg ${who === 'bot' ? 'msg-bot' : 'msg-user'}`;
  div.textContent = text;
  el.botMessages.appendChild(div);
  el.botMessages.scrollTop = el.botMessages.scrollHeight;
  if (who === 'bot' && !isBotOpen()) el.botBadge.classList.remove('hidden');
  return div;
}

function addTyping() {
  const div = document.createElement('div');
  div.className = 'msg msg-bot msg-typing';
  div.setAttribute('aria-label', 'PneumoBot is typing');
  div.innerHTML = '<span></span><span></span><span></span>';
  el.botMessages.appendChild(div);
  el.botMessages.scrollTop = el.botMessages.scrollHeight;
  return div;
}

function announceToBot(data) {
  const lines = [`New result: ${data.prediction}${data.severity ? ` · ${data.severity}` : ''}.`];
  if (data.bot_message) lines.push(data.bot_message);
  if (Array.isArray(data.recommendations) && data.recommendations.length) {
    lines.push('', 'General guidance:', ...data.recommendations.slice(0, 4).map((r) => `• ${r}`));
  }
  lines.push('', 'Ask me about symptoms, recovery, oxygen levels or hospital care.');
  addMessage(lines.join('\n'));
}

async function sendChat(text) {
  const message = text.trim();
  if (!message || state.chatBusy) return;
  addMessage(message, 'user');
  el.botInput.value = '';
  state.chatBusy = true;
  el.botSend.disabled = true;
  const typing = addTyping();

  try {
    const res = await fetchWithTimeout(`${API_BASE}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, severity: state.severity })
    }, 15000);
    if (!res.ok) throw new Error(await friendlyHttpError(res));
    const data = await res.json();
    typing.remove();
    addMessage(data.response || 'Sorry, I could not answer that.');
  } catch (err) {
    typing.remove();
    addMessage(err instanceof TypeError || err.name === 'AbortError'
      ? 'I cannot reach the server right now. Make sure the backend is running on port 8000.'
      : err.message);
  } finally {
    state.chatBusy = false;
    el.botSend.disabled = false;
  }
}

el.botLauncher.addEventListener('click', () => toggleBot(!isBotOpen()));
el.botClose.addEventListener('click', () => toggleBot(false));
el.botForm.addEventListener('submit', (e) => {
  e.preventDefault();
  sendChat(el.botInput.value);
});
el.botChips.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-q]');
  if (btn) sendChat(btn.dataset.q);
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && isBotOpen()) toggleBot(false);
});

/* ---------------- Init ---------------- */

addMessage("Hello, I'm PneumoBot — a rule-based assistant for pneumonia questions. Analyze an X-ray and I'll tailor my answers to the result.");
el.botBadge.classList.add('hidden');
showView('empty');
checkHealth();
