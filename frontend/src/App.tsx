import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "./api";
import type { Playlist, Track } from "./types";
import { AudioEngine, EQ_BANDS, EQ_PRESETS } from "./audio";
import PlaylistView from "./PlaylistView";
import Visualizer from "./Visualizer";

function fmtTime(t: number) {
  if (!isFinite(t) || t < 0) t = 0;
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

const VIZ_THEMES = [
  { value: "all", label: "ALL PROJECTM" },
  { value: "liquid", label: "LIQUID FLOW" },
  { value: "neon", label: "NEON GLOW" },
  { value: "fractal", label: "FRACTAL" },
  { value: "space", label: "SPACE" },
  { value: "organic", label: "ORGANIC" },
  { value: "chaos", label: "CHAOS" },
];

export default function App() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const engineRef = useRef<AudioEngine | null>(null);
  const [engineReady, setEngineReady] = useState(false);

  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [currentPlaylistId, setCurrentPlaylistId] = useState<number | null>(null);
  const [currentTrackId, setCurrentTrackId] = useState<number | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [eqOn, setEqOn] = useState(true);
  const [showEq, setShowEq] = useState(true);
  const [showPlaylist, setShowPlaylist] = useState(true);
  const [bands, setBands] = useState<number[]>([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const [preset, setPreset] = useState("FLAT");
  const [marquee, setMarquee] = useState("★ DRAG MP3 FILES HERE OR CLICK LOAD ★ WELCOME TO RETRO-AMP v0.1");
  const [showViz, setShowViz] = useState(true);
  const [vizTheme, setVizTheme] = useState("all");
  const [vizWidth, setVizWidth] = useState(420);
  const isSeekingRef = useRef(false);
  const resizingRef = useRef(false);
  const resizeStartXRef = useRef(0);
  const resizeStartWRef = useRef(420);

  const coverInputRef = useRef<HTMLInputElement>(null);
  const trackInputRef = useRef<HTMLInputElement>(null);

  const current = useMemo(
    () => playlists.find((p) => p.id === currentPlaylistId) || null,
    [playlists, currentPlaylistId]
  );
  const currentTrack = useMemo(
    () => current?.tracks.find((t) => t.id === currentTrackId) || null,
    [current, currentTrackId]
  );

  // load playlists
  useEffect(() => {
    (async () => {
      let pls = await api.listPlaylists();
      if (pls.length === 0) {
        const p = await api.createPlaylist("My Playlist");
        pls = [p];
      }
      setPlaylists(pls);
      setCurrentPlaylistId(pls[0].id);
    })();
  }, []);

  useEffect(() => {
    const stopSeeking = () => {
      isSeekingRef.current = false;
    };

    window.addEventListener("mouseup", stopSeeking);
    window.addEventListener("touchend", stopSeeking);
    window.addEventListener("pointerup", stopSeeking);
    window.addEventListener("pointercancel", stopSeeking);

    return () => {
      window.removeEventListener("mouseup", stopSeeking);
      window.removeEventListener("touchend", stopSeeking);
      window.removeEventListener("pointerup", stopSeeking);
      window.removeEventListener("pointercancel", stopSeeking);
    };
  }, []);

  // Keyboard shortcuts: Space = play/pause, Arrows = seek ±5s
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable) {
          return;
        }
      }
      const a = audioRef.current;
      if (e.code === "Space") {
        e.preventDefault();
        togglePlay();
      } else if (e.code === "ArrowRight") {
        if (!a) return;
        e.preventDefault();
        const step = e.shiftKey ? 15 : 5;
        const next = Math.min((a.duration || 0), a.currentTime + step);
        a.currentTime = next;
        setCurrentTime(next);
      } else if (e.code === "ArrowLeft") {
        if (!a) return;
        e.preventDefault();
        const step = e.shiftKey ? 15 : 5;
        const next = Math.max(0, a.currentTime - step);
        a.currentTime = next;
        setCurrentTime(next);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [current, currentTrackId]);

  // init engine lazily after user gesture
  function ensureEngine() {
    if (!audioRef.current) return null;
    if (!engineRef.current) {
      engineRef.current = new AudioEngine(audioRef.current);
      engineRef.current.setVolume(volume);
      setEngineReady(true);
    }
    engineRef.current.resume();
    return engineRef.current;
  }

  // audio element listeners
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onTime = () => { if (!isSeekingRef.current) setCurrentTime(a.currentTime); };
    const onDur = () => setDuration(a.duration || 0);
    const onEnd = () => playNext();
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("loadedmetadata", onDur);
    a.addEventListener("ended", onEnd);
    a.addEventListener("play", onPlay);
    a.addEventListener("pause", onPause);
    return () => {
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("loadedmetadata", onDur);
      a.removeEventListener("ended", onEnd);
      a.removeEventListener("play", onPlay);
      a.removeEventListener("pause", onPause);
    };
  }, [currentTrackId, current]);

  function playTrack(t: Track) {
    ensureEngine();
    if (!audioRef.current) return;
    audioRef.current.src = t.stream_url;
    audioRef.current.play().catch(() => {});
    setCurrentTrackId(t.id);
    setMarquee(`▶ ${t.artist ? t.artist + " - " : ""}${t.title}`);
  }

  function togglePlay() {
    ensureEngine();
    const a = audioRef.current;
    if (!a) return;
    if (!a.src && current?.tracks[0]) {
      playTrack(current.tracks[0]);
      return;
    }
    if (a.paused) a.play();
    else a.pause();
  }

  function stop() {
    const a = audioRef.current;
    if (!a) return;
    a.pause();
    a.currentTime = 0;
  }

  function playPrev() {
    if (!current || current.tracks.length === 0) return;
    const idx = current.tracks.findIndex((t) => t.id === currentTrackId);
    const next = current.tracks[(idx - 1 + current.tracks.length) % current.tracks.length];
    playTrack(next);
  }
  function playNext() {
    if (!current || current.tracks.length === 0) return;
    const idx = current.tracks.findIndex((t) => t.id === currentTrackId);
    const next = current.tracks[(idx + 1) % current.tracks.length];
    playTrack(next);
  }

  function onVolume(v: number) {
    setVolume(v);
    engineRef.current?.setVolume(v);
  }

  function onBand(i: number, v: number) {
    const nb = bands.slice();
    nb[i] = v;
    setBands(nb);
    engineRef.current?.setBand(i, v);
  }

  function applyPreset(name: string) {
    setPreset(name);
    const p = EQ_PRESETS[name] || EQ_PRESETS.FLAT;
    setBands(p);
    p.forEach((g, i) => engineRef.current?.setBand(i, g));
  }

  function toggleEq() {
    const next = !eqOn;
    setEqOn(next);
    engineRef.current?.setEqEnabled(next);
  }

  async function handleTrackFiles(files: FileList | File[] | null) {
    if (!files || !current) return;
    const arr = Array.from(files).filter((f) => /audio|mp3|m4a|wav|ogg|flac/i.test(f.type) || /\.(mp3|m4a|wav|ogg|flac|aac)$/i.test(f.name));
    if (arr.length === 0) return;
    const updated = await api.uploadTracks(current.id, arr);
    setPlaylists((ps) => ps.map((p) => (p.id === updated.id ? updated : p)));
  }

  async function handleCoverFile(file: File | null) {
    if (!file || !current) return;
    const updated = await api.uploadCover(current.id, file);
    setPlaylists((ps) => ps.map((p) => (p.id === updated.id ? updated : p)));
  }

  async function addPlaylist() {
    const name = prompt("Playlist name?", "New Playlist");
    if (!name) return;
    const p = await api.createPlaylist(name);
    setPlaylists((ps) => [...ps, p]);
    setCurrentPlaylistId(p.id);
  }

  async function removePlaylist() {
    if (!current) return;
    if (!confirm(`Delete playlist "${current.name}"?`)) return;
    await api.deletePlaylist(current.id);
    const rest = playlists.filter((p) => p.id !== current.id);
    setPlaylists(rest);
    setCurrentPlaylistId(rest[0]?.id ?? null);
    setCurrentTrackId(null);
  }

  async function renamePlaylist() {
    if (!current) return;
    const name = prompt("Rename playlist", current.name);
    if (!name) return;
    const updated = await api.renamePlaylist(current.id, name);
    setPlaylists((ps) => ps.map((p) => (p.id === updated.id ? updated : p)));
  }

  async function reorderTracks(ids: number[]) {
    if (!current) return;
    const updated = await api.reorder(current.id, ids);
    setPlaylists((ps) => ps.map((p) => (p.id === updated.id ? updated : p)));
  }

  async function deleteTrack(t: Track) {
    await api.deleteTrack(t.id);
    if (!current) return;
    const updated = {
      ...current,
      tracks: current.tracks.filter((x) => x.id !== t.id).map((x, i) => ({ ...x, position: i })),
    };
    setPlaylists((ps) => ps.map((p) => (p.id === updated.id ? updated : p)));
    if (currentTrackId === t.id) {
      audioRef.current?.pause();
      setCurrentTrackId(null);
    }
  }

  // drag-drop MP3 onto window
  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    handleTrackFiles(e.dataTransfer.files);
  }

  function onSeek(v: number) {
    if (audioRef.current) audioRef.current.currentTime = v;
    setCurrentTime(v);
  }

  function beginSeek() {
    isSeekingRef.current = true;
  }

  function updateSeek(v: number) {
    onSeek(v);
  }

  function endSeek(v?: number) {
    if (typeof v === "number") onSeek(v);
    isSeekingRef.current = false;
  }

  // Viz panel resize
  function onResizeMouseDown(e: React.MouseEvent) {
    resizingRef.current = true;
    resizeStartXRef.current = e.clientX;
    resizeStartWRef.current = vizWidth;
    const onMove = (ev: MouseEvent) => {
      if (!resizingRef.current) return;
      const delta = ev.clientX - resizeStartXRef.current;
      setVizWidth(Math.max(220, Math.min(800, resizeStartWRef.current + delta)));
    };
    const onUp = () => {
      resizingRef.current = false;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  function resetEq() {
    applyPreset("FLAT");
  }

  const info = currentTrack
    ? `${currentTrack.bitrate || 128} KBPS · ${Math.round((currentTrack.samplerate || 44100) / 1000)} KHZ · STEREO`
    : `128 KBPS · 44 KHZ · STEREO`;

  return (
    <div
      className="app"
      onDrop={onDrop}
      onDragOver={(e) => e.preventDefault()}
    >
      <audio ref={audioRef} crossOrigin="anonymous" />

      <div className="amp-wrapper">
      <div className="amp">
        {/* Title bar */}
        <div className="titlebar">
          <div className="title">◆ RETRO-AMP V0.1</div>
          <div className="titlebar-btns">
            <span />
            <span />
            <span className="close" />
          </div>
        </div>

        {/* LCD display */}
        <div className="lcd">
          <div className="lcd-left">
            <div className="lcd-time">{fmtTime(currentTime)}</div>
          </div>
          <div className="lcd-mid">
            <div>{info.split("·")[0]}</div>
            <div>{info.split("·")[1]}</div>
            <div>{info.split("·")[2]}</div>
          </div>
        </div>

        {/* Marquee */}
        <div className="marquee">
          <div className="marquee-inner">
            {marquee} &nbsp;&nbsp; {currentTrack ? `${currentTrack.title}` : ""}
          </div>
        </div>

        {/* Seek bar */}
        <input
          type="range"
          className="seek"
          min={0}
          max={duration || 0}
          value={currentTime}
          step={0.1}
          onMouseDown={beginSeek}
          onTouchStart={beginSeek}
          onPointerDown={beginSeek}
          onMouseUp={(e) => endSeek(Number(e.currentTarget.value))}
          onTouchEnd={(e) => endSeek(Number(e.currentTarget.value))}
          onPointerUp={(e) => endSeek(Number(e.currentTarget.value))}
          onPointerCancel={() => endSeek()}
          onBlur={() => endSeek()}
          onInput={(e) => updateSeek(Number((e.target as HTMLInputElement).value))}
          onChange={(e) => updateSeek(Number(e.target.value))}
        />

        {/* Transport */}
        <div className="transport">
          <button className="btn" onClick={playPrev} title="Previous">⏮</button>
          <button className="btn" onClick={togglePlay} title="Play/Pause">
            {isPlaying ? "▶" : "▶"}
          </button>
          <button className="btn" onClick={() => audioRef.current?.pause()} title="Pause">⏸</button>
          <button className="btn" onClick={stop} title="Stop">⏹</button>
          <button className="btn" onClick={playNext} title="Next">⏭</button>
          <div className="spacer" />
          <button className="btn wide" onClick={() => trackInputRef.current?.click()}>
            LOAD FILES
          </button>
          <input
            ref={trackInputRef}
            type="file"
            accept="audio/*"
            multiple
            hidden
            onChange={(e) => handleTrackFiles(e.target.files)}
          />
        </div>

        {/* Volume + EQ toggles */}
        <div className="row">
          <div className="vol-row">
            <span className="mono">VOL</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={volume}
              onChange={(e) => onVolume(Number(e.target.value))}
              className="vol"
            />
          </div>
          <button className={`btn small ${eqOn ? "" : "off"}`} onClick={toggleEq}>
            {eqOn ? "NORM" : "BYPASS"}
          </button>
          <button
            className={`btn small ${showEq ? "on" : ""}`}
            onClick={() => setShowEq((v) => !v)}
            title="Afficher/masquer l'égaliseur"
          >
            EQ
          </button>
        </div>

        {/* Equalizer */}
        {showEq && <div className="panel">
          <div className="panel-header">▸ 10-BAND EQUALIZER
            <div className="eq-header-right">
              <button className="btn tiny" onClick={resetEq} title="Reset to flat">RESET</button>
              <select
                className="preset"
                value={preset}
                onChange={(e) => applyPreset(e.target.value)}
              >
                {Object.keys(EQ_PRESETS).map((k) => (
                  <option key={k}>{k}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="eq">
            {EQ_BANDS.map((f, i) => (
              <div className="eq-band" key={f}>
                <div className="eq-val">{bands[i] > 0 ? "+" : ""}{bands[i]}</div>
                <input
                  type="range"
                  min={-12}
                  max={12}
                  step={1}
                  value={bands[i]}
                  {...({ orient: "vertical" } as any)}
                  className="slider-v"
                  onChange={(e) => onBand(i, Number(e.target.value))}
                />
                <div className="eq-label">
                  {f >= 1000 ? `${f / 1000}K` : f}
                </div>
              </div>
            ))}
          </div>
        </div>}

        {/* Playlist panel */}
        <div className="panel">
          <div className="panel-header" style={{cursor:"pointer"}} onClick={() => setShowPlaylist(v => !v)}>
            ▸ PLAYLIST {showPlaylist ? "▾" : "▸"}
            <div className="pl-ctrls" onClick={e => e.stopPropagation()}>
              <select
                className="preset"
                value={currentPlaylistId ?? ""}
                onChange={(e) => {
                  setCurrentPlaylistId(Number(e.target.value));
                  setCurrentTrackId(null);
                }}
              >
                {playlists.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <button className="btn tiny" onClick={addPlaylist}>+</button>
              <button className="btn tiny" onClick={renamePlaylist}>✎</button>
              <button className="btn tiny" onClick={removePlaylist}>🗑</button>
            </div>
          </div>

          {showPlaylist && <div className="pl-body">
            <div className="cover-col">
              <div
                className="cover"
                onClick={() => coverInputRef.current?.click()}
                title="Click to upload cover"
              >
                {current?.cover_url ? (
                  <img src={current.cover_url} alt="cover" />
                ) : (
                  <div className="cover-placeholder">UPLOAD<br/>COVER</div>
                )}
              </div>
              <input
                ref={coverInputRef}
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => handleCoverFile(e.target.files?.[0] || null)}
              />
              <div className="cover-name">{current?.name ?? ""}</div>
            </div>
            <div className="pl-scroll">
              <PlaylistView
                tracks={current?.tracks ?? []}
                currentTrackId={currentTrackId}
                onPlay={playTrack}
                onDelete={deleteTrack}
                onReorder={reorderTracks}
              />
            </div>
          </div>}
        </div>

        <div className="statusbar">
          <span className={`led ${isPlaying ? "on" : ""}`} /> PLAY
          <span className="led rec" /> REC
          <span className="spacer" />
          <span>{current?.tracks.length ?? 0} TRACKS</span>
        </div>
      </div>

      {/* Resize handle */}
      <div className="viz-resize-handle" onMouseDown={onResizeMouseDown} title="Drag to resize" />

      <div className="viz-panel" style={{width: vizWidth}}>
        <div className="viz-panel-header">◈ MILKDROP</div>
        <div className="viz-panel-body">
          {engineReady && engineRef.current ? (
            <Visualizer
              analyser={engineRef.current.vizAnalyser}
              audioCtx={engineRef.current.ctx}
              isPlaying={isPlaying}
              theme={vizTheme}
              width={vizWidth - 4}
              height={vizWidth - 4}
            />
          ) : (
            <div className="viz-idle">
              <div className="viz-idle-icon">◈</div>
              <div className="viz-idle-txt">NO SIGNAL<br/>PLAY A TRACK</div>
            </div>
          )}
        </div>
        <div className="viz-panel-footer">
          <span className="viz-theme-label">THEME</span>
          <select
            className="viz-theme-select"
            value={vizTheme}
            onChange={(e) => setVizTheme(e.target.value)}
          >
            {VIZ_THEMES.map((theme) => (
              <option key={theme.value} value={theme.value}>{theme.label}</option>
            ))}
          </select>
        </div>
        <div className="viz-panel-note">Preset bank: projectM / Milkdrop community</div>
      </div>

      </div>{/* amp-wrapper */}
    </div>
  );
}
