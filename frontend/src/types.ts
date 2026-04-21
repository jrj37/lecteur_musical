export interface Track {
  id: number;
  playlist_id: number;
  position: number;
  title: string;
  artist?: string | null;
  album?: string | null;
  duration?: number | null;
  bitrate?: number | null;
  samplerate?: number | null;
  original_name: string;
  stream_url: string;
}

export interface Playlist {
  id: number;
  name: string;
  cover_url?: string | null;
  tracks: Track[];
}
