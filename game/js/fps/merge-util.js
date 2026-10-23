/**
 * NEXARA — EVO: mescla partes ESTÁTICAS de um personagem procedural (menos draw calls).
 *
 * Regra: cada Mesh é "ancorado" no ancestral animado mais próximo (um nó em `keep`, ou a raiz).
 * Meshes do mesmo material sob a mesma âncora viram UM Mesh (geometria com a transformação
 * relativa à âncora já aplicada). Nós em `keep` (pivôs animados, sprites, barras, VFX que
 * piscam/escalam) nunca são mesclados nem removidos — seus filhos estáticos são mesclados
 * dentro deles. InstancedMesh é expandido (cada instância vira geometria).
 * Só position/normal(/uv se todos tiverem) — suficiente para MeshStandard/Basic sem textura.
 */
import * as THREE from 'three';

const _m = new THREE.Matrix4();
const _inv = new THREE.Matrix4();
const _im = new THREE.Matrix4();

function mergeGeos(list, cols = null) {
  const useUv = list.every((g) => !!g.attributes.uv);
  let vCount = 0;
  let iCount = 0;
  for (const g of list) {
    vCount += g.attributes.position.count;
    iCount += g.index ? g.index.count : g.attributes.position.count;
  }
  const pos = new Float32Array(vCount * 3);
  const nor = new Float32Array(vCount * 3);
  const uv = useUv ? new Float32Array(vCount * 2) : null;
  const col = cols ? new Float32Array(vCount * 3) : null;
  let gi = 0;
  const idx = vCount > 65535 ? new Uint32Array(iCount) : new Uint16Array(iCount);
  let vo = 0;
  let io = 0;
  for (const g of list) {
    const p = g.attributes.position;
    const n = g.attributes.normal;
    pos.set(p.array.length === p.count * 3 ? p.array : Float32Array.from({ length: p.count * 3 }, (_, i) => p.getComponent(Math.floor(i / 3), i % 3)), vo * 3);
    if (n) nor.set(n.array, vo * 3);
    if (uv) uv.set(g.attributes.uv.array, vo * 2);
    if (col) { const c = cols[gi]; for (let i = 0; i < p.count; i++) { col[(vo + i) * 3] = c.r; col[(vo + i) * 3 + 1] = c.g; col[(vo + i) * 3 + 2] = c.b; } }
    gi++;
    if (g.index) {
      const a = g.index.array;
      for (let i = 0; i < a.length; i++) idx[io + i] = a[i] + vo;
      io += a.length;
    } else {
      for (let i = 0; i < p.count; i++) idx[io + i] = vo + i;
      io += p.count;
    }
    vo += p.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  if (uv) out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  if (col) out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  out.computeBoundingSphere();
  return out;
}

/**
 * @param {THREE.Object3D} root
 * @param {Iterable<THREE.Object3D>} keepList nós animados/variáveis (preservados)
 * @returns {{ before:number, after:number }}
 */
/** META-69: materiais "irmãos" (mesmo tipo/rugosidade/metal/emissivo, sem textura, opacos) só mudam a COR → podem virar
 *  UM material com cor por vértice. Assinatura sem a cor; null = não mesclável por cor. */
function colorSig(m) {
  if (!m || m.map || m.emissiveMap || m.normalMap || m.alphaMap || m.aoMap || m.roughnessMap || m.metalnessMap || m.vertexColors || m.transparent || m.opacity < 1 || m.onBeforeCompile?.toString().length > 30) return null;
  if (m.type === 'MeshStandardMaterial') return `S|${m.roughness}|${m.metalness}|${m.emissive.getHex()}|${m.emissiveIntensity}|${m.flatShading}|${m.side}|${m.fog}|${m.toneMapped}|${m.envMapIntensity}|${m.wireframe}`;
  if (m.type === 'MeshBasicMaterial') return `B|${m.side}|${m.fog}|${m.toneMapped}|${m.wireframe}`;
  return null;
}
/**
 * @param {object} [opts] { colorMerge: bool — junta materiais que só diferem na cor (cor por vértice); exclude: materiais que mudam em jogo
 *   e precisam continuar únicos } → retorno inclui matMap (material antigo → material mesclado), para quem pisca/atualiza materiais.
 */
export function mergeStaticParts(root, keepList = [], opts = {}) {
  const keep = new Set(keepList);
  const exclude = new Set(opts.exclude || []);
  const matMap = new Map();
  keep.add(root);
  root.updateMatrixWorld(true);
  let before = 0;
  const buckets = new Map(); // anchor → Map(material → [{mesh, geo}])
  const toRemove = [];
  root.traverse((o) => {
    if (!o.isMesh) return;
    before++;
    if (keep.has(o) || Array.isArray(o.material) || o.userData.noMerge || o.isSkinnedMesh || !o.visible) return;
    // âncora = ancestral mais próximo em keep; se algum ancestral intermediário estiver em keep, ele é a âncora
    let a = o.parent;
    while (a && !keep.has(a)) a = a.parent;
    if (!a) return;
    // filhos de mesh também não são mesclados (o mesh pode ser pivô de algo)
    if (o.children.length) return;
    _inv.copy(a.matrixWorld).invert();
    const geos = [];
    if (o.isInstancedMesh) {
      for (let i = 0; i < o.count; i++) {
        o.getMatrixAt(i, _im);
        _m.multiplyMatrices(_inv, o.matrixWorld).multiply(_im);
        geos.push(o.geometry.clone().applyMatrix4(_m));
      }
    } else {
      _m.multiplyMatrices(_inv, o.matrixWorld);
      geos.push(o.geometry.clone().applyMatrix4(_m));
    }
    let byMat = buckets.get(a);
    if (!byMat) { byMat = new Map(); buckets.set(a, byMat); }
    const sig = opts.colorMerge && !exclude.has(o.material) ? colorSig(o.material) : null;
    const bkey = sig ? `${sig}|${o.renderOrder}|${o.castShadow}|${o.receiveShadow}` : o.material;
    let arr = byMat.get(bkey);
    if (!arr) { arr = { geos: [], meshes: [], cols: sig ? [] : null, mats: new Set(), mat: o.material, renderOrder: o.renderOrder, cast: o.castShadow, recv: o.receiveShadow }; byMat.set(bkey, arr); }
    arr.mats.add(o.material);
    if (arr.cols) for (let i = 0; i < geos.length; i++) arr.cols.push(o.material.color);
    arr.geos.push(...geos);
    arr.meshes.push(o);
  });
  for (const [anchor, byMat] of buckets) {
    for (const [, b] of byMat) {
      if (b.meshes.length < 2 && !b.meshes[0].isInstancedMesh) { b.geos.forEach((g) => g.dispose()); continue; }
      const multi = b.cols && b.mats.size > 1;
      const geo = mergeGeos(b.geos, multi ? b.cols : null);
      b.geos.forEach((g) => g.dispose());
      let mat = b.mat;
      if (multi) { mat = b.mat.clone(); mat.color.setRGB(1, 1, 1); mat.vertexColors = true; mat.name = 'merged-vc'; mat.userData = { ...b.mat.userData, mergedFrom: b.mats.size }; for (const m of b.mats) matMap.set(m, mat); }
      const mm = new THREE.Mesh(geo, mat);
      mm.name = 'merged';
      mm.renderOrder = b.renderOrder;
      mm.castShadow = b.cast;
      mm.receiveShadow = b.recv;
      anchor.add(mm);
      for (const m of b.meshes) toRemove.push(m);
    }
  }
  for (const m of toRemove) {
    m.parent?.remove(m);
    if (!m.geometry.userData?.shared) m.geometry.dispose();
  }
  // remove grupos vazios que não são âncoras
  const empties = [];
  root.traverse((o) => { if (o !== root && !keep.has(o) && o.type === 'Group' && !o.children.length) empties.push(o); });
  for (const e of empties) e.parent?.remove(e);
  let after = 0;
  root.traverse((o) => { if (o.isMesh) after++; });
  return { before, after, matMap, vcMats: new Set(matMap.values()).size };
}

/** Conta meshes visíveis (≈ draw calls) de um nó. */
export function countMeshes(root) {
  let n = 0;
  root.traverse((o) => { if (o.isMesh || o.isSprite || o.isPoints) n++; });
  return n;
}
