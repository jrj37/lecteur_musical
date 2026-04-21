import uuid
import mimetypes
from pathlib import Path
from typing import List, Optional

from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from sqlmodel import Session, select
from mutagen import File as MutagenFile

from .db import engine, init_db, TRACKS_DIR, COVERS_DIR
from .models import Playlist, Track


app = FastAPI(title="Retro-Amp API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def _startup() -> None:
    init_db()


def get_db():
    with Session(engine) as s:
        yield s


def _parse_range_header(range_header: str, file_size: int) -> tuple[int, int]:
    try:
        units, _, range_spec = range_header.partition("=")
        if units != "bytes" or not range_spec or "," in range_spec:
            raise ValueError()

        start_str, end_str = range_spec.split("-", 1)
        if start_str == "":
            suffix_length = int(end_str)
            if suffix_length <= 0:
                raise ValueError()
            start = max(file_size - suffix_length, 0)
            end = file_size - 1
        else:
            start = int(start_str)
            end = int(end_str) if end_str else file_size - 1

        if start < 0 or start >= file_size or end < start:
            raise ValueError()

        return start, min(end, file_size - 1)
    except (AttributeError, ValueError):
        raise HTTPException(status_code=416, detail="Invalid range request")


def _iter_file_range(path: Path, start: int, end: int):
    with path.open("rb") as file_obj:
        file_obj.seek(start)
        remaining = end - start + 1
        while remaining > 0:
            chunk = file_obj.read(min(64 * 1024, remaining))
            if not chunk:
                break
            remaining -= len(chunk)
            yield chunk


# ---------- Schemas ----------
class TrackOut(BaseModel):
    id: int
    playlist_id: int
    position: int
    title: str
    artist: Optional[str] = None
    album: Optional[str] = None
    duration: Optional[float] = None
    bitrate: Optional[int] = None
    samplerate: Optional[int] = None
    original_name: str
    stream_url: str


class PlaylistOut(BaseModel):
    id: int
    name: str
    cover_url: Optional[str] = None
    tracks: List[TrackOut] = []


class PlaylistCreate(BaseModel):
    name: str


class ReorderPayload(BaseModel):
    track_ids: List[int]


def _track_to_out(t: Track) -> TrackOut:
    return TrackOut(
        id=t.id,
        playlist_id=t.playlist_id,
        position=t.position,
        title=t.title,
        artist=t.artist,
        album=t.album,
        duration=t.duration,
        bitrate=t.bitrate,
        samplerate=t.samplerate,
        original_name=t.original_name,
        stream_url=f"/api/tracks/{t.id}/stream",
    )


def _playlist_to_out(p: Playlist, tracks: List[Track]) -> PlaylistOut:
    return PlaylistOut(
        id=p.id,
        name=p.name,
        cover_url=f"/api/playlists/{p.id}/cover" if p.cover_path else None,
        tracks=[_track_to_out(t) for t in sorted(tracks, key=lambda x: x.position)],
    )


# ---------- Playlists ----------
@app.get("/api/playlists", response_model=List[PlaylistOut])
def list_playlists(db: Session = Depends(get_db)):
    pls = db.exec(select(Playlist).order_by(Playlist.created_at)).all()
    out = []
    for p in pls:
        tracks = db.exec(select(Track).where(Track.playlist_id == p.id)).all()
        out.append(_playlist_to_out(p, tracks))
    return out


@app.post("/api/playlists", response_model=PlaylistOut)
def create_playlist(payload: PlaylistCreate, db: Session = Depends(get_db)):
    p = Playlist(name=payload.name.strip() or "Untitled")
    db.add(p)
    db.commit()
    db.refresh(p)
    return _playlist_to_out(p, [])


@app.delete("/api/playlists/{playlist_id}")
def delete_playlist(playlist_id: int, db: Session = Depends(get_db)):
    p = db.get(Playlist, playlist_id)
    if not p:
        raise HTTPException(404)
    tracks = db.exec(select(Track).where(Track.playlist_id == playlist_id)).all()
    for t in tracks:
        fp = TRACKS_DIR / t.filename
        if fp.exists():
            fp.unlink()
        db.delete(t)
    if p.cover_path:
        cp = COVERS_DIR / p.cover_path
        if cp.exists():
            cp.unlink()
    db.delete(p)
    db.commit()
    return {"ok": True}


@app.patch("/api/playlists/{playlist_id}", response_model=PlaylistOut)
def rename_playlist(playlist_id: int, payload: PlaylistCreate, db: Session = Depends(get_db)):
    p = db.get(Playlist, playlist_id)
    if not p:
        raise HTTPException(404)
    p.name = payload.name.strip() or p.name
    db.add(p)
    db.commit()
    db.refresh(p)
    tracks = db.exec(select(Track).where(Track.playlist_id == playlist_id)).all()
    return _playlist_to_out(p, tracks)


@app.post("/api/playlists/{playlist_id}/cover", response_model=PlaylistOut)
def upload_cover(playlist_id: int, file: UploadFile = File(...), db: Session = Depends(get_db)):
    p = db.get(Playlist, playlist_id)
    if not p:
        raise HTTPException(404)
    ext = Path(file.filename or "").suffix.lower() or ".png"
    if ext not in {".png", ".jpg", ".jpeg", ".webp", ".gif"}:
        raise HTTPException(400, "unsupported image type")
    fname = f"{uuid.uuid4().hex}{ext}"
    dest = COVERS_DIR / fname
    with dest.open("wb") as f:
        f.write(file.file.read())
    if p.cover_path:
        old = COVERS_DIR / p.cover_path
        if old.exists():
            old.unlink()
    p.cover_path = fname
    db.add(p)
    db.commit()
    db.refresh(p)
    tracks = db.exec(select(Track).where(Track.playlist_id == playlist_id)).all()
    return _playlist_to_out(p, tracks)


@app.get("/api/playlists/{playlist_id}/cover")
def get_cover(playlist_id: int, db: Session = Depends(get_db)):
    p = db.get(Playlist, playlist_id)
    if not p or not p.cover_path:
        raise HTTPException(404)
    return FileResponse(COVERS_DIR / p.cover_path)


@app.post("/api/playlists/{playlist_id}/reorder", response_model=PlaylistOut)
def reorder_tracks(playlist_id: int, payload: ReorderPayload, db: Session = Depends(get_db)):
    p = db.get(Playlist, playlist_id)
    if not p:
        raise HTTPException(404)
    tracks = db.exec(select(Track).where(Track.playlist_id == playlist_id)).all()
    by_id = {t.id: t for t in tracks}
    for idx, tid in enumerate(payload.track_ids):
        if tid in by_id:
            by_id[tid].position = idx
            db.add(by_id[tid])
    db.commit()
    tracks = db.exec(select(Track).where(Track.playlist_id == playlist_id)).all()
    return _playlist_to_out(p, tracks)


# ---------- Tracks ----------
@app.post("/api/playlists/{playlist_id}/tracks", response_model=PlaylistOut)
async def upload_tracks(
    playlist_id: int,
    files: List[UploadFile] = File(...),
    db: Session = Depends(get_db),
):
    p = db.get(Playlist, playlist_id)
    if not p:
        raise HTTPException(404)

    existing = db.exec(select(Track).where(Track.playlist_id == playlist_id)).all()
    next_pos = (max((t.position for t in existing), default=-1)) + 1

    for file in files:
        original = file.filename or "track.mp3"
        ext = Path(original).suffix.lower() or ".mp3"
        if ext not in {".mp3", ".m4a", ".ogg", ".wav", ".flac", ".aac"}:
            continue
        fname = f"{uuid.uuid4().hex}{ext}"
        dest = TRACKS_DIR / fname
        with dest.open("wb") as f:
            f.write(await file.read())

        title = Path(original).stem
        artist = album = None
        duration = bitrate = samplerate = None
        try:
            meta = MutagenFile(dest, easy=True)
            if meta is not None:
                if meta.tags:
                    title = (meta.tags.get("title", [title]) or [title])[0]
                    artist = (meta.tags.get("artist", [None]) or [None])[0]
                    album = (meta.tags.get("album", [None]) or [None])[0]
                if getattr(meta, "info", None):
                    duration = float(getattr(meta.info, "length", 0) or 0) or None
                    bitrate = int(getattr(meta.info, "bitrate", 0) or 0) // 1000 or None
                    samplerate = int(getattr(meta.info, "sample_rate", 0) or 0) or None
        except Exception:
            pass

        t = Track(
            playlist_id=playlist_id,
            position=next_pos,
            title=title or Path(original).stem,
            artist=artist,
            album=album,
            duration=duration,
            bitrate=bitrate,
            samplerate=samplerate,
            filename=fname,
            original_name=original,
        )
        db.add(t)
        next_pos += 1

    db.commit()
    tracks = db.exec(select(Track).where(Track.playlist_id == playlist_id)).all()
    return _playlist_to_out(p, tracks)


@app.delete("/api/tracks/{track_id}")
def delete_track(track_id: int, db: Session = Depends(get_db)):
    t = db.get(Track, track_id)
    if not t:
        raise HTTPException(404)
    fp = TRACKS_DIR / t.filename
    if fp.exists():
        fp.unlink()
    pid = t.playlist_id
    db.delete(t)
    db.commit()
    # compact positions
    remaining = db.exec(select(Track).where(Track.playlist_id == pid).order_by(Track.position)).all()
    for i, tr in enumerate(remaining):
        tr.position = i
        db.add(tr)
    db.commit()
    return {"ok": True}


@app.get("/api/tracks/{track_id}/stream")
def stream_track(track_id: int, request: Request, db: Session = Depends(get_db)):
    t = db.get(Track, track_id)
    if not t:
        raise HTTPException(404)
    fp = TRACKS_DIR / t.filename
    if not fp.exists():
        raise HTTPException(404)

    file_size = fp.stat().st_size
    media_type = mimetypes.guess_type(str(fp))[0] or "application/octet-stream"
    headers = {"Accept-Ranges": "bytes"}
    range_header = request.headers.get("range")

    if not range_header:
        return FileResponse(fp, media_type=media_type, headers=headers)

    try:
        start, end = _parse_range_header(range_header, file_size)
    except HTTPException:
        return Response(
            status_code=416,
            headers={**headers, "Content-Range": f"bytes */{file_size}"},
        )

    content_length = end - start + 1
    partial_headers = {
        **headers,
        "Content-Length": str(content_length),
        "Content-Range": f"bytes {start}-{end}/{file_size}",
    }
    return StreamingResponse(
        _iter_file_range(fp, start, end),
        status_code=206,
        media_type=media_type,
        headers=partial_headers,
    )


@app.get("/api/health")
def health():
    return {"ok": True}
