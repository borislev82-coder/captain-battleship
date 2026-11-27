'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const { networkInterfaces } = require('node:os');
const { RANKS, SHAPE_TEMPLATES, getFleetSpecForSize, rotateOffsets } = require('./rules');

const rooms = new Map();
let roundSequence = 0;
const onlineMs = 12_000;
const retainMs = 120_000;
const roomLimit = 500;
const maxRequestBytes = 32 * 1024;
const codePattern = /^[A-Z0-9]{4,10}$/;
const tokenPattern = /^[a-f0-9]{48}$/;
const online = (player, now) => Boolean(player && now - player.seen < onlineMs);
const files = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/rules.js', ['rules.js', 'text/javascript; charset=utf-8']],
  ['/room.js', ['room.js', 'text/javascript; charset=utf-8']],
  ['/fleet-materials.js', ['fleet-materials.js', 'text/javascript; charset=utf-8']],
  ['/scene3d.js', ['scene3d.js', 'text/javascript; charset=utf-8']],
  ['/board-view.js', ['board-view.js', 'text/javascript; charset=utf-8']],
  ['/fleet-view.js', ['fleet-view.js', 'text/javascript; charset=utf-8']],
  ['/assets/fleet3d/albedo.png', ['assets/fleet3d/albedo.png', 'image/png']],
  ['/assets/fleet3d/surface.png', ['assets/fleet3d/surface.png', 'image/png']],
  ['/assets/fleet3d/ocean.jpg', ['assets/fleet3d/ocean.jpg', 'image/jpeg']],
  ['/sw.js', ['sw.js', 'text/javascript; charset=utf-8']],
  ['/manifest.json', ['manifest.json', 'application/manifest+json']],
  ['/assets/tracks/day.mp3', ['assets/tracks/day.mp3', 'audio/mpeg']],
  ['/assets/tracks/night.mp3', ['assets/tracks/night.mp3', 'audio/mpeg']]
]);

class RequestError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function reset(room) {
  room.round = ++roundSequence;
  room.phase = 'setup';
  if (!room.players[room.host]) room.host = room.players.findIndex(Boolean);
  room.turn = room.host;
  room.winner = null;
  room.shots = [];
  for (const player of room.players) {
    if (player) player.fleet = null;
  }
}

function prune(code, room, now) {
  let departed = false;
  room.players = room.players.map(player => {
    if (!player || now - player.seen < retainMs) return player;
    departed = true;
    return null;
  });
  if (!room.players.some(Boolean)) rooms.delete(code);
  else if (departed) reset(room);
}

setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) prune(code, room, now);
}, 15_000).unref();

function grid(size) {
  return Array.from({ length: size }, () => Array(size).fill(0));
}

function validateFleet(size, placements) {
  const spec = getFleetSpecForSize(size);
  const fail = () => new RequestError(422, 'Расстановка флота не соответствует правилам комнаты.');
  if (!Array.isArray(placements) || placements.length !== spec.length) throw fail();
  const own = grid(size);
  const shipIndices = grid(size);
  const ships = spec.map((shape, index) => {
    const cells = placements[index];
    const template = SHAPE_TEMPLATES[shape].cells;
    if (!Array.isArray(cells) || cells.length !== template.length ||
        cells.some(cell => !Array.isArray(cell) || cell.length !== 2 ||
          cell.some(n => !Number.isInteger(n) || n < 0 || n >= size))) throw fail();

    const minR = Math.min(...cells.map(([r]) => r));
    const minC = Math.min(...cells.map(([, c]) => c));
    const signature = points => points.map(([r, c]) => r + ',' + c).sort().join(';');
    const normalized = signature(cells.map(([r, c]) => [r - minR, c - minC]));
    if (![0, 1, 2, 3].some(rotation => signature(rotateOffsets(template, rotation)) === normalized)) throw fail();

    for (const [r, c] of cells) {
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (own[r + dr]?.[c + dc]) throw fail();
        }
      }
    }
    for (const [r, c] of cells) {
      own[r][c] = 1;
      shipIndices[r][c] = index;
    }
    return { cells, remaining: cells.length };
  });
  return { ships, own, shipIndices, afloat: ships.length, revealed: grid(size) };
}

function fire(room, slot, r, c) {
  const opponent = room.players[1 - slot];
  const { own, revealed, ships, shipIndices } = opponent.fleet;
  if (!Number.isInteger(r) || !Number.isInteger(c) || own[r]?.[c] === undefined || revealed[r][c]) {
    throw new RequestError(422, 'Выберите клетку, в которую ещё не стреляли.');
  }

  let outcome;
  if (own[r][c] === 0) {
    own[r][c] = revealed[r][c] = 2;
    room.turn = 1 - slot;
    outcome = 'miss';
  } else {
    const ship = ships[shipIndices[r][c]];
    ship.remaining--;
    own[r][c] = revealed[r][c] = 3;
    outcome = 'hit';
    if (!ship.remaining) {
      outcome = 'sunk';
      for (const [sr, sc] of ship.cells) {
        own[sr][sc] = revealed[sr][sc] = 4;
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            if (own[sr + dr]?.[sc + dc] === 0) {
              own[sr + dr][sc + dc] = revealed[sr + dr][sc + dc] = 2;
            }
          }
        }
      }
      if (--opponent.fleet.afloat === 0) {
        room.phase = 'gameover';
        room.winner = slot;
      }
    }
  }
  room.shots.push({ slot, r, c, outcome });
}

function snapshot(room, slot, now, cursor) {
  const self = room.players[slot];
  const peer = room.players[1 - slot];
  const offset = cursor?.round === room.round && Number.isSafeInteger(cursor.shots)
    ? Math.max(0, Math.min(cursor.shots, room.shots.length)) : 0;
  const includeBoards = room.phase !== 'setup' &&
    (cursor?.round !== room.round || cursor?.phase !== room.phase || cursor?.shots !== room.shots.length);
  return {
    slot,
    rankId: room.rank.id,
    round: room.round,
    phase: room.phase,
    myTurn: room.phase === 'battle' && room.turn === slot && online(peer, now),
    winner: room.winner,
    ready: Boolean(self.fleet),
    own: includeBoards ? self.fleet.own : null,
    enemy: includeBoards ? peer.fleet.revealed : null,
    peer: peer && { name: peer.name, joined: peer.joined, ready: Boolean(peer.fleet), online: online(peer, now) },
    shotCount: room.shots.length,
    shots: room.shots.slice(offset)
  };
}

function roomRequest(input) {
  const { action, code, token, round } = input;
  if (typeof code !== 'string' || !codePattern.test(code)) throw new RequestError(400, 'Неверный код комнаты.');
  const now = Date.now();
  let room = rooms.get(code);
  if (room) prune(code, room, now);
  room = rooms.get(code);

  if (action === 'join') {
    const name = typeof input.name === 'string' ? input.name.trim() : '';
    if (!name || name.length > 40 || /[\x00-\x1f\x7f]/.test(name)) {
      throw new RequestError(400, 'Введите имя капитана длиной до 40 символов.');
    }
    if (!room) {
      if (rooms.size >= roomLimit) throw new RequestError(503, 'Сервер заполнен. Попробуйте позже.');
      const rank = RANKS.find(item => item.id === input.rankId);
      if (!rank) throw new RequestError(400, 'Выберите звание.');
      room = { rank, players: [null, null], host: 0 };
      reset(room);
      rooms.set(code, room);
    }
    const slot = room.players.indexOf(null);
    if (slot === -1) throw new RequestError(409, 'В комнате уже два капитана. Проверьте код или создайте другую комнату.');
    const sessionToken = randomBytes(24).toString('hex');
    room.players[slot] = { name, token: sessionToken, joined: now, seen: now, fleet: null };
    if (room.host < 0) room.host = slot;
    return { token: sessionToken, state: snapshot(room, slot, now) };
  }

  const slot = typeof token === 'string' && tokenPattern.test(token) && room
    ? room.players.findIndex(player => player?.token === token) : -1;
  if (slot < 0) throw new RequestError(401, 'Сессия комнаты завершилась. Войдите из лобби снова.');
  const self = room.players[slot];
  const peer = room.players[1 - slot];
  self.seen = now;

  if (action === 'leave') {
    room.players[slot] = null;
    if (peer) reset(room);
    else rooms.delete(code);
    return {};
  }

  if (action !== 'state' && round !== room.round) {
    throw new RequestError(409, 'Партия уже изменилась. Состояние комнаты обновляется.');
  }
  switch (action) {
    case 'state':
      break;
    case 'ready':
      if (room.phase !== 'setup' || self.fleet) throw new RequestError(409, 'Флот уже принят.');
      self.fleet = validateFleet(room.rank.size, input.placements);
      if (peer?.fleet) {
        room.phase = 'battle';
        room.turn = room.host;
      }
      break;
    case 'fire':
      if (room.phase !== 'battle' || room.turn !== slot || !online(peer, now)) {
        throw new RequestError(409, 'Сейчас выстрел недоступен.');
      }
      fire(room, slot, input.r, input.c);
      break;
    case 'rematch':
      if (room.phase === 'setup') throw new RequestError(409, 'Расстановка уже началась.');
      reset(room);
      break;
    default:
      throw new RequestError(400, 'Неизвестное действие.');
  }
  return { state: snapshot(room, slot, now, input.cursor) };
}

async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size <= maxRequestBytes) chunks.push(chunk);
  }
  if (size > maxRequestBytes) throw new RequestError(413, 'Запрос слишком большой.');
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    return value;
  } catch {
    throw new RequestError(400, 'Некорректный запрос.');
  }
}

function json(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(payload));
}

const server = http.createServer({ requestTimeout: 15_000, headersTimeout: 10_000, connectionsCheckingInterval: 1000 }, async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
  const pathname = req.url.split('?')[0];
  try {
    if (pathname === '/api/room' && req.method === 'POST') {
      if (req.headers['sec-fetch-site'] === 'cross-site' ||
          req.headers['content-type']?.split(';')[0] !== 'application/json') {
        throw new RequestError(415, 'Требуется запрос JSON с сайта игры.');
      }
      const input = await readJson(req);
      json(res, 200, roomRequest(input));
      return;
    }
    if (pathname === '/healthz' && req.method === 'GET') {
      json(res, 200, { ok: true });
      return;
    }
    const file = files.get(pathname);
    if (file && ['GET', 'HEAD'].includes(req.method)) {
      const [name, type] = file;
      const data = await fs.promises.readFile(path.join(__dirname, name));
      res.writeHead(200, { 'Content-Type': type, 'Content-Length': data.length, 'Cache-Control': 'no-cache' });
      res.end(req.method === 'HEAD' ? undefined : data);
      return;
    }
    json(res, 404, { error: 'Страница не найдена.' });
  } catch (error) {
    if (!(error instanceof RequestError)) console.error(error);
    json(res, error.status || 500, { error: error.status ? error.message : 'Ошибка сервера.' });
  }
});

const port = Number(process.env.PORT || 8080);
const host = process.env.HOST || '0.0.0.0';
server.listen(port, host, () => {
  const actualPort = server.address().port;
  console.log('Local: http://localhost:' + actualPort);
  if (host !== '0.0.0.0') return;
  for (const addresses of Object.values(networkInterfaces())) {
    for (const address of addresses) {
      if (address.family === 'IPv4' && !address.internal) console.log('LAN:   http://' + address.address + ':' + actualPort);
    }
  }
});
