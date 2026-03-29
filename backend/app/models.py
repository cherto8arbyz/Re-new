from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import JSON, DateTime, ForeignKey, String, Text
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


class UserProfile(Base):
  __tablename__ = "user_profiles"

  user_id: Mapped[str] = mapped_column(String(128), primary_key=True)
  reference_face_urls: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
  created_at: Mapped[datetime] = mapped_column(
    DateTime(timezone=True),
    nullable=False,
    default=lambda: datetime.now(timezone.utc),
  )
  updated_at: Mapped[datetime] = mapped_column(
    DateTime(timezone=True),
    nullable=False,
    default=lambda: datetime.now(timezone.utc),
    onupdate=lambda: datetime.now(timezone.utc),
  )


class DailyLookJob(Base):
  __tablename__ = "daily_look_jobs"

  id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
  user_id: Mapped[str] = mapped_column(ForeignKey("user_profiles.user_id"), nullable=False, index=True)
  status: Mapped[str] = mapped_column(String(32), nullable=False, default="processing")
  selected_garment_ids: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
  weather_context: Mapped[dict[str, object]] = mapped_column(JSON, nullable=False, default=dict)
  prompt: Mapped[str | None] = mapped_column(Text, nullable=True)
  final_image_url: Mapped[str | None] = mapped_column(Text, nullable=True)
  error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
  created_at: Mapped[datetime] = mapped_column(
    DateTime(timezone=True),
    nullable=False,
    default=lambda: datetime.now(timezone.utc),
  )
  completed_at: Mapped[datetime | None] = mapped_column(
    DateTime(timezone=True),
    nullable=True,
  )
