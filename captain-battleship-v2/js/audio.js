class CaptainAudioEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.styleId = 'shanty';
    this.isPlayingMusic = false;
    this.timerId = null;
    this.bar = 0;
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
      if (this.customAudio) {
        try { this.customAudio.pause(); } catch (_) {}
      }
    } else {
      this._ensureContext();
      this.startAmbient();
    }
    return this.muted;
  }

  _playVoice(freq, duration, type = 'triangle', volume = 0.04, slideTo = null) {
    if (this.muted || !this.ctx) return;
    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, now);
      if (slideTo) {
        osc.frequency.exponentialRampToValueAtTime(slideTo, now + duration);
      }

      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), now + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + duration + 0.03);
    } catch (_) {}
  }

  _playWaveNoise(duration = 0.9, peakGain = 0.018) {
    if (this.muted || !this.ctx) return;
    try {
      const sampleRate = this.ctx.sampleRate;
      const length = Math.floor(sampleRate * duration);
      const buffer = this.ctx.createBuffer(1, length, sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.sin((i / length) * Math.PI);
      }

      const noise = this.ctx.createBufferSource();
      noise.buffer = buffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(this.styleId === 'night_candle' ? 280 : 420, this.ctx.currentTime);
      filter.Q.setValueAtTime(0.7, this.ctx.currentTime);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.0001, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(peakGain, this.ctx.currentTime + duration * 0.4);
      gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + duration);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);
      noise.start();
    } catch (_) {}
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

    const shantyPhrases = [
      { bass: 146.83, chord: [293.66, 349.23, 440.0], lead: 587.33 },
      { bass: 130.81, chord: [261.63, 329.63, 392.0], lead: 523.25 },
      { bass: 116.54, chord: [233.08, 293.66, 349.23], lead: 466.16 },
      { bass: 110.0,  chord: [220.0,  277.18, 329.63], lead: 440.0 },
      { bass: 146.83, chord: [293.66, 369.99, 440.0], lead: 659.25 },
      { bass: 164.81, chord: [329.63, 392.0,  493.88], lead: 587.33 }
    ];

    const candlePhrases = [
      { bass: 110.0,  chord: [220.0,  261.63, 329.63], lead: 440.0 },
      { bass: 98.0,   chord: [196.0,  246.94, 293.66], lead: 392.0 },
      { bass: 87.31,  chord: [174.61, 220.0,  261.63], lead: 349.23 },
      { bass: 82.41,  chord: [164.81, 207.65, 246.94], lead: 329.63 }
    ];

    const tick = () => {
      if (this.muted || !this.ctx) return;
      const isCandle = this.styleId === 'night_candle';
      const phrases = isCandle ? candlePhrases : shantyPhrases;
      const p = phrases[this.bar % phrases.length];
      this.bar += 1;

      const dur = isCandle ? 1.5 : 0.85;
      this._playVoice(p.bass, dur, 'sine', isCandle ? 0.045 : 0.055);
      p.chord.forEach((n, idx) => {
        setTimeout(() => {
          this._playVoice(n, dur * 0.9, isCandle ? 'sine' : 'triangle', isCandle ? 0.022 : 0.026);
        }, idx * (isCandle ? 160 : 90));
      });

      if (this.bar % 2 === 1) {
        setTimeout(() => {
          this._playVoice(p.lead, dur * 0.75, 'triangle', isCandle ? 0.025 : 0.032);
        }, isCandle ? 350 : 220);
      }

      if (this.bar % 3 === 0) {
        this._playWaveNoise(isCandle ? 1.4 : 0.95, isCandle ? 0.015 : 0.02);
      }
    };

    tick();
    this.timerId = setInterval(tick, this.styleId === 'night_candle' ? 1450 : 880);
  }

  stopAmbient() {
    this.isPlayingMusic = false;
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
  }

  playCue(cueName) {
    if (this.muted) return;
    this._ensureContext();
    if (!this.ctx) return;

    if (cueName === 'ink') {
      this._playVoice(540, 0.09, 'triangle', 0.05, 620);
    } else if (cueName === 'shot') {
      this._playVoice(190, 0.22, 'sawtooth', 0.08, 65);
      this._playWaveNoise(0.25, 0.04);
    } else if (cueName === 'hit') {
      this._playVoice(140, 0.28, 'square', 0.08, 55);
      setTimeout(() => this._playVoice(95, 0.32, 'sawtooth', 0.08, 42), 85);
    } else if (cueName === 'miss') {
      this._playVoice(320, 0.16, 'sine', 0.045, 210);
      this._playWaveNoise(0.18, 0.025);
    } else if (cueName === 'win') {
      [392.0, 493.88, 587.33, 783.99].forEach((f, idx) => {
        setTimeout(() => this._playVoice(f, 0.28, 'triangle', 0.065), idx * 130);
      });
    }
  }
}

export const captainAudio = new CaptainAudioEngine();
