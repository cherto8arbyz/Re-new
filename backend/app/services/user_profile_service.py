from __future__ import annotations

from collections.abc import Sequence

from sqlalchemy.orm import Session, sessionmaker

from ..models import UserProfile


class UserProfileService:
  def __init__(self, session_factory: sessionmaker[Session]) -> None:
    self.session_factory = session_factory

  def ensure_profile(self, user_id: str) -> UserProfile:
    safe_user_id = str(user_id or "").strip()
    if not safe_user_id:
      raise ValueError("user_id is required.")

    with self.session_factory() as db:
      profile = db.get(UserProfile, safe_user_id)
      if profile is None:
        profile = UserProfile(user_id=safe_user_id, reference_face_urls=[])
        db.add(profile)
        db.commit()
        db.refresh(profile)
      return profile

  def replace_reference_face_urls(self, user_id: str, reference_face_urls: Sequence[str]) -> UserProfile:
    safe_urls = [str(url).strip() for url in reference_face_urls if str(url).strip()]
    profile = self.ensure_profile(user_id)

    with self.session_factory() as db:
      attached = db.get(UserProfile, profile.user_id)
      if attached is None:
        attached = UserProfile(user_id=profile.user_id, reference_face_urls=safe_urls)
      else:
        attached.reference_face_urls = safe_urls

      db.add(attached)
      db.commit()
      db.refresh(attached)
      return attached

  def get_reference_face_urls(self, user_id: str) -> list[str]:
    safe_user_id = str(user_id or "").strip()
    if not safe_user_id:
      return []

    with self.session_factory() as db:
      profile = db.get(UserProfile, safe_user_id)
      if profile is None:
        return []
      return [str(url).strip() for url in (profile.reference_face_urls or []) if str(url).strip()]
