import { BOARD_SIZE, FLEET_SPEC, COL_LABELS } from './config.js';
import { captainAudio } from '../../audio.js';

function createEmptyGrid() {
  return Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(0));
}

function inBounds(r, c) {
  return r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE;
}

function canPlaceShip(grid, r, c, len, horizontal) {
  for (let i = 0; i < len; i++) {
    const nr = horizontal ? r : r + i;
    const nc = horizontal ? c + i : c;
    if (!inBounds(nr, nc)) return false;

    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const ar = nr + dr;
        const ac = nc + dc;
        if (inBounds(ar, ac) && grid[ar][ac] !== 0) {
          return false;
        }
      }
    }
  }
  return true;
}

function generateRandomFleet() {
  for (let attempt = 0; attempt < 200; attempt++) {
    const grid = createEmptyGrid();
    const ships = [];
    let ok = true;

    for (const len of FLEET_SPEC) {
      let placed = false;
      for (let tries = 0; tries < 100; tries++) {
        const horizontal = Math.random() < 0.5;
        const r = Math.floor(Math.random() * BOARD_SIZE);
        const c = Math.floor(Math.random() * BOARD_SIZE);
        if (canPlaceShip(grid, r, c, len, horizontal)) {
          const cells = [];
          for (let i = 0; i < len; i++) {
            const nr = horizontal ? r : r + i;
            const nc = horizontal ? c + i : c;
            grid[nr][nc] = 1;
            cells.push([nr, nc]);
          }
          ships.push({ len, cells, hits: 0 });
          placed = true;
          break;
        }
      }
      if (!placed) {
        ok = false;
        break;
      }
    }

    if (ok) return { grid, ships };
  }
  throw new Error('Не удалось расставить флот');
}

export class BattleshipGame {
  constructor({ roomCode, styleId, playerName, difficultyId, network, onExit }) {
    this.roomCode = roomCode;
    this.styleId = styleId;
    this.playerName = playerName;
    this.difficultyId = difficultyId || 'medium';
    this.network = network;
    this.onExit = onExit || (() => {});

    this.root = document.getElementById('battleship-root');
    this.mode = 'pvp';
    this.peerConnected = false;
    this.peerName = 'Соперник';
    this.networkStatus = `Комната ${this.roomCode}: ожидание второго капитана...`;

    this.myReady = false;
    this.peerReady = false;
    this.phase = 'setup';
    this.myTurn = false;
    this.winnerText = '';

    this.logs = [];
    this._resetBoards();
    this.render();
  }

  _resetBoards() {
    const myFleet = generateRandomFleet();
    this.myGrid = myFleet.grid;
    this.myShips = myFleet.ships;

    this.enemyGrid = createEmptyGrid();
    this.botFleet = generateRandomFleet();
    this.botTargets = [];

    this.myReady = false;
    this.peerReady = false;
    this.phase = 'setup';
    this.myTurn = false;
    this.winnerText = '';
    this.logs = ['Флот построен! Нажмите «Переставить флот» или «Готов к бою».'];
  }

  _log(text) {
    this.logs.unshift(text);
    if (this.logs.length > 35) this.logs.pop();
  }

  setNetworkStatus(statusText) {
    this.networkStatus = statusText;
    this.render();
  }

  onPeerConnected({ playerName, role }) {
    this.peerConnected = true;
    this.peerName = playerName || 'Соперник';
    this.mode = 'pvp';
    this.networkStatus = `В комнате с вами: ${this.peerName}`;
    this._log(`⚓ Капитан ${this.peerName} вошёл в комнату ${this.roomCode}!`);

    if (this.myReady) {
      this.network?.send({ type: 'READY', playerName: this.playerName });
    }
    this._checkBattleStart(role);
    this.render();
  }

  onPeerDisconnected() {
    this.peerConnected = false;
    this.peerReady = false;
    this.networkStatus = 'Соперник отключился. Ожидание переподключения...';
    this._log('⚠️ Соперник покинул комнату.');
    this.render();
  }

  onNetworkError(errMsg) {
    this.networkStatus = `Ошибка сети: ${errMsg}`;
    this._log(`❌ ${errMsg}`);
    this.render();
  }

  onNetworkMessage(msg) {
    if (!msg || !msg.type) return;

    if (msg.type === 'READY') {
      this.peerReady = true;
      if (msg.playerName) this.peerName = msg.playerName;
      this._log(`✅ ${this.peerName} готов к бою!`);
      this._checkBattleStart();
      this.render();
    } else if (msg.type === 'FIRE') {
      this._handleIncomingFire(msg.r, msg.c);
    } else if (msg.type === 'FIRE_RESULT') {
      this._handleFireResult(msg);
    } else if (msg.type === 'REMATCH') {
      this._resetBoards();
      this._log('🔄 Соперник предложил новую партию!');
      this.render();
    }
  }

  _checkBattleStart() {
    if (this.phase !== 'setup') return;

    if (this.mode === 'bot' && this.myReady) {
      this.phase = 'battle';
      this.myTurn = true;
      this._log('🔥 Бой против Адмирала-бота начался! Ваш выстрел.');
      return;
    }

    if (this.mode === 'pvp' && this.peerConnected && this.myReady && this.peerReady) {
      this.phase = 'battle';
      const isHost = this.network?.role === 'host';
      this.myTurn = Boolean(isHost);
      this._log(
        this.myTurn
          ? '🔥 Оба капитана готовы! Вы ходите первым.'
          : `🔥 Оба капитана готовы! Первым стреляет ${this.peerName}.`
      );
    }
  }

  _markHaloAsMiss(grid, shipCells) {
    for (const [sr, sc] of shipCells) {
      grid[sr][sc] = 4;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const nr = sr + dr;
          const nc = sc + dc;
          if (inBounds(nr, nc) && grid[nr][nc] === 0) {
            grid[nr][nc] = 2;
          }
        }
      }
    }
  }

  _handleIncomingFire(r, c) {
    if (!inBounds(r, c)) return;

    const cell = this.myGrid[r][c];
    let outcome = 'miss';
    let sunkCells = null;

    if (cell === 1 || cell === 3 || cell === 4) {
      this.myGrid[r][c] = 3;
      const ship = this.myShips.find((s) => s.cells.some(([sr, sc]) => sr === r && sc === c));
      if (ship) {
        ship.hits = ship.cells.filter(([sr, sc]) => this.myGrid[sr][sc] === 3 || this.myGrid[sr][sc] === 4).length;
        if (ship.hits >= ship.len) {
          outcome = 'sunk';
          sunkCells = ship.cells;
          this._markHaloAsMiss(this.myGrid, ship.cells);
        } else {
          outcome = 'hit';
        }
      } else {
        outcome = 'hit';
      }
    } else {
      this.myGrid[r][c] = 2;
    }

    const allMySunk = this.myShips.every((s) => s.hits >= s.len);

    this.network?.send({
      type: 'FIRE_RESULT',
      r,
      c,
      outcome,
      sunkCells,
      gameOver: allMySunk
    });

    const coordText = `${COL_LABELS[c]}${r + 1}`;
    if (outcome === 'miss') {
      captainAudio.playCue('miss');
      this.myTurn = true;
      this._log(`💦 ${this.peerName} выстрелил в ${coordText} — мимо! Ваш ход.`);
    } else if (outcome === 'hit') {
      captainAudio.playCue('hit');
      this.myTurn = false;
      this._log(`💥 ${this.peerName} попал в ваш корабль (${coordText})! Его следующий выстрел.`);
    } else if (outcome === 'sunk') {
      captainAudio.playCue('hit');
      this.myTurn = false;
      this._log(`☠️ ${this.peerName} потопил ваш корабль (${coordText})!`);
    }

    if (allMySunk) {
      this.phase = 'gameover';
      this.myTurn = false;
      this.winnerText = `Победил ${this.peerName}! Весь ваш флот пошёл ко дну.`;
      this._log(`🏁 ${this.winnerText}`);
    }

    this.render();
  }

  _handleFireResult({ r, c, outcome, sunkCells, gameOver }) {
    const coordText = `${COL_LABELS[c]}${r + 1}`;

    if (outcome === 'miss') {
      this.enemyGrid[r][c] = 2;
      captainAudio.playCue('miss');
      this.myTurn = false;
      this._log(`💦 Выстрел в ${coordText} — мимо. Ход соперника.`);
    } else if (outcome === 'hit') {
      this.enemyGrid[r][c] = 3;
      captainAudio.playCue('hit');
      this.myTurn = true;
      this._log(`💥 Попадание в ${coordText}! Стреляйте ещё раз.`);
    } else if (outcome === 'sunk') {
      this.enemyGrid[r][c] = 4;
      if (Array.isArray(sunkCells)) {
        this._markHaloAsMiss(this.enemyGrid, sunkCells);
      }
      captainAudio.playCue('hit');
      this.myTurn = true;
      this._log(`☠️ Корабль соперника потоплен (${coordText})! Ваш ход.`);
    }

    if (gameOver) {
      this.phase = 'gameover';
      this.myTurn = false;
      this.winnerText = `Победа, капитан ${this.playerName}! Вражеская эскадра уничтожена.`;
      captainAudio.playCue('win');
      this._log(`🏆 ${this.winnerText}`);
    }

    this.render();
  }

  shootAt(r, c) {
    if (this.phase !== 'battle' || !this.myTurn) return;
    if (this.enemyGrid[r][c] !== 0) return;

    captainAudio.playCue('shot');

    if (this.mode === 'bot') {
      this._shootBot(r, c);
      return;
    }

    if (!this.peerConnected) {
      this._log('⚠️ Соперник не подключён.');
      this.render();
      return;
    }

    this.myTurn = false;
    this.network?.send({ type: 'FIRE', r, c });
    this.render();
  }

  _shootBot(r, c) {
    const cell = this.botFleet.grid[r][c];
    let outcome = 'miss';
    let sunkCells = null;

    if (cell === 1) {
      this.botFleet.grid[r][c] = 3;
      const ship = this.botFleet.ships.find((s) => s.cells.some(([sr, sc]) => sr === r && sc === c));
      if (ship) {
        ship.hits += 1;
        if (ship.hits >= ship.len) {
          outcome = 'sunk';
          sunkCells = ship.cells;
        } else {
          outcome = 'hit';
        }
      }
    }

    const allBotSunk = this.botFleet.ships.every((s) => s.hits >= s.len);
    this._handleFireResult({ r, c, outcome, sunkCells, gameOver: allBotSunk });

    if (!allBotSunk && outcome === 'miss') {
      setTimeout(() => this._botTurn(), 550);
    }
  }

  _botTurn() {
    if (this.phase !== 'battle' || this.mode !== 'bot') return;

    let target = null;
    while (this.botTargets.length > 0) {
      const cand = this.botTargets.shift();
      if (inBounds(cand[0], cand[1]) && (this.myGrid[cand[0]][cand[1]] === 0 || this.myGrid[cand[0]][cand[1]] === 1)) {
        target = cand;
        break;
      }
    }

    if (!target) {
      const candidates = [];
      for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
          if (this.myGrid[r][c] === 0 || this.myGrid[r][c] === 1) {
            candidates.push([r, c]);
          }
        }
      }
      if (candidates.length === 0) return;
      target = candidates[Math.floor(Math.random() * candidates.length)];
    }

    const [r, c] = target;
    const coordText = `${COL_LABELS[c]}${r + 1}`;
    const cell = this.myGrid[r][c];

    if (cell === 1) {
      this.myGrid[r][c] = 3;
      const ship = this.myShips.find((s) => s.cells.some(([sr, sc]) => sr === r && sc === c));
      if (ship) {
        ship.hits += 1;
        if (ship.hits >= ship.len) {
          this._markHaloAsMiss(this.myGrid, ship.cells);
          this.botTargets = [];
          this._log(`☠️ Бот потопил ваш корабль (${coordText})!`);
        } else {
          if (this.difficultyId !== 'easy') {
            this.botTargets.push([r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]);
          }
          this._log(`💥 Бот попал в ${coordText}!`);
        }
      }
      captainAudio.playCue('hit');

      if (this.myShips.every((s) => s.hits >= s.len)) {
        this.phase = 'gameover';
        this.myTurn = false;
        this.winnerText = 'Адмирал-бот одержал победу!';
        this.render();
        return;
      }

      this.render();
      setTimeout(() => this._botTurn(), 600);
    } else {
      this.myGrid[r][c] = 2;
      captainAudio.playCue('miss');
      this.myTurn = true;
      this._log(`💦 Бот выстрелил в ${coordText} — мимо. Ваш ход!`);
      this.render();
    }
  }

  _renderBoard(grid, isEnemy) {
    let html = '<div class="bs-grid">';
    html += '<div class="bs-label"></div>';
    for (let c = 0; c < BOARD_SIZE; c++) {
      html += `<div class="bs-label">${COL_LABELS[c]}</div>`;
    }

    for (let r = 0; r < BOARD_SIZE; r++) {
      html += `<div class="bs-label">${r + 1}</div>`;
      for (let c = 0; c < BOARD_SIZE; c++) {
        const val = grid[r][c];
        let cls = 'bs-cell';
        let symbol = '';

        if (isEnemy) cls += ' enemy';
        if (!isEnemy && val === 1) cls += ' ship';
        if (val === 2) {
          cls += ' miss';
          symbol = '•';
        } else if (val === 3) {
          cls += ' hit';
          symbol = '✕';
        } else if (val === 4) {
          cls += ' sunk';
          symbol = '☠';
        }

        const disabled =
          !isEnemy ||
          this.phase !== 'battle' ||
          !this.myTurn ||
          val !== 0
            ? 'disabled'
            : '';

        html += `<button class="${cls}" data-r="${r}" data-c="${c}" ${disabled}>${symbol}</button>`;
      }
    }

    html += '</div>';
    return html;
  }

  render() {
    if (!this.root) return;

    let turnLabel = 'Расстановка флота';
    if (this.phase === 'setup' && this.myReady) {
      turnLabel = this.peerConnected
        ? `Ожидаем готовности ${this.peerName}...`
        : 'Вы готовы. Ждём второго игрока по коду комнаты...';
    } else if (this.phase === 'battle') {
      turnLabel = this.myTurn
        ? '🎯 ВАШ ХОД — выберите клетку на поле соперника'
        : `⏳ Ходит ${this.mode === 'bot' ? 'Адмирал-бот' : this.peerName}...`;
    } else if (this.phase === 'gameover') {
      turnLabel = `🏁 ${this.winnerText}`;
    }

    this.root.innerHTML = `
      <div class="bs-shell">
        <div class="bs-topbar">
          <div>
            <strong>⚓ Морской Бой</strong>
            <span class="bs-room-badge">Комната: <strong>${this.roomCode}</strong></span>
          </div>
          <button id="bs-btn-exit" class="btn btn-ghost" type="button">← В лобби</button>
        </div>

        <div class="bs-status-banner">
          <div><strong>Сеть:</strong> ${this.networkStatus}</div>
          <div><strong>Статус:</strong> ${turnLabel}</div>
        </div>

        <div class="bs-controls">
          ${
            this.phase === 'setup'
              ? `
                <button id="bs-btn-shuffle" class="btn btn-secondary" type="button">🎲 Переставить флот</button>
                <button id="bs-btn-ready" class="btn btn-primary" type="button" ${this.myReady ? 'disabled' : ''}>
                  ${this.myReady ? '✅ Готовность подтверждена' : '⚔️ Готов к бою'}
                </button>
                ${
                  !this.peerConnected
                    ? `<button id="bs-btn-vs-bot" class="btn btn-secondary" type="button">🤖 Сыграть с ботом</button>`
                    : ''
                }
              `
              : `
                <button id="bs-btn-rematch" class="btn btn-secondary" type="button">🔄 Новая партия</button>
              `
          }
        </div>

        <div class="bs-boards">
          <div class="bs-board-wrap">
            <h3>Ваша эскадра (${this.playerName})</h3>
            ${this._renderBoard(this.myGrid, false)}
          </div>
          <div class="bs-board-wrap">
            <h3>Акватория противника (${this.mode === 'bot' ? 'Адмирал-бот' : this.peerName})</h3>
            ${this._renderBoard(this.enemyGrid, true)}
          </div>
        </div>

        <div class="bs-log">
          ${this.logs.map((line) => `<div>${line}</div>`).join('')}
        </div>
      </div>
    `;

    this.root.querySelector('#bs-btn-exit')?.addEventListener('click', () => {
      captainAudio.playCue('ink');
      this.onExit();
    });

    this.root.querySelector('#bs-btn-shuffle')?.addEventListener('click', () => {
      captainAudio.playCue('ink');
      const fleet = generateRandomFleet();
      this.myGrid = fleet.grid;
      this.myShips = fleet.ships;
      this.myReady = false;
      this.render();
    });

    this.root.querySelector('#bs-btn-ready')?.addEventListener('click', () => {
      captainAudio.playCue('ink');
      this.myReady = true;
      this._log('✅ Вы подтвердили готовность флота.');
      if (this.mode === 'pvp') {
        this.network?.send({ type: 'READY', playerName: this.playerName });
      }
      this._checkBattleStart();
      this.render();
    });

    this.root.querySelector('#bs-btn-vs-bot')?.addEventListener('click', () => {
      captainAudio.playCue('ink');
      this.mode = 'bot';
      this.myReady = true;
      this.networkStatus = 'Тренировочный бой против бота';
      this._checkBattleStart();
      this.render();
    });

    this.root.querySelector('#bs-btn-rematch')?.addEventListener('click', () => {
      captainAudio.playCue('ink');
      this._resetBoards();
      if (this.mode === 'pvp' && this.peerConnected) {
        this.network?.send({ type: 'REMATCH' });
      }
      this.render();
    });

    this.root.querySelectorAll('.bs-cell.enemy').forEach((btn) => {
      btn.addEventListener('click', () => {
        const r = Number(btn.dataset.r);
        const c = Number(btn.dataset.c);
        this.shootAt(r, c);
      });
    });
  }

  destroy() {
    if (this.root) {
      this.root.innerHTML = '';
    }
  }
}
