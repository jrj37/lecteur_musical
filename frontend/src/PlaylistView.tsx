import { useState } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Track } from "./types";

function fmt(t?: number | null) {
  if (!t || !isFinite(t)) return "--:--";
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function Row({
  track,
  index,
  active,
  onPlay,
  onDelete,
}: {
  track: Track;
  index: number;
  active: boolean;
  onPlay: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: track.id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`pl-row ${active ? "pl-row-active" : ""}`}
      onDoubleClick={onPlay}
    >
      <span className="pl-handle" {...attributes} {...listeners}>⋮⋮</span>
      <span className="pl-idx">{(index + 1).toString().padStart(2, "0")}</span>
      <span className="pl-title" title={track.title}>
        {track.artist ? `${track.artist} — ` : ""}
        {track.title}
      </span>
      <span className="pl-dur">{fmt(track.duration)}</span>
      <button className="pl-btn" onClick={onPlay} title="Play">▶</button>
      <button className="pl-btn pl-del" onClick={onDelete} title="Remove">✕</button>
    </div>
  );
}

interface Props {
  tracks: Track[];
  currentTrackId: number | null;
  onPlay: (t: Track) => void;
  onDelete: (t: Track) => void;
  onReorder: (ids: number[]) => void;
}

export default function PlaylistView({
  tracks,
  currentTrackId,
  onPlay,
  onDelete,
  onReorder,
}: Props) {
  const [items, setItems] = useState<Track[]>(tracks);

  // keep local in sync
  if (items.map((t) => t.id).join(",") !== tracks.map((t) => t.id).join(",")) {
    setItems(tracks);
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function handleEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = items.findIndex((t) => t.id === active.id);
    const newIndex = items.findIndex((t) => t.id === over.id);
    const next = arrayMove(items, oldIndex, newIndex);
    setItems(next);
    onReorder(next.map((t) => t.id));
  }

  if (items.length === 0) {
    return (
      <div className="pl-empty">
        NO TRACKS LOADED<br />
        DRAG MP3s OR CLICK LOAD
      </div>
    );
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleEnd}>
      <SortableContext items={items.map((t) => t.id)} strategy={verticalListSortingStrategy}>
        <div className="pl-list">
          {items.map((t, i) => (
            <Row
              key={t.id}
              index={i}
              track={t}
              active={t.id === currentTrackId}
              onPlay={() => onPlay(t)}
              onDelete={() => onDelete(t)}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
