import { BattleshipGame } from './games/battleship/game.js';
import { STYLES } from './games/battleship/config.js';
import { captainAudio } from './audio.js';
import { RoomNetwork } from './net/room-network.js';

const PORTAL_ACCESS_CODE = '1234';
const STORAGE_NICK_KEY = 'captain_hub_nickname';
const STORAGE_STYLE_KEY = 'captain_hub_style';

let selectedStyle = localStorage.getItem(STORAGE_STYLE_KEY) || 'shanty';
let selectedDifficulty = 'medium';
let currentGame = null;
let currentNetwork = null;

function showScreen(screenId) {
  document.querySelectorAll('.screen').forEach((el) => {
    el.hidden = el.id !== screenId;
  });
}

function applyCaptainStyle(styleId, autoplayMusic = true) {
  const cfg = STYLES[styleId] || STYLES.shanty;
  selectedStyle = cfg.id;
  localStorage.setItem(STORAGE_STYLE_KEY, selectedStyle);

  document.body.classList.remove('theme-shanty', 'theme-night_candle');
  document.body.classList.add(cfg.themeClass);

  document.querySelectorAll('.style-card').forEach((card) => {
    card.classList.toggle('active', card.dataset.style === selectedStyle);
  });

  const pillIcon = document.getElementById('style-pill-icon');
  const pillText = document.getElementById('style-pill-text');
  if (pillIcon) pillIcon.textContent = cfg.icon;
  if (pillText) pillText.textContent = cfg.name;

  captainAudio.setStyle(selectedStyle, autoplayMusic);
}

function loadNickname() {
  const savedNick = localStorage.getItem(STORAGE_NICK_KEY);
  const topBar = document.getElementById('top-bar');
  const displayNick = document.getElementById('display-nickname');
  const setupBlock = document.getElementById('nick-setup-block');
  const inputNick = document.getElementById('input-nickname');

  if (savedNick) {
    topBar.hidden = false;
    displayNick.textContent = savedNick;
    setupBlock.hidden = true;
    inputNick.value = savedNick;
  } else {
    setupBlock.hidden = false;
  }
  return savedNick;
}

function saveNickname(nick) {
  const clean = nick.trim();
  if (!clean) return null;
  localStorage.setItem(STORAGE_NICK_KEY, clean);
  loadNickname();
  captainAudio.playCue('ink');
  return clean;
}

function cleanupSession() {
  if (currentGame) {
    currentGame.destroy();
    currentGame = null;
  }
  if (currentNetwork) {
    currentNetwork.disconnect();
    currentNetwork = null;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  applyCaptainStyle(selectedStyle, false);

  const btnAudio = document.getElementById('btn-audio-toggle');
  const audioLabel = document.getElementById('audio-status-label');
  btnAudio.onclick = () => {
    const isMuted = captainAudio.toggleMute();
    btnAudio.firstChild.textContent = isMuted ? '🔇 ' : '🔊 ';
    audioLabel.textContent = isMuted ? 'Тишина' : 'Звук вкл';
  };

  // Экран 1 -> Экран 2
  document.getElementById('btn-to-access').onclick = () => {
    captainAudio.unlockAndPlayCurrent();
    captainAudio.playCue('ink');
    showScreen('screen-access');
    document.getElementById('input-access-code').focus();
  };

  // Экран 2: Шифр доступа
  const verifyAccess = () => {
    captainAudio.unlockAndPlayCurrent();
    const code = document.getElementById('input-access-code').value.trim();
    const errEl = document.getElementById('access-error');
    if (code === PORTAL_ACCESS_CODE) {
      errEl.hidden = true;
      captainAudio.playCue('ink');
      loadNickname();
      showScreen('screen-games');
    } else {
      errEl.hidden = false;
    }
  };

  document.getElementById('btn-verify-code').onclick = verifyAccess;
  document.getElementById('input-access-code').onkeydown = (e) => {
    if (e.key === 'Enter') verifyAccess();
  };

  // Экран 3: Выбор игры
  const openBattleshipLobby = () => {
    applyCaptainStyle(selectedStyle, true);
    captainAudio.playCue('ink');
    loadNickname();
    showScreen('screen-lobby');
  };

  document.getElementById('select-battleship').onclick = openBattleshipLobby;
  document.getElementById('select-battleship').onkeydown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openBattleshipLobby();
    }
  };

  // Экран 4: Лобби
  document.getElementById('btn-back-to-games').onclick = () => {
    cleanupSession();
    captainAudio.playCue('ink');
    showScreen('screen-games');
  };

  document.getElementById('btn-save-nick').onclick = () => {
    const val = document.getElementById('input-nickname').value;
    if (saveNickname(val)) {
      document.getElementById('lobby-error').hidden = true;
    }
  };

  document.getElementById('btn-change-nick').onclick = () => {
    captainAudio.playCue('ink');
    document.getElementById('nick-setup-block').hidden = false;
    document.getElementById('input-nickname').focus();
  };

  document.querySelectorAll('.style-card').forEach((card) => {
    card.onclick = () => {
      applyCaptainStyle(card.dataset.style, true);
      captainAudio.playCue('ink');
    };
  });

  document.querySelectorAll('.diff-btn').forEach((btn) => {
    btn.onclick = () => {
      document.querySelectorAll('.diff-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      selectedDifficulty = btn.dataset.diff;
      captainAudio.playCue('ink');
    };
  });

  document.getElementById('btn-gen-room').onclick = () => {
    const randomCode = Math.random().toString(36).substring(2, 7).toUpperCase();
    document.getElementById('input-room-code').value = randomCode;
    captainAudio.playCue('ink');
  };

  document.getElementById('btn-join-room').onclick = () => {
    applyCaptainStyle(selectedStyle, true);
    const errEl = document.getElementById('lobby-error');
    let nick = localStorage.getItem(STORAGE_NICK_KEY);

    if (!nick || !document.getElementById('nick-setup-block').hidden) {
      nick = saveNickname(document.getElementById('input-nickname').value);
    }

    if (!nick) {
      errEl.textContent = 'Сначала впишите имя капитана в судовой журнал!';
      errEl.hidden = false;
      return;
    }

    const roomCode = document.getElementById('input-room-code').value.trim().toUpperCase();
    if (!roomCode) {
      errEl.textContent = 'Укажите код комнаты или сгенерируйте его кнопкой «🎲 Код».';
      errEl.hidden = false;
      return;
    }

    errEl.hidden = true;
    captainAudio.playCue('ink');
    cleanupSession();
    showScreen('screen-game');

    const network = new RoomNetwork({
      roomCode,
      playerName: nick,
      onStatusChange: (statusText) => currentGame?.setNetworkStatus(statusText),
      onPeerJoin: (peerInfo) => currentGame?.onPeerConnected(peerInfo),
      onPeerLeave: (peerInfo) => currentGame?.onPeerDisconnected(peerInfo),
      onMessage: (msg) => currentGame?.onNetworkMessage(msg),
      onError: (errMsg) => currentGame?.onNetworkError(errMsg)
    });

    currentNetwork = network;

    currentGame = new BattleshipGame({
      roomCode,
      styleId: selectedStyle,
      playerName: nick,
      difficultyId: selectedDifficulty,
      network,
      onExit: () => {
        cleanupSession();
        showScreen('screen-lobby');
      }
    });

    network.connect();
  };
});
