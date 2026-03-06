/**
 * NeuroCraft Asset Studio — Three.js voxel editor.
 * Community members design trees, structures and blocks then submit via GitHub Issues.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// ── Block palette ──────────────────────────────────────────────────────────────
export const PALETTE = [
  { id: 0,  name: 'air',          color: null,      label: 'Air / Erase' },
  { id: 1,  name: 'grass',        color: '#5aab25', label: 'Grass' },
  { id: 2,  name: 'dirt',         color: '#8B5E3C', label: 'Dirt' },
  { id: 3,  name: 'stone',        color: '#9e9e9e', label: 'Stone' },
  { id: 4,  name: 'cobblestone',  color: '#78909c', label: 'Cobblestone' },
  { id: 5,  name: 'sand',         color: '#f0e68c', label: 'Sand' },
  { id: 6,  name: 'wood_log',     color: '#8B6040', label: 'Wood Log' },
  { id: 7,  name: 'leaves',       color: '#2d7a12', label: 'Leaves',      alpha: 0.78 },
  { id: 8,  name: 'planks',       color: '#d0b070', label: 'Planks' },
  { id: 9,  name: 'glass',        color: '#b3e5fc', label: 'Glass',        alpha: 0.50 },
  { id: 10, name: 'coal_ore',     color: '#546e7a', label: 'Coal Ore' },
  { id: 11, name: 'iron_ore',     color: '#b0bec5', label: 'Iron Ore' },
  { id: 12, name: 'gold_ore',     color: '#ffd54f', label: 'Gold Ore' },
  { id: 13, name: 'diamond_ore',  color: '#4dd0e1', label: 'Diamond Ore' },
  { id: 14, name: 'water',        color: '#1565c0', label: 'Water',        alpha: 0.60 },
  { id: 15, name: 'gravel',       color: '#90a4ae', label: 'Gravel' },
  { id: 16, name: 'wool_white',   color: '#fafafa', label: 'White Wool' },
  { id: 17, name: 'wool_red',     color: '#d32f2f', label: 'Red Wool' },
  { id: 18, name: 'wool_blue',    color: '#1976d2', label: 'Blue Wool' },
  { id: 19, name: 'wool_green',   color: '#388e3c', label: 'Green Wool' },
  { id: 20, name: 'wool_yellow',  color: '#fdd835', label: 'Yellow Wool' },
  { id: 21, name: 'bricks',       color: '#bf4040', label: 'Bricks' },
  { id: 22, name: 'snow',         color: '#eceff1', label: 'Snow' },
  { id: 23, name: 'flower_red',   color: '#e53935', label: 'Flower (Red)' },
  { id: 24, name: 'flower_yellow',color: '#ffeb3b', label: 'Flower (Yellow)' },
];

// ── Preset generators ──────────────────────────────────────────────────────────
function mkGrid(w, h, d) { return new Uint8Array(w * h * d); }
function idx(x, y, z, w, d) { return y * w * d + z * w + x; }
function setV(v, w, h, d, x, y, z, id) {
  if (x >= 0 && y >= 0 && z >= 0 && x < w && y < h && z < d)
    v[idx(x, y, z, w, d)] = id;
}

function oakTree() {
  const [w,h,d] = [5,9,5];
  const v = mkGrid(w,h,d);
  const s = (x,y,z,id) => setV(v,w,h,d,x,y,z,id);
  for (let y=0; y<5; y++) s(2,y,2, 6);
  for (let y=5; y<=8; y++) {
    const r = y<=6 ? 2 : 1;
    for (let dx=-r; dx<=r; dx++) for (let dz=-r; dz<=r; dz++) {
      if (Math.abs(dx)===r && Math.abs(dz)===r && y>5) continue;
      if (!v[idx(2+dx,y,2+dz,w,d)]) s(2+dx,y,2+dz, 7);
    }
  }
  return { w,h,d, voxels:v, name:'Oak Tree' };
}

function birchTree() {
  const [w,h,d] = [5,8,5];
  const v = mkGrid(w,h,d);
  const s = (x,y,z,id) => setV(v,w,h,d,x,y,z,id);
  for (let y=0; y<4; y++) s(2,y,2, 6);
  for (let y=4; y<=7; y++) {
    const r = y<=5 ? 2 : 1;
    for (let dx=-r; dx<=r; dx++) for (let dz=-r; dz<=r; dz++) {
      if (Math.abs(dx)===r && Math.abs(dz)===r) continue;
      if (!v[idx(2+dx,y,2+dz,w,d)]) s(2+dx,y,2+dz, 7);
    }
  }
  return { w,h,d, voxels:v, name:'Birch Tree' };
}

function tallTree() {
  const [w,h,d] = [7,14,7];
  const v = mkGrid(w,h,d);
  const s = (x,y,z,id) => setV(v,w,h,d,x,y,z,id);
  for (let y=0; y<8; y++) s(3,y,3, 6);
  for (let y=7; y<=13; y++) {
    const r = y<=9 ? 3 : y<=11 ? 2 : 1;
    for (let dx=-r; dx<=r; dx++) for (let dz=-r; dz<=r; dz++) {
      if (Math.abs(dx)===r && Math.abs(dz)===r && r>1) continue;
      if (!v[idx(3+dx,y,3+dz,w,d)]) s(3+dx,y,3+dz, 7);
    }
  }
  return { w,h,d, voxels:v, name:'Tall Spruce Tree' };
}

function smallHouse() {
  const [w,h,d] = [7,6,7];
  const v = mkGrid(w,h,d);
  const s = (x,y,z,id) => setV(v,w,h,d,x,y,z,id);
  for (let x=0; x<w; x++) for (let z=0; z<d; z++) s(x,0,z, 4);  // cobble floor
  for (let y=1; y<=3; y++) {
    for (let x=0; x<w; x++) { s(x,y,0, 8); s(x,y,d-1, 8); }
    for (let z=1; z<d-1; z++) { s(0,y,z, 8); s(w-1,y,z, 8); }
  }
  s(3,1,0, 0); s(3,2,0, 0);                    // door opening
  for (const [x,z] of [[1,0],[5,0],[0,2],[0,4],[w-1,2],[w-1,4],[1,d-1],[5,d-1]])
    s(x,2,z, 9);                                // glass windows
  for (let x=0; x<w; x++) for (let z=0; z<d; z++) s(x,4,z, 8); // plank roof
  return { w,h,d, voxels:v, name:'Small House' };
}

function boulder() {
  const [w,h,d] = [5,3,5];
  const v = mkGrid(w,h,d);
  for (let y=0; y<h; y++) for (let x=0; x<w; x++) for (let z=0; z<d; z++)
    if (Math.hypot(x-2, y*1.5-1, z-2) < 2.2) setV(v,w,h,d,x,y,z, 3);
  return { w,h,d, voxels:v, name:'Boulder' };
}

function mushroom() {
  const [w,h,d] = [7,6,7];
  const v = mkGrid(w,h,d);
  const s = (x,y,z,id) => setV(v,w,h,d,x,y,z,id);
  for (let y=0; y<3; y++) s(3,y,3, 6);          // stem (wood)
  // cap
  for (let dx=-3; dx<=3; dx++) for (let dz=-3; dz<=3; dz++) {
    if (Math.hypot(dx,dz) <= 3.2) s(3+dx,3,3+dz, 17); // red wool
  }
  for (let dx=-2; dx<=2; dx++) for (let dz=-2; dz<=2; dz++) {
    if (Math.hypot(dx,dz) <= 2.2) s(3+dx,4,3+dz, 17);
  }
  return { w,h,d, voxels:v, name:'Giant Mushroom' };
}

export const PRESETS = [
  { id:'oak_tree',    label:'🌳 Oak Tree',         fn: oakTree    },
  { id:'birch_tree',  label:'🌿 Birch Tree',        fn: birchTree  },
  { id:'tall_tree',   label:'🌲 Spruce Tree',       fn: tallTree   },
  { id:'small_house', label:'🏠 Small House',       fn: smallHouse },
  { id:'boulder',     label:'🪨 Boulder',           fn: boulder    },
  { id:'mushroom',    label:'🍄 Giant Mushroom',    fn: mushroom   },
  { id:'empty_3x3x3', label:'📦 Empty  3×3×3',     fn: ()=>({ w:3,h:3,d:3, voxels:mkGrid(3,3,3), name:'Custom' }) },
  { id:'empty_5x8x5', label:'📦 Empty  5×8×5',     fn: ()=>({ w:5,h:8,d:5, voxels:mkGrid(5,8,5), name:'Custom' }) },
  { id:'empty_9x9x9', label:'📦 Empty  9×9×9',     fn: ()=>({ w:9,h:9,d:9, voxels:mkGrid(9,9,9), name:'Custom' }) },
];

// ── VoxelStudio class ──────────────────────────────────────────────────────────
export class VoxelStudio {
  constructor(canvas) {
    this.canvas      = canvas;
    this.grid        = null;
    this.selectedId  = 6;         // wood_log by default
    this.tool        = 'paint';   // 'paint' | 'erase'
    this._meshes     = new Map(); // key → Mesh
    this._matCache   = new Map(); // id → Material
    this._raycaster  = new THREE.Raycaster();
    this._pointer    = new THREE.Vector2(-9, -9);
    this._dragStart  = null;
    this._dragged    = false;

    this._initThree();
    this._bindEvents();
    this._loop();
    this.loadPreset('oak_tree');
  }

  // ── Three.js setup ───────────────────────────────────────────────────
  _initThree() {
    const W = this.canvas.clientWidth  || 600;
    const H = this.canvas.clientHeight || 480;

    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(W, H);
    this.renderer.setClearColor(0x12122a, 1);

    this.scene  = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(50, W / H, 0.1, 200);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping    = true;
    this.controls.dampingFactor    = 0.12;
    this.controls.minDistance      = 2;
    this.controls.maxDistance      = 80;
    this.controls.mouseButtons     = { LEFT: null, MIDDLE: THREE.MOUSE.ROTATE, RIGHT: THREE.MOUSE.PAN };

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.65));
    const sun = new THREE.DirectionalLight(0xfff5e0, 1.2);
    sun.position.set(15, 25, 12);
    this.scene.add(sun);

    // Ghost voxel preview
    this._ghost = new THREE.Mesh(
      new THREE.BoxGeometry(1.03, 1.03, 1.03),
      new THREE.MeshBasicMaterial({ color: 0x00ffb3, wireframe: true })
    );
    this._ghost.visible = false;
    this.scene.add(this._ghost);

    // Grid bounding box
    this._bbox = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)),
      new THREE.LineBasicMaterial({ color: 0x2a2a50 })
    );
    this.scene.add(this._bbox);
  }

  // ── Presets & grid management ────────────────────────────────────────
  loadPreset(id) {
    const p = PRESETS.find(p => p.id === id);
    if (p) this.loadGrid(p.fn());
  }

  loadGrid({ w, h, d, voxels, name }) {
    this.grid = { w, h, d, voxels: new Uint8Array(voxels), name: name || 'Custom' };
    const cx = w/2, cy = h/2, cz = d/2;
    this.controls.target.set(cx, cy, cz);
    const far = Math.max(w, h, d) * 1.6 + 6;
    this.camera.position.set(cx + far, cy + far * 0.5, cz + far);
    this._bbox.scale.set(w, h, d);
    this._bbox.position.set(cx, cy, cz);
    this._rebuild();
  }

  resizeGrid(nw, nh, nd) {
    const { w, h, d, voxels, name } = this.grid;
    const nv = mkGrid(nw, nh, nd);
    for (let y=0; y<Math.min(h,nh); y++)
      for (let z=0; z<Math.min(d,nd); z++)
        for (let x=0; x<Math.min(w,nw); x++)
          nv[idx(x,y,z,nw,nd)] = voxels[idx(x,y,z,w,d)];
    this.loadGrid({ w:nw, h:nh, d:nd, voxels:nv, name });
  }

  // ── Voxel operations ─────────────────────────────────────────────────
  _inBounds(x, y, z) { return x>=0&&y>=0&&z>=0&&x<this.grid.w&&y<this.grid.h&&z<this.grid.d; }
  getBlock(x,y,z) { return this._inBounds(x,y,z) ? this.grid.voxels[idx(x,y,z,this.grid.w,this.grid.d)] : -1; }
  setBlock(x, y, z, id) {
    if (!this._inBounds(x, y, z)) return;
    this.grid.voxels[idx(x,y,z,this.grid.w,this.grid.d)] = id;
    clearTimeout(this._rbt);
    this._rbt = setTimeout(() => this._rebuild(), 18);
  }

  // ── Mesh rebuild ──────────────────────────────────────────────────────
  _rebuild() {
    for (const m of this._meshes.values()) { this.scene.remove(m); m.geometry.dispose(); }
    this._meshes.clear();
    const { w, h, d, voxels } = this.grid;
    for (let y=0; y<h; y++) for (let z=0; z<d; z++) for (let x=0; x<w; x++) {
      const id = voxels[idx(x,y,z,w,d)];
      if (!id) continue;
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.97, 0.97, 0.97), this._getMat(id));
      mesh.position.set(x+0.5, y+0.5, z+0.5);
      mesh.userData = { x, y, z };
      this.scene.add(mesh);
      this._meshes.set(`${x},${y},${z}`, mesh);
    }
  }

  _getMat(id) {
    if (this._matCache.has(id)) return this._matCache.get(id);
    const p = PALETTE.find(e => e.id === id);
    const m = new THREE.MeshLambertMaterial({
      color:       p?.color ? new THREE.Color(p.color) : 0x888888,
      transparent: !!p?.alpha,
      opacity:     p?.alpha ?? 1,
    });
    this._matCache.set(id, m);
    return m;
  }

  // ── Input ─────────────────────────────────────────────────────────────
  _bindEvents() {
    const el = this.renderer.domElement;
    el.addEventListener('contextmenu', e => e.preventDefault());

    el.addEventListener('pointermove', e => {
      const r = el.getBoundingClientRect();
      this._pointer.set(
        ((e.clientX - r.left) / r.width)  *  2 - 1,
        ((e.clientY - r.top)  / r.height) * -2 + 1
      );
      if (this._dragStart) {
        const dx = e.clientX - this._dragStart.x, dy = e.clientY - this._dragStart.y;
        if (Math.hypot(dx, dy) > 5) this._dragged = true;
      }
    });

    el.addEventListener('pointerdown', e => {
      if (e.button === 0 || e.button === 2) {
        this._dragStart = { x: e.clientX, y: e.clientY };
        this._dragged = false;
      }
    });

    el.addEventListener('pointerup', e => {
      if (!this._dragged && (e.button === 0 || e.button === 2)) this._doEdit(e);
      this._dragStart = null;
    });

    window.addEventListener('resize', () => this.resize());
  }

  _doEdit(e) {
    this._raycaster.setFromCamera(this._pointer, this.camera);
    const hits = this._raycaster.intersectObjects([...this._meshes.values()]);
    if (!hits.length) return;
    const hit  = hits[0];
    const norm = hit.face.normal.clone().round();
    const { x, y, z } = hit.object.userData;
    if (e.button === 2 || this.tool === 'erase') {
      this.setBlock(x, y, z, 0);
    } else {
      this.setBlock(x + norm.x, y + norm.y, z + norm.z, this.selectedId);
    }
  }

  _updateGhost() {
    this._raycaster.setFromCamera(this._pointer, this.camera);
    const hits = this._raycaster.intersectObjects([...this._meshes.values()]);
    if (!hits.length) { this._ghost.visible = false; return; }
    const hit  = hits[0];
    const norm = hit.face.normal.clone().round();
    const { x, y, z } = hit.object.userData;
    if (this.tool === 'erase') {
      this._ghost.position.set(x+0.5, y+0.5, z+0.5);
      this._ghost.material.color.set(0xff4444);
    } else {
      const tx = x+norm.x, ty = y+norm.y, tz = z+norm.z;
      if (!this._inBounds(tx,ty,tz)) { this._ghost.visible = false; return; }
      this._ghost.position.set(tx+0.5, ty+0.5, tz+0.5);
      const p = PALETTE.find(e => e.id === this.selectedId);
      this._ghost.material.color.set(p?.color || '#ffffff');
    }
    this._ghost.visible = true;
  }

  _loop() {
    requestAnimationFrame(() => this._loop());
    this._updateGhost();
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  resize() {
    const W = this.canvas.clientWidth || 600, H = this.canvas.clientHeight || 480;
    this.camera.aspect = W / H;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(W, H);
  }

  // ── Export ────────────────────────────────────────────────────────────
  exportJSON() {
    const { w, h, d, voxels, name } = this.grid;
    const blocks = [];
    for (let y=0; y<h; y++) for (let z=0; z<d; z++) for (let x=0; x<w; x++) {
      const id = voxels[idx(x,y,z,w,d)];
      if (id) blocks.push({ x, y, z, block: PALETTE.find(p=>p.id===id)?.name || 'unknown' });
    }
    return JSON.stringify({ name, width:w, height:h, depth:d, voxelCount:blocks.length, blocks }, null, 2);
  }

  get voxelCount() { return this.grid ? this.grid.voxels.filter(v=>v>0).length : 0; }
}
