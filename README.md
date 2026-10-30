# PneumoAI

### Deep Learning-Based Pneumonia Detection and Severity Assessment from Chest X-Ray Images Using CLAHE-Enhanced EfficientNet and Explainable AI

*Final Year Project · Deep Learning · Medical AI*

PneumoAI is a web application that takes a chest X-ray image and:

1. Enhances its contrast with **CLAHE**.
2. Classifies it as **Normal** or **Pneumonia** with a trained **EfficientNetB0** deep-learning model.
3. Estimates a **severity level** (Normal / Mild / Moderate / Severe) from the model's score.
4. Explains the decision with a **Grad-CAM** heatmap drawn on the original X-ray, with boxes around the regions that drove the prediction.
5. Answers follow-up questions through **PneumoBot**, a rule-based pneumonia assistant.

> ⚠️ **Research and educational prototype only.** It is not a medical device and has not been clinically validated. A prediction is not a diagnosis.

---

## Table of contents

1. [Quick start](#1-quick-start)
2. [The project title, term by term](#2-the-project-title-term-by-term)
3. [How a prediction is made (end-to-end flow)](#3-how-a-prediction-is-made-end-to-end-flow)
4. [Model architecture](#4-model-architecture)
5. [Training and reported results](#5-training-and-reported-results)
6. [Using the web application](#6-using-the-web-application)
7. [Backend API](#7-backend-api)
8. [Project structure](#8-project-structure)
9. [Manual setup (Windows / VS Code)](#9-manual-setup-windows--vs-code)
10. [Testing that was performed](#10-testing-that-was-performed)
11. [Limitations and honest notes](#11-limitations-and-honest-notes)
12. [Troubleshooting](#12-troubleshooting)
13. [Technologies used](#13-technologies-used)

---

## 1. Quick start

**Requirement:** Python 3.10, 3.11 or 3.12 installed (3.12 is used and tested).

1. Double-click **`start.bat`** in the project folder.
   - **First run:** it creates a Python virtual environment and installs all dependencies. This takes a few minutes and needs internet.
   - **Every run:** it starts the server and opens **http://localhost:8000/app/** in your browser.
2. Wait until the header status shows a green **"Model ready"** (about 10–60 seconds).
3. Upload a chest X-ray (sample images are in [`test_images/`](test_images/)) and click **Analyze X-ray**.

To stop the server, close the black `start.bat` window or press `Ctrl + C` in it.

---

## 2. The project title, term by term

Each part of the title corresponds to a concrete piece of the implementation:

| Term in the title | What it means | Where it is used in this project | Why it is used |
|---|---|---|---|
| **Deep Learning-Based** | Machine learning with many-layered neural networks that learn features directly from pixels instead of hand-crafted rules. | The trained Keras model [`pneumonia_final_v2.keras`](pneumonia_final_v2.keras), loaded once at server start in [`backend/app.py`](backend/app.py) (`load_model`). | Hand-written rules cannot reliably recognise lung opacity. A deep network learns these patterns from thousands of labelled X-rays. |
| **Pneumonia Detection** | Binary classification: does the X-ray show pneumonia (lung opacity) or not? | `/predict` in [`backend/app.py`](backend/app.py): the model's sigmoid output *p* is compared with the threshold **0.55**. *p* ≥ 0.55 → **Pneumonia**, otherwise **Normal**. | This is the primary diagnostic question the system answers. The 0.55 threshold was tuned on the validation set for best accuracy (instead of the default 0.5). |
| **Severity Assessment** | Grading how serious the finding is. | `get_severity()` in [`backend/model_utils.py`](backend/model_utils.py): Normal < 0.55 ≤ Mild < 0.70 ≤ Moderate < 0.85 ≤ Severe. Shown as the *"Experimental score-based estimate"* chip in the UI, and used to choose PneumoBot's guidance. | It goes beyond a yes/no answer and helps order follow-up guidance. **Note:** this is a heuristic on the model's probability, not a separately trained or clinically validated severity model (see [§11](#11-limitations-and-honest-notes)). |
| **Chest X-Ray Images** | Frontal (PA/AP) radiographs of the chest, the most common imaging test for pneumonia. | Training data: the RSNA Pneumonia Detection Challenge (14,863 DICOM X-rays). At run time the app accepts **PNG/JPG** uploads. | They are cheap and widely available, and pneumonia shows up on them as white "opacity" in the lungs. |
| **CLAHE** (Contrast Limited Adaptive Histogram Equalization) | An image-enhancement method. The image is split into small tiles (8 × 8 grid here), and contrast is equalised inside each tile. A *clip limit* (2.0) stops noise from being over-amplified. | `preprocess_image()` in [`backend/model_utils.py`](backend/model_utils.py): grayscale → normalise to 0–255 → `cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))` → resize to 224 × 224. The result is shown as the **"CLAHE enhanced"** image. | X-rays often have low, uneven contrast. CLAHE makes lung texture and faint opacities more visible, which helps the network extract features. The **same** CLAHE settings were used in training, so prediction-time preprocessing matches exactly. |
| **-Enhanced** | The model is fed the CLAHE-enhanced image, not the raw one. | The CLAHE output (stacked to 3 channels) is the model input. | Applying identical preprocessing in training and inference is essential; otherwise accuracy drops. |
| **EfficientNet** (EfficientNetB0) | A family of convolutional neural networks (CNNs) that scales depth, width and resolution in a balanced way. **B0** is the smallest member: accurate yet fast on a CPU. | The backbone of the saved model (layers up to `top_conv`, 1,280 feature maps). It was pre-trained on ImageNet and fine-tuned on X-rays (transfer learning). | Strong accuracy for its size (≈5.2 M parameters in total) and fast inference (~0.1 s per image on CPU). Transfer learning makes good use of a medium-sized medical dataset. |
| **Explainable AI** (XAI) | Methods that show *why* a model made a decision. | **Grad-CAM** in `generate_gradcam()` ([`backend/model_utils.py`](backend/model_utils.py)), shown in the *Visual explanation* section of the UI ([`frontend/script.js`](frontend/script.js), `buildViewer`). | Doctors and examiners can check that the model looks at the lungs, not at text markers or borders. This builds trust and exposes errors. |

**Two further techniques are inside the model, though not named in the title:**

| Technique | What it does | Where |
|---|---|---|
| **Channel attention** | Learns *which* of the 1,280 feature channels matter, from average- and max-pooled descriptors through a shared MLP with a sigmoid gate (CBAM-style squeeze-and-excitation). | Inside the saved model, after `top_conv` (layers `dense_7`…`multiply_2`). |
| **Spatial attention** | Learns *where* in the image to focus, from channel-wise mean and max maps → 7 × 7 convolution → sigmoid gate. | Inside the saved model (`mean_1`, `max_1`, `conv2d_1`, `multiply_3`). |

### Grad-CAM in a little more detail

**Grad-CAM** (Gradient-weighted Class Activation Mapping):

1. Runs the image through the model and records the 7 × 7 × 1280 feature maps of the last convolutional layer, **`top_conv`**.
2. Computes the gradient of the pneumonia score with respect to those feature maps.
3. Averages each channel's gradient to get one importance weight per channel.
4. Takes the weighted sum of the feature maps, keeps positive values (ReLU), normalises to 0–1, and resizes to 224 × 224.

The result is the **Grad-CAM heatmap**: red/yellow regions pushed the pneumonia score up the most.

The frontend then:

- Overlays the heatmap on the **original** X-ray (colour scale: blue = low → red = high attention). The opacity slider and the toggles change how it is shown.
- For a **Pneumonia** prediction, draws dashed boxes around every connected area where the heatmap is ≥ 60% of its peak. The strongest is labelled *"Highest Grad-CAM response"*, others *"High response"*. These boxes mark the regions that most influenced the decision, usually the lung opacity.

> Grad-CAM is computed at `top_conv`, which comes **before** the attention blocks. It is therefore a separate, post-hoc explanation and not the same thing as the model's built-in attention. Like all saliency maps, it is an approximate visual cue, not a precise clinical localisation.

---

## 3. How a prediction is made (end-to-end flow)

```
 Browser (frontend/)                         Server (backend/, FastAPI on port 8000)
 ───────────────────                         ────────────────────────────────────────
 1. User drops/browses a PNG/JPG
    · type + 12 MB size check
    · "is this really an X-ray?" check
 2. Click "Analyze X-ray"  ── POST /predict ─▶ 3. Validate file (type, size, decodable)
                                              4. preprocess_image():
                                                 grayscale → normalise 0–255 → CLAHE(2.0, 8×8)
                                                 → resize 224×224 (INTER_AREA) → 3 channels, float32
                                              5. model.predict → probability p (0–1)
                                              6. p ≥ 0.55 ? "Pneumonia" : "Normal"
                                              7. get_severity(p) → Normal / Mild / Moderate / Severe
                                              8. generate_gradcam() from layer "top_conv"
                                              9. Encode original, CLAHE, heatmap, overlay
                                                 as base64 PNG + recommendations
 10. Render results     ◀──── JSON ───────────
    · Pneumonia / Normal banner
    · confidence, probability bar with 0.55 marker
    · severity chip + method + caveat
    · Grad-CAM viewer on the original X-ray, region boxes
    · 4 thumbnails: Original · CLAHE · Heatmap · Overlay
 11. PneumoBot posts the result; follow-up questions ── POST /chat ─▶ bot.py rules
```

**Confidence vs probability.** The *pneumonia probability* is the raw model output *p*. *Prediction confidence* is the confidence in the shown verdict: *p* for Pneumonia, 1 − *p* for Normal. These are uncalibrated model scores, not guarantees.

---

## 4. Model architecture

Read directly from the saved model file (`pneumonia_final_v2.keras`, saved with Keras 3.13.2):

| Stage | Details |
|---|---|
| Input | 224 × 224 × 3, float32, pixel range **0–255** (EfficientNetB0 includes its own rescaling/normalisation layers) |
| Backbone | EfficientNetB0 (ImageNet pre-trained), output of `top_conv` → BatchNorm → SiLU = 7 × 7 × 1280 |
| Channel attention | GlobalAvgPool & GlobalMaxPool → shared Dense(160, ReLU) → Dense(1280, sigmoid) → add → multiply |
| Spatial attention | mean & max over channels → concatenate → Conv2D(1, 7 × 7, sigmoid) → multiply |
| Classification head | GlobalAvgPool → BatchNorm → Dense(256, ReLU) → Dropout(0.4) → Dense(64, ReLU) → Dropout(0.3) → **Dense(1, sigmoid)** |
| Output | Probability of pneumonia (0 = Normal, 1 = Pneumonia) |
| Total parameters | **5,218,439** |
| Decision threshold | **0.55** |

---

## 5. Training and reported results

Training was done on Kaggle (GPU T4 × 2). The values below come from the project's training notebook and report; they were not re-computed in this repository.

| Item | Value |
|---|---|
| Dataset | RSNA Pneumonia Detection Challenge (Kaggle): 14,863 chest X-rays (Normal 8,851 · Lung Opacity/Pneumonia 6,012). The ambiguous "Not Normal" class was excluded. |
| Split | Stratified 70 / 15 / 15: train 10,404 · validation 2,229 · test 2,230 |
| Augmentation | Random flip, brightness, contrast, rotation (training only) |
| Class weights | Normal 0.64 · Pneumonia 2.21 |
| Phase 1 | Backbone frozen, head trained, 15 epochs, LR 1e-3 |
| Phase 2 | Top 30% of backbone unfrozen, fine-tuned, 20 epochs, LR 1e-4 |
| Optimiser / loss | Adam / binary cross-entropy |
| Callbacks | EarlyStopping (patience 7, val AUC), ReduceLROnPlateau (factor 0.3, patience 3), ModelCheckpoint (best val AUC) |

**Reported test-set results** (2,230 held-out images, threshold 0.55):

| Accuracy | Precision | Recall (Sensitivity) | Specificity | F1-score | ROC-AUC |
|---|---|---|---|---|---|
| 93.59% | 93.67% | 90.24% | 95.86% | 91.93% | 0.9756 |

As an extra sanity check, the deployed app classified all **5/5** public sample X-rays in `test_images/` correctly (3 normal, 2 pneumonia). This is a smoke test, not an evaluation.

---

## 6. Using the web application

Open **http://localhost:8000/app/**. The page is a single page with these sections:

| Section | What it does |
|---|---|
| **Header** | Brand, navigation, and a live **model status**: *Checking model…* → *Model ready* (green) / *Model unavailable* / *Server unavailable*. The status is checked against `GET /health` every few seconds. |
| **Hero** | Project tagline, "Start analysis" and "Explore the workflow" buttons. The scan card is an illustration, not a patient result. |
| **Capabilities strip** | 01 Image enhancement · 02 Model inference · 03 Visual explanation. |
| **Analysis workspace** | **Left panel:** drag-and-drop or browse (PNG/JPG, max 12 MB), preview, file size, remove button, Analyze button (disabled until a valid image is chosen and during analysis, so it can't be double-submitted). **Right panel:** results (below). |
| **Results** | Pneumonia/Normal banner (colour + icon + text), predicted class, prediction confidence, pneumonia probability with a bar and 0.55 threshold marker, the severity estimate with its method and caveat, the Grad-CAM viewer (heatmap toggle, region-box toggle, opacity slider), and 4 thumbnails: **Original X-ray · CLAHE enhanced · Grad-CAM heatmap · Attention overlay**. |
| **"This may not be a chest X-ray" warning** | Appears when the upload is colourful, mostly white (screenshot/document), or has an unusual shape. The model will output *some* answer for any image, so this warns that the result is meaningless. |
| **From image to insight** | The 3-step pipeline (CLAHE → EfficientNetB0 → Grad-CAM), plus an expandable *Model details & reported evaluation* panel. |
| **PneumoBot** | "Ask PneumoBot" button (bottom-right). It posts each new result with general guidance and answers questions on medications, hospital care, symptoms, recovery time and oxygen levels for the current severity. Off-topic questions are declined. |
| **Footer** | Project title and "Back to top". |

The layout is responsive (desktop, tablet, mobile), keyboard accessible (Tab to the dropzone, Enter to browse, Esc closes the bot), and respects the "reduce motion" setting.

---

## 7. Backend API

Base URL: `http://localhost:8000`. Interactive documentation: **http://localhost:8000/docs**.

### `GET /health`
```json
{ "status": "ok", "model_loaded": true, "model_path": "...", "error": null }
```

### `POST /predict`
Multipart form with field **`file`** (PNG or JPG, ≤ 15 MB on the server; the UI limits uploads to 12 MB).

```json
{
  "prediction": "Pneumonia",
  "confidence": 99.16,              // pneumonia probability in %
  "probability": 0.9916,            // raw sigmoid output
  "threshold": 0.55,
  "severity": "Severe Pneumonia",
  "severity_color": "#e74c3c",
  "original_image": "<base64 PNG>",  // display copy, longest side ≤ 1024 px
  "clahe_image":    "<base64 PNG>",  // display copy, longest side ≤ 1024 px
  "gradcam_image":  "<base64 PNG>",  // 224×224 grayscale heatmap
  "overlay_image":  "<base64 PNG>",  // 224×224 heatmap blended on the CLAHE input
  "recommendations": ["GO TO EMERGENCY ROOM IMMEDIATELY", "..."],
  "bot_message": "SEVERE pneumonia detected. Go to emergency immediately."
}
```

| Status | When |
|---|---|
| 400 | Not JPG/PNG, empty or corrupt image |
| 413 | File larger than 15 MB |
| 422 | Missing `file` field |
| 503 | Model not loaded |
| 500 | Unexpected prediction failure |

### `POST /chat`
```json
// request
{ "message": "How long will recovery take?", "severity": "Mild Pneumonia" }
// response
{ "response": "Recovery time for Mild Pneumonia: 1-2 weeks with proper home rest and antibiotics." }
```
The bot ([`backend/bot.py`](backend/bot.py)) is fully rule-based (no external AI service). It first checks for pneumonia-related keywords; anything else gets *"I can only assist with pneumonia-related queries."* Then it routes the question (medication / hospital / symptoms / recovery / oxygen / general) and answers using the guidance table for the current severity.

---

## 8. Project structure

```
pneumonia project/
├── pneumonia_final_v2.keras     ← trained model used by the app (53 MB)
├── start.bat                    ← one-click setup + run (Windows)
├── README.md                    ← this file
├── PneumoAI_Tech_Stack_Document.docx ← detailed technology stack document (Word)
├── backend/
│   ├── app.py                   ← FastAPI server: CORS, model loading, /health /predict /chat, serves frontend at /app
│   ├── model_utils.py           ← CLAHE preprocessing, Grad-CAM, severity mapping, base64 encoding
│   ├── bot.py                   ← PneumoBot rules and severity guidance
│   ├── requirements.txt         ← pinned Python dependencies
│   └── .venv/                   ← Python virtual environment (created on first run)
├── frontend/
│   ├── index.html               ← page structure (all sections)
│   ├── style.css                ← teal / off-white medical theme, responsive rules
│   └── script.js                ← upload, validation, API calls, results, Grad-CAM viewer, PneumoBot
└── test_images/                 ← 5 public chest X-rays for demos (Wikimedia Commons, see SOURCES.md)
```

**Sample images** (`test_images/`, from Wikimedia Commons; authors and licences in [`test_images/SOURCES.md`](test_images/SOURCES.md)):

| File | Ground truth | App result |
|---|---|---|
| `normal_1.png` | Normal | Normal (p = 0.04%) |
| `normal_2.jpg` | Normal | Normal (p = 3.20%) |
| `normal_3.jpg` | Normal | Normal (p = 2.64%) |
| `pneumonia_1_lobar.jpg` | Lobar pneumonia | Pneumonia (p = 70.96%, Moderate) |
| `pneumonia_2_haemophilus.jpg` | Pneumonia (H. influenzae) | Pneumonia (p = 99.16%, Severe) |

---

## 9. Manual setup (Windows / VS Code)

Use this if you prefer not to use `start.bat`.

1. Install **Python 3.12** from https://www.python.org/downloads/ and tick **"Add Python to PATH"**.
2. Open the `pneumonia project` folder in **VS Code** (File → Open Folder) and open a terminal (`` Ctrl + ` ``).
3. Create the environment and install dependencies (once):
   ```powershell
   cd backend
   python -m venv .venv
   .venv\Scripts\python.exe -m pip install --upgrade pip
   .venv\Scripts\python.exe -m pip install -r requirements.txt
   ```
4. Start the server (every time):
   ```powershell
   cd backend
   .venv\Scripts\python.exe -m uvicorn app:app --port 8000
   ```
   Wait for `✅ Model loaded successfully`.
5. Open **http://localhost:8000/app/** in a browser.
   - Opening `frontend/index.html` directly from disk also works; it calls the API at `http://localhost:8000`.
   - API docs are at http://localhost:8000/docs.

> **Why TensorFlow 2.20 and not 2.15?** The model file was saved with **Keras 3.13.2**. TensorFlow 2.15 ships Keras 2, which cannot read Keras 3 `.keras` files. `requirements.txt` therefore pins `tensorflow==2.20.0` and `keras==3.13.2`.

---

## 10. Testing that was performed

All tests below were run against the real model on this machine (Windows 11, Python 3.12.10, CPU only) and passed:

| Suite | Checks | What is covered |
|---|---|---|
| Backend API | 49 / 49 | `/health`, `/docs`, static files. `/predict` on all 5 sample images: response fields, 0.55 threshold rule, severity mapping and colours, image sizes, recommendations. Determinism. Errors: empty/corrupt/PDF/TXT → 400, > 15 MB → 413, missing field → 422, wrong method → 405. Edge images (8 × 8, all-black, RGBA, 16-bit). 10 concurrent requests. 16 chatbot cases (every route × severity, off-topic, empty, unknown severity). CORS (other port and `file://`). Severity boundaries 0.55 / 0.70 / 0.85. |
| Model pipeline | 18 / 18 | Model loads standalone: 5,218,439 parameters, input 224 × 224 × 3, sigmoid output, `top_conv` exists. Preprocessing exactly matches the CLAHE(2.0, 8 × 8) + INTER_AREA recipe. Standalone predictions equal API predictions on all images. Grad-CAM is non-empty and image-specific. |
| Browser: core flow | 32 / 32 | Page/CSS load, status, file-type and 12 MB validation, preview/filename/size, remove, analyze, duplicate-click protection (1 request on 3 clicks), displayed values equal the API response, CLAHE/heatmap/overlay rendering, Normal vs Pneumonia banners, PneumoBot, network error, server error (internals hidden), missing Grad-CAM fallback, no horizontal overflow at 1440 / 820 / 390 px, no console errors. |
| Browser: extras | 35 / 35 | Keyboard-only use (Tab → Enter → file chooser → Enter to analyze), real drag-and-drop, viewer toggles and opacity slider, region-box rules (Pneumonia only), bot auto-message, bot chips use the current severity, blank messages ignored, Esc closes the bot, all navigation links and Back to top, model details panel, *Model unavailable* / *Server unavailable* states, opening `index.html` via `file://`, mobile bot panel and long file names, reduced-motion mode. |

**Not tested:** screen-reader output, browsers other than Microsoft Edge (Chromium), and DICOM (`.dcm`) files (not supported; see below).

---

## 11. Limitations and honest notes

- **Not clinically validated.** Results come from one public dataset (RSNA). Performance on other hospitals' X-rays may differ.
- **Severity is a heuristic.** It maps the model's pneumonia *probability* to levels (0.55 / 0.70 / 0.85). A more confident prediction does not necessarily mean a more extensive disease. The training notebook also explored area-based severity from RSNA bounding boxes, but the deployed app uses the probability-based mapping.
- **Probabilities are not calibrated.** "99%" means a high model score, not a 99% chance the diagnosis is right.
- **Grad-CAM is approximate.** It is computed at 7 × 7 resolution and upsampled, so the boxes are coarse. For Normal predictions the heatmap may highlight non-lung areas; this does not indicate disease.
- **Any image gets an answer.** The model was trained only on chest X-rays. Screenshots, photos or blank images still receive a prediction, which is why the app shows a "may not be a chest X-ray" warning. The check is a simple heuristic and cannot catch every case (for example, an all-black square image).
- **PneumoBot gives general, rule-based guidance.** Medication names and doses are illustrative textbook examples and must be decided by a doctor.
- **Formats:** PNG and JPG only. DICOM files must be converted to PNG first.
- **Speed:** about 2–4 seconds per image on a laptop CPU (Grad-CAM takes the longest). The first request after start-up can be slower.
- **Privacy:** images are processed by the local server on your own computer (`localhost`) and are not stored or sent elsewhere. Use de-identified images.

---

## 12. Troubleshooting

| Problem | Fix |
|---|---|
| Header says **Server unavailable** | The backend is not running. Start `start.bat` (or the uvicorn command) and keep its window open. |
| Header says **Model unavailable** | `pneumonia_final_v2.keras` is missing from the project folder or failed to load. Check the server window for the error message. |
| `Python was not found` | Install Python 3.12 with "Add Python to PATH" ticked, then rerun `start.bat`. |
| `pip install` fails | Check your internet connection. Delete `backend\.venv` and run `start.bat` again. |
| Port 8000 already in use | Another server is running. Close the other `start.bat` window, or run `netstat -ano | findstr :8000` and end that process. |
| Red "NativeCommandError … oneDNN" text in PowerShell | Harmless. These are TensorFlow information messages printed on stderr. |
| Page looks old after an update | Hard-refresh the browser with `Ctrl + F5`. |

---

## 13. Technologies used

| Technology | Version | Purpose |
|---|---|---|
| Python | 3.12 | Core language |
| TensorFlow / Keras | 2.20.0 / 3.13.2 | Loading the model, inference, gradients for Grad-CAM |
| EfficientNetB0 | ImageNet pre-trained | CNN backbone (transfer learning) |
| OpenCV | 4.11 | Image decoding, CLAHE, resizing, Grad-CAM colour map |
| NumPy, Pillow | — | Array maths, PNG encoding |
| FastAPI + Uvicorn | 0.115.6 / 0.34.0 | REST API server |
| HTML5 + CSS3 + Vanilla JavaScript | — | Frontend (no framework); Canvas API for the Grad-CAM viewer |
| DM Sans, Manrope | Google Fonts | Typography |
| Training (not in this repo) | Kaggle GPU T4 × 2, scikit-learn, Matplotlib, Seaborn, PyDICOM | Model training and evaluation |

---

*Deep Learning-Based Pneumonia Detection and Severity Assessment from Chest X-Ray Images Using CLAHE-Enhanced EfficientNet and Explainable AI. Dataset: RSNA Pneumonia Detection Challenge.*
