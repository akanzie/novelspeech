# testocr.py
import base64
import requests

SERVER_URL = "http://127.0.0.1:8000/ocr"
IMAGE_PATH = "test.png"   # đổi nếu ảnh khác
SMART_MODE = True         # bật / tắt smart mode

def image_to_base64(path: str) -> str:
    with open(path, "rb") as f:
        return base64.b64encode(f.read()).decode("utf-8")

def main():
    img_b64 = image_to_base64(IMAGE_PATH)

    payload = {
        "image_base64": img_b64,
        "smart": SMART_MODE
    }

    print("📤 Sending OCR request...")
    res = requests.post(SERVER_URL, json=payload, timeout=60)

    if res.status_code != 200:
        print("❌ HTTP error:", res.status_code)
        print(res.text)
        return

    data = res.json()

    if not data.get("success"):
        print("❌ OCR failed")
        print(data.get("error"))
        return

    print("\n====== OCR RESULT ======")
    print("SMART MODE:", data["smart"])
    print("\n--- RAW ---")
    print(data["raw"])
    print("\n--- POST PROCESSED ---")
    print(data["text"])
    print("========================")

if __name__ == "__main__":
    main()
