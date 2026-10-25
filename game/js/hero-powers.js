/**
 * NEXARA 20261024poder — PODERES DO HERÓI DO JOGADOR (kit do personagem escolhido na PARTIDA JUSTA).
 * Os 3 botões de especial (golpe_poderoso · ataque_area · suprema) viram os poderes do herói: mesmos IDs, Nexa e editor.
 * Esquiva / defesa / Investida (dash) não mudam (só a variante VENTO do Guerreiro: investida dupla + mais empurrão).
 * Dano de poder = `dano` do kit (vs rival NV1) → main.hitSpecial({ flatDano }) → applyPlayerHit (escala com o nível, passa
 * pelos modificadores/passivas, XP/loot/quests iguais). VFX = heroShots (projéteis/explosões) + textos; SFX = sfx.js.
 */
import { kitFor, SLOTS } from './hero-kits.js?v=20261025hud';
import { getStat, addModifier, STATS } from './modifiers.js?v=20261025hud';
import { DEG } from './gameplay-config.js?v=20261025hud';
import { wrapAngle } from './collision.js?v=20261025hud';

const KIND = { cone: 'melee', investida: 'melee', giro: 'melee', salto: 'melee', area_self: 'melee', mil_cortes: 'melee', linha: 'area', area_alvo: 'area', portal: 'area' };
export function createHeroPowers(deps) {
  let kit = null; let clock = 0;
  const b = {}; // buffs do herói: dmg/dmgUntil, dragao, imortalUntil, muralhaUntil, posturaUntil, hiddenUntil, iframeUntil, velUntil/vel, curaUntil/cura
  let escudo = 0;
  const st = new Map(); // monstro → status { ven, venDps, que, queDps, lento, lentoMult, vuln, vulnMult, marca, marcaMult, fraco, fracoMult, tick }
  const pend = []; // golpes agendados { at, fn }
  const traps = []; // armadilhas { x, y, r, until, dano, lento, dur, hit:Set }
  const events = []; const EV_CAP = 120;
  const stats = { uses: { golpe_poderoso: 0, ataque_area: 0, suprema: 0 }, hits: 0, dmg: 0, dot: 0, absorbed: 0, reflected: 0, chain: 0, pulled: 0, blinks: 0, dashDouble: 0 };
  let dashSecondUntil = 0; let dashSecondUsed = false;
  const log = (type, d) => { events.push({ t: Math.round(clock), type, ...d }); if (events.length > EV_CAP) events.shift(); };
  const on = (u) => (u || 0) > clock;
  const S = () => deps.getState();
  const mpos = (m) => { const q = deps.getMonsterPos(m); return { x: q.x, y: q.y }; }; // getMonsterPos devolve objeto REUTILIZADO → copia
  const P = () => deps.motion.getPos();
  const active = () => { const s = S(); return !!(kit && s?.brMode && s.fairMatch); };

  /** liga o kit no começo da partida justa (herói + variante) e ajusta a vida base */
  function start(s) {
    reset();
    if (!s?.fairMatch) { kit = null; return null; }
    kit = kitFor(s.player.heroStyle, s.player.heroCustom?.skin) || kitFor('cavaleiro', 'azul');
    s.heroKit = { heroi: kit.heroi, variante: kit.variante };
    s.player.hpMaxBase = kit.hp; s.player.hpMax = Math.max(1, Math.round(getStat(STATS.MAX_HP, kit.hp))); s.player.hp = s.player.hpMax;
    deps.onKit?.(kit);
    return kit;
  }
  function stop() { kit = null; reset(); deps.onKit?.(null); }
  function reset() { for (const k of Object.keys(b)) delete b[k]; escudo = 0; for (const [m] of st) if (m.slowMult) m.slowMult = 1; st.clear(); pend.length = 0; traps.length = 0; dashSecondUntil = 0; dashSecondUsed = false; }

  // —— CONFIG DOS SLOTS (custo/recarga/tempos): objetos estáveis por kit (cache do player-actions) ——
  const cfgCache = new Map();
  function slotCfg(id) {
    if (!active()) return null;
    if (id === 'dash') { if (!kit.var?.kb) return null; const key = kit.heroi + kit.variante + 'dash'; if (!cfgCache.has(key)) cfgCache.set(key, { knockbackScale: 1.0 * kit.var.kb }); return cfgCache.get(key); }
    const p = kit.poderes[id]; if (!p) return null;
    const key = kit.heroi + (kit.variante || '') + id;
    if (!cfgCache.has(key)) cfgCache.set(key, { nome: p.nome, cooldownMs: p.cd, ...(p.instant ? { windupMs: 0 } : {}), ...(p.tipo === 'giro' ? { recoveryMs: 200 } : {}), heroPower: p.id });
    return cfgCache.get(key);
  }

  // —— status em monstros ——
  function stOf(m) { let x = st.get(m); if (!x) { x = { tick: clock + 1000 }; st.set(m, x); } return x; }
  function vulnOf(m) { const x = st.get(m); if (!x) return 0; let v = 0; if (on(x.vuln)) v += x.vulnMult; if (on(x.marca)) v += x.marcaMult; return v; }
  /** monstro enfraquecido (Grito do Guerreiro VENENO): o golpe dele no herói perde fracoMult */
  function weakOf(m) { const x = m && st.get(m); return x && on(x.fraco) ? x.fracoMult : 0; }

  // —— MODIFICADORES (instalados uma vez; neutros sem kit) ——
  addModifier(STATS.DAMAGE, (v, ctx) => {
    if (!active() || !ctx?.mon) return v;
    let m = kit.atk;
    if (on(b.dmgUntil)) m *= 1 + b.dmg;
    const pa = kit.passiva; const mon = ctx.mon;
    if (pa.tipo === 'longe') { const p = P(); const mp = mpos(mon); if (Math.hypot(mp.x - p.x, mp.y - p.y) >= pa.dist) m *= 1 + pa.mult; }
    else if (pa.tipo === 'costas') { if (behind(mon)) m *= 1 + pa.mult; }
    else if (pa.tipo === 'execucao') { if (mon.hp < (mon.hpMax || 1) * pa.abaixo) m *= 1 + pa.mult; }
    else if (pa.tipo === 'furia') { const s = S(); m *= 1 + pa.max * Math.max(0, 1 - s.player.hp / Math.max(1, s.player.hpMax)); }
    m *= 1 + vulnOf(mon);
    return v * m;
  });
  addModifier(STATS.MOVE_SPEED, (v) => (active() ? v * kit.vel * (on(b.velUntil) ? 1 + b.vel : 1) * (on(b.slowUntil) ? 1 - b.slow : 1) : v));
  addModifier(STATS.NEXA_REGEN, (v) => (active() && kit.passiva.tipo === 'nexa_regen' ? v * (1 + kit.passiva.mult) : v));
  addModifier(STATS.DAMAGE_TAKEN, (v) => (active() ? v * kit.dmgTaken : v));
  addModifier(STATS.DRAGON_DAMAGE, (v) => (active() && on(b.dmgUntil) && b.dragao ? v * (1 + b.dragao) : v));

  /** NINJA: "pelas costas" = o alvo não está te encarando (ângulo da frente dele até você > 90°) */
  function behind(mon) {
    const r = deps.getView?.(mon); const p = P(); const mp = mpos(mon);
    if (mon.rival && !deps.rivalTargetsHero?.(mon)) return true; // rival olhando para outro alvo
    if (!r || !Number.isFinite(r.facing)) return false;
    const toHero = Math.atan2(p.x - mp.x, -(p.y - mp.y));
    return Math.abs(wrapAngle(toHero - r.facing)) > 90 * DEG;
  }

  // —— ABSORÇÃO do dano recebido (golpe de monstro/rival e poder de rival) ——
  function absorb(s, dmg, atk, kind = 'melee') {
    if (!active() || dmg <= 0) return 0;
    if (on(b.iframeUntil)) { stats.absorbed += dmg; return dmg; }
    const ranged = kind !== 'melee' || !!deps.isRangedAttacker?.(atk);
    if (on(b.muralhaUntil) && ranged) { stats.absorbed += dmg; log('muralha', { dmg }); fx(P().x, P().y, 1.2, 0xffd23f, 'ring', 300); deps.sfx?.block?.(); return dmg; }
    if (on(b.posturaUntil) && atk) { b.posturaUntil = 0; const back = Math.round(dmg * (kit.poderes.ataque_area.refl || 2)); stats.reflected += back; log('postura', { dmg, back, uid: atk.uid });
      deps.sfx?.perfect?.(); text('POSTURA!', '#ffe14a'); try { deps.hitRaw(atk, back, 'POSTURA'); } catch {} return dmg; }
    let a = 0;
    const w = weakOf(atk); if (w > 0) a += Math.round(dmg * w);
    if (kit.passiva.tipo === 'frontal' && atk) { const p = P(); const mp = mpos(atk); const ang = Math.abs(wrapAngle(Math.atan2(mp.x - p.x, -(mp.y - p.y)) - deps.getYaw())); if (ang <= 70 * DEG) a += Math.round((dmg - a) * kit.passiva.red); }
    if (escudo > 0 && a < dmg) { const e = Math.min(escudo, dmg - a); escudo -= e; a += e; }
    if (on(b.imortalUntil) && s.player.hp - (dmg - a) < 1) a = Math.max(a, dmg - (s.player.hp - 1));
    stats.absorbed += a; return Math.min(dmg, a);
  }

  // —— golpe do herói acertou (básico ou poder) ——
  function onHit(mon, res) {
    if (!active() || !res || !(res.dmgOut > 0)) return;
    if (on(b.hiddenUntil)) { b.hiddenUntil = 0; deps.onHidden?.(false); log('revelado', {}); } // atacar revela
    const s = S(); const pa = kit.passiva;
    if (pa.tipo === 'escudo_acerto') escudo = Math.min(s.player.hpMax * pa.teto, escudo + s.player.hpMax * pa.frac);
    if (!mon?.alive) return;
    const ven = pa.tipo === 'veneno' ? pa : kit.var?.veneno;
    if (ven) { const x = stOf(mon); x.ven = clock + ven.dur; x.venDps = ven.dps; }
    if (kit.var?.queima) { const x = stOf(mon); x.que = clock + kit.var.queima.dur; x.queDps = kit.var.queima.dps; const mp = mpos(mon); fx(mp.x, mp.y, 0.8, 0xff6a1a, 'splash', 450); } // FOGO: chamas no golpe
    if (on(b.curaUntil)) { const h = Math.max(1, Math.round(s.player.hpMax * b.cura)); s.player.hp = Math.min(s.player.hpMax, s.player.hp + h); stats.heal = (stats.heal || 0) + h; }
  }
  /** SAMURAI: bloqueio perfeito recarrega 1 s dos poderes */
  function onParry() { if (active() && kit.passiva.tipo === 'parry_cd') { deps.actions.reduceCooldowns?.(kit.passiva.ms, SLOTS); log('parry_cd', { ms: kit.passiva.ms }); text('MENTE CALMA', '#ffe14a'); } }
  /** VENTO: a Investida pode ser repetida logo em seguida (1 vez) */
  function onDash() {
    if (!active() || !kit.var?.investidaDupla) return;
    if (!dashSecondUsed) { dashSecondUsed = true; dashSecondUntil = clock + 1600; deps.actions.resetCooldown?.('dash'); stats.dashDouble++; log('dash_dupla', {}); text('INVESTIDA DUPLA', '#8affe8'); }
    else { dashSecondUsed = false; dashSecondUntil = 0; }
  }

  // —— helpers de efeito ——
  function fx(x, y, r, color, kind = 'area', ms = 520) { try { deps.heroShots.burst(x, y, r, color, kind, ms); } catch {} }
  function text(t, color) { try { deps.renderer.spawnFloatText?.(t, color, { size: 16, dy: -12 }); } catch {} }
  const colOf = (p) => p.cor ?? (kit.variante ? ({ azul: 0x3a9cff, fogo: 0xff6a1a, raio: 0xffe14a, veneno: 0x7dff3a, terra: 0xd8a040, vento: 0x8affe8 })[kit.variante] : 0xb0c8ff);
  function hit(mon, dano, info = {}) {
    if (!mon?.alive) return null;
    const p = P(); const mp = mpos(mon);
    const res = deps.hitFlat(mon, dano, { fromX: p.x, fromY: p.y, x: mp.x, y: mp.y, heavy: !!info.heavy, knockbackScale: (info.kb ?? 1) * (kit.var?.kb || 1), stunMs: info.stunMs || 0, slot: info.slot, kind: info.kind || 'proj' });
    if (res) { stats.hits++; stats.dmg += res.dmgOut || 0; log('hit', { slot: info.slot, uid: mon.uid, dmg: res.dmgOut || 0, poder: info.poder }); }
    return res;
  }
  function monsNear(x, y, r) { const s = S(); const out = []; for (const m of s.monstersAlive) { if (!m.alive || m.zone !== s.zoneId) continue; const mp = mpos(m); const d = Math.hypot(mp.x - x, mp.y - y); if (d - deps.bodyRadius(m) <= r) out.push({ m, mp, d }); } return out.sort((a, c) => a.d - c.d); }
  /** alvo à frente: travado (no alcance) → menor ângulo dentro do cone (meio ângulo) */
  function pickTarget(api, range, half = 35) {
    const p = P(); let best = null; let bs = Infinity;
    for (const o of monsNear(p.x, p.y, range)) { const ang = o.d > 1e-4 ? Math.abs(wrapAngle(Math.atan2(o.mp.x - p.x, -(o.mp.y - p.y)) - api.yaw)) : 0;
      if (o.m.uid !== api.targetUid && ang > half * DEG && o.d > 0.8) continue; const sc = (o.m.uid === api.targetUid ? -10 : 0) + ang + o.d * 0.05; if (sc < bs) { bs = sc; best = o; } }
    return best;
  }
  function areaCenter(api, alcance) { const p = P(); const t = pickTarget(api, alcance, 60); return t ? { x: t.mp.x, y: t.mp.y, uid: t.m.uid } : { x: p.x + api.dirX * alcance * 0.6, y: p.y + api.dirY * alcance * 0.6, uid: null }; }
  function blinkTo(x, y) { const p = P(); const n = 12; for (let i = n; i >= 1; i--) { const tx = p.x + (x - p.x) * i / n, ty = p.y + (y - p.y) * i / n; if (deps.blink(tx, ty)) { stats.blinks++; return true; } } return false; }

  /** ANTES do golpe: chamado pelo player-actions no impacto do especial. Retorna true se tratou. */
  function resolve(id, api) {
    if (!active()) return false;
    const p0 = kit.poderes[id]; if (!p0) return false;
    stats.uses[id]++; log('poder', { slot: id, poder: p0.id, nome: p0.nome });
    const p = P(); const col = colOf(p0); const kv = kit.var || {};
    const kindOf = KIND[p0.tipo] || 'proj';
    const H = (m, dano, o = {}) => hit(m, dano, { slot: id, poder: p0.id, kind: kindOf, ...o });
    text(p0.nome, '#' + col.toString(16).padStart(6, '0'));
    if (p0.tipo === 'linha' || p0.tipo === 'cone') { // mira assistida: alinha com o inimigo mais à frente (cone de 45°) — mesma ajuda do Golpe Poderoso
      const t = pickTarget(api, p0.alcance, 45); if (t && t.d > 0.3) { const yaw = Math.atan2(t.mp.x - p.x, -(t.mp.y - p.y)); api = { ...api, yaw, dirX: Math.sin(yaw), dirY: -Math.cos(yaw) }; }
    }
    switch (p0.tipo) {
      case 'projetil': {
        const t = pickTarget(api, p0.alcance, 30);
        const fire = (yaw, target) => deps.heroShots.fire({ x: p.x + Math.sin(yaw) * 0.35, y: p.y - Math.cos(yaw) * 0.35, yaw, target, kind: p0.kind, speed: p0.kind === 'arrow' ? 26 : p0.homing ? 13 : 20, range: p0.alcance + 0.6, radius: 0.5, color: col, pierce: p0.pierce || 0, turnDeg: p0.homing ? 900 : undefined,
          onHit: (m) => { const r = H(m, p0.dano, { heavy: true });
            if (r && p0.puxa && m.alive) { const pp = P(); const mp = mpos(m); const dx = mp.x - pp.x, dy = mp.y - pp.y, d = Math.hypot(dx, dy) || 1; if (d > 1.6 && deps.placeMonster(m.uid, pp.x + dx / d * 1.3, pp.y + dy / d * 1.3)) { stats.pulled++; log('puxou', { uid: m.uid }); } }
            if (r && p0.id === 'corte_azul' && kv.corteSalta) chain(m, kv.corteSalta - 1, p0.dano, col); } });
        fire(t ? Math.atan2(t.mp.x - p.x, -(t.mp.y - p.y)) : api.yaw, t ? t.m : null);
        deps.sfx?.special?.('strike'); break; }
      case 'leque': { const t = pickTarget(api, p0.alcance, 30); const yaw0 = t ? Math.atan2(t.mp.x - p.x, -(t.mp.y - p.y)) : api.yaw;
        for (let i = 0; i < p0.n; i++) { const yaw = yaw0 + (i - (p0.n - 1) / 2) * p0.spreadDeg * DEG; deps.heroShots.fire({ x: p.x, y: p.y, yaw, target: null, kind: p0.kind, speed: 22, range: p0.alcance, radius: 0.45, color: col, onHit: (m) => H(m, p0.dano) }); }
        deps.sfx?.special?.('dash'); break; }
      case 'cone': { for (const o of monsNear(p.x, p.y, p0.alcance)) { const ang = Math.abs(wrapAngle(Math.atan2(o.mp.x - p.x, -(o.mp.y - p.y)) - api.yaw)); if (ang <= p0.meioAngulo * DEG || o.d < 0.9) H(o.m, p0.dano, { heavy: true }); }
        fx(p.x + api.dirX * 1.4, p.y + api.dirY * 1.4, 1.3, 0xffe14a, 'spark', 260); deps.sfx?.special?.('strike'); break; }
      case 'linha': { const L = p0.alcance, w = p0.largura / 2;
        for (const o of monsNear(p.x, p.y, L + 1)) { const dx = o.mp.x - p.x, dy = o.mp.y - p.y; const along = dx * api.dirX + dy * api.dirY; const perp = Math.abs(dx * api.dirY - dy * api.dirX); if (along > -0.3 && along <= L && perp <= w + deps.bodyRadius(o.m)) H(o.m, p0.dano, { heavy: true, kb: 1.6 }); }
        for (let d = 1; d <= L; d += 1.3) fx(p.x + api.dirX * d, p.y + api.dirY * d, w + 0.3, col, 'area', 520 + d * 30);
        deps.sfx?.special?.('suprema'); break; }
      case 'area_alvo': { const c = areaCenter(api, p0.alcance); fx(c.x, c.y, p0.raio, col, 'ring', (p0.atrasoMs || p0.durMs || 500));
        if (p0.ticks) { const per = Math.round(p0.dano / p0.ticks); for (let i = 0; i < p0.ticks; i++) pend.push({ at: clock + (i + 1) * (p0.durMs / p0.ticks), fn: () => { fx(c.x, c.y, p0.raio, col, 'area', 400); for (const o of monsNear(c.x, c.y, p0.raio)) H(o.m, per); } }); deps.sfx?.special?.('spin'); }
        else { pend.push({ at: clock + (p0.atrasoMs || 0), fn: () => { fx(c.x, c.y, p0.raio, col, 'area', 900); deps.sfx?.impact?.(true); deps.renderer.shake?.(7); for (const o of monsNear(c.x, c.y, p0.raio)) H(o.m, p0.dano, { heavy: true, kb: 1.8 }); } }); deps.sfx?.charge?.(p0.atrasoMs || 300); }
        break; }
      case 'area_self': { for (const o of monsNear(p.x, p.y, p0.raio)) H(o.m, p0.dano, { heavy: true, stunMs: p0.stunMs, kb: 2 }); fx(p.x, p.y, p0.raio, col, 'area', 800); deps.sfx?.impact?.(true); deps.renderer.shake?.(8); break; }
      case 'giro': { const per = Math.round(p0.dano / p0.ticks); for (let i = 0; i < p0.ticks; i++) pend.push({ at: clock + i * (p0.durMs / p0.ticks), fn: () => { const q = P(); fx(q.x, q.y, p0.raio, col, 'ring', 450); deps.sfx?.special?.('spin'); for (const o of monsNear(q.x, q.y, p0.raio)) H(o.m, per, { kb: 0.6 }); } }); break; }
      case 'salto': { const t = pickTarget(api, p0.alcance, 50); if (t) { const dx = t.mp.x - p.x, dy = t.mp.y - p.y, d = Math.hypot(dx, dy) || 1; blinkTo(t.mp.x - dx / d * 1.1, t.mp.y - dy / d * 1.1); }
        const q = P(); for (const o of monsNear(q.x, q.y, p0.raio)) H(o.m, p0.dano, { heavy: true, stunMs: p0.stunMs, kb: 1.6 }); fx(q.x, q.y, p0.raio, col, 'area', 700); deps.sfx?.impact?.(true); deps.renderer.shake?.(6); break; }
      case 'portal': { const c = areaCenter(api, p0.alcance); fx(c.x, c.y, p0.raio, col, 'ring', p0.atrasoMs + 300);
        for (const o of monsNear(c.x, c.y, p0.raio)) { const dx = o.mp.x - c.x, dy = o.mp.y - c.y, d = Math.hypot(dx, dy) || 1; if (d > 0.8 && deps.placeMonster(o.m.uid, c.x + dx / d * 0.7, c.y + dy / d * 0.7)) stats.pulled++; }
        pend.push({ at: clock + p0.atrasoMs, fn: () => { fx(c.x, c.y, 2.2, col, 'area', 800); deps.sfx?.impact?.(true); for (const o of monsNear(c.x, c.y, 2.2)) H(o.m, p0.dano, { heavy: true }); } }); deps.sfx?.charge?.(p0.atrasoMs); break; }
      case 'mil_cortes': { const ts = monsNear(p.x, p.y, p0.raio).slice(0, p0.alvos); if (!ts.length) { text('SEM ALVO', '#ffffff'); break; }
        const per = Math.round(p0.dano / p0.alvos); b.iframeUntil = clock + p0.alvos * 130 + 200;
        for (let i = 0; i < p0.alvos; i++) { const o = ts[i % ts.length]; pend.push({ at: clock + i * 130, fn: () => { if (!o.m.alive) return; const mp = mpos(o.m); blinkTo(mp.x + 0.6, mp.y + 0.6); fx(mp.x, mp.y, 0.8, col, 'spark', 220); deps.sfx?.special?.('dash'); H(o.m, per); } }); }
        break; }
      case 'investida': { let t = pickTarget(api, p0.dist + 1.2, 35); const tx = t ? t.mp.x - (t.mp.x - p.x) / (t.d || 1) * 0.9 : p.x + api.dirX * p0.dist, ty = t ? t.mp.y - (t.mp.y - p.y) / (t.d || 1) * 0.9 : p.y + api.dirY * p0.dist; blinkTo(tx, ty);
        t = t || pickTarget(api, 1.6, 45); if (t) H(t.m, p0.dano, { heavy: true, stunMs: p0.stunMs, kb: p0.kb }); fx(P().x, P().y, 1.2, 0xffd23f, 'spark', 300); deps.sfx?.special?.('dash'); break; }
      case 'buff': {
        if (p0.dmg) { b.dmg = p0.dmg; b.dmgUntil = clock + p0.dur; b.dragao = p0.dragao || 0; }
        if (p0.imortal) b.imortalUntil = clock + p0.dur;
        if (p0.vel) { b.vel = p0.vel; b.velUntil = clock + p0.dur; }
        if (p0.curaAcerto) { b.cura = p0.curaAcerto; b.curaUntil = clock + p0.dur; }
        fx(p.x, p.y, 1.6, col, 'ring', p0.dur); deps.sfx?.cue?.(p0.imortal ? 'lava' : 'buff');
        if (p0.id === 'grito_guerra' && kv.gritoEnfraquece) { const g = kv.gritoEnfraquece; for (const o of monsNear(p.x, p.y, g.raio)) { const x = stOf(o.m); x.fraco = clock + g.dur; x.fracoMult = g.mult; fx(o.mp.x, o.mp.y, 0.7, 0x7dff3a, 'spark', 500); } log('enfraquece', { n: monsNear(p.x, p.y, g.raio).length }); }
        break; }
      case 'muralha': b.muralhaUntil = clock + p0.dur; fx(p.x, p.y, 1.3, 0xffd23f, 'ring', p0.dur); deps.sfx?.block?.(); break;
      case 'postura': b.posturaUntil = clock + p0.dur; fx(p.x, p.y, 1.0, 0xffe14a, 'ring', p0.dur); deps.sfx?.block?.(); break;
      case 'invisivel': b.hiddenUntil = clock + p0.dur; fx(p.x, p.y, 2.2, 0x8a8a9a, 'splash', 900); deps.sfx?.special?.('spin'); deps.onHidden?.(true); break;
      case 'teleporte': { b.iframeUntil = clock + p0.iframeMs; fx(p.x, p.y, 1, col, 'splash', 400); blinkTo(p.x + api.dirX * p0.dist, p.y + api.dirY * p0.dist); const q = P(); fx(q.x, q.y, 1, col, 'splash', 400); deps.sfx?.perfect?.(); break; }
      case 'salto_tras': { const a = p0.armadilha; traps.push({ x: p.x, y: p.y, r: a.raio, until: clock + 4000, dano: a.dano, lento: a.lento, dur: a.dur, hit: new Set() }); fx(p.x, p.y, a.raio, 0x9fe8ff, 'ring', 4000);
        b.iframeUntil = clock + 250; blinkTo(p.x - api.dirX * p0.dist, p.y - api.dirY * p0.dist); deps.sfx?.special?.('dash'); break; }
      case 'marca': { const t = pickTarget(api, p0.alcance, 45); if (t) { const x = stOf(t.m); x.marca = clock + p0.dur; x.marcaMult = p0.mult; t.m.markedUntil = performance.now() + p0.dur; fx(t.mp.x, t.mp.y, 1, 0xffb020, 'ring', p0.dur); log('marca', { uid: t.m.uid }); } else text('SEM ALVO', '#ffffff'); deps.sfx?.cue?.('mark'); break; }
      case 'maldicao': { const t = pickTarget(api, p0.alcance, 40); if (t) { const r = H(t.m, p0.dano); const x = stOf(t.m); x.lento = clock + p0.dur; x.lentoMult = 1 - p0.lento; x.vuln = clock + p0.dur; x.vulnMult = p0.vuln; fx(t.mp.x, t.mp.y, 1.1, 0x9b4dff, 'ring', p0.dur); log('maldicao', { uid: t.m.uid, ok: !!r }); } deps.sfx?.special?.('spin'); break; }
      case 'dreno': { const t = pickTarget(api, p0.alcance, 45); if (t) { const r = H(t.m, p0.dano); if (r && r.dmgOut > 0) { const s = S(); const h = Math.min(p0.cura, s.player.hpMax - s.player.hp); s.player.hp += h; stats.heal = (stats.heal || 0) + h; log('dreno', { uid: t.m.uid, heal: h }); }
          deps.heroShots.fire({ x: t.mp.x, y: t.mp.y, yaw: Math.atan2(p.x - t.mp.x, -(p.y - t.mp.y)), target: null, kind: 'arcane', speed: 14, range: t.d, radius: 0.1, color: 0x7dff3a, onHit: () => {} }); fx(p.x, p.y, 0.9, 0x7dff3a, 'splash', 500); } deps.sfx?.special?.('spin'); break; }
      default: return false;
    }
    return true;
  }
  /** RAIO: o Corte Azul salta para mais N inimigos (raio visível = projétil-relâmpago entre eles) */
  function chain(from, n, dano, col) {
    let cur = from; const seen = new Set([from.uid]);
    for (let i = 0; i < n; i++) {
      const cp = mpos(cur); const nx = monsNear(cp.x, cp.y, 4.5).find((o) => !seen.has(o.m.uid)); if (!nx) break;
      seen.add(nx.m.uid); deps.heroShots.fire({ x: cp.x, y: cp.y, yaw: Math.atan2(nx.mp.x - cp.x, -(nx.mp.y - cp.y)), target: null, kind: 'bolt', speed: 40, range: nx.d + 0.2, radius: 0.1, color: 0xffe14a, onHit: () => {} });
      fx(nx.mp.x, nx.mp.y, 0.7, 0xffe14a, 'spark', 300); hit(nx.m, dano, { slot: 'golpe_poderoso', poder: 'corte_azul_salto' }); stats.chain++; cur = nx.m;
    }
  }

  /** por quadro (ms de jogo): status/DoT, golpes agendados, armadilhas, fim de buffs */
  function update(dtMs) {
    if (!kit || dtMs <= 0) return;
    clock += dtMs;
    for (let i = pend.length - 1; i >= 0; i--) if (clock >= pend[i].at) { const e = pend.splice(i, 1)[0]; try { e.fn(); } catch (err) { console.warn('[poder]', err); } }
    for (const [m, x] of st) {
      if (!m.alive) { if (m.slowMult) m.slowMult = 1; st.delete(m); continue; }
      m.slowMult = on(x.lento) ? x.lentoMult : 1;
      if (clock >= x.tick) { x.tick = clock + 1000; let dot = 0; let kind = '';
        if (on(x.ven)) { dot += x.venDps; kind = 'veneno'; } if (on(x.que)) { dot += x.queDps; kind = kind ? kind + '+queima' : 'queima'; }
        if (dot > 0) { const mp = mpos(m); fx(mp.x, mp.y, 0.55, kind.startsWith('queima') ? 0xff6a1a : 0x7dff3a, 'spark', 380); deps.dot(m, dot, kind); stats.dot += dot; log('dot', { uid: m.uid, n: dot, kind }); } }
      if (!on(x.ven) && !on(x.que) && !on(x.lento) && !on(x.vuln) && !on(x.marca) && !on(x.fraco)) { m.slowMult = 1; st.delete(m); }
    }
    for (let i = traps.length - 1; i >= 0; i--) { const t = traps[i]; if (clock >= t.until) { traps.splice(i, 1); continue; }
      for (const o of monsNear(t.x, t.y, t.r)) { if (t.hit.has(o.m.uid)) continue; t.hit.add(o.m.uid); const x = stOf(o.m); x.lento = clock + t.dur; x.lentoMult = 1 - t.lento; fx(t.x, t.y, t.r, 0x9fe8ff, 'area', 400); hit(o.m, t.dano, { slot: 'ataque_area', poder: 'armadilha' }); log('armadilha', { uid: o.m.uid }); } }
    if (b.hiddenUntil && !on(b.hiddenUntil)) { b.hiddenUntil = 0; deps.onHidden?.(false); }
    if (dashSecondUntil && clock > dashSecondUntil) { dashSecondUntil = 0; dashSecondUsed = false; }
  }
  /** status de PODER de rival no herói: lentidão (Maldição / armadilha) — atordoar fica de fora (o herói nunca perde o controle por bot) */
  function statusFromRival(x) { if (!active() || !x) return; if (x.lento) { b.slow = Math.min(0.6, x.lento); b.slowUntil = clock + (x.dur || 2000); log('lento_heroi', { lento: b.slow, dur: x.dur || 2000 }); } }
  function view() {
    return { kit: kit ? { heroi: kit.heroi, variante: kit.variante, hp: kit.hp, vel: kit.vel, atk: kit.atk, dmgTaken: kit.dmgTaken, passiva: kit.passiva.tipo } : null,
      buffs: Object.fromEntries(Object.entries(b).filter(([k, v]) => !k.endsWith('Until') || v > clock).map(([k, v]) => [k, k.endsWith('Until') ? Math.round(v - clock) : v])),
      escudo: Math.round(escudo), hidden: on(b.hiddenUntil), status: [...st].map(([m, x]) => ({ uid: m.uid, ven: on(x.ven), que: on(x.que), lento: on(x.lento) ? x.lentoMult : 0, vuln: on(x.vuln), marca: on(x.marca), fraco: on(x.fraco), slowMult: m.slowMult })),
      traps: traps.length, pend: pend.length, stats: { ...stats, uses: { ...stats.uses } }, clock: Math.round(clock) };
  }
  return { start, stop, active, kit: () => (active() ? kit : null), slotCfg, resolve, absorb, onHit, onParry, onDash, update, hidden: () => active() && on(b.hiddenUntil), weakOf,
    view, statusFromRival, events: () => events.slice(), clearEvents: () => { events.length = 0; } };
}
