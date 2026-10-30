from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import tensorflow as tf
import numpy as np
from model_utils import preprocess_image, generate_gradcam, get_severity, is_decodable_image
from bot import get_bot_response, get_clinical_assistance, SEVERITY_DATA
import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
# Resolved relative to this file so the server works no matter which folder uvicorn is started from
MODEL_PATH = os.path.normpath(os.path.join(BASE_DIR, "..", "pneumonia_final_v2.keras"))
FRONTEND_DIR = os.path.normpath(os.path.join(BASE_DIR, "..", "frontend"))
THRESHOLD = 0.55
ALLOWED_TYPES = ["image/jpeg", "image/png", "image/jpg"]
ALLOWED_EXTENSIONS = (".jpg", ".jpeg", ".png")
MAX_UPLOAD_BYTES = 15 * 1024 * 1024

app = FastAPI(
    title="PneumoAI — Pneumonia Detection API",
    description="Deep Learning-Based Pneumonia Detection and Severity Assessment from Chest X-Ray Images "
                "Using CLAHE-Enhanced EfficientNet and Explainable AI",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

model = None
model_error = None


@app.on_event("startup")
async def load_model():
    global model, model_error
    try:
        model = tf.keras.models.load_model(MODEL_PATH, compile=False)
        # Warm-up pass so the first real request is not slowed by graph tracing
        model.predict(np.zeros((1, 224, 224, 3), dtype=np.float32), verbose=0)
        print(f"[OK] Model loaded successfully from {MODEL_PATH}")
    except Exception as e:
        model_error = str(e)
        print(f"[ERROR] Model load failed: {e}")


@app.get("/health")
def health_check():
    return {
        "status": "ok",
        "model_loaded": model is not None,
        "model_path": MODEL_PATH,
        "error": model_error
    }


@app.post("/predict")
async def predict(file: UploadFile = File(...)):
    if model is None:
        raise HTTPException(status_code=503, detail="The AI model is not loaded. Please check that pneumonia_final_v2.keras is in the project folder and restart the server.")

    filename = (file.filename or "").lower()
    if file.content_type not in ALLOWED_TYPES and not filename.endswith(ALLOWED_EXTENSIONS):
        raise HTTPException(status_code=400, detail="Only JPG and PNG images are supported. Please upload a chest X-ray in one of these formats.")

    contents = await file.read()
    if len(contents) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="The image is too large. Please upload a file smaller than 15 MB.")
    if not is_decodable_image(contents):
        raise HTTPException(status_code=400, detail="This file could not be read as an image. Please upload a valid chest X-ray (JPG or PNG).")

    try:
        img_array, original_base64, clahe_base64 = preprocess_image(contents)
        prob = float(model.predict(np.expand_dims(img_array, 0), verbose=0)[0][0])
        prediction = "Pneumonia" if prob >= THRESHOLD else "Normal"
        confidence = round(prob * 100, 2)
        severity, severity_color = get_severity(prob)
        gradcam_base64, overlay_base64 = generate_gradcam(model, img_array)
        severity_key = severity if severity in SEVERITY_DATA else "Normal"
        recommendations = SEVERITY_DATA[severity_key]["advice"]

        return JSONResponse({
            "prediction": prediction,
            "confidence": confidence,
            "probability": round(prob, 4),
            "threshold": THRESHOLD,
            "severity": severity,
            "severity_color": severity_color,
            "original_image": original_base64,
            "clahe_image": clahe_base64,
            "gradcam_image": gradcam_base64,
            "overlay_image": overlay_base64,
            "recommendations": recommendations,
            "clinical_assistance": get_clinical_assistance(prediction, prob, severity, THRESHOLD),
            "bot_message": SEVERITY_DATA[severity_key]["initial"]
        })

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Prediction failed: {str(e)}")


class ChatRequest(BaseModel):
    message: str
    severity: str = "Normal"


@app.post("/chat")
def chat(request: ChatRequest):
    if not request.message.strip():
        raise HTTPException(status_code=400, detail="Please type a question first.")
    try:
        response = get_bot_response(request.message, request.severity)
        return {"response": response}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Chat failed: {str(e)}")


# Also serve the frontend from the backend, so http://localhost:8000/app works with no second server
if os.path.isdir(FRONTEND_DIR):
    app.mount("/app", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")

    @app.get("/", include_in_schema=False)
    def root():
        return RedirectResponse(url="/app/")
