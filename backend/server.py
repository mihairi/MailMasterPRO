"""Mass Mailing / Mail Merge backend."""
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

from fastapi import FastAPI, APIRouter, Depends, HTTPException, UploadFile, File, Form, Request, Response, BackgroundTasks, Header
from fastapi.responses import JSONResponse, FileResponse
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, EmailStr, Field

from auth import (
    hash_password, verify_password,
    create_access_token, create_refresh_token, decode_token,
    get_current_user, require_admin,
)
from doc_service import parse_excel, replace_placeholders_text, build_personalized_pdf
from email_service import send_email

# ----------------- DB & app -----------------
mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

app = FastAPI(title="Mass Mailer API")
api = APIRouter(prefix="/api")

STORAGE_DIR = ROOT_DIR / "storage"
WORD_TEMPLATES_DIR = STORAGE_DIR / "word_templates"
UPLOADS_DIR = STORAGE_DIR / "uploads"
STORAGE_DIR.mkdir(exist_ok=True)
WORD_TEMPLATES_DIR.mkdir(exist_ok=True)
UPLOADS_DIR.mkdir(exist_ok=True)

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("mass-mailer")


# ----------------- Helpers -----------------
def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def gen_id() -> str:
    return str(uuid.uuid4())


def _set_auth_cookies(resp: Response, access: str, refresh: str):
    resp.set_cookie("access_token", access, httponly=True, secure=False, samesite="lax", max_age=43200, path="/")
    resp.set_cookie("refresh_token", refresh, httponly=True, secure=False, samesite="lax", max_age=604800, path="/")


# ----------------- Models -----------------
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
    recipients: List[Dict[str, Any]]  # each dict: {email, password?, ...fields}


class ApiKeyCreateInput(BaseModel):
    name: str


# ----------------- Auth -----------------
@api.post("/auth/login")
async def login(payload: LoginInput, response: Response):
    user = await db.users.find_one({"email": payload.email.lower()}, {"_id": 0})
    if not user or not verify_password(payload.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    access = create_access_token(user["id"], user["email"], user["role"])
    refresh = create_refresh_token(user["id"])
    _set_auth_cookies(response, access, refresh)
    user.pop("password_hash", None)
    return {"user": user, "access_token": access, "token_type": "bearer"}


@api.post("/auth/logout")
async def logout(response: Response, _user=Depends(get_current_user)):
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
    user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    access = create_access_token(user["id"], user["email"], user["role"])
    response.set_cookie("access_token", access, httponly=True, secure=False, samesite="lax", max_age=43200, path="/")
    return {"ok": True}


# ----------------- Users (admin) -----------------
@api.get("/users")
async def list_users(_admin=Depends(require_admin)):
    users = await db.users.find({}, {"_id": 0, "password_hash": 0}).to_list(1000)
    return users


@api.post("/users")
async def create_user(payload: CreateUserInput, _admin=Depends(require_admin)):
    existing = await db.users.find_one({"email": payload.email.lower()})
    if existing:
        raise HTTPException(status_code=400, detail="Email already exists")
    if payload.role not in ("admin", "user"):
        raise HTTPException(status_code=400, detail="Invalid role")
    user_doc = {
        "id": gen_id(),
        "email": payload.email.lower(),
        "name": payload.name or payload.email.split("@")[0],
        "role": payload.role,
        "password_hash": hash_password(payload.password),
        "created_at": now_iso(),
    }
    await db.users.insert_one(user_doc)
    user_doc.pop("password_hash", None)
    user_doc.pop("_id", None)
    return user_doc


@api.delete("/users/{user_id}")
async def delete_user(user_id: str, admin=Depends(require_admin)):
    if admin["id"] == user_id:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    res = await db.users.delete_one({"id": user_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    return {"ok": True}


# ----------------- Email Templates -----------------
@api.get("/email-templates")
async def list_email_templates(_user=Depends(get_current_user)):
    items = await db.email_templates.find({}, {"_id": 0}).to_list(1000)
    return items


@api.post("/email-templates")
async def create_email_template(payload: EmailTemplateInput, user=Depends(get_current_user)):
    doc = {
        "id": gen_id(),
        "name": payload.name,
        "subject": payload.subject,
        "body_html": payload.body_html,
        "created_by": user["email"],
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    await db.email_templates.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.put("/email-templates/{tid}")
async def update_email_template(tid: str, payload: EmailTemplateInput, _user=Depends(get_current_user)):
    res = await db.email_templates.update_one(
        {"id": tid},
        {"$set": {**payload.model_dump(), "updated_at": now_iso()}},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    item = await db.email_templates.find_one({"id": tid}, {"_id": 0})
    return item


@api.delete("/email-templates/{tid}")
async def delete_email_template(tid: str, _user=Depends(get_current_user)):
    res = await db.email_templates.delete_one({"id": tid})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    return {"ok": True}


# ----------------- Word Templates -----------------
@api.get("/word-templates")
async def list_word_templates(_user=Depends(get_current_user)):
    items = await db.word_templates.find({}, {"_id": 0}).to_list(1000)
    return items


@api.post("/word-templates")
async def upload_word_template(
    name: str = Form(...),
    file: UploadFile = File(...),
    user=Depends(get_current_user),
):
    if not file.filename.lower().endswith(".docx"):
        raise HTTPException(status_code=400, detail="Only .docx files are allowed")
    file_id = gen_id()
    stored_path = WORD_TEMPLATES_DIR / f"{file_id}.docx"
    with open(stored_path, "wb") as out:
        shutil.copyfileobj(file.file, out)
    doc = {
        "id": file_id,
        "name": name,
        "original_filename": file.filename,
        "stored_path": str(stored_path),
        "uploaded_by": user["email"],
        "created_at": now_iso(),
    }
    await db.word_templates.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.delete("/word-templates/{tid}")
async def delete_word_template(tid: str, _user=Depends(get_current_user)):
    item = await db.word_templates.find_one({"id": tid})
    if not item:
        raise HTTPException(status_code=404, detail="Not found")
    try:
        os.remove(item["stored_path"])
    except OSError:
        pass
    await db.word_templates.delete_one({"id": tid})
    return {"ok": True}


# ----------------- Excel parse (preview) -----------------
@api.post("/excel/parse")
async def parse_excel_endpoint(file: UploadFile = File(...), _user=Depends(get_current_user)):
    if not file.filename.lower().endswith((".xlsx", ".xlsm")):
        raise HTTPException(status_code=400, detail="Only .xlsx files are allowed")
    suffix = ".xlsx"
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix, dir=str(UPLOADS_DIR))
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


# ----------------- Logging helper -----------------
async def _log_send(
    user_email: str,
    recipient: str,
    subject: str,
    attachment_name: Optional[str],
    status: str,
    error: Optional[str] = None,
    source: str = "ui",
    campaign_id: Optional[str] = None,
):
    await db.send_logs.insert_one({
        "id": gen_id(),
        "user_email": user_email,
        "recipient": recipient,
        "subject": subject,
        "attachment_name": attachment_name,
        "status": status,
        "error": error,
        "source": source,
        "campaign_id": campaign_id,
        "timestamp": now_iso(),
    })


# ----------------- Send Campaign (UI) -----------------
@api.post("/campaigns/send")
async def send_campaign(
    subject: str = Form(...),
    body_html: str = Form(...),
    excel: UploadFile = File(...),
    word_template_id: Optional[str] = Form(None),
    attachment_basename: str = Form("document"),
    user=Depends(get_current_user),
):
    # Save excel temporarily and parse
    tmp_xlsx = tempfile.NamedTemporaryFile(delete=False, suffix=".xlsx", dir=str(UPLOADS_DIR))
    shutil.copyfileobj(excel.file, tmp_xlsx)
    tmp_xlsx.close()

    word_template_path = None
    if word_template_id:
        w = await db.word_templates.find_one({"id": word_template_id})
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
    successes = 0
    failures = 0
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
                await asyncio.to_thread(
                    send_email, recipient, personalized_subject, personalized_body,
                    attachment_path, attachment_filename,
                )
                successes += 1
                await _log_send(user["email"], recipient, personalized_subject, attachment_filename, "sent", None, "ui", campaign_id)
            except Exception as e:
                failures += 1
                err = f"{type(e).__name__}: {e}"
                failure_details.append({"recipient": recipient, "error": err})
                logger.error("Send failed for %s: %s\n%s", recipient, err, traceback.format_exc())
                await _log_send(user["email"], recipient, personalized_subject, attachment_filename, "failed", err, "ui", campaign_id)
    finally:
        shutil.rmtree(workdir, ignore_errors=True)
        try:
            os.remove(tmp_xlsx.name)
        except OSError:
            pass

    return {
        "campaign_id": campaign_id,
        "total": successes + failures,
        "sent": successes,
        "failed": failures,
        "failures": failure_details,
    }


# ----------------- Logs -----------------
@api.get("/logs")
async def get_logs(limit: int = 200, user=Depends(get_current_user)):
    query = {} if user["role"] == "admin" else {"user_email": user["email"]}
    items = await db.send_logs.find(query, {"_id": 0}).sort("timestamp", -1).to_list(limit)
    return items


# ----------------- API Keys -----------------
@api.get("/api-keys")
async def list_api_keys(user=Depends(get_current_user)):
    q = {} if user["role"] == "admin" else {"owner_email": user["email"]}
    items = await db.api_keys.find(q, {"_id": 0, "key_hash": 0}).to_list(200)
    return items


@api.post("/api-keys")
async def create_api_key(payload: ApiKeyCreateInput, user=Depends(get_current_user)):
    raw = "mk_" + secrets.token_urlsafe(32)
    doc = {
        "id": gen_id(),
        "name": payload.name,
        "owner_email": user["email"],
        "key_preview": raw[:10] + "...",
        "key_hash": hash_password(raw),
        "created_at": now_iso(),
        "revoked": False,
    }
    await db.api_keys.insert_one(doc)
    return {"id": doc["id"], "name": doc["name"], "key": raw, "created_at": doc["created_at"]}


@api.delete("/api-keys/{kid}")
async def revoke_api_key(kid: str, user=Depends(get_current_user)):
    q = {"id": kid} if user["role"] == "admin" else {"id": kid, "owner_email": user["email"]}
    res = await db.api_keys.update_one(q, {"$set": {"revoked": True}})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    return {"ok": True}


async def _validate_api_key(provided: str) -> dict:
    if not provided:
        raise HTTPException(status_code=401, detail="Missing X-API-Key")
    keys = await db.api_keys.find({"revoked": False}).to_list(1000)
    for k in keys:
        if verify_password(provided, k["key_hash"]):
            return k
    raise HTTPException(status_code=401, detail="Invalid API key")


# ----------------- External API (API key) -----------------
@api.post("/external/send")
async def external_send(payload: SendCampaignExternalInput, x_api_key: Optional[str] = Header(None, alias="X-API-Key")):
    key_doc = await _validate_api_key(x_api_key or "")
    template = await db.email_templates.find_one({"id": payload.template_id}, {"_id": 0})
    if not template:
        raise HTTPException(status_code=404, detail="Email template not found")
    word_template_path = None
    if payload.word_template_id:
        w = await db.word_templates.find_one({"id": payload.word_template_id})
        if not w:
            raise HTTPException(status_code=404, detail="Word template not found")
        word_template_path = w["stored_path"]

    campaign_id = gen_id()
    successes = 0
    failures = 0
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
                await asyncio.to_thread(
                    send_email, recipient, personalized_subject, personalized_body,
                    attachment_path, attachment_filename,
                )
                successes += 1
                await _log_send(key_doc["owner_email"], recipient, personalized_subject, attachment_filename, "sent", None, "api", campaign_id)
            except Exception as e:
                failures += 1
                err = f"{type(e).__name__}: {e}"
                failure_details.append({"recipient": recipient, "error": err})
                await _log_send(key_doc["owner_email"], recipient, personalized_subject, attachment_filename, "failed", err, "api", campaign_id)
    finally:
        shutil.rmtree(workdir, ignore_errors=True)

    return {
        "campaign_id": campaign_id,
        "total": successes + failures,
        "sent": successes,
        "failed": failures,
        "failures": failure_details,
    }


# ----------------- Dashboard stats -----------------
@api.get("/stats")
async def stats(user=Depends(get_current_user)):
    q = {} if user["role"] == "admin" else {"user_email": user["email"]}
    total = await db.send_logs.count_documents(q)
    sent = await db.send_logs.count_documents({**q, "status": "sent"})
    failed = await db.send_logs.count_documents({**q, "status": "failed"})
    templates = await db.email_templates.count_documents({})
    word_templates = await db.word_templates.count_documents({})
    return {
        "total_emails": total,
        "sent": sent,
        "failed": failed,
        "success_rate": (sent / total * 100.0) if total else 0.0,
        "email_templates": templates,
        "word_templates": word_templates,
    }


@api.get("/")
async def root():
    return {"service": "mass-mailer", "status": "ok"}


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
    # Indexes
    await db.users.create_index("email", unique=True)
    await db.users.create_index("id", unique=True)
    await db.email_templates.create_index("id", unique=True)
    await db.word_templates.create_index("id", unique=True)
    await db.api_keys.create_index("id", unique=True)
    await db.send_logs.create_index("timestamp")

    # Seed admin
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@example.com").lower()
    admin_password = os.environ.get("ADMIN_PASSWORD", "admin123")
    existing = await db.users.find_one({"email": admin_email})
    if not existing:
        await db.users.insert_one({
            "id": gen_id(),
            "email": admin_email,
            "name": "Admin",
            "role": "admin",
            "password_hash": hash_password(admin_password),
            "created_at": now_iso(),
        })
        logger.info("Seeded admin user: %s", admin_email)
    elif not verify_password(admin_password, existing["password_hash"]):
        await db.users.update_one({"email": admin_email}, {"$set": {"password_hash": hash_password(admin_password)}})


@app.on_event("shutdown")
async def shutdown():
    client.close()
