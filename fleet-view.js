'use strict';

(() => {
  const modelNumbers = {
    line1: 2, line2: 1, line3: 9, line4: 12, line5: 16,
    sq2: 5, sq3: 30, corner3: 3, l4: 10, t4: 11
  };

  const modelFor = shape => battleshipRules.SHAPE_TEMPLATES[shape].model ?? 100 + modelNumbers[shape];

  const fleet = new Map(Object.entries(battleshipRules.SHAPE_TEMPLATES).map(([shape, template]) => {
    const cells = template.cells.map(([r, c]) => [c, r]);
    const width = Math.max(...cells.map(([x]) => x)) + 1;
    const height = Math.max(...cells.map(([, y]) => y)) + 1;
    const grid = Array.from({ length: height }, () => Array(width).fill('0'));
    for (const [x, y] of cells) grid[y][x] = '1';
    const number = template.model ?? modelNumbers[shape];
    return [modelFor(shape), { number, cells, width, height, grid: grid.map(row => row.join('')), cell_count: cells.length }];
  }));

  function position(ship, id) {
    const y = Math.min(...ship.cells.map(([r]) => r));
    const x = Math.min(...ship.cells.map(([, c]) => c));
    const cells = ship.cells.map(([r, c]) => (r - y) + ',' + (c - x)).sort().join(';');
    const template = battleshipRules.SHAPE_TEMPLATES[ship.shapeKey];
    const r = [0, 1, 2, 3].find(rotation =>
      battleshipRules.rotateOffsets(template.cells, rotation).map(cell => cell.join(',')).sort().join(';') === cells);
    return { n: modelFor(ship.shapeKey), id, x, y, r: r ?? 0 };
  }

  let rendererLoad;
  function loadRenderer() {
    if (!rendererLoad) {
      const loadScript = (src) => new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = src;
        script.onload = resolve;
        script.onerror = reject;
        document.head.append(script);
      });
      rendererLoad = loadScript("/fleet-materials.js").then(() => loadScript("/scene3d.js")).catch(error => {
        rendererLoad = null;
        throw error;
      });
    }
    return rendererLoad;
  }

  window.drawFleetBoards = async function drawFleetBoards(game) {
    const nodes = [...game.root.querySelectorAll('.bs-board-frame')];
    try {
      await loadRenderer();
      const renderer = window.Naval3D;
      if (!renderer?.available) return;
      await renderer.texturesReady;
      for (const node of nodes) {
        if (!node.isConnected) continue;
        const viewport = node.closest('[data-board]');
        const side = viewport.dataset.board;
        const { row, col, rows, cols } = game.boardSector(side === 'enemy');
        const ships = [];
        if (side === 'own') for (const ship of game.myShips) {
          if (!ship.cells.some(([r, c]) => r >= row && r < row + rows && c >= col && c < col + cols)) continue;
          if (game.phase !== 'setup' && ship.cells.every(([r, c]) => game.myGrid[r][c] === 4)) continue;
          const model = position(ship, ship.id);
          ships.push({ ...model, x: model.x - col, y: model.y - row });
        }
        const key = JSON.stringify([rows, cols, ships]);
        let cached = game.boardFrames[side];
        if (cached?.key !== key) {
          const canvas = document.createElement("canvas");
          canvas.width = cols * 24;
          canvas.height = rows * 24;
          const frame = renderer.render({
            width: canvas.width, height: canvas.height, W: cols, H: rows, fleet, ships,
            angle: 90, time: 0, grid: false, animated: false, flatOriginal: true
          });
          canvas.getContext("2d").drawImage(frame, 0, 0);
          game.boardFrames[side] = cached = { key, canvas };
        }
        node.width = cached.canvas.width;
        node.height = cached.canvas.height;
        node.getContext("2d").drawImage(cached.canvas, 0, 0);
        viewport.classList.add('has-3d');
      }
    } catch (error) {
      console.warn('3D board unavailable', error);
    }
  };

  window.openFleetView = async function openFleetView(game) {
    const dialog = document.getElementById('fleet3d-dialog');
    const canvas = document.getElementById('fleet3d-canvas');
    const selector = document.getElementById('fleet3d-ship');
    const tilt = document.getElementById('fleet3d-tilt');
    const status = document.getElementById('fleet3d-status');
    const ctx = canvas.getContext('2d');
    selector.replaceChildren(new Option(game.size > 30 ? 'Флот в выбранном секторе' : 'Флот на поле', 'all'));
    for (const shape of new Set(game.myShips.map(ship => ship.shapeKey))) {
      selector.add(new Option(battleshipRules.SHAPE_TEMPLATES[shape].label, shape));
    }
    if (!game.myShips.some(ship => ship.cells.length)) selector.value = game.myShips[0].shapeKey;
    status.textContent = 'Загружаем 3D-флот…';
    dialog.showModal();
    try {
      await loadRenderer();
    } catch {
      status.textContent = 'Не удалось загрузить 3D-флот. Попробуйте открыть обзор снова.';
      return;
    }
    if (!dialog.open) return;
    const renderer = window.Naval3D;

    if (!renderer?.available || !ctx) {
      status.textContent = '3D-обзор недоступен в этом браузере. Закройте окно, чтобы вернуться к полю.';
      return;
    }

    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let animation;
    let previous = -Infinity;
    const firstFrame = performance.now();

    function draw(now) {
      if (!dialog.open) return;
      if (now - previous < (renderer.backend === 'WebGL' ? 42 : 125)) {
        animation = requestAnimationFrame(draw);
        return;
      }
      previous = now;

      let W = game.size;
      let H = game.size;
      let ships;
      if (selector.value === 'all') {
        const afloat = game.myShips.filter(ship => ship.cells.length &&
          (game.phase === 'setup' || ship.cells.some(([r, c]) => game.myGrid[r]?.[c] !== 4)));
        ships = afloat.map(position);
        if (game.size > 30) {
          const { row, col, rows, cols } = game.boardSector(false);
          W = cols;
          H = rows;
          ships = ships.filter(ship => {
            const model = fleet.get(ship.n);
            const odd = ship.r % 2;
            const width = odd ? model.height : model.width;
            const height = odd ? model.width : model.height;
            return ship.x < col + cols && ship.x + width > col && ship.y < row + rows && ship.y + height > row;
          }).map(ship => ({ ...ship, x: ship.x - col, y: ship.y - row }));
        }
        status.textContent = ships.length ? '' : 'На поле нет кораблей на плаву.';
      } else {
        const n = modelFor(selector.value);
        const model = fleet.get(n);
        W = Math.max(4, model.width + 2);
        H = Math.max(4, model.height + 2);
        ships = [{ n, id: 0, x: (W - model.width) / 2, y: (H - model.height) / 2, r: 0 }];
        status.textContent = '';
      }
      const width = Math.max(280, Math.min(1000, Math.round(canvas.clientWidth)));
      const height = Math.max(240, Math.round(width * 0.55));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      try {
        const frame = renderer.render({
          width, height, W, H, ships, fleet, angle: Number(tilt.value),
          grid: selector.value === 'all', animated: !reducedMotion,
          time: reducedMotion ? 0 : (now - firstFrame) / 1000
        });
        ctx.drawImage(frame, 0, 0);
      } catch (error) {
        console.error(error);
        status.textContent = 'Не удалось отобразить 3D. Игровое поле доступно после закрытия окна.';
        return;
      }
      animation = requestAnimationFrame(draw);
    }

    dialog.addEventListener('close', () => cancelAnimationFrame(animation), { once: true });
    animation = requestAnimationFrame(draw);
  };
})();
