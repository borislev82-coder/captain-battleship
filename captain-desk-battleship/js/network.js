// Комнаты на двоих с фильтрацией по выбранному стилю стола

export class RoomNetwork {
  constructor(roomCode, styleId, playerId, playerName, preferredDiff, onMessage) {
    this.roomCode = roomCode.toUpperCase();
    this.styleId = styleId;
    this.playerId = playerId;
    this.playerName = playerName;
    this.preferredDiff = preferredDiff;
    this.onMessage = onMessage;

    // Канал привязан и к коду комнаты, и к стилю — соперники того же стиля находят друг друга
    this.channel = new BroadcastChannel(`captain_room_${this.styleId}_${this.roomCode}`);

    this.channel.onmessage = (event) => {
      const msg = event.data;
      if (msg && msg.senderId !== this.playerId && msg.styleId === this.styleId) {
        this.onMessage(msg);
      }
    };
  }

  send(type, payload = {}) {
    this.channel.postMessage({
      type,
      styleId: this.styleId,
      senderId: this.playerId,
      senderName: this.playerName,
      payload,
      timestamp: Date.now()
    });
  }

  announceJoin() {
    this.send('JOIN', { preferredDiff: this.preferredDiff });
  }

  close() {
    this.send('LEAVE');
    this.channel.close();
  }
}
