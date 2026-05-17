"""SMTP email sending utility with connection reuse, retries, and proper headers."""
import os
import smtplib
import ssl
import socket
import time
import logging
import uuid
from email.message import EmailMessage
from email.utils import formataddr, formatdate, make_msgid
from typing import Optional

logger = logging.getLogger("mailmaster-pro")


def get_smtp_config() -> dict:
    return {
        "host":      os.environ.get("SMTP_HOST", ""),
        "port":      int(os.environ.get("SMTP_PORT", "587") or 587),
        "user":      os.environ.get("SMTP_USER", ""),
        "password":  os.environ.get("SMTP_PASS", ""),
        "from_addr": os.environ.get("SMTP_FROM", ""),
        "from_name": os.environ.get("SMTP_FROM_NAME", "MailMaster PRO"),
        "use_tls":   (os.environ.get("SMTP_USE_TLS", "true").lower() == "true"),
        "reply_to":  os.environ.get("SMTP_REPLY_TO", ""),
        "list_unsubscribe": os.environ.get("SMTP_LIST_UNSUBSCRIBE", ""),
    }


# Transient SMTP codes worth retrying.
_TRANSIENT_CODES = {421, 450, 451, 452}


class SMTPSession:
    """Reusable SMTP connection for a campaign.

    Usage:
        with SMTPSession() as s:
            for r in recipients:
                s.send(...)
    """

    def __init__(self, retry_attempts: Optional[int] = None, retry_backoff_seconds: Optional[float] = None):
        self.cfg = get_smtp_config()
        if not self.cfg["host"]:
            raise RuntimeError("SMTP_HOST is not configured")
        self.retry_attempts = retry_attempts if retry_attempts is not None else int(os.environ.get("RETRY_ATTEMPTS", "3"))
        self.retry_backoff_seconds = retry_backoff_seconds if retry_backoff_seconds is not None else float(os.environ.get("RETRY_BACKOFF_SECONDS", "5"))
        self._conn: Optional[smtplib.SMTP] = None

    # ---- context manager ----
    def __enter__(self):
        self._connect()
        return self

    def __exit__(self, exc_type, exc, tb):
        self.close()

    # ---- connection lifecycle ----
    def _connect(self):
        host, port = self.cfg["host"], self.cfg["port"]
        if port == 465:
            ctx = ssl.create_default_context()
            self._conn = smtplib.SMTP_SSL(host, port, context=ctx, timeout=30)
        else:
            self._conn = smtplib.SMTP(host, port, timeout=30)
            self._conn.ehlo()
            if self.cfg["use_tls"]:
                self._conn.starttls(context=ssl.create_default_context())
                self._conn.ehlo()
        if self.cfg["user"]:
            self._conn.login(self.cfg["user"], self.cfg["password"])

    def _reconnect(self):
        self.close()
        self._connect()

    def close(self):
        if self._conn is not None:
            try:
                self._conn.quit()
            except Exception:
                try:
                    self._conn.close()
                except Exception:
                    pass
            self._conn = None

    def _ensure_alive(self):
        if self._conn is None:
            self._connect()
            return
        try:
            status = self._conn.noop()[0]
            if status != 250:
                self._reconnect()
        except (smtplib.SMTPServerDisconnected, ConnectionError, socket.error, OSError):
            self._reconnect()

    # ---- send ----
    def send(
        self,
        to_email: str,
        subject: str,
        html_body: str,
        attachment_path: Optional[str] = None,
        attachment_name: Optional[str] = None,
    ) -> None:
        msg = self._build_message(to_email, subject, html_body, attachment_path, attachment_name)

        last_err: Optional[Exception] = None
        for attempt in range(self.retry_attempts):
            try:
                self._ensure_alive()
                self._conn.send_message(msg)
                return
            except smtplib.SMTPResponseException as e:
                last_err = e
                if e.smtp_code in _TRANSIENT_CODES and attempt + 1 < self.retry_attempts:
                    delay = self.retry_backoff_seconds * (2 ** attempt)
                    logger.warning("Transient SMTP %s for %s — retry %d/%d in %.1fs",
                                   e.smtp_code, to_email, attempt + 1, self.retry_attempts, delay)
                    time.sleep(delay)
                    self._reconnect()
                    continue
                raise
            except (smtplib.SMTPServerDisconnected, ConnectionError, socket.error, OSError) as e:
                last_err = e
                if attempt + 1 < self.retry_attempts:
                    delay = self.retry_backoff_seconds * (2 ** attempt)
                    logger.warning("SMTP connection drop for %s — retry %d/%d in %.1fs: %s",
                                   to_email, attempt + 1, self.retry_attempts, delay, e)
                    time.sleep(delay)
                    self._reconnect()
                    continue
                raise
        if last_err is not None:
            raise last_err

    # ---- message construction ----
    def _build_message(
        self,
        to_email: str,
        subject: str,
        html_body: str,
        attachment_path: Optional[str],
        attachment_name: Optional[str],
    ) -> EmailMessage:
        cfg = self.cfg
        msg = EmailMessage()
        msg["Subject"] = subject
        from_addr = cfg["from_addr"] or cfg["user"] or "noreply@localhost"
        msg["From"] = formataddr((cfg["from_name"], from_addr))
        msg["To"] = to_email
        msg["Date"] = formatdate(localtime=True)
        # Domain part of Message-ID — prefer From domain
        domain = from_addr.split("@", 1)[-1] if "@" in from_addr else "localhost"
        msg["Message-ID"] = make_msgid(domain=domain)
        msg["X-Mailer"] = "MailMaster-PRO"
        if cfg["reply_to"]:
            msg["Reply-To"] = cfg["reply_to"]
        if cfg["list_unsubscribe"]:
            msg["List-Unsubscribe"] = cfg["list_unsubscribe"]

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
        return msg


# ---- One-shot helper (legacy) ----
def send_email(
    to_email: str,
    subject: str,
    html_body: str,
    attachment_path: Optional[str] = None,
    attachment_name: Optional[str] = None,
) -> None:
    """Send a single email by opening a fresh SMTP connection. For multi-recipient
    campaigns prefer SMTPSession() so the connection is reused."""
    with SMTPSession() as s:
        s.send(to_email, subject, html_body, attachment_path, attachment_name)
