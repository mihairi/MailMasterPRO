"""SMTP email sending utility."""
import os
import smtplib
import ssl
from email.message import EmailMessage
from email.utils import formataddr
from typing import Optional


def get_smtp_config() -> dict:
    return {
        "host": os.environ.get("SMTP_HOST", ""),
        "port": int(os.environ.get("SMTP_PORT", "587") or 587),
        "user": os.environ.get("SMTP_USER", ""),
        "password": os.environ.get("SMTP_PASS", ""),
        "from_addr": os.environ.get("SMTP_FROM", ""),
        "from_name": os.environ.get("SMTP_FROM_NAME", "Mass Mailer"),
        "use_tls": (os.environ.get("SMTP_USE_TLS", "true").lower() == "true"),
    }


def send_email(
    to_email: str,
    subject: str,
    html_body: str,
    attachment_path: Optional[str] = None,
    attachment_name: Optional[str] = None,
) -> None:
    cfg = get_smtp_config()
    if not cfg["host"]:
        raise RuntimeError("SMTP_HOST is not configured")

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = formataddr((cfg["from_name"], cfg["from_addr"] or cfg["user"]))
    msg["To"] = to_email
    msg.set_content("This message requires an HTML-capable email client.")
    msg.add_alternative(html_body or "", subtype="html")

    if attachment_path:
        with open(attachment_path, "rb") as f:
            data = f.read()
        msg.add_attachment(
            data,
            maintype="application",
            subtype="pdf",
            filename=attachment_name or os.path.basename(attachment_path),
        )

    if cfg["port"] == 465:
        context = ssl.create_default_context()
        with smtplib.SMTP_SSL(cfg["host"], cfg["port"], context=context, timeout=30) as s:
            if cfg["user"]:
                s.login(cfg["user"], cfg["password"])
            s.send_message(msg)
    else:
        with smtplib.SMTP(cfg["host"], cfg["port"], timeout=30) as s:
            s.ehlo()
            if cfg["use_tls"]:
                s.starttls(context=ssl.create_default_context())
                s.ehlo()
            if cfg["user"]:
                s.login(cfg["user"], cfg["password"])
            s.send_message(msg)
