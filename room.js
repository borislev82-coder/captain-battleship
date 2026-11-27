'use strict';

class RoomNetwork {
  constructor({ roomCode, playerName, rankId, onState, onStatus }) {
    Object.assign(this, { roomCode, playerName, rankId, onState, onStatus });
    this.shots = 0;
    this.connected = false;
  }

  async request(action, data = {}, keepalive = false) {
    const response = await fetch('/api/room', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: this.roomCode, token: this.token, round: this.round,
        cursor: { round: this.round, phase: this.phase, shots: this.shots }, action, ...data
      }),
      signal: AbortSignal.timeout(8000),
      keepalive
    });
    const result = await response.json();
    if (!response.ok) {
      const error = new Error(result.error || 'Запрос отклонён.');
      error.status = response.status;
      throw error;
    }
    return result;
  }

  async connect() {
    if (this.busy || this.closed) return;
    this.busy = true;
    try {
      const { token, state } = await this.request('join', { name: this.playerName, rankId: this.rankId });
      this.token = token;
      if (this.closed) {
        this.request('leave', {}, true).catch(() => {});
        return;
      }
      this.accept(state);
      this.timer = setInterval(() => this.update(), 950);
    } catch (error) {
      if (!this.closed) this.report(error.status ? error.message : 'Сервер недоступен. Откройте адрес запущенного сервера.', true);
    } finally {
      this.busy = false;
    }
  }

  accept(state) {
    this.connected = true;
    this.statusText = null;
    this.round = state.round;
    this.phase = state.phase;
    this.shots = state.shotCount;
    this.onState(state);
  }

  report(message, disconnected) {
    if (disconnected) this.connected = false;
    if (this.statusText === message) return;
    this.statusText = message;
    this.onStatus(message, disconnected);
  }

  async update(action = 'state', data = {}) {
    if (this.closed || !this.token || this.actionPending) return;
    if (action !== 'state' && this.poll) {
      const round = this.round;
      this.actionPending = true;
      await this.poll;
      this.actionPending = false;
      if (this.closed || !this.token || round !== this.round) return;
    }
    if (this.busy) return;
    this.busy = true;
    try {
      const request = this.request(action, data);
      if (action === 'state') this.poll = request.catch(() => {});
      const { state } = await request;
      if (!this.closed) this.accept(state);
    } catch (error) {
      if (this.closed) return;
      if (error.status === 401) {
        clearInterval(this.timer);
        this.token = null;
      }
      this.report(error.status ? error.message : 'Связь потеряна. Восстанавливаем подключение…', !error.status || error.status === 401);
    } finally {
      this.poll = null;
      this.busy = false;
    }
  }

  manualResync() {
    if (this.token) this.update();
    else this.connect();
  }

  disconnect() {
    this.closed = true;
    this.connected = false;
    clearInterval(this.timer);
    if (this.token) this.request('leave', {}, true).catch(() => {});
  }

  getChannelSummary() {
    return this.connected ? 'Сервер' : 'Ожидание связи';
  }
}
