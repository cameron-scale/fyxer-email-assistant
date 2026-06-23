"""Optional Twilio client for SMS alerts and remote approval.

Degrades to a no-op logger when credentials are absent so nothing breaks in dry
runs. Also exposes a tiny SMTP email alert helper for the watchdog.
"""
from __future__ import annotations

import os
import smtplib
from email.mime.text import MIMEText
from typing import List, Optional


class AlertClient:
    def __init__(self):
        self.twilio_sid = os.environ.get("TWILIO_ACCOUNT_SID", "")
        self.twilio_token = os.environ.get("TWILIO_AUTH_TOKEN", "")
        self.from_number = os.environ.get("TWILIO_FROM_NUMBER", "")
        self.operator_phone = os.environ.get("OPERATOR_PHONE_NUMBER", "")
        self.sent: List[str] = []  # in-memory log, handy for tests

    @property
    def sms_enabled(self) -> bool:
        return all([self.twilio_sid, self.twilio_token, self.from_number,
                    self.operator_phone])

    def send_sms(self, body: str) -> bool:
        self.sent.append(body)
        if not self.sms_enabled:
            return False
        try:
            from twilio.rest import Client
            client = Client(self.twilio_sid, self.twilio_token)
            client.messages.create(body=body, from_=self.from_number,
                                    to=self.operator_phone)
            return True
        except Exception:
            return False

    def send_email(self, subject: str, body: str) -> bool:
        host = os.environ.get("SMTP_HOST", "")
        to = os.environ.get("OPERATOR_EMAIL", "")
        if not host or not to:
            return False
        try:
            msg = MIMEText(body)
            msg["Subject"] = subject
            msg["From"] = os.environ.get("SMTP_USER", to)
            msg["To"] = to
            with smtplib.SMTP(host, int(os.environ.get("SMTP_PORT", "587"))) as s:
                s.starttls()
                user = os.environ.get("SMTP_USER", "")
                pw = os.environ.get("SMTP_PASSWORD", "")
                if user and pw:
                    s.login(user, pw)
                s.send_message(msg)
            return True
        except Exception:
            return False

    def alert(self, message: str) -> None:
        """Best-effort multi-channel alert. Never raises."""
        self.send_sms(message)
        self.send_email("Centurion alert", message)
