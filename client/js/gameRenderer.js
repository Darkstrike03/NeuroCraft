import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { ChunkMesher } from './chunkMesh.js';
import { BLOCK_NAMES } from './blockColors.js';

const CHUNK_SIZE   = 16;
const CHUNK_HEIGHT = 64;
const VIEW_DIST    = 4;  // chunks in each direction to keep loaded

// ─── Mob / player mesh colors ──────────────────────────────────────────
const MOB_COLORS = {
  zombie:   0x4caf50, skeleton: 0xeeeeee, creeper: 0x66bb6a,
  cow:      0x5d4037, pig:      0xff8a65, sheep:   0xfafafa,
};

export class GameRenderer {
  constructor(canvas) {
    this.canvas    = canvas;
    this.chunkData = new Map();  // "cx,cz" → Uint8Array
    this.meshes    = new Map();  // "cx,cz" → THREE.Mesh
    this.players   = new Map();  // id → { mesh, label, ... }
    this.mobs      = new Map();  // id → { mesh, ... }
    this._dirty    = new Set();  // chunks needing rebuild
    this.followId  = null;       // player id to follow with camera

    this._init();
    this._animate();
  }

  _init() {
    const W = this.canvas.clientWidth, H = this.canvas.clientHeight;

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(W, H);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type    = THREE.PCFSoftShadowMap;
    this.renderer.setClearColor(0x87ceeb);

    // Scene
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x87ceeb, 60, 130);

    // Camera
    this.camera = new THREE.PerspectiveCamera(70, W / H, 0.1, 200);
    this.camera.position.set(8, 55, 32);
    this.camera.lookAt(8, 33, 0);

    // Controls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.1;
    this.controls.maxPolarAngle = Math.PI * 0.85;
    this.controls.minDistance   = 5;
    this.controls.maxDistance   = 150;

    // Lighting
    const ambient = new THREE.AmbientLight(0xffffff, 0.5);
    this.scene.add(ambient);

    this.sunLight = new THREE.DirectionalLight(0xfff5e0, 1.0);
    this.sunLight.position.set(80, 120, 50);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(1024, 1024);
    this.sunLight.shadow.camera.near   = 0.1;
    this.sunLight.shadow.camera.far    = 300;
    this.sunLight.shadow.camera.left   = -80;
    this.sunLight.shadow.camera.right  = 80;
    this.sunLight.shadow.camera.top    = 80;
    this.sunLight.shadow.camera.bottom = -80;
    this.scene.add(this.sunLight);

    this.moonLight = new THREE.DirectionalLight(0x8888ff, 0.3);
    this.moonLight.position.set(-80, 80, -50);
    this.scene.add(this.moonLight);

    // Sky dome (gradient sphere)
    const skyGeo = new THREE.SphereGeometry(190, 16, 8);
    const skyCols = [];
    const posArr  = skyGeo.attributes.position.array;
    for (let i = 0; i < posArr.length; i += 3) {
      const t = (posArr[i + 1] / 190 + 1) / 2;
      const c = new THREE.Color().lerpColors(
        new THREE.Color(0x87ceeb), new THREE.Color(0x1a6fa8), 1 - t
      );
      skyCols.push(c.r, c.g, c.b);
    }
    skyGeo.setAttribute('color', new THREE.Float32BufferAttribute(skyCols, 3));
    const skyMat  = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide });
    this.skySphere = new THREE.Mesh(skyGeo, skyMat);
    this.scene.add(this.skySphere);

    this.mesher = new ChunkMesher((wx, y, wz) => this._getBlock(wx, y, wz));

    // Resize handling
    window.addEventListener('resize', () => this._onResize());
  }

  _onResize() {
    const W = this.canvas.clientWidth, H = this.canvas.clientHeight;
    this.camera.aspect = W / H;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(W, H);
  }

  // ── Block access ──────────────────────────────────────────────────────
  _getBlock(worldX, y, worldZ) {
    if (y < 0 || y >= CHUNK_HEIGHT) return 0;
    const cx = Math.floor(worldX / CHUNK_SIZE);
    const cz = Math.floor(worldZ / CHUNK_SIZE);
    const data = this.chunkData.get(`${cx},${cz}`);
    if (!data) return 0;
    const lx = ((worldX % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const lz = ((worldZ % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    return data[(y * CHUNK_SIZE * CHUNK_SIZE) + (lz * CHUNK_SIZE) + lx];
  }

  // ── Chunk management ──────────────────────────────────────────────────
  receiveChunk(cx, cz, dataArr) {
    const key  = `${cx},${cz}`;
    const data = new Uint8Array(dataArr);
    this.chunkData.set(key, data);
    this._dirty.add(key);
    // Also mark adjacent chunks dirty so their boundary faces update
    for (const [dx, dz] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const nk = `${cx+dx},${cz+dz}`;
      if (this.chunkData.has(nk)) this._dirty.add(nk);
    }
  }

  applyBlockChange(x, y, z, type) {
    const cx = Math.floor(x / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    const lx = ((x % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const lz = ((z % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const key = `${cx},${cz}`;
    const data = this.chunkData.get(key);
    if (!data) return;
    data[(y * CHUNK_SIZE * CHUNK_SIZE) + (lz * CHUNK_SIZE) + lx] = type;
    this._dirty.add(key);
    // Adjacent chunks might need rebuild if block is on edge
    if (lx === 0)              this._dirty.add(`${cx-1},${cz}`);
    if (lx === CHUNK_SIZE - 1) this._dirty.add(`${cx+1},${cz}`);
    if (lz === 0)              this._dirty.add(`${cx},${cz-1}`);
    if (lz === CHUNK_SIZE - 1) this._dirty.add(`${cx},${cz+1}`);
  }

  _rebuildDirtyChunks() {
    let rebuilt = 0;
    for (const key of this._dirty) {
      if (rebuilt >= 4) break; // cap rebuilds per frame to avoid stutter
      this._rebuildChunk(key);
      this._dirty.delete(key);
      rebuilt++;
    }
  }

  _rebuildChunk(key) {
    const [cx, cz] = key.split(',').map(Number);
    const old = this.meshes.get(key);
    if (old) { this.scene.remove(old); old.geometry.dispose(); old.material.dispose(); }

    const mesh = this.mesher.build(cx, cz);
    if (mesh) {
      this.scene.add(mesh);
      this.meshes.set(key, mesh);
    } else {
      this.meshes.delete(key);
    }
  }

  // ── Player entities ───────────────────────────────────────────────────
  updatePlayers(playersArr) {
    const seen = new Set();
    for (const p of playersArr) {
      seen.add(p.id);
      let ent = this.players.get(p.id);
      if (!ent) {
        ent = this._createPlayerEntity(p.name, 0x2196f3);
        this.players.set(p.id, ent);
        this.scene.add(ent.group);
      }
      ent.group.position.set(p.x + 0.5, p.y, p.z + 0.5);
      ent.nameTag.textContent = `${p.name}\n${p.lastThought?.slice(0, 40) || '…'}`;
      ent.data = p;
    }
    // Remove stale
    for (const [id, ent] of this.players) {
      if (!seen.has(id)) { this.scene.remove(ent.group); this.players.delete(id); }
    }
  }

  _createPlayerEntity(name, color) {
    const group = new THREE.Group();

    // Legs with hip pivot so rotation swings from the top (hip), not the centre
    const legGeo = new THREE.BoxGeometry(0.25, 0.75, 0.25);
    const legMat = new THREE.MeshLambertMaterial({ color: 0x1a237e });

    const legLPivot = new THREE.Group();           // group[0]
    legLPivot.position.set(-0.13, 0.75, 0);
    const legL = new THREE.Mesh(legGeo, legMat);
    legL.position.y = -0.375;                      // hang below pivot
    legLPivot.add(legL);
    group.add(legLPivot);

    const legRPivot = new THREE.Group();           // group[1]
    legRPivot.position.set(0.13, 0.75, 0);
    const legR = new THREE.Mesh(legGeo, legMat.clone());
    legR.position.y = -0.375;
    legRPivot.add(legR);
    group.add(legRPivot);

    // Torso                                        // group[2]
    const bodyMat = new THREE.MeshLambertMaterial({ color });
    const body    = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.75, 0.25), bodyMat);
    body.position.y = 1.125;
    group.add(body);

    // Arms with shoulder pivot
    const armGeo = new THREE.BoxGeometry(0.22, 0.7, 0.22);
    const armMat = new THREE.MeshLambertMaterial({ color });

    const armLPivot = new THREE.Group();           // group[3]
    armLPivot.position.set(-0.36, 1.5, 0);
    const armL = new THREE.Mesh(armGeo, armMat);
    armL.position.y = -0.35;
    armLPivot.add(armL);
    group.add(armLPivot);

    const armRPivot = new THREE.Group();           // group[4]
    armRPivot.position.set(0.36, 1.5, 0);
    const armR = new THREE.Mesh(armGeo, armMat.clone());
    armR.position.y = -0.35;
    armRPivot.add(armR);
    group.add(armRPivot);

    // Head                                         // group[5]
    const head = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.5, 0.5),
      new THREE.MeshLambertMaterial({ color: 0xffe0b2 })
    );
    head.position.y = 1.75;
    group.add(head);

    // Name-tag sprite                              // group[6]
    const cvs = document.createElement('canvas');
    cvs.width = 256; cvs.height = 64;
    const ctx = cvs.getContext('2d');
    const texture = new THREE.CanvasTexture(cvs);
    const sprite  = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }));
    sprite.scale.set(3, 0.75, 1);
    sprite.position.y = 2.4;
    group.add(sprite);

    const nameTag = {
      textContent: name,
      set textContent(t) {
        ctx.clearRect(0, 0, 256, 64);
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.roundRect(2, 2, 252, 60, 8);
        ctx.fill();
        ctx.fillStyle = '#00ffb3';
        ctx.font = 'bold 18px monospace';
        ctx.textAlign = 'center';
        const lines = t.split('\n');
        ctx.fillText(lines[0] || '', 128, 24);
        ctx.fillStyle = '#cccccc';
        ctx.font = '13px monospace';
        ctx.fillText((lines[1] || '').slice(0, 30), 128, 48);
        texture.needsUpdate = true;
      },
    };
    nameTag.textContent = name;

    return { group, nameTag, walkPhase: 0, data: {} };
  }

  // ── Mob entities ──────────────────────────────────────────────────────
  updateMobs(mobsArr) {
    const seen = new Set();
    for (const m of mobsArr) {
      seen.add(m.id);
      let ent = this.mobs.get(m.id);
      if (!ent) {
        ent = this._createMobEntity(m.type);
        this.mobs.set(m.id, ent);
        this.scene.add(ent);
      }
      ent.position.set(m.x + 0.5, m.y, m.z + 0.5);
    }
    for (const [id, mesh] of this.mobs) {
      if (!seen.has(id)) { this.scene.remove(mesh); this.mobs.delete(id); }
    }
  }

  _createMobEntity(type) {
    const color = MOB_COLORS[type] || 0xff0000;
    const h     = type === 'creeper' ? 1.7 : (type==='skeleton'||type==='zombie' ? 1.9 : 1.4);
    const geo   = new THREE.BoxGeometry(0.8, h, 0.8);
    const mat   = new THREE.MeshLambertMaterial({ color });
    const mesh  = new THREE.Mesh(geo, mat);
    mesh.position.y = h / 2;
    return mesh;
  }

  // ── Day / night cycle ─────────────────────────────────────────────────
  setDayCycle(dayTick, dayLength) {
    const t = dayTick / dayLength; // 0→1
    const isNight = t > 0.5;

    // Sky colour
    const dayColor   = new THREE.Color(0x87ceeb);
    const sunsetColor= new THREE.Color(0xff7040);
    const nightColor = new THREE.Color(0x0a0a2a);
    let sky;
    if      (t < 0.45) sky = dayColor;
    else if (t < 0.5)  sky = dayColor.clone().lerp(sunsetColor, (t-0.45)/0.05);
    else if (t < 0.55) sky = sunsetColor.clone().lerp(nightColor, (t-0.5)/0.05);
    else               sky = nightColor;

    this.renderer.setClearColor(sky);
    this.scene.fog.color.copy(sky);
    this.skySphere.material.color?.set?.(sky);

    // Sun position (circular arc)
    const angle = t * Math.PI * 2 - Math.PI / 2;
    this.sunLight.position.set(Math.cos(angle) * 100, Math.sin(angle) * 100, 50);
    this.sunLight.intensity = isNight ? 0 : Math.max(0, Math.sin(t * Math.PI)) * 1.1;
    this.moonLight.intensity = isNight ? 0.3 : 0;
  }

  // ── Follow camera ─────────────────────────────────────────────────────
  followPlayer(id) {
    this.followId = id;
  }

  _applyFollowCamera() {
    if (!this.followId) return;
    const ent = this.players.get(this.followId);
    if (!ent) return;
    const pos = ent.group.position;
    this.controls.target.lerp(pos, 0.08);
  }

  // ── Main animate loop ─────────────────────────────────────────────────
  _animate() {
    requestAnimationFrame(() => this._animate());
    this._rebuildDirtyChunks();
    this._applyFollowCamera();
    this.controls.update();

    // Limb walk animation — swing arms/legs when player last action was 'move'
    for (const [, ent] of this.players) {
      const moving = ent.data?.lastAction === 'move';
      if (moving) ent.walkPhase = ((ent.walkPhase || 0) + 0.13) % (Math.PI * 2);
      else        ent.walkPhase = (ent.walkPhase || 0) * 0.72; // settle to neutral
      const sw = Math.sin(ent.walkPhase) * 0.48;
      const ch = ent.group.children;
      if (ch[0]) ch[0].rotation.x =  sw;  // legLPivot
      if (ch[1]) ch[1].rotation.x = -sw;  // legRPivot
      if (ch[3]) ch[3].rotation.x = -sw;  // armLPivot (opposite to leg)
      if (ch[4]) ch[4].rotation.x =  sw;  // armRPivot
    }

    this.renderer.render(this.scene, this.camera);
  }
}
