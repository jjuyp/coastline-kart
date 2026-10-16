// A compact, original Web Audio score and soundscape. Every source is generated
// locally; the continuous engine/tyres/wind nodes are created only on first play.
export class RaceAudio {
  constructor() {
    this.context = null;
    this.muted = false;
    this.ready = false;
    this.racing = false;
    this.nextNote = 0;
    this.noteIndex = 0;
    this.cueTimes = Object.create(null);
    this.melody = [
      0, 7, 12, 7, 4, 7, 11, 7, 2, 9, 14, 9, 5, 9, 12, 9, 0, 7, 12, 16, 14, 12, 9, 7, 5, 9, 12, 9,
      7, 4, 2, 7,
    ];
  }
  async init() {
    try {
      if (!this.context) this._create();
      if (!this.context) return false;
      if (this.context.state === 'suspended') await this.context.resume();
      this.ready = this.context.state === 'running';
      return this.ready;
    } catch (_) {
      this.ready = false;
      return false;
    }
  }
  _create() {
    const AudioContext = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = (this.context = new AudioContext());
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.7;
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -16;
    compressor.knee.value = 22;
    compressor.ratio.value = 3;
    this.master.connect(compressor);
    compressor.connect(ctx.destination);
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 550;
    this.engineFilter.Q.value = 0.4;
    this.engineGain.connect(this.engineFilter);
    this.engineFilter.connect(this.master);
    this.engine = ctx.createOscillator();
    this.engine.type = 'sawtooth';
    this.engine.frequency.value = 58;
    this.engine.connect(this.engineGain);
    this.engine.start();
    this.harmonicGain = ctx.createGain();
    this.harmonicGain.gain.value = 0;
    this.harmonic = ctx.createOscillator();
    this.harmonic.type = 'triangle';
    this.harmonic.frequency.value = 116;
    this.harmonic.connect(this.harmonicGain);
    this.harmonicGain.connect(this.master);
    this.harmonic.start();
    const length = ctx.sampleRate * 3;
    const noise = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = noise.getChannelData(0);
    let brown = 0;
    for (let i = 0; i < length; i++) {
      brown = (brown + (Math.random() * 2 - 1) * 0.028) / 1.028;
      data[i] = brown * 4.5;
    }
    this.noiseBuffer = noise;
    this.noise = ctx.createBufferSource();
    this.noise.buffer = noise;
    this.noise.loop = true;
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'lowpass';
    this.windFilter.frequency.value = 630;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;
    this.noise.connect(this.windFilter);
    this.windFilter.connect(this.windGain);
    this.windGain.connect(this.master);
    this.tyreFilter = ctx.createBiquadFilter();
    this.tyreFilter.type = 'bandpass';
    this.tyreFilter.frequency.value = 1500;
    this.tyreFilter.Q.value = 0.65;
    this.tyreGain = ctx.createGain();
    this.tyreGain.gain.value = 0;
    this.noise.connect(this.tyreFilter);
    this.tyreFilter.connect(this.tyreGain);
    this.tyreGain.connect(this.master);
    this.noise.start();
    this.musicGain = ctx.createGain();
    this.musicGain.gain.value = 0.3;
    this.musicGain.connect(this.master);
    this.nextNote = ctx.currentTime + 0.1;
  }
  setMuted(muted) {
    this.muted = Boolean(muted);
    if (this.context && this.master)
      this.master.gain.setTargetAtTime(this.muted ? 0 : 0.7, this.context.currentTime, 0.03);
  }
  update(dt, { speed = 0, drift = false, boost = false, racing = false } = {}) {
    if (!this.context || this.context.state !== 'running') return;
    const ctx = this.context,
      now = ctx.currentTime;
    const velocity = Math.min(Math.abs(speed) / 30, 1.35);
    const active = racing ? 1 : 0;
    const rev = 56 + velocity * 124 + (boost ? 20 : 0);
    // A small continuously varying rev tone prevents a static electric buzz.
    this.engine.frequency.setTargetAtTime(rev + Math.sin(now * 14) * (1 + velocity * 2), now, 0.07);
    this.harmonic.frequency.setTargetAtTime(rev * 2.003, now, 0.09);
    this.engineGain.gain.setTargetAtTime(active * (0.027 + velocity * 0.033), now, 0.15);
    this.harmonicGain.gain.setTargetAtTime(active * (0.022 + velocity * 0.012), now, 0.15);
    this.engineFilter.frequency.setTargetAtTime(
      360 + velocity * 530 + (boost ? 230 : 0),
      now,
      0.16,
    );
    this.tyreGain.gain.setTargetAtTime(active * (drift && velocity > 0.22 ? 0.1 : 0), now, 0.07);
    this.tyreFilter.frequency.setTargetAtTime(1150 + velocity * 900, now, 0.09);
    this.windGain.gain.setTargetAtTime(active * (0.024 + velocity * 0.07), now, 0.35);
    if (racing && !this.racing) {
      this.nextNote = now + 0.15;
      this.noteIndex = 0;
    }
    this.racing = racing;
    // The scheduler creates short notes at 2.8 Hz, never audio nodes per frame.
    if (racing && !this.muted && now >= this.nextNote - 0.08) {
      if (this.nextNote < now - 0.2) this.nextNote = now + 0.02;
      const index = this.noteIndex % this.melody.length;
      this._tone(
        261.626 * 2 ** (this.melody[index] / 12),
        this.nextNote,
        0.25,
        0.045,
        'sine',
        this.musicGain,
      );
      if (index % 4 === 0) {
        const bass = [130.813, 146.832, 130.813, 174.614][Math.floor(index / 8)];
        this._tone(bass, this.nextNote, 0.61, 0.042, 'triangle', this.musicGain);
      }
      this.nextNote += 0.355;
      this.noteIndex++;
    }
  }
  _tone(frequency, when, duration, level, type = 'sine', target = this.master, finalFrequency) {
    const ctx = this.context;
    if (!ctx || !target) return;
    const oscillator = ctx.createOscillator(),
      envelope = ctx.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, when);
    if (finalFrequency)
      oscillator.frequency.exponentialRampToValueAtTime(finalFrequency, when + duration);
    envelope.gain.setValueAtTime(0, when);
    envelope.gain.linearRampToValueAtTime(level, when + 0.012);
    envelope.gain.exponentialRampToValueAtTime(0.0001, when + duration);
    oscillator.connect(envelope);
    envelope.connect(target);
    oscillator.start(when);
    oscillator.stop(when + duration + 0.03);
    oscillator.onended = () => {
      oscillator.disconnect();
      envelope.disconnect();
    };
  }
  cue(type) {
    if (!this.context || this.context.state !== 'running' || this.muted) return;
    const now = this.context.currentTime;
    if (
      (type === 'collision' || type === 'boost' || type === 'click') &&
      now - (this.cueTimes[type] ?? -10) < 0.18
    )
      return;
    this.cueTimes[type] = now;
    if (type === 'countdown' || type === 'count' || type === 'tick') {
      this._tone(659.25, now, 0.15, 0.13, 'sine');
      this._tone(1318.5, now, 0.1, 0.035, 'sine');
    } else if (type === 'go') {
      this._tone(1046.5, now, 0.44, 0.13, 'sine');
      this._tone(1568, now + 0.035, 0.4, 0.047, 'triangle');
    } else if (type === 'lap') {
      [783.99, 987.77, 1174.66].forEach((f, i) => this._tone(f, now + i * 0.085, 0.29, 0.095));
    } else if (type === 'finish') {
      [523.25, 659.25, 783.99, 1046.5, 987.77, 1046.5].forEach((f, i) =>
        this._tone(f, now + i * 0.13, i === 5 ? 0.95 : 0.35, 0.105, 'triangle'),
      );
      [261.63, 329.63, 392].forEach((f) => this._tone(f, now + 0.65, 1.15, 0.044));
    } else if (type === 'boost') {
      this._tone(220, now, 0.5, 0.07, 'sine', this.master, 980);
      this._tone(330, now + 0.03, 0.4, 0.025, 'triangle', this.master, 1320);
    } else if (type === 'collision') {
      this._tone(100, now, 0.16, 0.12, 'triangle', this.master, 42);
    } else if (type === 'click') this._tone(740, now, 0.06, 0.055, 'sine');
  }
  stop() {
    this.racing = false;
    if (!this.context) return;
    const now = this.context.currentTime;
    for (const gain of [this.engineGain, this.harmonicGain, this.tyreGain, this.windGain])
      if (gain) gain.gain.setTargetAtTime(0, now, 0.08);
  }
  dispose() {
    if (!this.context) return;
    this.stop();
    try {
      this.engine.stop();
      this.harmonic.stop();
      this.noise.stop();
    } catch (_) {}
    this.context.close().catch(() => {});
    this.context = null;
    this.ready = false;
  }
}
