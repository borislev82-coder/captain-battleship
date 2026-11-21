class CaptainAudioEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.styleId = 'shanty';
    this.isPlayingMusic = false;
    this.timerId = null;
    this.step = 0;
    this.customAudio = null;
  }

  _ensureContext() {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  unlockAndPlayCurrent() {
    this._ensureContext();
    if (!this.muted && !this.isPlayingMusic) {
      this.startAmbient();
    }
  }

  setStyle(styleId, autoplay = true) {
    this.styleId = styleId || 'shanty';
    if (autoplay && !this.muted) {
      this._ensureContext();
      this.startAmbient();
    }
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.muted) {
      this.stopAmbient();
      if (this.customAudio) this.customAudio.pause();
    } else {
      this._ensureContext();
      this.startAmbient();
    }
    return this.muted;
  }

  startAmbient() {
    if (this.muted) return;
    this._ensureContext();
    if (!this.ctx) return;

    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }

    this.isPlayingMusic = true;
    const notesShanty = [293.66, 349.23, 440.0, 392.0, 349.23, 329.63, 293.66, 220.0];
    const notesCandle = [220.0, 261.63, 329.63, 293.66, 246.94, 220.0, 196.0, 220.0];
    const tempoMs = this.styleId === 'night_candle' ? 950 : 620;

    this.timerId = setInterval(() => {
      if (this.muted || !this.ctx) return;
      const scale = this.styleId === 'night_candle' ? notesCandle : notesShanty;
      const freq = scale[this.step % scale.length];
      this.step += 1;
      this._playTone(freq, this.styleId === 'night_candle' ? 0.75 : 0.42, 'triangle', 0.03);
    }, tempoMs);
  }

  stopAmbient() {
    this.isPlayingMusic = false;
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
  }

  _playTone(freq, duration, type = 'sine', volume = 0.06) {
    if (this.muted || !this.ctx) return;
    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, now);

      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(volume, now + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + duration + 0.02);
    } catch (_) {}
  }

  playCue(cueName) {
    if (this.muted) return;
    this._ensureContext();
    if (!this.ctx) return;

    if (cueName === 'ink') {
      this._playTone(520, 0.09, 'triangle', 0.05);
    } else if (cueName === 'shot') {
      this._playTone(160, 0.18, 'sawtooth', 0.08);
    } else if (cueName === 'hit') {
      this._playTone(130, 0.28, 'square', 0.09);
      setTimeout(() => this._playTone(95, 0.3, 'sawtooth', 0.08), 80);
    } else if (cueName === 'miss') {
      this._playTone(280, 0.14, 'sine', 0.05);
    } else if (cueName === 'win') {
      [392, 493.88, 587.33, 783.99].forEach((f, idx) => {
        setTimeout(() => this._playTone(f, 0.25, 'triangle', 0.07), idx * 120);
      });
    }
  }
}

export const captainAudio = new CaptainAudioEngine();
