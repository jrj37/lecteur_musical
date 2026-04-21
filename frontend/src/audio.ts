// Web-Audio based engine with 10-band equalizer + analyser for visualizer.

export const EQ_BANDS = [60, 170, 310, 600, 1000, 3000, 6000, 12000, 14000, 16000];

export class AudioEngine {
  ctx: AudioContext;
  audio: HTMLAudioElement;
  source: MediaElementAudioSourceNode;
  gain: GainNode;
  analyser: AnalyserNode;      // post-gain, for metering
  vizAnalyser: AnalyserNode;   // pre-gain, raw signal for butterchurn
  filters: BiquadFilterNode[];
  private eqEnabled = true;

  constructor(audio: HTMLAudioElement) {
    const Ctx =
      (window as any).AudioContext || (window as any).webkitAudioContext;
    this.ctx = new Ctx();
    this.audio = audio;
    this.source = this.ctx.createMediaElementSource(audio);
    this.gain = this.ctx.createGain();

    // Post-gain analyser (general metering)
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.65;

    // Pre-gain analyser dedicated to butterchurn — always full signal
    this.vizAnalyser = this.ctx.createAnalyser();
    this.vizAnalyser.fftSize = 2048;
    this.vizAnalyser.smoothingTimeConstant = 0.65;
    // Tap source directly; vizAnalyser acts as a pass-through for butterchurn
    this.source.connect(this.vizAnalyser);

    this.filters = EQ_BANDS.map((f, i) => {
      const n = this.ctx.createBiquadFilter();
      n.frequency.value = f;
      n.Q.value = 1.0;
      if (i === 0) n.type = "lowshelf";
      else if (i === EQ_BANDS.length - 1) n.type = "highshelf";
      else n.type = "peaking";
      n.gain.value = 0;
      return n;
    });
    this.rebuildGraph();
  }

  private rebuildGraph() {
    try {
      this.source.disconnect();
      this.filters.forEach((f) => f.disconnect());
      this.gain.disconnect();
      this.analyser.disconnect();
      // vizAnalyser stays connected to source permanently
    } catch {}
    // Re-tap vizAnalyser from source
    this.source.connect(this.vizAnalyser);
    let node: AudioNode = this.source;
    if (this.eqEnabled) {
      for (const f of this.filters) {
        node.connect(f);
        node = f;
      }
    }
    node.connect(this.gain);
    this.gain.connect(this.analyser);
    this.analyser.connect(this.ctx.destination);
  }

  setEqEnabled(on: boolean) {
    this.eqEnabled = on;
    this.rebuildGraph();
  }

  setBand(i: number, db: number) {
    if (this.filters[i]) this.filters[i].gain.value = db;
  }

  setVolume(v: number) {
    this.gain.gain.value = Math.max(0, Math.min(1, v));
  }

  async resume() {
    if (this.ctx.state === "suspended") await this.ctx.resume();
  }
}

export const EQ_PRESETS: Record<string, number[]> = {
  FLAT: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  ROCK: [5, 3, -2, -3, -1, 2, 4, 5, 5, 5],
  POP: [-1, 2, 4, 4, 2, -1, -1, 0, 2, 3],
  JAZZ: [3, 2, 1, 2, -1, -1, 0, 1, 2, 3],
  CLASSICAL: [4, 3, 2, 1, -1, -1, 0, 2, 3, 4],
  BASS: [8, 6, 4, 2, 0, 0, 0, 0, 0, 0],
  TREBLE: [0, 0, 0, 0, 0, 2, 4, 6, 7, 8],
  VOCAL: [-2, -1, 0, 3, 4, 4, 3, 1, 0, -1],
};
