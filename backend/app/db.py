from __future__ import annotations

from collections.abc import Generator
from pathlib import Path

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from .settings import settings


APP_DIR = Path(__file__).resolve().parent
DATA_DIR = APP_DIR / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)

DEFAULT_DATABASE_URL = f"sqlite:///{(DATA_DIR / 'renew_mvp.db').as_posix()}"


class Base(DeclarativeBase):
  pass


engine = create_engine(
  settings.database_url or DEFAULT_DATABASE_URL,
  connect_args={"check_same_thread": False}
  if (settings.database_url or DEFAULT_DATABASE_URL).strip().lower().startswith("sqlite")
  else {},
)
SessionLocal = sessionmaker(
  bind=engine,
  autocommit=False,
  autoflush=False,
  expire_on_commit=False,
)


def init_db() -> None:
  from . import models

  Base.metadata.create_all(bind=engine)
  _ensure_daily_look_face_swap_request_id_column()
  _ensure_daily_look_avatar_gender_column()


def _ensure_daily_look_face_swap_request_id_column() -> None:
  inspector = inspect(engine)
  if "daily_look_jobs" not in inspector.get_table_names():
    return

  existing_columns = {column["name"] for column in inspector.get_columns("daily_look_jobs")}
  if "face_swap_request_id" in existing_columns:
    return

  with engine.begin() as connection:
    connection.execute(text("ALTER TABLE daily_look_jobs ADD COLUMN face_swap_request_id TEXT"))


def _ensure_daily_look_avatar_gender_column() -> None:
  inspector = inspect(engine)
  if "daily_look_jobs" not in inspector.get_table_names():
    return

  existing_columns = {column["name"] for column in inspector.get_columns("daily_look_jobs")}
  if "avatar_gender" in existing_columns:
    return

  with engine.begin() as connection:
    connection.execute(
      text("ALTER TABLE daily_look_jobs ADD COLUMN avatar_gender VARCHAR(32) NOT NULL DEFAULT 'female'")
    )


def get_db_session() -> Generator[Session, None, None]:
  db = SessionLocal()
  try:
    yield db
  finally:
    db.close()
