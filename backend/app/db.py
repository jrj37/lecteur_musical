from pathlib import Path
from sqlmodel import SQLModel, Session, create_engine

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
TRACKS_DIR = DATA_DIR / "tracks"
COVERS_DIR = DATA_DIR / "covers"
for d in (DATA_DIR, TRACKS_DIR, COVERS_DIR):
    d.mkdir(parents=True, exist_ok=True)

DB_URL = f"sqlite:///{DATA_DIR / 'retroamp.db'}"
engine = create_engine(DB_URL, echo=False, connect_args={"check_same_thread": False})


def init_db() -> None:
    SQLModel.metadata.create_all(engine)


def get_session() -> Session:
    return Session(engine)
