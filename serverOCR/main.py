# main.py
import base64
import io
import unicodedata

import cv2
import numpy as np
from PIL import Image
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from pathlib import Path

from vietocr.tool.predictor import Predictor
from vietocr.tool.config import Cfg
from datetime import datetime

# SMART MODE (optional)
HAS_PYVI = False
try:
    from pyvi import ViTokenizer
    HAS_PYVI = True
except ImportError:
    ViTokenizer = None

# =========================
# CONFIG
# =========================
USE_GPU = False
PORT = 8000
SCALE_UP = 3
SAVE_DEBUG_IMAGES = True
DEBUG_IMAGE_DIR = Path("debug_images")

# =========================
# INIT VIETOCR
# =========================
cfg = Cfg.load_config_from_name("vgg_transformer")
cfg["device"] = "cuda" if USE_GPU else "cpu"
cfg["predictor"]["beamsearch"] = True
cfg["cnn"]["pretrained"] = True

predictor = Predictor(cfg)
print("✅ VietOCR loaded")

# =========================
# FASTAPI
# =========================
app = FastAPI(title="VietOCR Smart Server")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

class OCRRequest(BaseModel):
    image_base64: str
    smart: bool = False   # 👈 toggle smart mode

# =========================
# UTILS
# =========================
def base64_to_pil(b64: str) -> Image.Image:
    if "," in b64:
        b64 = b64.split(",")[1]
    data = base64.b64decode(b64)
    return Image.open(io.BytesIO(data)).convert("RGB")

def preprocess_canvas(img: Image.Image) -> Image.Image:
    img_np = np.array(img)

    # invert
    img_np = cv2.bitwise_not(img_np)

    # scale up
    h, w, _ = img_np.shape
    img_np = cv2.resize(
        img_np,
        (w * SCALE_UP, h * SCALE_UP),
        interpolation=cv2.INTER_CUBIC
    )

    # grayscale
    gray = cv2.cvtColor(img_np, cv2.COLOR_BGR2GRAY)

    # adaptive threshold
    th = cv2.adaptiveThreshold(
        gray,
        255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY,
        31,
        10
    )

    return Image.fromarray(th)

# =========================
# POST PROCESS
# =========================
COMMON_FIX = {
    " be ha": " bệ hạ",
}

def post_process(text: str, smart: bool = False) -> str:
    # 1. unicode normalize (BẮT BUỘC)
    text = unicodedata.normalize("NFC", text)

    # 2. rule-based fix
    low = f" {text.lower()} "
    for k, v in COMMON_FIX.items():
        low = low.replace(k, v)
    text = low.strip()

    # 3. SMART MODE: pyvi
    if smart and HAS_PYVI:
        text = ViTokenizer.tokenize(text)
        text = text.replace("_", " ")

    # 4. cleanup space
    text = " ".join(text.split())

    return text

# =========================
# API
# =========================
@app.post("/ocr")
def ocr(req: OCRRequest):
    try:
        print(f"[{datetime.now().isoformat()}] /ocr request: "
              f"has_image={bool(req.image_base64)}, "
              f"len={len(req.image_base64 or '')}, "
              f"prefix={(req.image_base64 or '')[:30]!r}, "
              f"smart={req.smart}")
        img = base64_to_pil(req.image_base64)
        img_np = np.array(img)
        print(f"[{datetime.now().isoformat()}] image stats: "
              f"size={img.size}, "
              f"min={img_np.min()}, "
              f"max={img_np.max()}, "
              f"mean={img_np.mean():.2f}")
        if SAVE_DEBUG_IMAGES:
            DEBUG_IMAGE_DIR.mkdir(parents=True, exist_ok=True)
            ts = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
            raw_path = DEBUG_IMAGE_DIR / f"input_raw_{ts}.png"
            img.save(raw_path)
        img = preprocess_canvas(img)
        if SAVE_DEBUG_IMAGES:
            processed_path = DEBUG_IMAGE_DIR / f"input_processed_{ts}.png"
            img.save(processed_path)

        raw = predictor.predict(img)
        text = post_process(raw, smart=req.smart)
        print(f"✅ OCR success: raw_len={len(raw)}, text_len={len(text)}, text={text!r}")
        return {
            "success": True,
            "smart": req.smart,
            "raw": raw,
            "text": text
        }

    except Exception as e:
        return {"success": False, "error": str(e)}

# =========================
# RUN
# =========================
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=PORT)
