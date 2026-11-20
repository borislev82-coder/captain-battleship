export const STYLES = {
  shanty: {
    id: 'shanty',
    name: 'Весёлый пиратский поход',
    icon: '🍻',
    themeClass: 'theme-shanty'
  },
  night_candle: {
    id: 'night_candle',
    name: 'Тёмная ночь, свеча у руля',
    icon: '🕯️',
    themeClass: 'theme-night_candle'
  }
};

export const DIFFICULTIES = {
  easy: {
    id: 'easy',
    name: 'Лёгкий (8×8)',
    boardSize: 8,
    autoOutlineSunk: true,
    fleet: [
      { id: 's1', name: 'Бригантина', size: 3 },
      { id: 's2', name: 'Шхуна', size: 2 },
      { id: 's3', name: 'Шхуна', size: 2 },
      { id: 's4', name: 'Шлюпка', size: 1 },
      { id: 's5', name: 'Шлюпка', size: 1 },
      { id: 's6', name: 'Шлюпка', size: 1 }
    ]
  },
  medium: {
    id: 'medium',
    name: 'Средний (10×10)',
    boardSize: 10,
    autoOutlineSunk: true,
    fleet: [
      { id: 's1', name: 'Галеон', size: 4 },
      { id: 's2', name: 'Фрегат', size: 3 },
      { id: 's3', name: 'Фрегат', size: 3 },
      { id: 's4', name: 'Бриг', size: 2 },
      { id: 's5', name: 'Бриг', size: 2 },
      { id: 's6', name: 'Бриг', size: 2 },
      { id: 's7', name: 'Пинас', size: 1 },
      { id: 's8', name: 'Пинас', size: 1 },
      { id: 's9', name: 'Пинас', size: 1 },
      { id: 's10', name: 'Пинас', size: 1 }
    ]
  },
  hard: {
    id: 'hard',
    name: 'Сложный (12×12)',
    boardSize: 12,
    autoOutlineSunk: true,
    fleet: [
      { id: 's1', name: 'Флагман Армады', size: 5 },
      { id: 's2', name: 'Галеон', size: 4 },
      { id: 's3', name: 'Галеон', size: 4 },
      { id: 's4', name: 'Фрегат', size: 3 },
      { id: 's5', name: 'Фрегат', size: 3 },
      { id: 's6', name: 'Бриг', size: 2 },
      { id: 's7', name: 'Бриг', size: 2 },
      { id: 's8', name: 'Бриг', size: 2 },
      { id: 's9', name: 'Шлюпка', size: 1 },
      { id: 's10', name: 'Шлюпка', size: 1 },
      { id: 's11', name: 'Шлюпка', size: 1 }
    ]
  },
  pro: {
    id: 'pro',
    name: 'Профи (12×12 • Без обводки)',
    boardSize: 12,
    autoOutlineSunk: false,
    fleet: [
      { id: 's1', name: 'Флагман Армады', size: 5 },
      { id: 's2', name: 'Галеон', size: 4 },
      { id: 's3', name: 'Фрегат', size: 3 },
      { id: 's4', name: 'Фрегат', size: 3 },
      { id: 's5', name: 'Бриг', size: 2 },
      { id: 's6', name: 'Бриг', size: 2 },
      { id: 's7', name: 'Бриг', size: 2 },
      { id: 's8', name: 'Шлюпка', size: 1 },
      { id: 's9', name: 'Шлюпка', size: 1 },
      { id: 's10', name: 'Шлюпка', size: 1 },
      { id: 's11', name: 'Шлюпка', size: 1 }
    ]
  }
};
