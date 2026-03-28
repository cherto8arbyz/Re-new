from __future__ import annotations

from collections.abc import Generator
from pathlib import Path

from sqlalchemy import create_engine
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
  connect_args={"check_same_thread": False},
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


def get_db_session() -> Generator[Session, None, None]:
  db = SessionLocal()
  try:
    yield db
  finally:
    db.close()
