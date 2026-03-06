import * as THREE from 'three';
import { TRANSPARENT, getBlockColor, hexToRgb } from './blockColors.js';

const CHUNK_SIZE   = 16;
const CHUNK_HEIGHT = 64;

// Face definitions: [normalDir index, normal vec, 4 corner offsets, AO neighbor dirs]
// faceDir: 0=+Y(top), 1=-Y(bot), 2=+X, 3=-X, 4=+Z, 5=-Z
const FACES = [
  { dir:[ 0, 1, 0], face:0, verts:[[0,1,0],[1,1,0],[1,1,1],[0,1,1]], side1:[1,0,0], side2:[0,0,1] },
  { dir:[ 0,-1, 0], face:1, verts:[[0,0,1],[1,0,1],[1,0,0],[0,0,0]], side1:[1,0,0], side2:[0,0,1] },
  { dir:[ 1, 0, 0], face:2, verts:[[1,0,0],[1,1,0],[1,1,1],[1,0,1]], side1:[0,1,0], side2:[0,0,1] },
  { dir:[-1, 0, 0], face:3, verts:[[0,0,1],[0,1,1],[0,1,0],[0,0,0]], side1:[0,1,0], side2:[0,0,1] },
  { dir:[ 0, 0, 1], face:4, verts:[[1,0,1],[1,1,1],[0,1,1],[0,0,1]], side1:[1,0,0], side2:[0,1,0] },
  { dir:[ 0, 0,-1], face:5, verts:[[0,0,0],[0,1,0],[1,1,0],[1,0,0]], side1:[1,0,0], side2:[0,1,0] },
];

// Compute voxel ambient occlusion for a vertex
// s1, s2 = side neighbors, corner = diagonal corner
function vertexAO(s1, s2, corner) {
  if (s1 && s2) return 0.0;
  return 1.0 - (s1 + s2 + corner) * 0.25;
}

export class ChunkMesher {
  /**
   * @param {Function} getBlock  (worldX, y, worldZ) → blockId
   */
  constructor(getBlock) {
    this.getBlock = getBlock;
  }

  build(cx, cz) {
    const positions = [];
    const colors    = [];
    const normals   = [];
    const uvs       = [];
    const indices   = [];
    let   vi        = 0; // vertex index counter

    const get = (x, y, z) => this.getBlock(x, y, z);
    const isSolid = (x, y, z) => !TRANSPARENT.has(get(x, y, z));

    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        for (let y = 0; y < CHUNK_HEIGHT; y++) {
          const wx = cx * CHUNK_SIZE + lx;
          const wz = cz * CHUNK_SIZE + lz;
          const bt = get(wx, y, wz);
          if (bt === 0) continue;

          for (const f of FACES) {
            const nx = wx + f.dir[0], ny = y + f.dir[1], nz = wz + f.dir[2];
            const nb = get(nx, ny, nz);
            if (!TRANSPARENT.has(nb)) continue; // face hidden

            const baseColor = getBlockColor(bt, f.face);
            const [br, bg, bb] = hexToRgb(baseColor);

            // Ambient occlusion for each of 4 vertices
            const aoValues = f.verts.map(([vx, vy, vz]) => {
              // vertex world position (corner of voxel)
              const vwx = wx + vx, vwy = y + vy, vwz = wz + vz;
              // sample 3 adjacent voxels for AO
              const s1 = isSolid(vwx + f.side1[0], vwy + f.side1[1], vwz + f.side1[2]) ? 1 : 0;
              const s2 = isSolid(vwx + f.side2[0], vwy + f.side2[1], vwz + f.side2[2]) ? 1 : 0;
              const co = isSolid(
                vwx + f.side1[0] + f.side2[0],
                vwy + f.side1[1] + f.side2[1],
                vwz + f.side1[2] + f.side2[2]
              ) ? 1 : 0;
              return vertexAO(s1, s2, co);
            });

            // Add 4 vertices
            for (let vi2 = 0; vi2 < 4; vi2++) {
              const [vx, vy, vz] = f.verts[vi2];
              positions.push(wx + vx, y + vy, wz + vz);
              const ao = aoValues[vi2];
              colors.push(br * ao, bg * ao, bb * ao);
              normals.push(f.dir[0], f.dir[1], f.dir[2]);
              uvs.push(vi2 & 1, (vi2 >> 1) & 1);
            }

            // Two triangles — flip diagonal if AO dictates (avoids dark-stripe artifact)
            if (aoValues[0] + aoValues[3] > aoValues[1] + aoValues[2]) {
              indices.push(vi, vi+1, vi+2, vi, vi+2, vi+3);
            } else {
              indices.push(vi+1, vi+2, vi+3, vi+1, vi+3, vi);
            }
            vi += 4;
          }
        }
      }
    }

    if (vi === 0) return null; // empty chunk — no mesh needed

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('color',    new THREE.Float32BufferAttribute(colors,    3));
    geo.setAttribute('normal',   new THREE.Float32BufferAttribute(normals,   3));
    geo.setAttribute('uv',       new THREE.Float32BufferAttribute(uvs,       2));
    geo.setIndex(indices);
    geo.computeBoundingSphere();

    const mat  = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow    = false;
    mesh.receiveShadow = true;
    return mesh;
  }
}
