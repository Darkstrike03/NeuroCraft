// Socket.io game client — handles all real-time communication
import { io } from 'https://cdn.socket.io/4.7.4/socket.io.esm.min.js';

export class GameNetwork {
  /**
   * @param {string}        serverUrl
   * @param {GameRenderer}  renderer
   * @param {Function}      onStateUpdate  called with latest game state
   * @param {Function}      onAction       called with { playerName, action, thought, result }
   * @param {Function}      onChat         called with { from, message }
   */
  constructor(serverUrl, renderer, onStateUpdate, onAction, onChat) {
    this.renderer       = renderer;
    this.onStateUpdate  = onStateUpdate;
    this.onAction       = onAction;
    this.onChat         = onChat;
    this._chunksNeeded  = new Set();
    this._loadedChunks  = new Set();

    this.socket = io(serverUrl, { transports: ['websocket'] });

    this.socket.on('connect',     () => console.log('[Net] Connected'));
    this.socket.on('disconnect',  () => console.log('[Net] Disconnected'));

    this.socket.on('authenticated', ({ ok, error }) => {
      if (!ok) console.error('[Net] Auth failed:', error);
      else      console.log('[Net] Authenticated');
    });

    this.socket.on('initialChunks', (chunks) => {
      for (const { cx, cz, data } of chunks) {
        this.renderer.receiveChunk(cx, cz, data);
        this._loadedChunks.add(`${cx},${cz}`);
      }
    });

    this.socket.on('chunkData', ({ cx, cz, data }) => {
      this.renderer.receiveChunk(cx, cz, data);
      this._loadedChunks.add(`${cx},${cz}`);
      this._chunksNeeded.delete(`${cx},${cz}`);
    });

    this.socket.on('blockChange', ({ x, y, z, type }) => {
      this.renderer.applyBlockChange(x, y, z, type);
    });

    this.socket.on('gameState', (state) => {
      this.renderer.updatePlayers(state.players || []);
      this.renderer.setDayCycle(state.dayTick || 0, state.dayLength || 24000);
      this.onStateUpdate(state);
    });

    this.socket.on('mobPositions', (mobs) => {
      this.renderer.updateMobs(mobs);
    });

    this.socket.on('mobSpawn', (mob) => {
      this.renderer.updateMobs([...renderer.mobs.values?.() ?? [], mob]);
    });

    this.socket.on('mobDeath', ({ mobId }) => {
      const m = this.renderer.mobs.get(mobId);
      if (m) { this.renderer.scene.remove(m); this.renderer.mobs.delete(mobId); }
    });

    this.socket.on('playerAction', (ev) => this.onAction(ev));
    this.socket.on('chat',         (ev) => this.onChat(ev));
  }

  authenticate(token) {
    this.socket.emit('authenticate', token);
  }

  requestChunk(cx, cz) {
    const key = `${cx},${cz}`;
    if (this._loadedChunks.has(key) || this._chunksNeeded.has(key)) return;
    this._chunksNeeded.add(key);
    this.socket.emit('requestChunk', { cx, cz });
  }

  /** Call periodically with camera world position to stream in nearby chunks */
  updateStreamPosition(wx, wz) {
    const cx = Math.floor(wx / 16), cz = Math.floor(wz / 16);
    for (let dx = -4; dx <= 4; dx++) {
      for (let dz = -4; dz <= 4; dz++) {
        this.requestChunk(cx + dx, cz + dz);
      }
    }
  }
}
