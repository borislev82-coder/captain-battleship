export class RoomNetwork {
  constructor({ roomCode, playerName, onOpen, onPeerJoin, onPeerLeave, onMessage, onError, onStatusChange }) {
    this.roomCode = String(roomCode || '').trim().toUpperCase();
    this.playerName = String(playerName || 'Капитан').trim();
    this.callbacks = {
      onOpen: onOpen || (() => {}),
      onPeerJoin: onPeerJoin || (() => {}),
      onPeerLeave: onPeerLeave || (() => {}),
      onMessage: onMessage || (() => {}),
      onError: onError || (() => {}),
      onStatusChange: onStatusChange || (() => {})
    };

    this.role = null;
    this.peer = null;
    this.conn = null;
    this.bc = null;
    this.connected = false;
    this.peerName = null;
    this.clientId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    this.destroyed = false;
  }

  _channelName() {
    return `CAPTAIN_BS_ROOM_${this.roomCode}`;
  }

  _setStatus(text) {
    this.callbacks.onStatusChange(text);
  }

  connect() {
    if (!this.roomCode) {
      this.callbacks.onError('Не указан код комнаты.');
      return;
    }

    this._initBroadcastChannel();

    if (typeof window !== 'undefined' && window.Peer) {
      this._startHost();
    } else {
      this.role = 'host';
      this._setStatus('Ожидание соперника (локальный канал)');
      this.callbacks.onOpen({ role: 'host', roomCode: this.roomCode });
    }
  }

  _initBroadcastChannel() {
    if (typeof BroadcastChannel === 'undefined') return;
    try {
      this.bc = new BroadcastChannel(this._channelName());
      this.bc.onmessage = (ev) => {
        if (this.destroyed) return;
        const data = ev.data;
        if (!data || data.senderId === this.clientId) return;

        if (data.type === 'BC_HELLO') {
          if (!this.role) this.role = 'host';
          this.bc.postMessage({
            type: 'BC_WELCOME',
            senderId: this.clientId,
            playerName: this.playerName
          });
          this._handlePeerConnected(data.playerName || 'Соперник', 'broadcast');
        } else if (data.type === 'BC_WELCOME') {
          this.role = 'guest';
          this._handlePeerConnected(data.playerName || 'Соперник', 'broadcast');
        } else if (data.type === 'BC_PAYLOAD') {
          this.callbacks.onMessage(data.payload);
        } else if (data.type === 'BC_LEAVE') {
          this.connected = false;
          this.callbacks.onPeerLeave({ playerName: data.playerName || 'Соперник' });
        }
      };

      this.bc.postMessage({
        type: 'BC_HELLO',
        senderId: this.clientId,
        playerName: this.playerName
      });
    } catch (_) {}
  }

  _startHost() {
    if (this.destroyed) return;
    this.role = 'host';
    this._setStatus(`Открываем комнату ${this.roomCode}...`);

    const hostId = `cbs-room-${this.roomCode.toLowerCase()}`;
    const peer = new window.Peer(hostId, { debug: 0 });
    this.peer = peer;

    peer.on('open', () => {
      if (this.destroyed) return;
      this._setStatus(`Комната ${this.roomCode} открыта. Ждём второго игрока...`);
      this.callbacks.onOpen({ role: 'host', roomCode: this.roomCode });
    });

    peer.on('connection', (conn) => {
      if (this.destroyed) return;
      this._bindConn(conn);
    });

    peer.on('error', (err) => {
      if (this.destroyed) return;
      if (err && err.type === 'unavailable-id') {
        try { peer.destroy(); } catch (_) {}
        this._startGuest(hostId);
        return;
      }
      this._setStatus('Ошибка сети WebRTC');
      this.callbacks.onError(err?.message || 'Ошибка подключения к сигнальному серверу');
    });
  }

  _startGuest(hostId) {
    if (this.destroyed) return;
    this.role = 'guest';
    this._setStatus(`Подключаемся к комнате ${this.roomCode}...`);

    const peer = new window.Peer(undefined, { debug: 0 });
    this.peer = peer;

    peer.on('open', () => {
      if (this.destroyed) return;
      this.callbacks.onOpen({ role: 'guest', roomCode: this.roomCode });
      const conn = peer.connect(hostId, {
        reliable: true,
        metadata: { playerName: this.playerName }
      });
      this._bindConn(conn);
    });

    peer.on('error', (err) => {
      if (this.destroyed) return;
      this._setStatus('Комната не найдена или недоступна');
      this.callbacks.onError(err?.message || 'Не удалось войти в комнату');
    });
  }

  _bindConn(conn) {
    this.conn = conn;

    conn.on('open', () => {
      if (this.destroyed) return;
      conn.send({ type: 'NET_HELLO', playerName: this.playerName });
      this._handlePeerConnected(conn.metadata?.playerName || 'Соперник', 'webrtc');
    });

    conn.on('data', (msg) => {
      if (this.destroyed || !msg) return;
      if (msg.type === 'NET_HELLO') {
        this._handlePeerConnected(msg.playerName || 'Соперник', 'webrtc');
        return;
      }
      this.callbacks.onMessage(msg);
    });

    conn.on('close', () => {
      if (this.destroyed) return;
      this.connected = false;
      this._setStatus('Соперник покинул комнату');
      this.callbacks.onPeerLeave({ playerName: this.peerName || 'Соперник' });
    });

    conn.on('error', (err) => {
      if (this.destroyed) return;
      this.callbacks.onError(err?.message || 'Ошибка канала связи');
    });
  }

  _handlePeerConnected(name, transport) {
    this.peerName = name;
    const firstTime = !this.connected;
    this.connected = true;
    this._setStatus(`Соперник в комнате: ${name}`);
    if (firstTime) {
      this.callbacks.onPeerJoin({
        playerName: name,
        role: this.role,
        transport
      });
    }
  }

  send(payload) {
    if (this.destroyed) return false;
    let ok = false;

    if (this.conn && this.conn.open) {
      this.conn.send(payload);
      ok = true;
    }

    if (this.bc) {
      try {
        this.bc.postMessage({
          type: 'BC_PAYLOAD',
          senderId: this.clientId,
          payload
        });
        ok = true;
      } catch (_) {}
    }

    return ok;
  }

  disconnect() {
    this.destroyed = true;
    if (this.bc) {
      try {
        this.bc.postMessage({
          type: 'BC_LEAVE',
          senderId: this.clientId,
          playerName: this.playerName
        });
        this.bc.close();
      } catch (_) {}
      this.bc = null;
    }
    if (this.conn) {
      try { this.conn.close(); } catch (_) {}
      this.conn = null;
    }
    if (this.peer) {
      try { this.peer.destroy(); } catch (_) {}
      this.peer = null;
    }
  }
}
