import { DIFFICULTIES, STYLES } from './config.js';
import {
  createEmptyGrid,
  canPlaceShip,
  placeShipOnGrid,
  autoPlaceFleet,
  getShipCells,
  getSurroundingCells
} from './board.js';
import { RoomNetwork } from '../../network.js';
import { captainAudio } from '../../audio.js';

const COL_LETTERS = ['А', 'Б', 'В', 'Г', 'Д', 'Е', 'Ж', 'З', 'И', 'К', 'Л', 'М'];

export class BattleshipGame {
  constructor({ roomCode, styleId, playerName, difficultyId, onExit }) {
    this.roomCode = roomCode;
    this.styleId = styleId;
    this.styleConfig = STYLES[styleId] || STYLES.shanty;
    this.playerName = playerName;
    this.playerId = 'p_' + Math.random().toString(36).slice(2, 9);
    this.config = DIFFICULTIES[difficultyId] || DIFFICULTIES.medium;
    this.onExit = onExit;

    this.enemyName = null;
    this.enemyReady = false;
    this.myReady = false;
    this.isHost = true;
    this.isMyTurn = false;
    this.gameOver = false;

    this.grid = createEmptyGrid(this.config.boardSize);
    this.placedShips = [];
    this.lastPlacedKeys = new Set();
    this.selectedShipId = this.config.fleet[0].id;
    this.isHorizontal = true;

    this.myShots = new Map();
    this.enemyShots = new Map();

    this.bindUI();
    this.initNetwork();
    this.renderSetup();
  }

  bindUI() {
    document.getElementById('game-room-id').textContent = this.roomCode;
    document.getElementById('game-style-name').textContent = this.styleConfig.name;
    document.getElementById('game-diff-name').textContent = this.config.name;
    document.getElementById('setup-player-name').textContent = `Капитан ${this.playerName}`;
    document.getElementById('battle-my-name').textContent = `Капитан ${this.playerName}`;

    document.getElementById('phase-setup').hidden = false;
    document.getElementById('phase-battle').hidden = true;

    this.btnRotate = document.getElementById('btn-rotate-ship');
    this.btnRandom = document.getElementById('btn-random-fleet');
    this.btnClear = document.getElementById('btn-clear-fleet');
    this.btnReady = document.getElementById('btn-ready-battle');
    this.btnLeave = document.getElementById('btn-leave-game');

    this.btnRandom.disabled = false;
    this.btnClear.disabled = false;

    this.btnRotate.onclick = () => {
      this.toggleOrientation();
      captainAudio.playCue('ink');
    };
    this.btnRandom.onclick = () => {
      this.handleAutoPlace();
      captainAudio.playCue('ink');
    };
    this.btnClear.onclick = () => {
      this.handleClear();
      captainAudio.playCue('ink');
    };
    this.btnReady.onclick = () => {
      this.handleReady();
      captainAudio.playCue('ink');
    };
    this.btnLeave.onclick = () => this.destroy();

    this.keyHandler = (e) => {
      if (e.key === 'r' || e.key === 'R' || e.key === 'к' || e.key === 'К') {
        this.toggleOrientation();
        captainAudio.playCue('ink');
      }
    };
    window.addEventListener('keydown', this.keyHandler);
  }

  initNetwork() {
    this.net = new RoomNetwork(
      this.roomCode,
      this.styleId,
      this.playerId,
      this.playerName,
      this.config.id,
      (msg) => this.handleNetworkMessage(msg)
    );
    this.setNote('Капитан ждёт второго шкипера у стола...');
    this.net.announceJoin();
  }

  handleNetworkMessage(msg) {
    switch (msg.type) {
      case 'JOIN':
        this.enemyName = msg.senderName;
        this.isHost = true;
        this.net.send('WELCOME', {
          difficultyId: this.config.id,
          hostReady: this.myReady
        });
        this.updateLobbyNote();
        break;

      case 'WELCOME':
        this.enemyName = msg.senderName;
        this.isHost = false;
        this.enemyReady = msg.payload.hostReady;
        if (msg.payload.difficultyId !== this.config.id) {
          this.config = DIFFICULTIES[msg.payload.difficultyId];
          document.getElementById('game-diff-name').textContent = this.config.name;
          this.handleClear();
        }
        this.updateLobbyNote();
        break;

      case 'READY':
        this.enemyReady = true;
        this.checkBattleStart();
        break;

      case 'SHOT':
        this.processIncomingShot(msg.payload.x, msg.payload.y);
        break;

      case 'SHOT_RESULT':
        this.processShotResult(msg.payload);
        break;

      case 'LEAVE':
        this.setNote(`Капитан ${this.enemyName || 'соперник'} свернул карты и покинул стол.`, 'defeat');
        this.gameOver = true;
        break;
    }
  }

  updateLobbyNote() {
    if (!this.enemyName) {
      this.setNote('Капитан ждёт второго шкипера у стола...');
    } else if (!this.myReady) {
      this.setNote(`Капитан ${this.enemyName} подошёл к столу! Размещайте флот.`);
    } else if (!this.enemyReady) {
      this.setNote(`Перо замерло: ждём, пока капитан ${this.enemyName} расставит суда...`);
    }
  }

  setNote(text, styleClass = '') {
    const banner = document.getElementById('game-status-banner');
    banner.textContent = text;
    banner.className = 'captain-note ' + styleClass;
  }

  toggleOrientation() {
    this.isHorizontal = !this.isHorizontal;
    document.getElementById('orientation-label').textContent =
      this.isHorizontal ? 'Горизонтально' : 'Вертикально';
  }

  handleAutoPlace() {
    const { grid, placedShips } = autoPlaceFleet(this.config.boardSize, this.config.fleet);
    this.grid = grid;
    this.placedShips = placedShips;
    this.lastPlacedKeys = new Set(placedShips.flatMap(s => s.cells.map(c => `${c.x},${c.y}`)));
    this.selectedShipId = null;
    this.renderSetup();
  }

  handleClear() {
    this.grid = createEmptyGrid(this.config.boardSize);
    this.placedShips = [];
    this.lastPlacedKeys.clear();
    this.selectedShipId = this.config.fleet[0].id;
    this.myReady = false;
    this.renderSetup();
  }

  buildCoordinateGrid(boardEl, size, cellBuilder) {
    const wrapper = document.createElement('div');
    wrapper.className = 'board-with-coords';

    const corner = document.createElement('div');
    corner.className = 'coord-corner';
    corner.textContent = '✦';

    const colsEl = document.createElement('div');
    colsEl.className = 'coord-cols';
    colsEl.style.gridTemplateColumns = `repeat(${size}, 1fr)`;
    for (let x = 0; x < size; x++) {
      const lbl = document.createElement('span');
      lbl.textContent = COL_LETTERS[x] || (x + 1);
      colsEl.appendChild(lbl);
    }

    const rowsEl = document.createElement('div');
    rowsEl.className = 'coord-rows';
    rowsEl.style.gridTemplateRows = `repeat(${size}, 1fr)`;
    for (let y = 0; y < size; y++) {
      const lbl = document.createElement('span');
      lbl.textContent = y + 1;
      rowsEl.appendChild(lbl);
    }

    boardEl.style.gridTemplateColumns = `repeat(${size}, auto)`;
    boardEl.innerHTML = '';

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        boardEl.appendChild(cellBuilder(x, y));
      }
    }

    wrapper.appendChild(corner);
    wrapper.appendChild(colsEl);
    wrapper.appendChild(rowsEl);
    wrapper.appendChild(boardEl);

    return wrapper;
  }

  renderSetup() {
    const dock = document.getElementById('ship-dock');
    dock.innerHTML = '';

    for (const ship of this.config.fleet) {
      const isPlaced = this.placedShips.some(s => s.id === ship.id);
      const item = document.createElement('div');
      item.className = 'dock-item' +
        (isPlaced ? ' placed' : '') +
        (this.selectedShipId === ship.id ? ' selected' : '');

      const cellsHtml = Array(ship.size).fill('<span class="dock-cell"></span>').join('');
      item.innerHTML = `<span>${ship.name} (${ship.size})</span><div class="dock-cells">${cellsHtml}</div>`;

      if (!isPlaced) {
        item.onclick = () => {
          this.selectedShipId = ship.id;
          captainAudio.playCue('ink');
          this.renderSetup();
        };
      }
      dock.appendChild(item);
    }

    this.btnReady.disabled = this.placedShips.length !== this.config.fleet.length;

    const boardEl = document.getElementById('setup-board');
    const hostContainer = boardEl.parentElement;
    const existingWrapper = hostContainer.querySelector('.board-with-coords');
    if (existingWrapper) existingWrapper.remove();

    const size = this.config.boardSize;
    const wrapped = this.buildCoordinateGrid(boardEl, size, (x, y) => {
      const cell = document.createElement('div');
      const key = `${x},${y}`;
      cell.className = 'cell' +
        (this.grid[y][x] ? ' ship' : '') +
        (this.lastPlacedKeys.has(key) ? ' ship-placed-anim' : '');
      cell.dataset.x = x;
      cell.dataset.y = y;
      cell.title = `${COL_LETTERS[x] || x + 1}${y + 1}`;

      cell.onmouseenter = () => this.previewShip(x, y, true);
      cell.onmouseleave = () => this.previewShip(x, y, false);
      cell.onclick = () => this.placeSelectedShip(x, y);
      return cell;
    });

    hostContainer.appendChild(wrapped);
    this.lastPlacedKeys.clear();
  }

  previewShip(x, y, show) {
    const boardEl = document.getElementById('setup-board');
    boardEl.querySelectorAll('.cell').forEach(c => {
      c.classList.remove('preview-valid', 'preview-invalid');
    });

    if (!show || !this.selectedShipId) return;
    const ship = this.config.fleet.find(s => s.id === this.selectedShipId);
    if (!ship) return;

    const valid = canPlaceShip(this.grid, x, y, ship.size, this.isHorizontal);
    const cells = getShipCells(x, y, ship.size, this.isHorizontal);

    for (const c of cells) {
      const el = boardEl.querySelector(`.cell[data-x="${c.x}"][data-y="${c.y}"]`);
      if (el) {
        el.classList.add(valid ? 'preview-valid' : 'preview-invalid');
      }
    }
  }

  placeSelectedShip(x, y) {
    if (!this.selectedShipId) return;
    const ship = this.config.fleet.find(s => s.id === this.selectedShipId);
    if (!ship) return;

    if (canPlaceShip(this.grid, x, y, ship.size, this.isHorizontal)) {
      const cells = placeShipOnGrid(this.grid, ship, x, y, this.isHorizontal);
      this.placedShips.push({ ...ship, cells, hits: 0 });
      this.lastPlacedKeys = new Set(cells.map(c => `${c.x},${c.y}`));
      captainAudio.playCue('ink');

      const nextShip = this.config.fleet.find(
        s => !this.placedShips.some(p => p.id === s.id)
      );
      this.selectedShipId = nextShip ? nextShip.id : null;
      this.renderSetup();
    }
  }

  handleReady() {
    this.myReady = true;
    this.btnReady.disabled = true;
    this.btnRandom.disabled = true;
    this.btnClear.disabled = true;
    this.net.send('READY');
    this.updateLobbyNote();
    this.checkBattleStart();
  }

  checkBattleStart() {
    if (this.myReady && this.enemyReady) {
      document.getElementById('phase-setup').hidden = true;
      document.getElementById('phase-battle').hidden = false;
      document.getElementById('battle-enemy-name').textContent =
        this.enemyName ? `Капитан ${this.enemyName}` : 'Соперник';

      this.isMyTurn = this.isHost;
      this.updateTurnNote();
      this.renderBattleBoards();
    }
  }

  updateTurnNote() {
    if (this.gameOver) return;
    if (this.isMyTurn) {
      this.setNote('Ваш ход! Поставьте чернильную метку на карте врага.', 'your-turn');
    } else {
      this.setNote(`Ход капитана ${this.enemyName || 'соперника'}...`);
    }
  }

  renderBattleBoards() {
    const size = this.config.boardSize;

    // 1. Своя карта
    const myBoard = document.getElementById('my-battle-board');
    const myWrapper = myBoard.parentElement;
    const oldMyGrid = myWrapper.querySelector('.board-with-coords');
    if (oldMyGrid) oldMyGrid.remove();

    myWrapper.appendChild(
      this.buildCoordinateGrid(myBoard, size, (x, y) => {
        const cell = document.createElement('div');
        const key = `${x},${y}`;
        const shotState = this.enemyShots.get(key);
        cell.className = 'cell';
        cell.title = `${COL_LETTERS[x] || x + 1}${y + 1}`;
        if (this.grid[y][x]) cell.classList.add('ship');
        if (shotState) cell.classList.add(shotState);
        return cell;
      })
    );

    // 2. Карта вражеских вод
    const enemyBoard = document.getElementById('enemy-battle-board');
    const enemyWrapper = enemyBoard.parentElement;
    const oldEnemyGrid = enemyWrapper.querySelector('.board-with-coords');
    if (oldEnemyGrid) oldEnemyGrid.remove();

    enemyWrapper.appendChild(
      this.buildCoordinateGrid(enemyBoard, size, (x, y) => {
        const cell = document.createElement('div');
        const key = `${x},${y}`;
        const shotState = this.myShots.get(key);
        cell.className = 'cell';
        cell.title = `${COL_LETTERS[x] || x + 1}${y + 1}`;
        if (shotState) {
          cell.classList.add(shotState);
        } else if (this.isMyTurn && !this.gameOver) {
          cell.onclick = () => this.fireAt(x, y);
        }
        return cell;
      })
    );
  }

  fireAt(x, y) {
    if (!this.isMyTurn || this.gameOver) return;
    const key = `${x},${y}`;
    if (this.myShots.has(key)) return;

    this.isMyTurn = false;
    captainAudio.playCue('ink');
    this.net.send('SHOT', { x, y });
    this.setNote(`Залп по сектору ${COL_LETTERS[x] || x + 1}${y + 1}...`);
  }

  processIncomingShot(x, y) {
    const key = `${x},${y}`;
    const shipId = this.grid[y][x];
    const coordLabel = `${COL_LETTERS[x] || x + 1}${y + 1}`;

    if (!shipId) {
      this.enemyShots.set(key, 'miss');
      this.isMyTurn = true;
      this.net.send('SHOT_RESULT', { x, y, result: 'miss' });
      this.setNote(`Враг промахнулся в секторе ${coordLabel}! Ваш ход.`, 'your-turn');
    } else {
      const ship = this.placedShips.find(s => s.id === shipId);
      ship.hits++;
      const isSunk = ship.hits >= ship.size;

      if (isSunk) {
        captainAudio.playCue('sunk');
        for (const c of ship.cells) {
          this.enemyShots.set(`${c.x},${c.y}`, 'sunk');
        }
        let outline = [];
        if (this.config.autoOutlineSunk) {
          outline = getSurroundingCells(ship.cells, this.config.boardSize);
          for (const oc of outline) {
            const oKey = `${oc.x},${oc.y}`;
            if (!this.enemyShots.has(oKey)) {
              this.enemyShots.set(oKey, 'miss');
            }
          }
        }
        const allSunk = this.placedShips.every(s => s.hits >= s.size);
        this.net.send('SHOT_RESULT', {
          x,
          y,
          result: 'sunk',
          shipName: ship.name,
          sunkCells: ship.cells,
          outlineCells: outline,
          allSunk
        });

        if (allSunk) {
          this.gameOver = true;
          this.setNote('Поражение! Весь ваш флот пошёл ко дну.', 'defeat');
        } else {
          this.setNote(`Потоплен «${ship.name}» в секторе ${coordLabel}!`);
        }
      } else {
        captainAudio.playCue('hit');
        this.enemyShots.set(key, 'hit');
        this.net.send('SHOT_RESULT', { x, y, result: 'hit' });
        this.setNote(`Попадание по вашему судну в секторе ${coordLabel}!`);
      }
    }

    this.renderBattleBoards();
  }

  processShotResult({ x, y, result, shipName, sunkCells, outlineCells, allSunk }) {
    const key = `${x},${y}`;
    const coordLabel = `${COL_LETTERS[x] || x + 1}${y + 1}`;

    if (result === 'miss') {
      this.myShots.set(key, 'miss');
      this.isMyTurn = false;
      this.setNote(`Промах в секторе ${coordLabel}. Ход переходит сопернику.`);
    } else if (result === 'hit') {
      captainAudio.playCue('hit');
      this.myShots.set(key, 'hit');
      this.isMyTurn = true;
      this.setNote(`Точное попадание в ${coordLabel}! Стреляйте снова.`, 'your-turn');
    } else if (result === 'sunk') {
      captainAudio.playCue('sunk');
      for (const c of sunkCells) {
        this.myShots.set(`${c.x},${c.y}`, 'sunk');
      }
      if (outlineCells) {
        for (const oc of outlineCells) {
          const oKey = `${oc.x},${oc.y}`;
          if (!this.myShots.has(oKey)) {
            this.myShots.set(oKey, 'miss');
          }
        }
      }
      if (allSunk) {
        this.gameOver = true;
        this.setNote('ПОБЕДА! Вражеская эскадра повержена!', 'victory');
        this.renderBattleBoards();
        return;
      }
      this.isMyTurn = true;
      this.setNote(`Судно «${shipName || 'врага'}» пошло ко дну! Ваш ход.`, 'your-turn');
    }

    this.renderBattleBoards();
  }

  destroy() {
    window.removeEventListener('keydown', this.keyHandler);
    if (this.net) this.net.close();
    this.onExit();
  }
}
