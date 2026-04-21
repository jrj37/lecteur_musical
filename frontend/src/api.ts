import type { Playlist } from "./types";

async function j<T>(r: Response): Promise<T> {
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  return r.json() as Promise<T>;
}

export const api = {
  listPlaylists: () => fetch(`/api/playlists`).then(j<Playlist[]>),
  createPlaylist: (name: string) =>
    fetch(`/api/playlists`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    }).then(j<Playlist>),
  renamePlaylist: (id: number, name: string) =>
    fetch(`/api/playlists/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    }).then(j<Playlist>),
  deletePlaylist: (id: number) =>
    fetch(`/api/playlists/${id}`, { method: "DELETE" }).then((r) => r.json()),
  uploadCover: (id: number, file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return fetch(`/api/playlists/${id}/cover`, {
      method: "POST",
      body: fd,
    }).then(j<Playlist>);
  },
  uploadTracks: (id: number, files: File[]) => {
    const fd = new FormData();
    files.forEach((f) => fd.append("files", f));
    return fetch(`/api/playlists/${id}/tracks`, {
      method: "POST",
      body: fd,
    }).then(j<Playlist>);
  },
  reorder: (id: number, trackIds: number[]) =>
    fetch(`/api/playlists/${id}/reorder`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ track_ids: trackIds }),
    }).then(j<Playlist>),
  deleteTrack: (id: number) =>
    fetch(`/api/tracks/${id}`, { method: "DELETE" }).then((r) => r.json()),
};
