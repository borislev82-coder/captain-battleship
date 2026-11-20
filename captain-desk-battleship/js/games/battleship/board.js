export function createEmptyGrid(size) {
  return Array.from({ length: size }, () => Array(size).fill(null));
}

export function getShipCells(x, y, size, isHorizontal) {
  const cells = [];
  for (let i = 0; i < size; i++) {
    cells.push({
      x: isHorizontal ? x + i : x,
      y: isHorizontal ? y : y + i
    });
  }
  return cells;
}

export function canPlaceShip(grid, x, y, shipSize, isHorizontal) {
  const boardSize = grid.length;
  const cells = getShipCells(x, y, shipSize, isHorizontal);

  for (const cell of cells) {
    if (cell.x < 0 || cell.x >= boardSize || cell.y < 0 || cell.y >= boardSize) {
      return false;
    }
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = cell.x + dx;
        const ny = cell.y + dy;
        if (nx >= 0 && nx < boardSize && ny >= 0 && ny < boardSize) {
          if (grid[ny][nx] !== null) {
            return false;
          }
        }
      }
    }
  }
  return true;
}

export function placeShipOnGrid(grid, ship, x, y, isHorizontal) {
  const cells = getShipCells(x, y, ship.size, isHorizontal);
  for (const c of cells) {
    grid[c.y][c.x] = ship.id;
  }
  return cells;
}

export function autoPlaceFleet(boardSize, fleetTemplate) {
  const grid = createEmptyGrid(boardSize);
  const placedShips = [];

  for (const ship of fleetTemplate) {
    let placed = false;
    let attempts = 0;
    while (!placed && attempts < 600) {
      attempts++;
      const isHorizontal = Math.random() < 0.5;
      const x = Math.floor(Math.random() * boardSize);
      const y = Math.floor(Math.random() * boardSize);
      if (canPlaceShip(grid, x, y, ship.size, isHorizontal)) {
        const cells = placeShipOnGrid(grid, ship, x, y, isHorizontal);
        placedShips.push({ ...ship, cells, hits: 0 });
        placed = true;
      }
    }
  }
  return { grid, placedShips };
}

export function getSurroundingCells(cells, boardSize) {
  const set = new Set();
  const shipSet = new Set(cells.map(c => `${c.x},${c.y}`));

  for (const c of cells) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = c.x + dx;
        const ny = c.y + dy;
        const key = `${nx},${ny}`;
        if (nx >= 0 && nx < boardSize && ny >= 0 && ny < boardSize && !shipSet.has(key)) {
          set.add(key);
        }
      }
    }
  }
  return Array.from(set).map(str => {
    const [x, y] = str.split(',').map(Number);
    return { x, y };
  });
}
