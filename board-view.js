'use strict';

(() => {
  const keys = {
    ArrowLeft: [-1, 0], KeyA: [-1, 0], ArrowRight: [1, 0], KeyD: [1, 0],
    ArrowUp: [0, -1], KeyW: [0, -1], ArrowDown: [0, 1], KeyS: [0, 1]
  };

  function bindBoard(game, viewport) {
    const side = viewport.dataset.board;
    const camera = game.boardCameras[side];
    const grid = viewport.querySelector('.bs-grid');
    const fingers = new Map();
    let mouse;
    let suppressClickUntil = 0;

    const save = () => {
      camera.x = viewport.scrollLeft;
      camera.y = viewport.scrollTop;
    };
    const pan = (x, y) => {
      viewport.scrollBy(x, y);
      save();
    };
    const zoom = (scale, x, y) => {
      const next = Math.min(3.5, Math.max(0.7, scale));
      if (next === camera.scale) return;
      const ratio = next / camera.scale;
      const rect = viewport.getBoundingClientRect();
      const left = (viewport.scrollLeft + x - rect.left) * ratio - (x - rect.left);
      const top = (viewport.scrollTop + y - rect.top) * ratio - (y - rect.top);
      camera.scale = next;
      grid.style.zoom = next;
      viewport.scrollTo(left, top);
      save();
    };

    grid.style.zoom = camera.scale;
    viewport.scrollTo(camera.x, camera.y);
    viewport.addEventListener('scroll', save, { passive: true });
    viewport.addEventListener('pointerenter', () => { game.activeBoard = side; });
    viewport.addEventListener('focusin', () => { game.activeBoard = side; });
    viewport.addEventListener('wheel', event => {
      event.preventDefault();
      game.activeBoard = side;
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 200 : 1);
      zoom(camera.scale * Math.exp(-delta / 430), event.clientX, event.clientY);
    }, { passive: false });
    viewport.addEventListener('contextmenu', event => event.preventDefault());

    const metrics = () => {
      const [a, b] = [...fingers.values()];
      return {
        x: (a.x + b.x) / 2, y: (a.y + b.y) / 2,
        distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y))
      };
    };

    viewport.addEventListener('pointerdown', event => {
      game.activeBoard = side;
      if (event.pointerType === 'touch') {
        fingers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (fingers.size >= 2) {
          suppressClickUntil = performance.now() + 400;
          for (const id of fingers.keys()) viewport.setPointerCapture(id);
        }
      } else if (event.button === 2) {
        event.preventDefault();
        mouse = { x: event.clientX, y: event.clientY };
        viewport.setPointerCapture(event.pointerId);
        viewport.classList.add('is-panning');
      }
    });
    viewport.addEventListener('pointermove', event => {
      if (mouse && event.pointerType !== 'touch') {
        pan(mouse.x - event.clientX, mouse.y - event.clientY);
        mouse = { x: event.clientX, y: event.clientY };
      } else if (fingers.has(event.pointerId)) {
        const before = fingers.size >= 2 ? metrics() : null;
        fingers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (before) {
          const after = metrics();
          zoom(camera.scale * after.distance / before.distance, before.x, before.y);
          pan(before.x - after.x, before.y - after.y);
          suppressClickUntil = performance.now() + 400;
        }
      }
    });
    const end = event => {
      fingers.delete(event.pointerId);
      if (event.pointerType !== 'touch') {
        mouse = null;
        viewport.classList.remove('is-panning');
      }
    };
    for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) viewport.addEventListener(name, end);
    viewport.addEventListener('click', event => {
      if (performance.now() < suppressClickUntil && event.detail > 0) {
        event.preventDefault();
        event.stopPropagation();
      }
    }, true);
  }

  window.boardView = {
    bind(game) {
      game.root.querySelectorAll('[data-board]').forEach(viewport => bindBoard(game, viewport));
    },
    key(game, event) {
      const direction = keys[event.code];
      if (!direction || document.querySelector('dialog[open]') ||
          event.altKey || event.ctrlKey || event.metaKey ||
          event.target.closest?.('input, textarea, select, [contenteditable]')) return false;
      const viewport = game.root.querySelector('[data-board="' + game.activeBoard + '"]');
      if (!viewport) return false;
      event.preventDefault();
      viewport.scrollBy(direction[0] * 48, direction[1] * 48);
      const camera = game.boardCameras[game.activeBoard];
      camera.x = viewport.scrollLeft;
      camera.y = viewport.scrollTop;
      return true;
    }
  };
})();
