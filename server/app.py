# server/app.py
import os
import logging
from io import BytesIO
from typing import Any, Dict, List

from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware

import PyPDF2
from PIL import Image, UnidentifiedImageError
import pytesseract

import nltk
from nltk.corpus import stopwords
from nltk.tokenize import word_tokenize, sent_tokenize
from collections import defaultdict
import base64
import re

# --------------------------
# Logging & config
# --------------------------
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("local-summarizer")

# If you want to configure a TESSERACT path (Windows), set TESSERACT_CMD env var
tesseract_cmd_override = os.getenv("TESSERACT_CMD")
if tesseract_cmd_override:
    pytesseract.pytesseract.tesseract_cmd = tesseract_cmd_override

# FastAPI app
app = FastAPI(title="Local Summarizer", version="1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # restrict in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
)

# Ensure NLTK data exists (download if missing)
try:
    nltk.data.find("tokenizers/punkt")
except LookupError:
    logger.info("Downloading punkt...")
    nltk.download("punkt")

try:
    nltk.data.find("corpora/stopwords")
except LookupError:
    logger.info("Downloading stopwords...")
    nltk.download("stopwords")

STOPWORDS = set(stopwords.words("english"))

# --------------------------
# Helpers: extract text
# --------------------------
def decode_inline_data(part: Dict[str, Any]) -> bytes:
    inline = part.get("inlineData")
    if not inline or "data" not in inline:
        raise ValueError("No inlineData.data found in part")
    b64 = inline["data"]
    return base64.b64decode(b64)

def extract_text_from_pdf_bytes(file_bytes: bytes) -> str:
    try:
        reader = PyPDF2.PdfReader(BytesIO(file_bytes))
        texts = []
        for page in reader.pages:
            try:
                txt = page.extract_text() or ""
            except Exception:
                txt = ""
            if txt:
                texts.append(txt)
        return "\n".join(texts).strip()
    except Exception as e:
        logger.exception("PDF extraction failed: %s", e)
        return ""

def extract_text_from_image_bytes(file_bytes: bytes) -> str:
    try:
        img = Image.open(BytesIO(file_bytes)).convert("RGB")
        text = pytesseract.image_to_string(img)
        return text.strip()
    except UnidentifiedImageError:
        logger.exception("Unidentified image")
        return ""
    except Exception as e:
        logger.exception("Image OCR failed: %s", e)
        return ""

def extract_text(mime_type: str, file_bytes: bytes) -> str:
    if mime_type in ("application/pdf", "application/x-pdf"):
        text = extract_text_from_pdf_bytes(file_bytes)
        if text:
            return text
        # try OCR fallback for scanned PDFs (attempt to open as image pages omitted for brevity)
    if mime_type.startswith("image/"):
        return extract_text_from_image_bytes(file_bytes)
    # fallback: try pdf then image
    text = extract_text_from_pdf_bytes(file_bytes)
    if text:
        return text
    return extract_text_from_image_bytes(file_bytes)

# --------------------------
# Summarizer: extractive frequency-based
# --------------------------
def normalize_word(w: str) -> str:
    return re.sub(r'[^a-zA-Z0-9]', '', w).lower()

def build_word_freq(text: str) -> Dict[str, int]:
    words = word_tokenize(text)
    freq = defaultdict(int)
    for w in words:
        nw = normalize_word(w)
        if not nw:
            continue
        if nw in STOPWORDS:
            continue
        freq[nw] += 1
    return freq

def score_sentences(sentences: List[str], freq: Dict[str, int]) -> Dict[int, float]:
    scores = {}
    for idx, sent in enumerate(sentences):
        words = word_tokenize(sent)
        score = 0.0
        for w in words:
            nw = normalize_word(w)
            if not nw:
                continue
            score += freq.get(nw, 0)
        scores[idx] = score / (len(words) + 1)
    return scores

def extractive_summarize(text: str, max_sentences: int = 4) -> str:
    if not text or len(text.strip()) < 50:
        return text.strip()
    sentences = sent_tokenize(text)
    if len(sentences) <= max_sentences:
        return "\n\n".join(sentences)
    freq = build_word_freq(text)
    if not freq:
        return "\n\n".join(sentences[:max_sentences])
    scores = score_sentences(sentences, freq)
    top_idxs = sorted(scores, key=lambda i: scores[i], reverse=True)[:max_sentences]
    top_idxs_sorted = sorted(top_idxs)
    selected = [sentences[i] for i in top_idxs_sorted]
    return "\n\n".join(selected)

# --------------------------
# API route
# --------------------------
@app.post("/api/summarize")
async def summarize_route(request: Request):
    try:
        payload = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON payload")

    contents = payload.get("contents")
    if not contents or not isinstance(contents, list):
        raise HTTPException(status_code=400, detail="Missing 'contents' array")

    file_bytes = None
    mime_type = None
    prompt_text = None

    for content in contents:
        parts = content.get("parts", [])
        for part in parts:
            if isinstance(part, dict) and "inlineData" in part:
                inline = part["inlineData"]
                mime_type = inline.get("mimeType")
                b64 = inline.get("data")
                if b64:
                    try:
                        file_bytes = base64.b64decode(b64)
                    except Exception:
                        raise HTTPException(status_code=400, detail="Invalid base64 data")
            elif isinstance(part, dict) and "text" in part and not prompt_text:
                prompt_text = part["text"]

    if not file_bytes:
        raise HTTPException(status_code=400, detail="No inline file data found")

    logger.info("Extracting text from file (mime=%s)", mime_type)
    extracted_text = extract_text(mime_type or "", file_bytes)
    if not extracted_text:
        return JSONResponse(status_code=200, content={
            "summary": "",
            "message": "No text could be extracted from the file. If it's an image, ensure it contains printed text (OCR)."
        })

    combined_text = (prompt_text + "\n\n" + extracted_text) if prompt_text else extracted_text
    summary = extractive_summarize(combined_text, max_sentences=4)

    return JSONResponse(status_code=200, content={
        "summary": summary,
        "source_text_length": len(extracted_text),
        "source_mime_type": mime_type or "unknown"
    })

@app.get("/health")
def health():
    return {"status": "ok"}

# --------------------------
# Run with uvicorn when executed directly
# --------------------------
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="0.0.0.0", port=int(os.getenv("PORT", 5200)), reload=True)
