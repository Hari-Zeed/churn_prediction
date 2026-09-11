"""
logger.py
---------
Production-grade structured JSON logging utility for Churn ML Pipeline and API processes.
Emits single-line JSON formatted events compatible with Vercel logs, Datadog, AWS CloudWatch, and ELK.
"""

import json
import logging
import sys
from datetime import datetime, timezone
from typing import Any, Dict


class StructuredJsonFormatter(logging.Formatter):
    """Formats Python logging records as single-line structured JSON objects."""

    def format(self, record: logging.LogRecord) -> str:
        log_obj: Dict[str, Any] = {
            "event": getattr(record, "event", record.getMessage()),
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "data": getattr(record, "data", {}),
            "level": record.levelname,
        }
        if record.exc_info:
            log_obj["exception"] = self.formatException(record.exc_info)
        return json.dumps(log_obj)


def get_logger(name: str = "churn_ml") -> logging.Logger:
    """Returns a configured logger with StructuredJsonFormatter."""
    logger = logging.getLogger(name)
    logger.propagate = False
    if not logger.handlers:
        handler = logging.StreamHandler(sys.stdout)
        handler.setFormatter(StructuredJsonFormatter())
        logger.addHandler(handler)
        logger.setLevel(logging.INFO)
    return logger


_logger = get_logger()


def log_event(event: str, data: Dict[str, Any] = None, level: str = "INFO") -> None:
    """
    Emits a structured JSON log event.

    Format:
    {
      "event": "...",
      "timestamp": "...",
      "data": {...}
    }
    """
    if data is None:
        data = {}
    record_extra = {"event": event, "data": data}
    log_func = getattr(_logger, level.lower(), _logger.info)
    log_func(event, extra=record_extra)
