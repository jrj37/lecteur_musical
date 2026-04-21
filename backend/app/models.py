from datetime import datetime
from typing import Optional
from sqlmodel import SQLModel, Field


class Playlist(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    cover_path: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)


class Track(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    playlist_id: int = Field(foreign_key="playlist.id", index=True)
    position: int = 0
    title: str
    artist: Optional[str] = None
    album: Optional[str] = None
    duration: Optional[float] = None
    bitrate: Optional[int] = None
    samplerate: Optional[int] = None
    filename: str  # stored filename on disk
    original_name: str
