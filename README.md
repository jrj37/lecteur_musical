# Retro-Amp

Lecteur MP3 web avec visualiseur **Milkdrop** (via `butterchurn`, le port JS de projectM — projectM lui-même est C++ et ne tourne pas dans un navigateur), égaliseur 10 bandes, et gestion de playlists (drag-and-drop pour réordonner, suppression, upload de cover).

- **Frontend** : TypeScript + React + Vite + Web Audio API + butterchurn
- **Backend** : Python + FastAPI + SQLite (stockage des MP3 + covers + playlists)

## Lancer

Deux terminaux :

```bash
# Terminal 1 — backend (http://localhost:8787)
cd backend
./run.sh
```

```bash
# Terminal 2 — frontend (http://localhost:5173)
cd frontend
./run.sh
```

Ouvre `http://localhost:5173`. Vite proxy `/api` → `http://localhost:8787`.

## Fonctionnalités

- Interface retro-winamp (LCD vert, chrome, boutons biseautés, marquee, VT323/Press Start 2P)
- Lecture MP3/M4A/OGG/WAV/FLAC/AAC via `<audio>` + Web Audio graph
- **Égaliseur 10 bandes** (60/170/310/600/1K/3K/6K/12K/14K/16K) avec presets (Flat/Rock/Pop/Jazz/Classical/Bass/Treble/Vocal) + bypass
- **Visualiseur Milkdrop** : butterchurn branché sur l'`AnalyserNode`, presets tournants (change toutes les 30s)
- **Playlists multiples** : create/rename/delete, cover uploadable (cliquer sur la pochette)
- **Réordonner** par drag-and-drop (poignée `⋮⋮`) — persisté côté serveur
- **Supprimer** des pistes individuellement (bouton `✕`)
- **Ajouter** des pistes par drag-and-drop sur la fenêtre OU via `LOAD FILES`
- Lecture prev/next/stop/seek/volume, auto-next à la fin

## Arborescence

```
music/
├── backend/                 FastAPI + SQLite + mutagen
│   ├── app/
│   │   ├── main.py          Endpoints REST
│   │   ├── models.py        SQLModel Playlist/Track
│   │   └── db.py
│   ├── data/                (généré) retroamp.db, tracks/, covers/
│   ├── requirements.txt
│   └── run.sh
└── frontend/                Vite + React + TS
    ├── src/
    │   ├── App.tsx          UI principale
    │   ├── PlaylistView.tsx Drag-drop (@dnd-kit)
    │   ├── Visualizer.tsx   Butterchurn/Milkdrop
    │   ├── audio.ts         Web Audio graph + EQ
    │   ├── api.ts           Client REST
    │   └── styles.css
    └── run.sh
```

## Notes

- Le visualiseur s'active au premier clic (contraintes navigateur sur `AudioContext`). Tu peux le masquer avec le bouton `EQ` en haut à droite.
- Les uploads sont stockés dans `backend/data/`. Pour reset : `rm -rf backend/data`.
- Sur Firefox les sliders verticaux utilisent `appearance: slider-vertical` (supporté partiellement) — Chrome/Safari fonctionnent pleinement.
