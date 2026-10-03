/**
 * NEXARA — altura do chão (relevo). Só a ARENA PRINCIPAL registra uma função; nas outras zonas = 0
 * (nada muda nos modos antigos). Coordenadas em TILES (float); retorno em unidades do mundo.
 */
let fn = null;
export function setGroundFn(f) { fn = typeof f === 'function' ? f : null; }
export function groundAt(fx, fy) { return fn ? fn(fx, fy) : 0; }
export function hasGround() { return !!fn; }
