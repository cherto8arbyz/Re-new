from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import DateTime, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from .db import Base


class GenerationJob(Base):
  __tablename__ = "generation_jobs"

  id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
  status: Mapped[str] = mapped_column(String(32), nullable=False, default="pending")
  result_url: Mapped[str | None] = mapped_column(Text, nullable=True)
  error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
  created_at: Mapped[datetime] = mapped_column(
    DateTime(timezone=True),
    nullable=False,
    default=lambda: datetime.now(timezone.utc),
  )
