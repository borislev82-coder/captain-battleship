// Управление музыкой по стилю стола и мягкими морскими звуками

const STYLE_TRACKS = {
  shanty: 'audio-shanty',
  night_candle: 'audio-night'
};

class CaptainAudioEngine {
  constructor() {
    this.currentStyle = 'shanty';
    this.muted = false;
    this.ctx = null;
  }

  ensureContext() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  setStyle(styleId, autoplay = true) {
    this.currentStyle = STYLE_TRACKS[styleId] ? styleId : 'shanty';
    const targetAudioId = STYLE_TRACKS[this.currentStyle];

    Object.entries(STYLE_TRACKS).forEach(([key, audioId]) => {
      const el = document.getElementById(audioId);
      if (!el) return;
      if (key !== this.currentStyle || this.muted || !autoplay) {
        el.pause();
      }
    });

    const activeEl = document.getElementById(targetAudioId);
    if (activeEl && !this.muted && autoplay) {
      activeEl.volume = 0.45;
      activeEl.play().catch(() => {
        // Браузер может заблокировать автовоспроизведение до первого клика пользователя
      });
    }
  }

  unlockAndPlayCurrent() {
    this.ensureContext();
    if (!this.muted) {
      this.setStyle(this.currentStyle, true);
    }
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.muted) {
      Object.values(STYLE_TRACKS).forEach((audioId) => {
        const el = document.getElementById(audioId);
        if (el) el.pause();
      });
    } else {
      this.setStyle(this.currentStyle, true);
    }
    return this.muted;
  }

  // Лёгкий отклик пера / выстрела / попадания
  playCue(kind = 'ink') {
    if (this.muted) return;
    this.ensureContext();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    if (kind === 'hit') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(140, now);
      osc.frequency.exponentialRampToValueAtTime(48, now + 0.22);
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
      osc.connect(gain).connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.25);
    } else if (kind === 'sunk') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(110, now);
      osc.frequency.exponentialRampToValueAtTime(36, now + 0.45);
      gain.gain.setValueAtTime(0.16, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.46);
      osc.connect(gain).connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.47);
    } else {
      // Мягкий штрих пера по пергаменту
      osc.type = 'sine';
      osc.frequency.setValueAtTime(320, now);
      osc.frequency.exponentialRampToValueAtTime(190, now + 0.06);
      gain.gain.setValueAtTime(0.04, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.065);
      osc.connect(gain).connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.07);
    }
  }
}

export const captainAudio = new CaptainAudioEngine();
