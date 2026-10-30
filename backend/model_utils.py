import cv2
import numpy as np
import tensorflow as tf
import base64
from PIL import Image
import io


def image_to_base64(img_array):
    if len(img_array.shape) == 2:
        img = Image.fromarray(img_array)
    else:
        img = Image.fromarray(img_array.astype(np.uint8))
    buffer = io.BytesIO()
    img.save(buffer, format='PNG')
    return base64.b64encode(buffer.getvalue()).decode('utf-8')


def is_decodable_image(image_bytes):
    """Return True if OpenCV can decode the bytes as an image (used for input validation only)."""
    if not image_bytes:
        return False
    img = cv2.imdecode(np.frombuffer(image_bytes, np.uint8), cv2.IMREAD_GRAYSCALE)
    return img is not None and img.size > 0


def preprocess_image(image_bytes):
    img_array = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(img_array, cv2.IMREAD_GRAYSCALE)
    img = cv2.normalize(img, None, 0, 255, cv2.NORM_MINMAX).astype(np.uint8)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    img_clahe = clahe.apply(img)
    img_resized = cv2.resize(img_clahe, (224, 224), interpolation=cv2.INTER_AREA)
    img_rgb = np.stack([img_resized, img_resized, img_resized], axis=-1).astype(np.float32)
    # Display copies only: the model input above is computed from the full-resolution image
    original_base64 = image_to_base64(display_copy(img))
    clahe_base64 = image_to_base64(display_copy(img_clahe))
    return img_rgb, original_base64, clahe_base64


DISPLAY_MAX_SIDE = 1024


def display_copy(img, max_side=DISPLAY_MAX_SIDE):
    """Downscale an image for the browser (keeps aspect ratio); large X-rays would otherwise send ~15 MB per response."""
    h, w = img.shape[:2]
    scale = max_side / max(h, w)
    if scale >= 1:
        return img
    return cv2.resize(img, (round(w * scale), round(h * scale)), interpolation=cv2.INTER_AREA)


def generate_gradcam(model, img_array):
    grad_model = tf.keras.Model(
        inputs=model.inputs,
        outputs=[model.get_layer('top_conv').output, model.output]
    )
    with tf.GradientTape() as tape:
        conv_outputs, predictions = grad_model(np.expand_dims(img_array, 0))
        loss = predictions[:, 0]
    grads = tape.gradient(loss, conv_outputs)
    pooled_grads = tf.reduce_mean(grads, axis=(0, 1, 2))
    conv_outputs = conv_outputs[0]
    heatmap = conv_outputs @ pooled_grads[..., tf.newaxis]
    heatmap = tf.squeeze(heatmap).numpy()
    heatmap = np.maximum(heatmap, 0)
    heatmap = heatmap / (heatmap.max() + 1e-8)
    heatmap = cv2.resize(heatmap, (224, 224))
    heatmap_uint8 = np.uint8(255 * heatmap)
    colormap = cv2.applyColorMap(heatmap_uint8, cv2.COLORMAP_JET)
    colormap = cv2.cvtColor(colormap, cv2.COLOR_BGR2RGB)
    base = np.stack([img_array[:, :, 0]] * 3, axis=-1) / 255.0
    overlay = base + 0.4 * colormap / 255.0
    overlay = overlay / overlay.max()
    overlay = np.uint8(overlay * 255)
    gradcam_base64 = image_to_base64(heatmap_uint8)
    overlay_base64 = image_to_base64(overlay)
    return gradcam_base64, overlay_base64


def get_severity(confidence):
    if confidence < 0.55:
        return "Normal", "#27ae60"
    elif confidence < 0.70:
        return "Mild Pneumonia", "#f39c12"
    elif confidence < 0.85:
        return "Moderate Pneumonia", "#e67e22"
    else:
        return "Severe Pneumonia", "#e74c3c"
