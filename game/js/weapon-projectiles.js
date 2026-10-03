/**
 * NEXARA — projéteis REAIS do herói (ARCO: flecha · CAJADO: raio de energia) + explosões de área no alvo.
 *
 * - Voa no relógio do jogo (dtSec do loop; pausa/hit-stop congelam junto), com mira assistida: segue o
 *   inimigo escolhido no disparo (homing limitado por giro máx.), colide com QUALQUER inimigo no caminho.
 * - Parede (sem linha de visão) encerra o projétil. Alcance máximo por arma (data/arsenal.json → armas).
 * - O dano sai pelo MESMO caminho do golpe (applyPlayerHit → applyDamageToMonster: XP/loot/quests/MCB).
 * - Arrays exportados (heroProjectiles/heroBursts) são lidos pelo fps-renderer (InstancedMesh, cor da família).
 */
import { hasLineOfSight } from './collision.js?v=20261003m10g';

export const heroProjectiles = [];
export const heroBursts = [];
const MAX_PROJ = 24;
const MAX_BURST = 12;
const stats = { fired: 0, hits: 0, expired: 0, walls: 0, splashHits: 0, bursts: 0, byKind: {} };
const recent = [];
let fxClock = 0;
/** Relógio de jogo dos efeitos (ms) — o renderer usa para a idade das áreas. */
export const heroFxNow = () => fxClock;

/**
 * @param {{ getState:()=>object, getZone:(s:object)=>object, getMonsterPos:(m:object)=>{x:number,y:number}, bodyRadius:(m:object)=>number }} deps
 */
export function createWeaponProjectiles(deps) {
  let clock = 0;
  let seq = 0;

  /**
   * @param {{ x:number, y:number, yaw:number, target?:object|null, kind:'arrow'|'bolt'|'charged'|'arcane', speed:number,
   *   range:number, radius?:number, turnDeg?:number, color:number, family?:string|null,
   *   onHit:(mon:object, p:object)=>void, splash?:{ radius:number, onSplash:(mon:object, p:object)=>void }|null, pierce?:number }} o
   */
  function fire(o) {
    if (heroProjectiles.length >= MAX_PROJ) heroProjectiles.shift();
    const p = {
      id: ++seq, x: o.x, y: o.y, sx: o.x, sy: o.y, yaw: o.yaw, vx: Math.sin(o.yaw), vy: -Math.cos(o.yaw),
      targetUid: o.target?.uid ?? null, kind: o.kind, speed: o.speed, range: o.range, radius: o.radius ?? 0.3,
      turn: (o.turnDeg ?? 540) * Math.PI / 180, color: o.color, family: o.family || null, alive: true, born: clock,
      traveled: 0, onHit: o.onHit, splash: o.splash || null, pierce: o.pierce || 0, hitUids: new Set()
    };
    // aponta direto para o alvo travado/escolhido (mira assistida) — o giro limitado corrige o resto
    if (o.target) {
      const tp = deps.getMonsterPos(o.target);
      const a = Math.atan2(tp.x - o.x, -(tp.y - o.y));
      p.yaw = a; p.vx = Math.sin(a); p.vy = -Math.cos(a);
    }
    heroProjectiles.push(p);
    stats.fired++;
    stats.byKind[o.kind] = (stats.byKind[o.kind] || 0) + 1;
    return p;
  }

  /** Explosão/área visível no ponto (raio em tiles) — só visual; o dano é aplicado por quem chama. */
  function burst(x, y, radius, color, kind = 'ring', ms = 520) {
    if (heroBursts.length >= MAX_BURST) heroBursts.shift();
    heroBursts.push({ x, y, r: radius, color, kind, born: clock, until: clock + ms, alive: true });
    stats.bursts++;
  }

  function impact(p, mon, state) {
    stats.hits++;
    p.hitUids.add(mon.uid);
    try { p.onHit(mon, p); } catch (e) { console.warn('[proj] hit', e); }
    if (p.splash && state) {
      const R = p.splash.radius;
      burst(p.x, p.y, R, p.color, 'splash', 420);
      for (const m of state.monstersAlive) {
        if (!m.alive || m.zone !== state.zoneId || p.hitUids.has(m.uid)) continue;
        const mp = deps.getMonsterPos(m);
        if (Math.hypot(mp.x - p.x, mp.y - p.y) - deps.bodyRadius(m) <= R) { stats.splashHits++; p.hitUids.add(m.uid); try { p.splash.onSplash(m, p); } catch (e) { console.warn('[proj] splash', e); } }
      }
    } else burst(p.x, p.y, 0.45, p.color, 'spark', 220);
    recent.push({ id: p.id, kind: p.kind, uid: mon.uid, dist: +Math.hypot(p.x - p.sx, p.y - p.sy).toFixed(2), at: Math.round(clock) });
    if (recent.length > 40) recent.shift();
  }

  /** @param {number} dtSec segundos de jogo (0 = congelado) */
  function update(dtSec) {
    if (dtSec > 0) clock += dtSec * 1000;
    fxClock = clock;
    for (let i = heroBursts.length - 1; i >= 0; i--) if (clock >= heroBursts[i].until) heroBursts.splice(i, 1);
    if (!heroProjectiles.length) return;
    const state = deps.getState();
    const zone = state && deps.getZone(state);
    if (!state || !zone || dtSec <= 0) { if (!state) heroProjectiles.length = 0; return; }
    const SUB = 3;
    const h = dtSec / SUB;
    for (let i = heroProjectiles.length - 1; i >= 0; i--) {
      const p = heroProjectiles[i];
      for (let k = 0; k < SUB && p.alive; k++) {
        // mira assistida: gira até turn rad/s na direção do alvo vivo
        if (p.targetUid != null) {
          const t = state.monstersAlive.find((m) => m.uid === p.targetUid);
          if (t && t.alive && t.zone === state.zoneId) {
            const tp = deps.getMonsterPos(t);
            const want = Math.atan2(tp.x - p.x, -(tp.y - p.y));
            let d = want - p.yaw; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
            const mx = p.turn * h;
            p.yaw += Math.max(-mx, Math.min(mx, d));
            p.vx = Math.sin(p.yaw); p.vy = -Math.cos(p.yaw);
          } else p.targetUid = null;
        }
        const step = p.speed * h;
        const nx = p.x + p.vx * step;
        const ny = p.y + p.vy * step;
        if (!hasLineOfSight(zone, p.x, p.y, nx, ny)) { p.alive = false; stats.walls++; burst(p.x, p.y, 0.4, p.color, 'spark', 200); break; }
        p.x = nx; p.y = ny; p.traveled += step;
        for (const m of state.monstersAlive) {
          if (!m.alive || m.zone !== state.zoneId || p.hitUids.has(m.uid)) continue;
          const mp = deps.getMonsterPos(m);
          if (Math.hypot(mp.x - p.x, mp.y - p.y) <= deps.bodyRadius(m) + p.radius) {
            impact(p, m, state);
            if (p.pierce-- <= 0) { p.alive = false; break; }
          }
        }
        if (p.alive && p.traveled >= p.range) { p.alive = false; stats.expired++; }
      }
      if (!p.alive) heroProjectiles.splice(i, 1);
    }
  }

  function clear() { heroProjectiles.length = 0; heroBursts.length = 0; }
  return {
    fire, burst, update, clear,
    getClock: () => clock,
    stats: () => ({ ...stats, byKind: { ...stats.byKind }, live: heroProjectiles.length, bursts: heroBursts.length, recent: recent.slice(-12) }),
    live: () => heroProjectiles.map((p) => ({ id: p.id, kind: p.kind, x: +p.x.toFixed(2), y: +p.y.toFixed(2), target: p.targetUid, traveled: +p.traveled.toFixed(2) }))
  };
}
