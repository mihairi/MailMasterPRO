"""MailMaster PRO backend — SQLite/SQLCipher edition."""
from dotenv import load_dotenv
from pathlib import Path
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

import os
import uuid
import shutil
import secrets
import tempfile
import logging
import traceback
import asyncio
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any

from fastapi import FastAPI, APIRouter, Depends, HTTPException, UploadFile, File, Form, Request, Response, Header
from starlette.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr

import database as db
from auth import (
    hash_password, verify_password,
    create_access_token, create_refresh_token, decode_token,
    get_current_user, require_admin,
)
from doc_service import parse_excel, replace_placeholders_text, build_personalized_pdf
from email_service import send_email

# ----------------- app -----------------
app = FastAPI(title="MailMaster PRO API")
api = APIRouter(prefix="/api")

STORAGE_DIR = ROOT_DIR / "storage"
WORD_TEMPLATES_DIR = STORAGE_DIR / "word_templates"
UPLOADS_DIR = STORAGE_DIR / "uploads"
STORAGE_DIR.mkdir(exist_ok=True)
WORD_TEMPLATES_DIR.mkdir(exist_ok=True)
UPLOADS_DIR.mkdir(exist_ok=True)

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("mailmaster-pro")


# ----------------- helpers -----------------
def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def gen_id() -> str:
    return str(uuid.uuid4())


def _set_auth_cookies(resp: Response, access: str, refresh: str):
    resp.set_cookie("access_token", access, httponly=True, secure=False, samesite="lax", max_age=43200, path="/")
    resp.set_cookie("refresh_token", refresh, httponly=True, secure=False, samesite="lax", max_age=604800, path="/")


# ----------------- Pydantic models -----------------
class LoginInput(BaseModel):
    email: EmailStr
    password: str


class CreateUserInput(BaseModel):
    email: EmailStr
    password: str
    name: str = ""
    role: str = "user"


class EmailTemplateInput(BaseModel):
    name: str
    subject: str
    body_html: str


class SendCampaignExternalInput(BaseModel):
    template_id: str
    word_template_id: Optional[str] = None
    recipients: List[Dict[str, Any]]


class ApiKeyCreateInput(BaseModel):
    name: str


# ----------------- Auth -----------------
@api.post("/auth/login")
async def login(payload: LoginInput, response: Response):
    user = db.fetch_one("SELECT * FROM users WHERE email = ?", (payload.email.lower(),))
    if not user or not verify_password(payload.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    access = create_access_token(user["id"], user["email"], user["role"])
    refresh = create_refresh_token(user["id"])
    _set_auth_cookies(response, access, refresh)
    user.pop("password_hash", None)
    return {"user": user, "access_token": access, "token_type": "bearer"}


@api.post("/auth/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")
    return {"ok": True}


@api.get("/auth/me")
async def me(user=Depends(get_current_user)):
    return user


@api.post("/auth/refresh")
async def refresh(request: Request, response: Response):
    token = request.cookies.get("refresh_token")
    if not token:
        raise HTTPException(status_code=401, detail="No refresh token")
    try:
        payload = decode_token(token)
        if payload.get("type") != "refresh":
            raise HTTPException(status_code=401, detail="Invalid token type")
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid refresh token")
    user = db.fetch_one("SELECT id, email, role FROM users WHERE id = ?", (payload["sub"],))
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    access = create_access_token(user["id"], user["email"], user["role"])
    response.set_cookie("access_token", access, httponly=True, secure=False, samesite="lax", max_age=43200, path="/")
    return {"ok": True}


# ----------------- Users (admin) -----------------
@api.get("/users")
async def list_users(_admin=Depends(require_admin)):
    return db.fetch_all("SELECT id, email, name, role, created_at FROM users ORDER BY created_at DESC")


@api.post("/users")
async def create_user(payload: CreateUserInput, _admin=Depends(require_admin)):
    if payload.role not in ("admin", "user"):
        raise HTTPException(status_code=400, detail="Invalid role")
    existing = db.fetch_one("SELECT id FROM users WHERE email = ?", (payload.email.lower(),))
    if existing:
        raise HTTPException(status_code=400, detail="Email already exists")
    user = {
        "id": gen_id(),
        "email": payload.email.lower(),
        "name": payload.name or payload.email.split("@")[0],
        "role": payload.role,
        "password_hash": hash_password(payload.password),
        "created_at": now_iso(),
    }
    db.execute(
        "INSERT INTO users (id, email, name, role, password_hash, created_at) VALUES (?,?,?,?,?,?)",
        (user["id"], user["email"], user["name"], user["role"], user["password_hash"], user["created_at"]),
    )
    user.pop("password_hash", None)
    return user


@api.delete("/users/{user_id}")
async def delete_user(user_id: str, admin=Depends(require_admin)):
    if admin["id"] == user_id:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    existing = db.fetch_one("SELECT id FROM users WHERE id = ?", (user_id,))
    if not existing:
        raise HTTPException(status_code=404, detail="User not found")
    db.execute("DELETE FROM users WHERE id = ?", (user_id,))
    return {"ok": True}


# ----------------- Email Templates -----------------
@api.get("/email-templates")
async def list_email_templates(_user=Depends(get_current_user)):
    return db.fetch_all("SELECT * FROM email_templates ORDER BY updated_at DESC")


@api.post("/email-templates")
async def create_email_template(payload: EmailTemplateInput, user=Depends(get_current_user)):
    now = now_iso()
    item = {
        "id": gen_id(),
        "name": payload.name,
        "subject": payload.subject,
        "body_html": payload.body_html,
        "created_by": user["email"],
        "created_at": now,
        "updated_at": now,
    }
    db.execute(
        "INSERT INTO email_templates (id, name, subject, body_html, created_by, created_at, updated_at) VALUES (?,?,?,?,?,?,?)",
        (item["id"], item["name"], item["subject"], item["body_html"], item["created_by"], item["created_at"], item["updated_at"]),
    )
    return item


@api.put("/email-templates/{tid}")
async def update_email_template(tid: str, payload: EmailTemplateInput, _user=Depends(get_current_user)):
    existing = db.fetch_one("SELECT id FROM email_templates WHERE id = ?", (tid,))
    if not existing:
        raise HTTPException(status_code=404, detail="Not found")
    db.execute(
        "UPDATE email_templates SET name=?, subject=?, body_html=?, updated_at=? WHERE id=?",
        (payload.name, payload.subject, payload.body_html, now_iso(), tid),
    )
    return db.fetch_one("SELECT * FROM email_templates WHERE id = ?", (tid,))


@api.delete("/email-templates/{tid}")
async def delete_email_template(tid: str, _user=Depends(get_current_user)):
    existing = db.fetch_one("SELECT id FROM email_templates WHERE id = ?", (tid,))
    if not existing:
        raise HTTPException(status_code=404, detail="Not found")
    db.execute("DELETE FROM email_templates WHERE id = ?", (tid,))
    return {"ok": True}


# ----------------- Word Templates -----------------
@api.get("/word-templates")
async def list_word_templates(_user=Depends(get_current_user)):
    return db.fetch_all("SELECT id, name, original_filename, stored_path, uploaded_by, created_at FROM word_templates ORDER BY created_at DESC")


@api.post("/word-templates")
async def upload_word_template(name: str = Form(...), file: UploadFile = File(...), user=Depends(get_current_user)):
    if not file.filename.lower().endswith(".docx"):
        raise HTTPException(status_code=400, detail="Only .docx files are allowed")
    file_id = gen_id()
    stored_path = WORD_TEMPLATES_DIR / f"{file_id}.docx"
    with open(stored_path, "wb") as out:
        shutil.copyfileobj(file.file, out)
    item = {
        "id": file_id,
        "name": name,
        "original_filename": file.filename,
        "stored_path": str(stored_path),
        "uploaded_by": user["email"],
        "created_at": now_iso(),
    }
    db.execute(
        "INSERT INTO word_templates (id, name, original_filename, stored_path, uploaded_by, created_at) VALUES (?,?,?,?,?,?)",
        (item["id"], item["name"], item["original_filename"], item["stored_path"], item["uploaded_by"], item["created_at"]),
    )
    return item


@api.delete("/word-templates/{tid}")
async def delete_word_template(tid: str, _user=Depends(get_current_user)):
    item = db.fetch_one("SELECT stored_path FROM word_templates WHERE id = ?", (tid,))
    if not item:
        raise HTTPException(status_code=404, detail="Not found")
    try:
        os.remove(item["stored_path"])
    except OSError:
        pass
    db.execute("DELETE FROM word_templates WHERE id = ?", (tid,))
    return {"ok": True}


# ----------------- Excel parse -----------------
@api.post("/excel/parse")
async def parse_excel_endpoint(file: UploadFile = File(...), _user=Depends(get_current_user)):
    if not file.filename.lower().endswith((".xlsx", ".xlsm")):
        raise HTTPException(status_code=400, detail="Only .xlsx files are allowed")
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".xlsx", dir=str(UPLOADS_DIR))
    try:
        shutil.copyfileobj(file.file, tmp)
        tmp.close()
        headers, rows = parse_excel(tmp.name)
        return {"headers": headers, "rows": rows, "count": len(rows)}
    finally:
        try:
            os.remove(tmp.name)
        except OSError:
            pass


# ----------------- send log helper -----------------
def _log_send_sync(user_email, recipient, subject, attachment_name, status, error=None, source="ui", campaign_id=None):
    db.execute(
        "INSERT INTO send_logs (id, user_email, recipient, subject, attachment_name, status, error, source, campaign_id, timestamp) VALUES (?,?,?,?,?,?,?,?,?,?)",
        (gen_id(), user_email, recipient, subject, attachment_name, status, error, source, campaign_id, now_iso()),
    )


# ----------------- Send campaign (UI) -----------------
@api.post("/campaigns/send")
async def send_campaign(
    subject: str = Form(...),
    body_html: str = Form(...),
    excel: UploadFile = File(...),
    word_template_id: Optional[str] = Form(None),
    attachment_basename: str = Form("document"),
    user=Depends(get_current_user),
):
    tmp_xlsx = tempfile.NamedTemporaryFile(delete=False, suffix=".xlsx", dir=str(UPLOADS_DIR))
    shutil.copyfileobj(excel.file, tmp_xlsx)
    tmp_xlsx.close()

    word_template_path = None
    if word_template_id:
        w = db.fetch_one("SELECT stored_path FROM word_templates WHERE id = ?", (word_template_id,))
        if not w:
            os.remove(tmp_xlsx.name)
            raise HTTPException(status_code=404, detail="Word template not found")
        word_template_path = w["stored_path"]

    try:
        headers, rows = parse_excel(tmp_xlsx.name)
    except Exception as e:
        os.remove(tmp_xlsx.name)
        raise HTTPException(status_code=400, detail=f"Failed to parse Excel: {e}")

    if not headers or len(headers) < 2:
        os.remove(tmp_xlsx.name)
        raise HTTPException(status_code=400, detail="Excel must have at least 2 columns (email, password)")

    email_field = headers[0]
    password_field = headers[1]
    campaign_id = gen_id()
    successes = failures = 0
    failure_details: List[Dict[str, str]] = []

    workdir = tempfile.mkdtemp(dir=str(UPLOADS_DIR))
    try:
        for row in rows:
            recipient = (row.get(email_field) or "").strip()
            password = (row.get(password_field) or "").strip()
            if not recipient:
                continue
            personalized_subject = replace_placeholders_text(subject, row)
            personalized_body = replace_placeholders_text(body_html, row)
            attachment_path = None
            attachment_filename = None
            try:
                if word_template_path:
                    out_name = f"{attachment_basename}_{recipient.replace('@','_at_')}.pdf"
                    attachment_path = await asyncio.to_thread(
                        build_personalized_pdf, word_template_path, row, password or None, workdir, out_name
                    )
                    attachment_filename = f"{attachment_basename}.pdf"
                await asyncio.to_thread(send_email, recipient, personalized_subject, personalized_body, attachment_path, attachment_filename)
                successes += 1
                await asyncio.to_thread(_log_send_sync, user["email"], recipient, personalized_subject, attachment_filename, "sent", None, "ui", campaign_id)
            except Exception as e:
                failures += 1
                err = f"{type(e).__name__}: {e}"
                failure_details.append({"recipient": recipient, "error": err})
                logger.error("Send failed for %s: %s\n%s", recipient, err, traceback.format_exc())
                await asyncio.to_thread(_log_send_sync, user["email"], recipient, personalized_subject, attachment_filename, "failed", err, "ui", campaign_id)
    finally:
        shutil.rmtree(workdir, ignore_errors=True)
        try:
            os.remove(tmp_xlsx.name)
        except OSError:
            pass

    return {"campaign_id": campaign_id, "total": successes + failures, "sent": successes, "failed": failures, "failures": failure_details}


# ----------------- Logs -----------------
@api.get("/logs")
async def get_logs(limit: int = 200, user=Depends(get_current_user)):
    if user["role"] == "admin":
        return db.fetch_all("SELECT * FROM send_logs ORDER BY timestamp DESC LIMIT ?", (limit,))
    return db.fetch_all("SELECT * FROM send_logs WHERE user_email = ? ORDER BY timestamp DESC LIMIT ?", (user["email"], limit))


# ----------------- API Keys (admin) -----------------
@api.get("/api-keys")
async def list_api_keys(_admin=Depends(require_admin)):
    return db.fetch_all("SELECT id, name, owner_email, key_preview, created_at, revoked FROM api_keys ORDER BY created_at DESC")


@api.post("/api-keys")
async def create_api_key(payload: ApiKeyCreateInput, admin=Depends(require_admin)):
    raw = "mk_" + secrets.token_urlsafe(32)
    item = {
        "id": gen_id(),
        "name": payload.name,
        "owner_email": admin["email"],
        "key_preview": raw[:10] + "...",
        "key_hash": hash_password(raw),
        "created_at": now_iso(),
    }
    db.execute(
        "INSERT INTO api_keys (id, name, owner_email, key_preview, key_hash, created_at, revoked) VALUES (?,?,?,?,?,?,0)",
        (item["id"], item["name"], item["owner_email"], item["key_preview"], item["key_hash"], item["created_at"]),
    )
    return {"id": item["id"], "name": item["name"], "key": raw, "created_at": item["created_at"]}


@api.delete("/api-keys/{kid}")
async def revoke_api_key(kid: str, _admin=Depends(require_admin)):
    existing = db.fetch_one("SELECT id FROM api_keys WHERE id = ?", (kid,))
    if not existing:
        raise HTTPException(status_code=404, detail="Not found")
    db.execute("UPDATE api_keys SET revoked = 1 WHERE id = ?", (kid,))
    return {"ok": True}


def _validate_api_key(provided: str) -> dict:
    if not provided:
        raise HTTPException(status_code=401, detail="Missing X-API-Key")
    keys = db.fetch_all("SELECT * FROM api_keys WHERE revoked = 0")
    for k in keys:
        if verify_password(provided, k["key_hash"]):
            return k
    raise HTTPException(status_code=401, detail="Invalid API key")


# ----------------- External API -----------------
@api.post("/external/send")
async def external_send(payload: SendCampaignExternalInput, x_api_key: Optional[str] = Header(None, alias="X-API-Key")):
    key_doc = await asyncio.to_thread(_validate_api_key, x_api_key or "")
    template = db.fetch_one("SELECT subject, body_html FROM email_templates WHERE id = ?", (payload.template_id,))
    if not template:
        raise HTTPException(status_code=404, detail="Email template not found")
    word_template_path = None
    if payload.word_template_id:
        w = db.fetch_one("SELECT stored_path FROM word_templates WHERE id = ?", (payload.word_template_id,))
        if not w:
            raise HTTPException(status_code=404, detail="Word template not found")
        word_template_path = w["stored_path"]

    campaign_id = gen_id()
    successes = failures = 0
    failure_details = []
    workdir = tempfile.mkdtemp(dir=str(UPLOADS_DIR))
    try:
        for row in payload.recipients:
            recipient = str(row.get("email", "")).strip()
            password = str(row.get("password", "")).strip()
            if not recipient:
                continue
            data = {k: str(v) for k, v in row.items()}
            personalized_subject = replace_placeholders_text(template["subject"], data)
            personalized_body = replace_placeholders_text(template["body_html"], data)
            attachment_path = None
            attachment_filename = None
            try:
                if word_template_path:
                    out_name = f"document_{recipient.replace('@','_at_')}.pdf"
                    attachment_path = await asyncio.to_thread(
                        build_personalized_pdf, word_template_path, data, password or None, workdir, out_name
                    )
                    attachment_filename = "document.pdf"
                await asyncio.to_thread(send_email, recipient, personalized_subject, personalized_body, attachment_path, attachment_filename)
                successes += 1
                await asyncio.to_thread(_log_send_sync, key_doc["owner_email"], recipient, personalized_subject, attachment_filename, "sent", None, "api", campaign_id)
            except Exception as e:
                failures += 1
                err = f"{type(e).__name__}: {e}"
                failure_details.append({"recipient": recipient, "error": err})
                await asyncio.to_thread(_log_send_sync, key_doc["owner_email"], recipient, personalized_subject, attachment_filename, "failed", err, "api", campaign_id)
    finally:
        shutil.rmtree(workdir, ignore_errors=True)

    return {"campaign_id": campaign_id, "total": successes + failures, "sent": successes, "failed": failures, "failures": failure_details}


# ----------------- Dashboard stats -----------------
@api.get("/stats")
async def stats(user=Depends(get_current_user)):
    if user["role"] == "admin":
        total = db.count("SELECT COUNT(*) FROM send_logs")
        sent = db.count("SELECT COUNT(*) FROM send_logs WHERE status = 'sent'")
        failed = db.count("SELECT COUNT(*) FROM send_logs WHERE status = 'failed'")
    else:
        total = db.count("SELECT COUNT(*) FROM send_logs WHERE user_email = ?", (user["email"],))
        sent = db.count("SELECT COUNT(*) FROM send_logs WHERE user_email = ? AND status = 'sent'", (user["email"],))
        failed = db.count("SELECT COUNT(*) FROM send_logs WHERE user_email = ? AND status = 'failed'", (user["email"],))
    return {
        "total_emails": total,
        "sent": sent,
        "failed": failed,
        "success_rate": (sent / total * 100.0) if total else 0.0,
        "email_templates": db.count("SELECT COUNT(*) FROM email_templates"),
        "word_templates": db.count("SELECT COUNT(*) FROM word_templates"),
    }


@api.get("/")
async def root():
    return {"service": "mailmaster-pro", "status": "ok", "storage": "sqlite+sqlcipher"}


# ----------------- App wiring -----------------
app.include_router(api)

origins = os.environ.get("CORS_ORIGINS", "*").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins if origins != ["*"] else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def on_startup():
    db.init_schema()
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@example.com").lower()
    admin_password = os.environ.get("ADMIN_PASSWORD", "admin123")
    existing = db.fetch_one("SELECT * FROM users WHERE email = ?", (admin_email,))
    if not existing:
        db.execute(
            "INSERT INTO users (id, email, name, role, password_hash, created_at) VALUES (?,?,?,?,?,?)",
            (gen_id(), admin_email, "Admin", "admin", hash_password(admin_password), now_iso()),
        )
        logger.info("Seeded admin user: %s", admin_email)
    elif not verify_password(admin_password, existing["password_hash"]):
        db.execute("UPDATE users SET password_hash = ? WHERE email = ?", (hash_password(admin_password), admin_email))
        logger.info("Updated admin password from env")
    logger.info("Database: %s", os.environ.get("DB_PATH", "data/mailmaster.db"))
