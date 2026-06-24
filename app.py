from __future__ import annotations

import os
import threading
import time
from collections import defaultdict, deque
from typing import Any, Dict

import requests
from flask import Flask, jsonify, render_template, request

from ai_analysis import generate_ai_analysis
from calculations import CalculationError, CalculatorInput, calculate_roi

app = Flask(__name__)
app.config["JSON_SORT_KEYS"] = False
app.config["MAX_CONTENT_LENGTH"] = 128 * 1024

_rate_buckets: dict[str, deque[float]] = defaultdict(deque)
_rate_lock = threading.Lock()
RATE_LIMIT = int(os.getenv("CALCULATOR_RATE_LIMIT", "15"))
RATE_WINDOW_SECONDS = 60 * 60


def _client_ip() -> str:
    forwarded = request.headers.get("X-Forwarded-For", "")
    return (forwarded.split(",")[0].strip() if forwarded else request.remote_addr) or "unknown"


def _rate_limited() -> bool:
    now = time.time()
    ip = _client_ip()
    with _rate_lock:
        bucket = _rate_buckets[ip]
        while bucket and bucket[0] <= now - RATE_WINDOW_SECONDS:
            bucket.popleft()
        if len(bucket) >= RATE_LIMIT:
            return True
        bucket.append(now)
    return False


def _clean_contact(payload: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "name": str(payload.get("name", "")).strip()[:100],
        "email": str(payload.get("email", "")).strip()[:160],
        "phone": str(payload.get("phone", "")).strip()[:40],
        "consent": bool(payload.get("consent", False)),
    }


def _validate_contact(contact: Dict[str, Any]) -> None:
    if len(contact["name"]) < 2:
        raise CalculationError("Informe seu nome para identificar o diagnóstico.")
    phone_digits = "".join(ch for ch in contact["phone"] if ch.isdigit())
    if len(phone_digits) < 10:
        raise CalculationError("Informe um WhatsApp válido.")
    if not contact["consent"]:
        raise CalculationError("É necessário aceitar o uso dos dados para gerar o diagnóstico.")


def _send_webhook(contact: Dict[str, Any], result: Dict[str, Any], analysis: Dict[str, Any]) -> bool:
    webhook_url = os.getenv("LEAD_WEBHOOK_URL", "").strip()
    if not webhook_url:
        return False

    try:
        response = requests.post(
            webhook_url,
            json={
                "source": "calculadora_roi_verticale",
                "contact": contact,
                "calculation": result,
                "analysis": analysis,
            },
            timeout=6,
        )
        response.raise_for_status()
        return True
    except requests.RequestException:
        return False


@app.after_request
def security_headers(response):
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "SAMEORIGIN"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; "
        "style-src 'self' 'unsafe-inline'; "
        "font-src 'self'; "
        "script-src 'self' 'unsafe-inline'; "
        "connect-src 'self'; img-src 'self' data:; base-uri 'self'; form-action 'self'"
    )
    return response


@app.get("/")
def index():
    return render_template(
        "index.html",
        whatsapp_number=os.getenv("WHATSAPP_NUMBER", "5512999999999"),
        privacy_url=os.getenv("PRIVACY_URL", "#"),
    )


@app.get("/health")
def health():
    return jsonify({"status": "ok"})


@app.post("/api/calculate")
def calculate():
    if _rate_limited():
        return jsonify(
            {
                "ok": False,
                "error": "Muitas análises foram solicitadas deste acesso. Tente novamente mais tarde.",
            }
        ), 429

    payload = request.get_json(silent=True) or {}
    try:
        contact = _clean_contact(payload.get("contact", {}))
        _validate_contact(contact)
        data = CalculatorInput.from_payload(payload)
        result = calculate_roi(data)
        analysis = generate_ai_analysis(result)
        webhook_sent = _send_webhook(contact, result, analysis)
        return jsonify(
            {
                "ok": True,
                "result": result,
                "analysis": analysis,
                "lead_received": True,
                "webhook_sent": webhook_sent,
            }
        )
    except CalculationError as exc:
        return jsonify({"ok": False, "error": str(exc)}), 400
    except Exception:
        return jsonify(
            {
                "ok": False,
                "error": "Não foi possível concluir a análise. Revise os dados e tente novamente.",
            }
        ), 500


if __name__ == "__main__":
    port = int(os.getenv("PORT", "5000"))
    app.run(host="0.0.0.0", port=port, debug=os.getenv("FLASK_DEBUG") == "1")
