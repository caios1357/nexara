/**
 * ARENA PRINCIPAL — RIVAIS (BOTS offline).
 *
 * Heróis rivais controlados pela IA LOCAL (sem rede, sem backend, não são jogadores online — o rótulo
 * sempre diz "RIVAL (BOT)"). Reaproveitam o monstro/arquétipo 'H' da IA de inimigos para lutar com o
 * herói (golpe em cone, GOLPE GIRATÓRIO, esquiva com i-frames) e uma simulação grossa aqui para:
 *   · explorar (meta = monstro próximo · baú não aberto · ponto dentro da zona) — a "casa" da IA anda;
 *   · lutar com monstros e com outros rivais (dano direto; não dá XP ao jogador);
 *   · saquear baús (o baú fica aberto para todos; o loot vai para a bolsa do rival e cai quando ele cai);
 *   · andar grosso pelo mapa quando longe (IA congelada pelo LOD).
 * No último estágio da zona (ou com 1 rival restante após a zona começar) o mais forte vira
 * CAMPEÃO RIVAL (cartão de entrada + barra de HP). Derrotar todos os rivais → VITÓRIA.
 */
import { getAiView, AI_STATES, placeMonster, resetMonsterRuntime, onMonsterHit, rivalDodge, getMonsterPos, setAttackerBonus } from './enemy-ai.js?v=20261029mapa';
import { xpForLevel, getEquippedStats } from './state.js?v=20261029mapa';
import { getConfig } from './gameplay-config.js?v=20261029mapa';
import { sorteiaPersonagem, PERSONALIDADES } from './personagens.js?v=20261029mapa';
import { planRoster } from './br-roster.js?v=20261029mapa';
import { listPassives } from './passives.js?v=20261029mapa';
import { bbForRivalIndex, newBBState, stepBB, bbAbility } from './dragon-bb.js?v=20261029mapa';
import { kitFor } from './hero-kits.js?v=20261029mapa';
import { newFighter, outMult, mitigate, onHitFx, tick as kitTick, botPower, applyExtra, nucleoUp } from './rival-kits.js?v=20261029mapa';
import { ARCONTE_KIT, isArconte } from './arconte-kit.js?v=20261029mapa'; // 20261025arconte: rival chefe do X1

const ENGAGED = new Set([AI_STATES.DETECT, AI_STATES.CHASE, AI_STATES.ATTACK_PREPARE, AI_STATES.ATTACK, AI_STATES.RECOVERY]);

export function createRivals(ctx) {
  // ctx: st(), br(), cfg(), map(), R(), walk(x,y), nearestFree(x,y), spawnAt(id,x,y,extra), note(kind,info), finish(kind,info),
  //      spawnDrops(x,y,loots,src), rollLootFor(st,tier,opts), credit(n,why), regionAt(x,y)
  // ?rivais=0 desliga os rivais (comparação de desempenho / depuração)
  const URL_OFF = typeof location !== 'undefined' && new URLSearchParams(location.search).get('rivais') === '0';
  // ?rivaisAlvo=0 → comparação A/B: sem a escolha de alvo entre todos os heróis (comportamento anterior: o herói atrai a atenção de todos)
  const URL_NOALVO = typeof location !== 'undefined' && new URLSearchParams(location.search).get('rivaisAlvo') === '0';
  const RC = () => (URL_OFF ? { ativo: false } : URL_NOALVO ? { ...(ctx.cfg().rivais || {}), alvo: null } : ctx.cfg().rivais || {});
  const list = () => ctx.br()?.rivals || [];
  // 20261024apex: 49 rivais → índice uid→monstro por quadro (antes: .find() em monstersAlive a cada consulta = O(rivais² × monstros))
  let mIdx = new Map(); let mArr = null; let mLen = -1; let mClock = NaN;
  const monOf = (rv) => { const st = ctx.st(); if (!st || !rv) return null; const arr = st.monstersAlive; const ck = ctx.br()?.clock;
    if (arr !== mArr || arr.length !== mLen || ck !== mClock) { mIdx.clear(); for (let i = 0; i < arr.length; i++) if (!mIdx.has(arr[i].uid)) mIdx.set(arr[i].uid, arr[i]); mArr = arr; mLen = arr.length; mClock = ck; }
    const m = mIdx.get(rv.uid); return m && m.uid === rv.uid ? m : null; };
  const pos = (m) => { const p = getMonsterPos(m); return p ? { x: p.x, y: p.y } : { x: m.x + 0.5, y: m.y + 0.5 }; };
  const lvl = () => Math.max(1, ctx.st()?.player?.nivel || 1);

  function inZone(x, y, k = 0.9) {
    const z = ctx.br().zone; if (z.phase === 'wait') return true;
    const r = Math.min(z.r, z.toR ?? z.r);
    return Math.hypot(x + 0.5 - z.cx, y + 0.5 - z.cy) <= r * k;
  }
  // NEXARA FAST: nível PRÓPRIO do rival (começa no NV1; sobe com XP de monstros e de rivais derrotados). Mapa completo: nível do herói.
  const fastRules = () => !!RC().nivelProprio;
  const lvlFor = (rv) => (fastRules() ? (rv.ownL || 1) : lvl() + (rv.lvlOff || 0));
  function gainXp(rv, n) {
    if (!fastRules() || !(n > 0)) return;
    rv.xp = (rv.xp || 0) + n * (RC().xpMult ?? 1); rv.xpTotal = (rv.xpTotal || 0) + n;
    while (rv.xp >= xpForLevel(rv.ownL || 1)) { rv.xp -= xpForLevel(rv.ownL || 1); rv.ownL = (rv.ownL || 1) + 1; ctx.note('rival_levelup', { name: rv.name, level: rv.ownL }); rivalPassive(rv); }
  }
  /** 20261024apex PARTIDA JUSTA: o rival também ganha uma PASSIVA a cada nível (mesmo registro data/passives.json do herói),
   *  sorteada entre as que ele ainda não tem — vida máx./dano entram no HP/ataque do rival; anunciada ('rival_passive'). */
  function rivalPassive(rv) {
    if (!RC().justa) return null;
    let pool = []; try { pool = listPassives().filter((d) => !(rv.passivas || []).includes(d.id)); } catch { pool = []; }
    if (!pool.length) return null;
    const d = pool[Math.floor(ctx.R() * pool.length)]; (rv.passivas ||= []).push(d.id);
    for (const e of d.efeitos || []) { if (e.tipo !== 'mult') continue; if (e.stat === 'maxHp') rv.pHp = (rv.pHp || 0) + e.valor; else if (e.stat === 'damage') rv.pAtk = (rv.pAtk || 0) + e.valor; }
    ctx.note('rival_passive', { name: rv.name, level: rv.ownL, passive: d.id, nome: d.nome });
    return d.id;
  }
  const rivalXp = (rv) => Math.round((ctx.st()._monsters[RC().monstro || 'mon_br_rival']?.xp || 60) * (1 + 0.25 * ((rv.level || 1) - 1)));
  function spawn(p) {
    const c = RC(); const br = ctx.br(); if (!c.ativo || br.rivals) return;
    br.rivals = []; br.rivalFinal = false; br.championUid = null; br.rivalsDown = 0;
    const m = ctx.map(); const n = br.x1 ? 1 : Math.max(3, Math.min(c.nMax || 5, c.n || 4)); // X1 ⚔: um rival só // NEXARA FAST: nMax 10
    const pts = m.spawnPoints.filter((q) => !ctx.inCovil(q.x, q.y, q.region) && Math.hypot(q.x - p.x, q.y - p.y) >= (c.distInicialMin || 30));
    const chosen = [];
    for (let k = 0; k < 900 && chosen.length < n && pts.length; k++) { /* 20 rivais: separação vai cedendo (22 → 12 → 6) */
      const q = pts[Math.floor(ctx.R() * pts.length)];
      const minSep = k < 200 ? 22 : k < 500 ? 12 : 6;
      if (chosen.every((o) => Math.hypot(o.x - q.x, o.y - q.y) >= minSep)) chosen.push(q);
    }
    // 20261024apex: 50 jogadores — mapa pequeno (FAST) não tem pontos separados para todos → completa com pontos repetidos deslocados
    for (let k = 0; chosen.length < n && k < 4000 && m.spawnPoints.length; k++) {
      const base = (pts.length ? pts : m.spawnPoints)[Math.floor(ctx.R() * (pts.length || m.spawnPoints.length))];
      const ang = ctx.R() * Math.PI * 2, rr = 2 + ctx.R() * 6; const q0 = ctx.nearestFree ? ctx.nearestFree(Math.round(base.x + Math.cos(ang) * rr), Math.round(base.y + Math.sin(ang) * rr)) : base; const q = q0 ? { ...q0, region: base.region } : null;
      if (!q || !ctx.walk(q.x, q.y) || ctx.inCovil(q.x, q.y, q.region) || Math.hypot(q.x - p.x, q.y - p.y) < Math.min(c.distInicialMin || 30, 14)) continue;
      if (chosen.every((o) => Math.hypot(o.x - q.x, o.y - q.y) >= (k < 2000 ? 4 : 2))) chosen.push(q);
    }
    br.charOff = Math.floor(ctx.R() * 9); // 9 PERSONAGENS: rodízio embaralhado pela semente (todos aparecem)
    // 20261024apex: ELENCO planejado (o LOBBY mostrou exatamente estes) — sem plano (testes antigos), planeja aqui com a semente da partida
    const temPlano = Array.isArray(ctx.cfg().rivais?.plano) && ctx.cfg().rivais.plano.length >= chosen.length; const plano = temPlano ? ctx.cfg().rivais.plano : (c.justa || chosen.length > (c.herois || []).length) ? planRoster({ n: chosen.length, herois: c.herois || [], R: ctx.R, fast: fastRules(), justa: !!c.justa }) : chosen.map((q, i) => c.herois[i % c.herois.length]); // regras antigas (sem plano, ≤ heróis do JSON): elenco e sorteio IGUAIS ao de antes
    if (ctx.cfg().rivais) delete ctx.cfg().rivais.plano; // consumido (a próxima partida planeja de novo)
    br.roster = plano.slice(0, chosen.length); br.rivalSpawns = chosen.map((q) => ({ x: q.x, y: q.y, region: q.region || null, walk: !!ctx.walk(q.x, q.y), covil: !!ctx.inCovil(q.x, q.y, q.region) })); br.heroSpawnAt = { x: p.x, y: p.y };
    chosen.forEach((q, i) => { const h = plano[i]; spawnOne(h, q.x, q.y, i); });
    ctx.note('rivals_spawn', { n: br.rivals.length, names: br.rivals.map((r) => r.name) });
  }
  function spawnOne(h, x, y, idx) {
    const c = RC(); const br = ctx.br(); const st = ctx.st();
    const def = st._monsters[c.monstro || 'mon_br_rival']; if (!def) return null;
    const mon = ctx.spawnAt(def.id, x, y, { enc: 'rival', dbg: true, fresh: true });
    if (!mon) return null;
    const rv = { uid: mon.uid, idx, style: h.style, name: h.nome, primary: h.primary, glow: h.glow, bag: [], mcb: 0, kills: 0, chests: 0,
      goal: null, goalAt: -1e9, nextSwing: 0, nextHurt: 0, swingAt: -1e9, seenAt: -1e9, champion: false, out: false, by: null, path: null, pathI: 0, dodgeReady: 0,
      ownL: 1, xp: 0, xpTotal: 0, rivalKills: 0, killedBy: null };
    { // 9 PERSONAGENS: o bot usa o personagem do ELENCO (lobby) — sem elenco, sorteia um dos 9 + skin elemental + PERSONALIDADE
      const k = h.char ? h : sorteiaPersonagem((idx + (br.charOff || 0)), ctx.R);
      rv.char = k.char; rv.perso = k.perso; rv.persoLabel = k.persoLabel || PERSONALIDADES[k.perso]?.label; rv.skin = k.skin; rv.style = k.char; rv.glow = k.glow;
      rv.lvlOff = 0; /* partida justa: todos no mesmo nível inicial (substitui o 'nível variado' do 1º pedido) */ rv.arma = c.justa ? (h.arma === 'cajado' ? 'cajado' : 'espada') : null; // PARTIDA JUSTA: NV1 + arma básica (espada ou cajado) // nível VARIADO: herói + 0..3 (nunca abaixo do herói → força ≥ jogador)
    }
    mon.rival = { name: h.nome, style: rv.style, char: rv.char, skin: rv.skin, perso: rv.perso, primary: h.primary, glow: rv.glow, champion: false, arma: rv.arma };
    if (fastRules()) rv.ownL = (ctx.st()?.fastZero ? 1 : lvl()) + (rv.lvlOff || 0); // FAST do zero: todos no NV1 · sem 'do zero': começam no nível do herói e sobem por conta própria
    { // 20261009berco: cada herói rival tem seu FILHOTE DE DRAGÃO (BB): cor/elemento próprios + 1 habilidade de apoio (data/dragoes.json)
      const bd = c.bb === false ? null : bbForRivalIndex(ctx.st()._data, idx);
      if (bd) { rv.bb = { def: bd, S: newBBState(1800 + idx * 350, br.clock), at: 0 }; mon.rival.bb = { id: bd.id, nome: bd.nome, cor: bd.cor, tipo: bbAbility(bd)?.tipo || null, wind: false, firedAt: -1e9 }; }
    }
    if (c.justa && kitsOn()) { rv.kit = (isArconte(rv.char) ? ARCONTE_KIT : kitFor(rv.char, rv.skin)) || kitFor('cavaleiro', 'azul'); if (isArconte(rv.char)) { mon.rival.chefe = true; mon.rival.nuc = 0; } rv.fk = newFighter(rv.kit, 100, 1, br.clock || 0, ctx.R); rv.fk.rv = rv; mon.rival.kit = { heroi: rv.kit.heroi, variante: rv.kit.variante }; } // 20261024poder: PODERES do herói do bot
    applyLevel(rv, mon, lvlFor(rv), true);
    mon.walkMult = (c.velocidade || 1.2) * (PERSO(rv).velMult || 1);
    mon.route = { pts: [], i: 0, rival: true };
    br.rivals.push(rv);
    return rv;
  }
  /**
   * RIVAIS FORTES: nível do rival = nível do herói (CAMPEÃO = +2). HP/ataque = base × força (×1,5 / ×1,3) × nível
   * (× multiplicador do campeão). Ao subir de nível no meio da corrida, os rivais acompanham (mantém a % de HP).
   */
  function rivalStats(L, champ, playerL = L) {
    const c = RC(); const F = c.forca || {}; const CP = c.campeao || {}; const def = ctx.st()._monsters[c.monstro || 'mon_br_rival'];
    // M10 passo 4 (medido em e2e-m10-balanco): no NV1 o CAMPEÃO (NV3 ×1,6 HP) tirava 123% do HP mesmo esquivando → o bônus do campeão
    // entra em rampa até o herói chegar ao NV "rampaNivel" (o +2 de nível continua valendo sempre)
    const ramp = Math.min(1, Math.max(0.2, playerL / (CP.rampaNivel ?? 5)));
    const cH = champ ? 1 + ((CP.hpMult ?? 1.6) - 1) * ramp : 1; const cA = champ ? 1 + ((CP.atkMult ?? 1.3) - 1) * ramp : 1;
    // LOTE-b M3 (pedido do Caio: "rivais fracos no meu nível"): medido no NV27 o rival tirava só 30% do HP do herói parado e caía em 12 s
    // (NV10: 64% / 15 s) → CURVA ALTA acima do NV 'aPartirNv' + bônus pelo EQUIPAMENTO do herói (ataque dele → HP do rival, defesa dele → dano do rival)
    const CA = c.curvaAlta || {}; const over = Math.max(0, playerL - (CA.aPartirNv ?? 10));
    const G0 = gearBonus(); const gk = Math.min(1, over / 10); const G = { hp: 1 + (G0.hp - 1) * gk, atk: 1 + (G0.atk - 1) * gk }; // equipamento só pesa acima do NV10 (início igual ao balanço medido)
    const hp = Math.round(def.hp * (F.hpMult ?? 1.5) * (1 + (c.hpPorNivel ?? 0.12) * (L - 1)) * cH * (1 + (CA.hpPorNivel ?? 0) * over) * G.hp);
    const atk = (F.atkMult ?? 1.3) * (1 + (c.atkPorNivel ?? 0.06) * (L - 1)) * cA * (1 + (CA.atkPorNivel ?? 0) * over) * G.atk;
    return { hp, atk, over };
  }
  /** bônus do equipamento do herói (mapa completo; FAST usa o nível próprio do rival e não entra) */
  function gearBonus() {
    const E = RC().curvaAlta?.equip; const st = ctx.st(); if (!E || fastRules() || !st?.equipment) return { hp: 1, atk: 1, sig: '' };
    let g = null; try { g = getEquippedStats(st); } catch { g = null; } if (!g) return { hp: 1, atk: 1, sig: '' };
    return { hp: 1 + Math.min(E.max ?? 0.8, (E.hpPorAtk ?? 0) * g.weaponAtk), atk: 1 + Math.min(E.max ?? 0.8, (E.atkPorDef ?? 0) * g.armorDef), sig: `${g.weaponAtk}|${g.armorDef}` };
  }
  function applyLevel(rv, mon, playerL, full) {
    const champ = !!rv.champion; const L = Math.max(1, playerL + (champ ? (RC().campeao?.nivelExtra ?? 2) : 0));
    const S = rivalStats(L, champ, playerL); const frac = full || !(mon.hpMax > 0) ? 1 : Math.max(0, Math.min(1, mon.hp / mon.hpMax));
    const pH = 1 + (rv.pHp || 0), pA = 1 + (rv.pAtk || 0); // passivas do rival (partida justa)
    // 20261024poder: vida do rival NV1 = vida do HERÓI dele (igual à do jogador com o mesmo herói; antes 260 × 100) — cresce com o nível como antes
    const def0 = ctx.st()._monsters[RC().monstro || 'mon_br_rival']; const base1 = Math.max(1, (def0?.hp || 260) * (RC().forca?.hpMult ?? 1.5));
    rv.eq = rv.kit ? rv.kit.hp / base1 : 1;
    mon.hpMax = Math.round(S.hp * rv.eq * pH); mon.hp = Math.max(1, Math.round(mon.hpMax * frac)); mon.atkScale = S.atk * pA;
    if (rv.fk) { rv.fk.hp = mon.hp; rv.fk.hpMax = mon.hpMax; }
    const T = RC().tatica; if (T) { mon.cdMult = T.cdMult ?? 1; mon.tacSpeed = T.velMult ?? 1; if (T.aggro) mon.aggroR = T.aggro; } // FAST: reação mais rápida, mais agressivos
    else { const CA = RC().curvaAlta || {}; mon.cdMult = Math.max(CA.cdMin ?? 0.75, 1 - (CA.cdPorNivel ?? 0) * S.over); } // LOTE-b M3: NV alto → golpeia com menos espera entre ataques
    rv.gearSig = gearBonus().sig;
    rv.level = L; rv.forPlayerL = playerL; mon.rival.level = L;
    mon.arenaLabel = `${champ ? 'CAMPEÃO RIVAL' : 'RIVAL'} (BOT) NV ${L} · ${rv.name}`;
  }

  /* ── 20261024poder: PODERES DOS BOTS (mesmo código da simulação de equilíbrio: rival-kits.js) ── */
  function kitsOn() { const q = typeof location !== 'undefined' ? location.search : ''; return !/[?&]poderes=0\b/.test(q) && RC().poderes !== false; }
  const PW = () => RC().poderesBot || {};
  /** lutador-espelho do herói do jogador (marca/maldição/veneno dos rivais nele; kit do herói p/ passivas defensivas na conta do rival) */
  function heroF() { const br = ctx.br(); const pl = ctx.st().player; const hf = (br.heroF ||= { hero: true, kit: null, hp: 100, hpMax: 100, s: {}, b: {}, tgt: null, escudo: 0, nextDot: 0 }); hf.hp = pl.hp; hf.hpMax = pl.hpMax || 1; hf.kit = null; return hf; }
  const onT = (u, now) => (u || 0) > now;
  function heroDotTick(now) {
    const hf = ctx.br().heroF; if (!hf || now < hf.nextDot) return; hf.nextDot = now + 1000;
    let d = 0; if (onT(hf.s.venenoUntil, now)) d += hf.s.venenoDps || 0; if (onT(hf.s.queimaUntil, now)) d += hf.s.queimaDps || 0;
    if (d > 0) ctx.powerHitHero?.(d, hf.dotSrc ? monOf(list().find((q) => q.uid === hf.dotSrc)) : null, 'dot', { label: onT(hf.s.queimaUntil, now) ? 'QUEIMA' : 'VENENO' });
  }
  /** golpe (básico ou poder) de rival em rival com kits: passivas/buffs × mitigação do alvo; devolve o dano final (já aplicado o reflexo da Postura) */
  function kitHitRival(rv, mon, orv, om, n, kind, extra, now) {
    const a = rv.fk, d = orv.fk; if (a) { a.hp = mon.hp; a.hpMax = mon.hpMax; } if (d) { d.hp = om.hp; d.hpMax = om.hpMax; }
    const mp = pos(mon), op = pos(om); const dist = Math.hypot(op.x - mp.x, op.y - mp.y);
    let raw = Math.max(1, Math.round(n * (a ? outMult(a, d, now, { dist }) : 1)));
    if (d) d.tgt = d.tgt || null;
    const m = d ? mitigate(d, raw, a, kind, now) : { n: raw, refl: 0 };
    if (m.refl > 0 && a) { const r2 = mitigate(a, m.refl, d, 'melee', now); if (r2.n > 0) damageRival(rv, mon, r2.n, orv.name, !rv.champion || !!ctx.br().spectate, orv); (ctx.br().pwStats ||= newPwStats()).refl++; }
    m.n = Math.round(m.n);
    if (m.n > 0 && a) { const h0 = a.hp; onHitFx(a, d, m.n, now); if (a.hp > h0) mon.hp = Math.min(mon.hpMax, mon.hp + (a.hp - h0)); if (d) applyExtra(d, extra, now); }
    return m.n;
  }
  const newPwStats = () => ({ uses: 0, vsHero: 0, vsRival: 0, dmgHero: 0, dmgRival: 0, refl: 0, bySlot: { golpe_poderoso: 0, ataque_area: 0, suprema: 0 }, byPower: {} });
  /** a cada ~250 ms: DoT/golpes agendados do bot, status (lento/atordoado), multiplicador do golpe no herói e decisão de PODER (botPower) */
  function stepPowers(rv, mon, mp, p, dP, clock) {
    const f = rv.fk; const br = ctx.br(); const P0 = PW(); const st = ctx.st();
    f.hp = mon.hp; f.hpMax = mon.hpMax;
    if (clock < (rv.pwAt || 0)) return; const step = P0.passoMs ?? 250; rv.pwAt = clock + step; // 20261024poder: tudo abaixo a cada 250 ms por rival (49 rivais → custo baixo)
    mon.slowMultR = onT(f.s.lentoUntil, clock) ? 1 - (f.s.lento || 0) : 1;
    const hf = heroF();
    mon.rivalOutMult = outMult(f, hf, clock, { dist: dP }); // golpe básico do rival NO HERÓI (actions.monsterAttackPlayer)
    if (f.kit?.passiva?.tipo === 'nucleos') { // 20261025arconte: golpe básico que acertou o herói também acende 1 Núcleo
      const hpNow = st.player.hp; if (rv.tgt?.kind === 'jogador' && rv.nucHp != null && hpNow < rv.nucHp && dP <= 3.2 && !f.pend.length && clock - (rv.pwLast?.at ?? -1e9) > 400) nucleoUp(f, clock);
      rv.nucHp = hpNow; mon.rival.nuc = f.nuc || 0; mon.rival.eclipseUntil = f.b.eclipseUntil || 0; mon.rival.cicloneUntil = f.b.cicloneUntil || 0; mon.rival.clock = clock; }
    if (br.testCalm?.noPowers) return;
    const out = rv.pwOut || (rv.pwOut = []); out.length = 0; kitTick(f, clock, out);
    for (const e of out) {
      if (e.alvo === f) { if (e.n > 0) damageRival(rv, mon, Math.max(1, Math.round(e.n * (rv.eq || 1))), 'veneno', false); continue; }
      if ((e.zone || e.selfR) && !pendReach(rv, mon, e)) { const S2 = (br.pwStats ||= newPwStats()); (S2.areaMiss ||= {})[e.slotId || '?'] = ((S2.areaMiss[e.slotId || '?']) || 0) + 1; continue; } // 20261025arconte: saiu da área a tempo
      const dlt = deliver(rv, mon, e.alvo, e.n, e.kind, e.extra || null, clock, e.slotId);
      if ((e.zone || e.selfR) && dlt > 0) { const S2 = (br.pwStats ||= newPwStats()); (S2.areaHit ||= {})[e.slotId || '?'] = ((S2.areaHit[e.slotId || '?']) || 0) + 1; }
    }
    if (!mon.alive || onT(f.s.stunUntil, clock)) return;
    // alvo: o do bot (herói só quando ele mira o herói — limite de rivais no herói já vale) ou o rival que ele caça
    let foe = null, dist = 99;
    if (rv.tgt?.kind === 'jogador' && st.player.hp > 0 && !ctx.heroHidden?.()) {
      if (clock >= (br.pwHeroNext || 0) && dP <= 10) { foe = hf; dist = dP; } // teto GLOBAL: um poder de rival no herói a cada pwHeroMs (o herói não vira saco de pancada)
    } else if (rv.tgt?.kind === 'rival' && rivalsCanKill()) {
      const orv = list().find((q) => q.uid === rv.tgt.uid); const om = orv && monOf(orv);
      if (om && om.alive && orv.fk && !onT(orv.fk.b.hiddenUntil, clock)) { const op = pos(om); dist = Math.hypot(op.x - mp.x, op.y - mp.y); if (dist <= 10) foe = orv.fk; }
    }
    if (!foe) return;
    f.tgt = foe;
    const nexa0 = f.nexa; const hp0 = f.hp;
    let usedId = null;
    if (foe === hf && ctx.powerGate && !ctx.powerGate(rv, mon, dist)) return; // X1 ⚔: a IA escolhe a HORA do poder (janela em que o herói gastou esquiva/poder)
    const slot = foe ? botPower(f, foe, dist, clock, { hit: (alvo, n, kind, extra) => { const d = deliver(rv, mon, alvo, n, kind, extra, clock, usedId); return d; }, hide: (ff, ms) => { mon.rivalHiddenUntil = br.clock + ms; }, foePos: () => (foe === hf ? (ctx.getPos?.() || null) : (foe?.rv && monOf(foe.rv) ? pos(monOf(foe.rv)) : null)) }) : null;
    if (f.hp > hp0) mon.hp = Math.min(mon.hpMax, mon.hp + (f.hp - hp0)); // Corrente de Almas / Fera
    if (slot) {
      usedId = f.kit.poderes[slot].id;
      for (const e of f.pend) if (!e.slotId) e.slotId = usedId;
      const S = (br.pwStats ||= newPwStats()); S.uses++; S.bySlot[slot]++; S.byPower[usedId] = (S.byPower[usedId] || 0) + 1; if (foe === hf) { S.vsHero++; br.pwHeroNext = clock + (P0.heroiMs ?? 1500); (S.heroAt ||= []).push(Math.round(clock)); if (S.heroAt.length > 40) S.heroAt.shift(); }
      rv.pwLast = { slot, id: usedId, at: clock, vsHero: foe === hf };
      if (f.kit?.passiva?.tipo === 'nucleos') { mon.rival.eclipseUntil = f.b.eclipseUntil || 0; mon.rival.cicloneUntil = f.b.cicloneUntil || 0; mon.rival.clock = clock; mon.rival.nuc = f.nuc || 0; } // 20261025arconte
      mon.rivalPower = { id: usedId, slot, at: performance.now() };
      if (dP <= (P0.vfxDist ?? 18)) { try { ctx.rivalPowerFx?.(rv, mon, f.kit, slot, foe === hf ? { x: p.x, y: p.y } : (foe?.rv ? pos(monOf(foe.rv)) : null)); } catch {} }
    }
    void nexa0;
  }
  /** 20261025arconte: golpe de área agendado só acerta se o alvo AINDA está na área (Ciclone: em volta do Arconte · Eclipse: no ponto marcado) */
  function pendReach(rv, mon, e) {
    const a = e.alvo; if (!a) return false; let q = null;
    if (a.hero) q = ctx.getPos?.() || null; else { const om = a.rv && monOf(a.rv); q = om ? pos(om) : null; }
    if (!q) return false;
    if (e.selfR) { const mp = pos(mon); return Math.hypot(q.x - mp.x, q.y - mp.y) <= e.selfR; }
    return Math.hypot(q.x - e.zone.x, q.y - e.zone.y) <= e.zone.r + 0.3;
  }
  /** aplica um golpe de PODER do bot no alvo (herói ou outro rival) */
  function deliver(rv, mon, alvo, n, kind, extra, clock, pid) {
    if (!alvo || !(n > 0)) return 0; const br = ctx.br(); const f = rv.fk; const S = (br.pwStats ||= newPwStats());
    if (alvo.hero) {
      if (ctx.heroHidden?.() && kind !== 'area') return 0;
      const mp = pos(mon); const p = ctx.getPos?.() || mp; const dist = Math.hypot(p.x - mp.x, p.y - mp.y);
      if (kind !== 'dot' && dist > 12) return 0; // longe demais (o herói fugiu do alcance)
      const raw = Math.max(1, Math.round(n * outMult(f, alvo, clock, { dist })));
      const dealt = ctx.powerHitHero?.(raw, mon, kind, { label: pid || 'poder', extra }) || 0;
      if (dealt > 0) { S.dmgHero += dealt; const h0 = f.hp; onHitFx(f, alvo, dealt, clock); if (f.hp > h0) mon.hp = Math.min(mon.hpMax, mon.hp + (f.hp - h0)); if (onT(alvo.s.venenoUntil, clock) || onT(alvo.s.queimaUntil, clock)) alvo.dotSrc = rv.uid;
        if (extra) { applyExtra(alvo, { vuln: extra.vuln, dur: extra.dur }, clock); ctx.heroStatus?.(extra); } }
      return dealt;
    }
    const orv = alvo.rv; const om = orv && monOf(orv); if (!om || !om.alive || orv.out || !rivalsCanKill()) return 0;
    const dealt = kitHitRival(rv, mon, orv, om, n * (orv.eq || 1), kind, extra, clock);
    if (dealt > 0) { orv.lastAttacker = rv.uid; orv.lastAttackedAt = clock; S.dmgRival += dealt; damageRival(orv, om, dealt, rv.name, !orv.champion || !!br.spectate, rv); S.vsRival++;
      if (extra?.stunMs) { try { onMonsterHit(om, { fromX: pos(mon).x, fromY: pos(mon).y, forceStunMs: extra.stunMs, knockbackScale: 0.8, fromRival: true }); } catch {} } }
    if (extra?.salta > 1) { const op = pos(om); let k = extra.salta - 1; for (const o of list()) { if (k <= 0) break; if (o === rv || o === orv || o.out || !o.fk) continue; const m2 = monOf(o); if (!m2 || !m2.alive) continue; const q = pos(m2); if (Math.hypot(q.x - op.x, q.y - op.y) > 4.5) continue; k--; const d2 = kitHitRival(rv, mon, o, m2, n * (o.eq || 1), kind, null, clock); if (d2 > 0) damageRival(o, m2, d2, rv.name, !o.champion || !!br.spectate, rv); } }
    return dealt;
  }
  /** golpe do HERÓI num rival com kit: Muralha/Postura/Terra/Escudo/Fúria do bot (gancho do actions.applyDamageToMonster) */
  function mitigateFromHero(mon, dmg, opts = {}) {
    const rv = list().find((q) => q.uid === mon.uid); if (!rv?.fk || opts.kind === 'dot' || (opts.source && opts.source !== 'player')) return dmg;
    const br = ctx.br(); const clock = br.clock; const f = rv.fk; f.hp = mon.hp; f.hpMax = mon.hpMax; const hf = heroF();
    const m = mitigate(f, dmg, hf, opts.kind || 'melee', clock);
    if (m.refl > 0) { (br.pwStats ||= newPwStats()).refl++; ctx.powerHitHero?.(m.refl, mon, 'melee', { label: 'POSTURA' }); }
    if (m.why) mon.rivalMitigated = { why: m.why, at: performance.now() };
    return m.n;
  }
  function powersView() {
    const br = ctx.br(); if (!br?.rivals) return null;
    return { stats: br.pwStats ? JSON.parse(JSON.stringify(br.pwStats)) : newPwStats(), heroF: br.heroF ? { s: { ...br.heroF.s } } : null,
      list: br.rivals.filter((rv) => rv.fk).map((rv) => { const m = monOf(rv); return { uid: rv.uid, char: rv.char, skin: rv.skin, kit: rv.kit.heroi + (rv.kit.variante ? ':' + rv.kit.variante : ''), hp: m?.hp ?? 0, hpMax: m?.hpMax ?? 0, kitHp: rv.kit.hp, nexa: +rv.fk.nexa.toFixed(1), uses: { ...rv.fk.uses }, last: rv.pwLast || null, out: !!rv.out }; }) };
  }
  function PERSO(rv) { return PERSONALIDADES[rv?.perso] || PERSONALIDADES.equilibrado; }
  function aliveRivals() { return list().filter((rv) => { const m = monOf(rv); return m && m.alive && !rv.out; }); }

  /** meta do rival: monstro perto → baú não aberto → ponto dentro da zona (final: o herói) */
  function pickGoal(rv, mon, mp, p) {
    const br = ctx.br(); const st = ctx.st(); const m = ctx.map();
    { // PERSONALIDADE: CAUTELOSO/OPORTUNISTA/CAÇADOR ferido abaixo de recuaFrac → RECUA para longe de quem bateu (dentro da zona) por ~6 s
      const P = PERSO(rv); const rt = retreatGoal(rv, mon, mp, P); if (rt) return rt;
    }
    if (br.rivalFinal && (!RC().finalLivre || rv.champion || rv.tgt?.kind === 'jogador')) return { kind: 'heroi', x: Math.floor(p.x), y: Math.floor(p.y) }; // 20261017perf: com finalLivre só o CAMPEÃO (ou quem escolheu o herói) caça o herói na reta final; os demais seguem brigando entre si
    { const g = giantGoal(rv, mp); if (g) return g; } // 20261016abrigos: rivais também caçam GIGANTES (sela) — competem com o herói
    // 20261010ajustes: ÚLTIMA CORRIDA — zona final e morte súbita há > 60 s: todos caçam o rival mais próximo (e reaparecem colados nele se não houver caminho) → a partida sempre chega ao confronto final
    if (br.suddenSince && br.clock - br.suddenSince > 60000) { let bo = null, bd = 1e9; for (const o of st.monstersAlive) { if (!o.alive || o === mon || !o.rival) continue; const d = Math.hypot(o.x - mp.x, o.y - mp.y); if (d < bd) { bd = d; bo = o; } } if (bo) return { kind: 'rival', uid: bo.uid, x: bo.x, y: bo.y }; }
    // outro rival por perto (≤ 16 tiles) → caça o rival (a zona aproxima todos; eles se eliminam no caminho)
    // 20261009berco: XP vem de MONSTROS também — monstro colado (≤ 12 tiles) vence um rival distante (> 8 tiles); rival próximo continua prioridade
    let nm = null, nd = RC().monstroPertoDist ?? 18;
    for (const o of st.monstersAlive) { if (!o.alive || o === mon || !o.br || o.boss || o.rival) continue; const d = Math.hypot(o.x + 0.5 - mp.x, o.y + 0.5 - mp.y); if (d < nd && inZone(o.x, o.y)) { nd = d; nm = o; } }
    const rivalFar = (om) => !om || Math.hypot(om.x + 0.5 - mp.x, om.y + 0.5 - mp.y) > (RC().rivalPertoDist ?? 5);
    if (nm && rivalFar(rv.tgt?.kind === 'rival' ? monOf(list().find((q) => q.uid === rv.tgt.uid)) : (list().filter((o) => o !== rv && !o.out).map(monOf).filter((q) => q && q.alive).sort((x, y) => Math.hypot(x.x - mp.x, x.y - mp.y) - Math.hypot(y.x - mp.x, y.y - mp.y))[0]))) return { kind: 'monstro', uid: nm.uid, x: nm.x, y: nm.y };
    if (rv.tgt?.kind === 'rival' && rivalsCanKill()) { const om = monOf(list().find((q) => q.uid === rv.tgt.uid)); if (om && om.alive) return { kind: 'rival', uid: om.uid, x: om.x, y: om.y }; } // 20261009leve: alvo escolhido por proximidade/fraqueza/ameaça (herói = 1 alvo a mais)
    let rb = null, rd = rivalsCanKill() ? (br.spectate || (br.rivalFinal && RC().finalLivre) ? 200 : (fastRules() ? (RC().cacaRivalDist || 16) : (RC().cacaRivalDistArena || RC().cacaRivalDist || 16)) * (PERSO(rv).cacaMult || 1)) : 0; /* 20261017perf: mapa grande da ARENA — rivais procuram rival mais longe; na reta final vão atrás uns dos outros */ // só quando podem se eliminar (zona fechando)
    for (const o of list()) { if (o === rv || o.out) continue; const om = monOf(o); if (!om || !om.alive) continue; const d = Math.hypot(om.x + 0.5 - mp.x, om.y + 0.5 - mp.y); if (d < rd) { rd = d; rb = om; } }
    if (rb) return { kind: 'rival', uid: rb.uid, x: rb.x, y: rb.y };
    let best = null, bd = 13;
    for (const o of st.monstersAlive) {
      if (!o.alive || o === mon || !o.br || o.boss || o.rival) continue;
      const d = Math.hypot(o.x + 0.5 - mp.x, o.y + 0.5 - mp.y);
      if (d < bd && inZone(o.x, o.y)) { bd = d; best = o; }
    }
    if (best) return { kind: 'monstro', uid: best.uid, x: best.x, y: best.y };
    // saque com moderação: no máximo saque.maxBaus por rival e uma pausa entre baús (sobra loot para o herói)
    const SQ = RC().saque || {};
    let cb = null; bd = rv.chests >= (SQ.maxBaus ?? 6) || br.clock < (rv.lootPauseUntil || 0) || br.clock < (SQ.inicioMs ?? 20000) ? 0 : 60;
    for (const s of [...m.chests, ...m.crates]) {
      if (s.secret || br.lootOpened.includes(s.id) || ctx.inCovil(s.x, s.y, s.region) || !inZone(s.x, s.y)) continue;
      const d = Math.hypot(s.x - mp.x, s.y - mp.y); if (d < bd) { bd = d; cb = s; }
    }
    if (cb) return { kind: 'bau', id: cb.id, x: cb.x, y: cb.y };
    const z = br.zone;
    for (let k = 0; k < 20; k++) {
      const a = ctx.R() * Math.PI * 2; const rr = ctx.R() * Math.max(4, Math.min(z.r, z.toR ?? z.r) * 0.7);
      const x = Math.round(z.cx + Math.cos(a) * rr), y = Math.round(z.cy + Math.sin(a) * rr);
      if (ctx.walk(x, y) && !ctx.inCovil(x, y, ctx.regionAt(x, y)?.id)) return { kind: 'zona', x, y };
    }
    return { kind: 'zona', x: Math.floor(z.cx), y: Math.floor(z.cy) };
  }
  function retreatGoal(rv, mon, mp, P) {
    const br = ctx.br(); if (!P.recuaFrac || br.rivalFinal || !(mon.hpMax > 0)) return null;
    const clock = br.clock || 0;
    if (rv.retreatUntil > clock && rv.retreat) return { kind: 'recuo', x: rv.retreat.x, y: rv.retreat.y };
    if (rv.retreat && clock >= rv.retreatUntil) { rv.retreat = null; rv.backs = (rv.backs || 0) + 1; rv.retreatCd = clock + 12000; }
    if (mon.hp / mon.hpMax >= P.recuaFrac || clock < (rv.retreatCd || 0)) return null;
    const am = rv.lastAttacker ? ctx.st().monstersAlive.find((o) => o.uid === rv.lastAttacker) : null;
    let ax = am ? am.x - mp.x : ctx.R() - 0.5, ay = am ? am.y - mp.y : ctx.R() - 0.5; const L = Math.hypot(ax, ay) || 1; ax /= L; ay /= L;
    for (const dist of [10, 7, 4]) { const x = Math.round(mp.x - ax * dist), y = Math.round(mp.y - ay * dist); if (ctx.walk(x, y) && inZone(x, y, 0.95)) { rv.retreat = { x, y }; rv.retreatUntil = clock + 6000; rv.retreats = (rv.retreats || 0) + 1; rv.tgt = null; return { kind: 'recuo', x, y }; } }
    return null;
  }
  /** caminho grosso (BFS de tiles alcançáveis) para rival longe do herói (IA congelada pelo LOD) */
  let bfsBuf = null; let bfsCount = 0; let bfsBudget = 0; let bfsLimit = false; let bfsDeferred = 0;
  function bfsPath(sx, sy, gx, gy) {
    const m = ctx.map(); const W = m.W, H = m.H; const N = W * H;
    // 20261024apex: buffers reaproveitados (49 rivais → sem alocar 2 arrays do tamanho do mapa por caminho)
    if (!bfsBuf || bfsBuf.N !== N) bfsBuf = { N, prev: new Int32Array(N), q: new Int32Array(N) };
    const prev = bfsBuf.prev; prev.fill(-1); const q = bfsBuf.q; let h = 0, t = 0; bfsCount++;
    if (!(sx >= 0 && sy >= 0 && sx < W && sy < H && gx >= 0 && gy >= 0 && gx < W && gy < H)) return null; // meta/posição fora do mapa → sem caminho (nunca laço infinito)
    const s = sx + sy * W, g = gx + gy * W; if (s === g) return [];
    prev[s] = s; q[t++] = s;
    while (h < t) {
      const c = q[h++]; if (c === g) break;
      const cx = c % W, cy = (c / W) | 0;
      for (let k = 0; k < 4; k++) {
        const nx = cx + (k === 0 ? 1 : k === 1 ? -1 : 0), ny = cy + (k === 2 ? 1 : k === 3 ? -1 : 0);
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue; const ni = nx + ny * W;
        if (prev[ni] !== -1 || m.reachable[ni] !== 1) continue; prev[ni] = c; q[t++] = ni;
      }
    }
    if (prev[g] === -1) return null;
    const out = []; for (let c = g, n = 0; c !== s; c = prev[c]) { out.push(c); if (++n > N) return null; } out.reverse(); return out;
  }
  /** FAST: ritmo das eliminações ENTRE rivais (a partida não pode esvaziar antes do herói chegar): a 1ª só após 'elimPrimeiraMs', depois 1 a cada 'elimIntervaloMs' (espectador: 'elimEspectadorMs') */
  function elimAllowed(br) {
    const R0 = RC(); if (!R0.elimIntervaloMs) return true;
    return br.clock >= Math.max(R0.elimPrimeiraMs || 0, br.nextElimAt || 0);
  }
  function damageRival(rv, mon, n, byName, lethal, killer = null) {
    const c = RC().combate || {};
    { // 20261009berco: MORTE SÚBITA — zona final + ≤ 6 rivais vivos há > 45 s (20261010: era ≤ 3; rivais já não convergem no herói): o dano entre rivais cresce (até ×5) p/ ninguém ficar em empate eterno (a partida não pode travar)
      const B = ctx.br(); const z = B?.zone;
      if (z && z.stage >= 3 && aliveRivals().length <= (RC().morteSubitaMax ?? 6)) { B.suddenSince = B.suddenSince || B.clock; const t = B.clock - B.suddenSince; if (t > 45000) n = Math.round(n * Math.min(5, 1 + (t - 45000) / 15000)); } else if (B) B.suddenSince = 0;
    }
    { const ck = ctx.br()?.clock || 0; if (rv.shieldUntil > ck) n = Math.max(1, Math.round(n * (1 - (rv.shieldRed || 0)))); if (rv.veilUntil > ck) n = Math.max(1, Math.round(n * 0.25)); } // BB: escudo / véu
    if (rv.fk && (rv.fk.b.imortalUntil || 0) > (ctx.br()?.clock || 0) && mon.hp - n < 1) n = Math.max(0, mon.hp - 1); // Fúria de Lava
    if (ctx.br()?.x1 && ctx.x1Clamp) n = ctx.x1Clamp(mon, n); // X1 ⚔: veneno/reflexo também só levam a 1 HP (a rodada acaba)
    if (lethal && killer && !elimAllowed(ctx.br())) lethal = false; // ainda não pode cair: fica no piso de HP (hpMinFrac)
    const floor = lethal ? 0 : Math.ceil((mon.hpMax || 1) * (c.hpMinFrac ?? 0.3));
    if (mon.hp <= floor) return false;
    mon.hp = Math.max(floor, mon.hp - n);
    if (mon.hp <= 0) { eliminate(rv, mon, byName, killer); return true; }
    return false;
  }
  /** rival caiu SEM ser pelo herói (outro rival): sai da corrida, a bolsa cai no chão (o herói pode pegar) */
  function eliminate(rv, mon, byName, killer = null) {
    const br = ctx.br(); const mp = pos(mon);
    mon.alive = false; mon.hp = 0; resetMonsterRuntime(mon);
    if (killer) { const R0 = RC(); br.nextElimAt = br.clock + (br.spectate ? (R0.elimEspectadorMs ?? 8000) : (R0.elimIntervaloMs || 0)); }
    rv.out = true; rv.by = byName || 'arena'; rv.killedBy = killer ? killer.name : null; br.rivalsDown++;
    if (killer && fastRules()) {
      // NEXARA FAST: o vencedor SAQUEIA o derrotado (bolsa + metade do MCB) e ganha XP do abate
      const n = rv.bag.length; killer.bag.push(...rv.bag.splice(0)); const m2 = Math.floor((rv.mcb || 0) * 0.5); killer.mcb += m2; rv.mcb -= m2;
      killer.rivalKills = (killer.rivalKills || 0) + 1; gainXp(killer, rivalXp(rv));
      ctx.note('rival_looted', { name: killer.name, from: rv.name, items: n, mcb: m2 });
    } else if (rv.bag.length) ctx.spawnDrops(Math.floor(mp.x), Math.floor(mp.y), rv.bag.splice(0), `rival_${rv.idx}`);
    ctx.note('rival_out', { name: rv.name, by: rv.by, left: aliveRivals().length });
  }
  /** rivais podem se eliminar? só com a zona fechando, fora do final, e sobrando mais que minVivosFinal (ou estágio ≥ 3) */
  function rivalsCanKill() {
    const br = ctx.br(); const n = aliveRivals().length;
    if (br.spectate) return n > 1; // espectador: a briga vai até sobrar 1 (campeão também pode cair)
    return (!br.rivalFinal || !!RC().finalLivre) && (br.zone.phase !== 'wait' || !!RC().lutamSempre) && n > 1 && (n > (RC().minVivosFinal ?? 2) || br.zone.stage >= 2) && !(Array.isArray(RC().pisoVivos) && n <= (RC().pisoVivos[(br.zone.phase === 'wait' && br.zone.stage < 0 ? 0 : br.zone.stage + 1)] ?? 0)); /* 20 rivais: eliminação em etapas */ // FAST: lutam a partida toda
  }
  function nearestFoe(rv, mon, mp, maxD) {
    const st = ctx.st(); let best = null, bd = maxD; const rk = rivalsCanKill();
    for (const o of st.monstersAlive) {
      if (!o.alive || o === mon || !o.br || o.boss) continue;
      if (o.rival && !rk) continue;
      const op = pos(o); const d = Math.hypot(op.x - mp.x, op.y - mp.y);
      if (d < bd) { bd = d; best = o; }
    }
    return best ? { o: best, d: bd } : null;
  }

  /**
   * 20261009leve — ALVO DO RIVAL entre TODOS os heróis (rivais + herói do jogador): pontuação = distância × fator de fraqueza
   * × ameaça × fidelidade (quanto MENOR, melhor). O herói NÃO tem preferência: é só mais um alvo (jogadorMult = 1 = neutro).
   * Sem `rivais.alvo` (mapa completo) tudo segue como antes.
   */
  /** 20261017perf (zona final): quantos OUTROS rivais já miram o herói — limite `maxAlvoJogador` impede o bando inteiro de escolher o herói por proximidade/fraqueza (só ataque do herói ignora o limite) */
  function playerFull(rv) {
    const A = RC().alvo; const cap = A?.maxAlvoJogador; if (!cap) return false; let n = 0;
    for (const o of list()) { if (o === rv || o.out) continue; if (o.tgt?.kind === 'jogador') { const m = monOf(o); if (m && m.alive && ++n >= cap) return true; } }
    return false;
  }
  function pickTarget(rv, mon, mp, p, dP, clock) {
    const A = RC().alvo; if (!A) return null;
    const st = ctx.st(); const pl = st.player; const cur = rv.tgt;
    if (rv.retreatUntil > clock) return null; // recuando: não escolhe briga
    const wk = PERSO(rv).fracoPeso ?? A.fracoPeso ?? 0.4, th = A.ameacaMult ?? 0.65, stick = A.fidelidade ?? 0.8;
    let best = null, bs = 1e9;
    const consider = (kind, uid, d, hpFrac, threat) => {
      const s = d * (1 - wk * (1 - Math.max(0, Math.min(1, hpFrac)))) * (threat ? th : 1) * (cur && cur.kind === kind && cur.uid === uid ? stick : 1) * (kind === 'jogador' ? (A.jogadorMult ?? 1) : 1);
      if (s < bs) { bs = s; best = { kind, uid, d }; }
    };
    if (!ctx.heroHidden?.() && dP <= (A.jogadorAlcance ?? 18) && !(st.player.hp <= 0) && (clock < (rv.threatPlayerUntil || 0) || cur?.kind === 'jogador' || (!playerFull(rv) && (dP <= (A.jogadorPertoR ?? 4) || (pl.hpMax > 0 && pl.hp / pl.hpMax <= (A.jogadorFracoFrac ?? 0.35) && dP <= (A.jogadorFracoR ?? 6)))))) /* 20261017perf: herói só entra na escolha se atacou, encostou (≤ 4) ou está fraco e perto — antes qualquer herói a ≤ 10 tiles podia ser escolhido */ consider('jogador', 0, dP, pl.hpMax > 0 ? pl.hp / pl.hpMax : 1, clock < (rv.threatPlayerUntil || 0));
    const hunting = isHunter(rv) && !(clock - (rv.lastAttackedAt || -1e9) < 4000); // caçador de gigante não procura duelo (só revida)
    if (rivalsCanKill() && !hunting) {
      for (const o of list()) {
        if (o === rv || o.out) continue; const om = monOf(o); if (!om || !om.alive) continue;
        const op = pos(om); const d = Math.hypot(op.x - mp.x, op.y - mp.y); if (d > (A.rivalAlcance ?? 28)) continue;
        consider('rival', om.uid, d, om.hpMax > 0 ? om.hp / om.hpMax : 1, rv.lastAttacker === om.uid && clock - (rv.lastAttackedAt || -1e9) < 5000);
      }
    }
    return best;
  }

  /**
   * 20261017perf — ALVO FIEL: rival em duelo com OUTRO herói mantém o alvo (compromisso `compromissoMs`) e só o troca pelo herói se
   * (a) o herói o atacou (ameaça), (b) o herói chegou a ≤ `jogadorPertoR` tiles, ou (c) o herói está fraco (≤ `jogadorFracoFrac` de vida) e a ≤ `jogadorFracoR`.
   * VER o herói de longe NÃO cancela a briga. Trocas rival→rival: só com o compromisso vencido, com cooldown `trocaCooldownMs` por rival e histerese
   * (o novo alvo só entra se o alvo atual saiu da zona de combate: morreu, fugiu > `soltaDist` tiles ou deixou de ser eliminável). Sem `compromissoMs`: comportamento anterior.
   */
  function stickTarget(rv, prev, nt, mp, p, dP, clock) {
    const A = RC().alvo; if (!A || !A.compromissoMs || !prev) return nt;
    if (prev.kind === 'jogador') { // troca legítima pelo herói também tem compromisso: não volta ao rival a cada 0,7 s
      const plp = ctx.st().player;
      if (nt && nt.kind === 'rival' && plp.hp > 0 && dP <= (A.ataqueR ?? 14) && clock - (rv.tgtSince || 0) < (A.compromissoJogadorMs ?? 4000)) return prev;
      if (nt && nt.kind === 'rival') rv.noPlayerUntil = clock + (A.trocaCooldownMs ?? 3500); // largou o herói: cooldown antes de ser puxado de novo por 'perto/fraco'
      return nt;
    }
    if (prev.kind !== 'rival') return nt;
    const om = monOf(list().find((q) => q.uid === prev.uid)); const rk = rivalsCanKill();
    const op = om && om.alive ? pos(om) : null; const dOp = op ? Math.hypot(op.x - mp.x, op.y - mp.y) : 1e9;
    if (!op || !rk || dOp > (A.soltaDist ?? 20)) return nt; // alvo morreu / fugiu / não é mais eliminável → escolhe de novo
    { // trocas legítimas pelo herói (mesmo quando o 'melhor' por pontuação seria outro rival)
      const pl = ctx.st().player; const hpf = pl.hpMax > 0 ? pl.hp / pl.hpMax : 1;
      const atacado = clock < (rv.threatPlayerUntil || 0) && dP <= (A.ataqueR ?? 14), perto = dP <= (A.jogadorPertoR ?? 4) && dP <= dOp + 0.8 && !(dOp <= (A.emCombateR ?? 2.6) && dP > (A.emCombateJogadorR ?? 1.8)), /* o herói só 'puxa' quem briga se estiver tão perto quanto o oponente (entrou na briga), não por estar a 3-4 tiles de uma luta */ fraco = hpf <= (A.jogadorFracoFrac ?? 0.35) && dP <= (A.jogadorFracoR ?? 6);
      if (pl.hp > 0 && (atacado || ((perto || fraco) && clock >= (rv.noPlayerUntil || 0) && !playerFull(rv)))) return { kind: 'jogador', uid: 0, d: dP };
      if (nt && nt.kind === 'jogador') return prev; // só vê o herói: não larga o duelo
    }
    if (nt && nt.kind === prev.kind && nt.uid === prev.uid) return nt;
    if (clock - (rv.tgtSince || 0) < A.compromissoMs || clock < (rv.nextRetarget || 0)) return prev; // compromisso / cooldown
    const hit = rv.lastAttacker === nt?.uid && clock - (rv.lastAttackedAt || -1e9) < 3000; // quem me bate agora vale uma troca
    if (!hit) return prev; // histerese: alvo atual válido e perto → fica
    rv.nextRetarget = clock + (A.trocaCooldownMs ?? 3500); return nt;
  }
  const countAtk = (k) => { const b = ctx.br(); if (!b) return; const a = (b.atk = b.atk || { jogador: 0, rival: 0, monstro: 0 }); a[k]++; };

  /** FILHOTE (BB) do rival: habilidade com AVISO (windup 450 ms). Alvos: herói e outros rivais. Cadência de passo 250 ms por rival (LOD: custo desprezível). */
  function stepRivalBB(rv, mon, mp, p, dP, clock) {
    const B = rv.bb; const st = ctx.st(); const C = RC().combate || {}; const br = ctx.br();
    const d0 = st._monsters[mon.id] || {}; const base = Math.max(1, Math.round((d0.ataque || 10) * 1.6 * (mon.atkScale || 1) * (C.danoMult || 1) * (RC().bbDanoFrac ?? 0.3))); // BB é APOIO: dano = 30% de um golpe do herói (não decide a luta)
    const cands = (x, y, r, max) => {
      const out = [];
      if (false && st.player.hp > 0 && Math.hypot(p.x - x, p.y - y) <= r) out.push({ x: p.x, y: p.y, d: Math.hypot(p.x - mp.x, p.y - mp.y), hit: (n) => { if (st.player.hp > n + 1) ctx.damageHero?.(n, `filhote de ${rv.name}`); } }); // CAMPEÃO / confronto final: o filhote não entra (duelo justo 1×1) · BB é apoio: nunca dá o golpe final no herói (a morte é sempre por golpe de rival, com atribuição)
      if (rivalsCanKill()) for (const o of list()) {
        if (o === rv || o.out) continue; const om = monOf(o); if (!om || !om.alive) continue; const op = pos(om);
        if (Math.hypot(op.x - x, op.y - y) <= r) out.push({ x: op.x, y: op.y, d: Math.hypot(op.x - mp.x, op.y - mp.y), hit: (n) => { o.lastAttacker = rv.uid; o.lastAttackedAt = clock; countBb(); damageRival(o, om, Math.round(n * (C.danoEntreRivais ?? 0.6)), rv.name, !o.champion || !!br.spectate, rv); } });
      }
      return out.sort((a, b) => a.d - b.d).slice(0, max || 1);
    };
    const countBb = () => { const a = (br.bbHits = br.bbHits || { jogador: 0, rival: 0 }); a.rival++; };
    const io = {
      foe: (range) => { const l = cands(mp.x, mp.y, range, 8); const t = rv.tgt && l.find((q) => (rv.tgt.kind === 'jogador' && q.hit.length >= 0 && q.x === p.x && q.y === p.y)); const f = t || l[0]; if (!f) return null; const h0 = f.hit; f.hit = (n) => { if (f.x === p.x && f.y === p.y) { const a = (br.bbHits = br.bbHits || { jogador: 0, rival: 0 }); a.jogador++; } h0(n); }; return f; },
      near: (x, y, r, max) => cands(x, y, r, max),
      threat: () => (dP < 6) || cands(mp.x, mp.y, 6, 1).length > 0,
      hpFrac: () => (mon.hpMax > 0 ? mon.hp / mon.hpMax : 1),
      heal: (frac) => { if (rv.champion) return; mon.hp = Math.min(mon.hpMax, mon.hp + Math.round(mon.hpMax * frac)); },
      shield: (ms, red) => { if (rv.champion) return; rv.shieldUntil = clock + ms; rv.shieldRed = red; },
      veil: (ms) => { if (rv.champion) return; rv.veilUntil = clock + ms; rv.dodgeReady = 0; },
      base: () => base,
      emit: (kind, info) => { if (kind === 'bb_windup') { mon.rival.bb.wind = true; mon.rival.bb.firedAt = clock; } else if (kind === 'bb_hit' || kind === 'bb_buff') mon.rival.bb.wind = false; br.bbEv = (br.bbEv || 0) + 1; }
    };
    const r = stepBB(B.def, B.S, clock, io);
    if (mon.rival.bb.wind && clock - mon.rival.bb.firedAt > 700) mon.rival.bb.wind = false;
    return r;
  }
  /* ── 20261016abrigos: RIVAL × GIGANTE e VOO DO RIVAL (mesmas regras do herói: energia flightMs, recarga cooldownMs, sem voo na reta final, sopro com cadência/alcance da montaria) ── */
  const GC = () => RC().gigantes || {};
  const giantsAlive = () => (ctx.st()?.monstersAlive || []).filter((m) => m.alive && m.elemental);
  /** LOTE-b M5 (pedido do Caio): CAÇADORES DE GIGANTE — fração `gigantes.frac` dos rivais prioriza matar um gigante p/ ganhar a sela (não aceita duelo com rival
   *  enquanto caça, só revida quem o atacou há < 4 s). Antes: só caçava quem estava SEM alvo, e com 'lutamSempre' quase ninguém ficava sem alvo. */
  function isHunter(rv) {
    const G = GC(); const br = ctx.br(); if (!G.ativo || fastRules() || br.rivalFinal || rv.sela || rv.fly) return false;
    const idx = Number.isFinite(rv.idx) ? rv.idx : rv.uid; const k = G.frac || 0.35; if (!PERSO(rv).gigante && Math.floor((idx + 1) * k) === Math.floor(idx * k)) return false; // CAÇADORA: sempre caça gigante // distribuição uniforme (≈ frac dos rivais)
    const mon = monOf(rv); if (!mon || mon.hp < mon.hpMax * (G.hpMinFrac ?? 0.6)) return false;
    const mp = pos(mon); return giantsAlive().some((g) => Math.hypot(g.x - mp.x, g.y - mp.y) < (G.dist || 45));
  }
  function giantGoal(rv, mp) {
    const G = GC(); const br = ctx.br(); if (!G.ativo || fastRules() || br.rivalFinal || rv.sela || rv.fly || rv.tgt?.kind === 'jogador' || (rv.tgt && !isHunter(rv)) || (br.clock || 0) < (rv.threatPlayerUntil || 0) + 8000) return null; // em briga/duelo não larga o oponente p/ caçar gigante (caçador: só o herói/ameaça o tiram da caça)
    if (!isHunter(rv)) return null; // só uma parte dos rivais vai atrás de gigante
    const mon = monOf(rv); if (!mon || mon.hp < mon.hpMax * (G.hpMinFrac ?? 0.6)) return null;
    let best = null, bd = G.dist || 45; for (const g of giantsAlive()) { const d = Math.hypot(g.x - mp.x, g.y - mp.y); if (d < bd) { bd = d; best = g; } }
    return best ? { kind: 'gigante', uid: best.uid, x: best.x, y: best.y } : null;
  }
  function hitGiant(rv, mon, mp, g, clock) {
    const st = ctx.st(); const G = GC(); const C = RC().combate || {}; const def = st._monsters[mon.id];
    const dmg = Math.max(1, Math.round((def.ataque || 10) * 1.6 * (mon.atkScale || 1) * (G.danoMult ?? 1.4) * (PERSO(rv).danoGiganteMult || 1) * (0.8 + ctx.R() * 0.4)));
    rv.nextSwing = clock + (C.cadenciaMs || 900) * (0.85 + ctx.R() * 0.3); rv.swingAt = clock; mon.rivalSwingAt = performance.now(); mon.rivalSwingN = (mon.rivalSwingN || 0) + 1;
    g.hp -= dmg; g.rivalHits = (g.rivalHits || 0) + 1; const br = ctx.br(); br.giantHitsByRivals = (br.giantHitsByRivals || 0) + 1;
    if (g.hp <= 0) { g.hp = 0; g.alive = false; resetMonsterRuntime(g); rv.kills++; gainXp(rv, st._monsters[g.id]?.xp || 200);
      rv.sela = { pal: g.dragonCor || null, nome: g.arenaLabel, at: clock }; rv.flyCdUntil = clock + 1500; rv.flights = rv.flights || 0;
      br.giantsByRivals = (br.giantsByRivals || 0) + 1; ctx.onGiantByRival?.(g, rv); ctx.note('giant_by_rival', { name: rv.name, giant: g.arenaLabel, elemento: g.elemental }); rv.goal = null; }
  }
  function stepFly(rv, mon, mp, p, dP, clock, dtMs) {
    const M = getConfig().mount || {}; const br = ctx.br(); const dt = dtMs / 1000; const st = ctx.st(); const F = rv.fly;
    if (!F) { // decola? (tem sela, recarga ok, fora da reta final, meta longe ou rival-alvo longe)
      if (!rv.sela || br.rivalFinal || clock < (rv.flyCdUntil || 0) || rv.tgt?.kind === 'jogador' || clock < (rv.threatPlayerUntil || 0) + 8000) return false;
      const gx = rv.goal?.x ?? mp.x, gy = rv.goal?.y ?? mp.y; if (Math.hypot(gx - mp.x, gy - mp.y) < (GC().vooDistMin ?? 14) && rv.tgt?.kind !== 'rival') return false;
      rv.fly = { phase: 'takeoff', alt: 0, leftMs: M.flightMs ?? 30000, breath: M.breath?.max ?? 100, fireAt: -1e9 }; rv.flights = (rv.flights || 0) + 1; ctx.note('rival_takeoff', { name: rv.name }); return true;
    }
    const cruise = M.cruiseAltitude ?? 3.2;
    if (F.phase === 'takeoff') { F.alt = Math.min(cruise, F.alt + 2.6 * dt); if (F.alt >= cruise) F.phase = 'cruise'; }
    F.leftMs -= dtMs; if (br.rivalFinal && F.phase !== 'landing') F.phase = 'landing'; // reta final: sem voo (igual ao herói)
    if (F.leftMs <= 0 && F.phase !== 'landing') F.phase = 'landing';
    // anda em linha reta por cima de tudo até a meta (borda do mapa segura)
    const tgtM = rv.tgt?.kind === 'rival' ? monOf(list().find((q) => q.uid === rv.tgt.uid)) : null; const gx = tgtM ? tgtM.x : (rv.goal?.x ?? mp.x), gy = tgtM ? tgtM.y : (rv.goal?.y ?? mp.y);
    const dx = gx - mp.x, dy = gy - mp.y, d = Math.hypot(dx, dy); const W = ctx.map().W, H = ctx.map().H;
    if (F.phase !== 'landing' && d > 1.5) { const sp = Math.min(d, (M.speed ?? 6.5) * dt); const nx = Math.max(1.5, Math.min(W - 2.5, mp.x + dx / d * sp)), ny = Math.max(1.5, Math.min(H - 2.5, mp.y + dy / d * sp)); placeMonster(st, mon.uid, nx, ny); mon.facingRival = Math.atan2(dx, -dy); rv.moved = (rv.moved || 0) + 1; }
    if (F.phase === 'cruise' && d <= 2 && !tgtM) F.phase = 'landing';
    // sopro de cima: rival/monstro abaixo e à frente (herói só se o rival estiver em duelo com ele — foco preservado)
    const B = M.breath || {}; if (clock - F.fireAt > 600) F.breath = Math.min(B.max ?? 100, F.breath + (B.regenPerSec ?? 8) * dt);
    if (F.phase === 'cruise' && clock - F.fireAt >= (B.cadenceMs ?? 450) && F.breath >= (B.burst ?? 12)) {
      const def = st._monsters[mon.id]; const dmg = Math.max(1, Math.round((def.ataque || 10) * 1.6 * (mon.atkScale || 1) * (B.dmgMult ?? 0.8))); let n = 0;
      for (const o of st.monstersAlive) { if (n >= (B.maxTargets ?? 3) || !o.alive || o === mon || !o.br || o.boss) continue; const op = pos(o); if (Math.hypot(op.x - mp.x, op.y - mp.y) > (B.range ?? 7) * 0.6) continue;
        if (o.rival) { if (!rivalsCanKill()) continue; const orv = list().find((q) => q.uid === o.uid); if (orv && !orv.fly) { countAtk('rival'); damageRival(orv, o, Math.round(dmg * ((RC().combate || {}).danoEntreRivais ?? 0.6)), rv.name, !orv.champion, rv); n++; } }
        else { o.hp -= dmg; n++; if (o.hp <= 0) { o.hp = 0; o.alive = false; resetMonsterRuntime(o); rv.kills++; gainXp(rv, st._monsters[o.id]?.xp || 0); } } }
      if (rv.tgt?.kind === 'jogador' && dP <= (B.range ?? 7) * 0.6 && n < (B.maxTargets ?? 3)) { ctx.damageHero?.(dmg, rv.name + ' (sopro do dragão)'); n++; }
      if (n) { F.fireAt = clock; F.breath -= B.burst ?? 12; F.fires = (F.fires || 0) + 1; br.rivalFires = (br.rivalFires || 0) + 1; mon.rivalFireAt = performance.now(); }
    }
    if (F.phase === 'landing') { F.alt = Math.max(0, F.alt - (M.descendSpeed ?? 2.2) * dt); if (F.alt <= 0) { const f = ctx.nearestFree(Math.floor(mon.x), Math.floor(mon.y)); if (f) placeMonster(st, mon.uid, f.x + 0.5, f.y + 0.5); rv.fly = null; rv.flyCdUntil = clock + (M.cooldownMs ?? 45000); rv.landings = (rv.landings || 0) + 1; rv.goalAt = -1e9; ctx.note('rival_land', { name: rv.name }); mon.rivalFly = null; return true; } }
    mon.rivalFly = { phase: F.phase, alt: F.alt, pal: rv.sela?.pal || null };
    return true;
  }
  function update(dtMs, p) {
    const c = RC(); const br = ctx.br(); if (!c.ativo || !br) return;
    if (!br.rivals) { spawn(p); return; }
    const st = ctx.st(); const clock = br.clock; const C = c.combate || {}; const dtS = dtMs / 1000;
    const lodMed = (ctx.cfg().lodIa?.medio || 24) - 1;
    const alive = aliveRivals(); bfsBudget = Math.max(3, Math.ceil(alive.length / 12)); bfsLimit = alive.length > 40; // 20261024apex: orçamento/limiar de caminho só com MUITOS rivais (50 jogadores); até 40 = comportamento antigo
    const gearSigNow = c.curvaAlta?.equip && !fastRules() ? gearBonus().sig : null;
    if (c.justa && kitsOn()) heroDotTick(clock);
    if (ctx.heroHidden?.()) for (const rv of alive) if (rv.tgt?.kind === 'jogador') { rv.tgt = null; rv.tgtAt = clock; const m = monOf(rv); if (m) { m.aggroR = c.alvo?.ignoraR ?? 0.6; m.loseR = 0.5; } } // Bomba de Fumaça: rivais perdem o herói // trocou de equipamento no meio da corrida → rivais acompanham
    for (const rv of alive) {
      const mon = monOf(rv); const mp = pos(mon);
      const TL = lvlFor(rv); if (rv.forPlayerL !== TL || (gearSigNow !== null && rv.gearSig !== gearSigNow)) applyLevel(rv, mon, TL, false); // mapa completo: herói subiu → rivais acompanham · FAST: nível próprio do rival
      const dP = Math.hypot(mp.x - p.x, mp.y - p.y);
      if (dP <= (c.visaoMinimapa || 18)) rv.seenAt = clock;
      const v = getAiView(mon); const engaged = v && ENGAGED.has(v.state) && dP < 14 && !(rv.tgt?.kind === 'rival' && clock >= (rv.threatPlayerUntil || 0) && v.state !== AI_STATES.ATTACK && v.state !== AI_STATES.ATTACK_PREPARE); // 20261010ajustes: rival com alvo RIVAL não conta como 'engajado com o herói' (antes, perto do herói só golpeava o herói)
      if (v && v.state === AI_STATES.ATTACK_PREPARE && rv.lastSt !== AI_STATES.ATTACK_PREPARE && dP < 9) { countAtk('jogador'); { const W = (br.atkWhy = br.atkWhy || {}); const why = clock < (rv.threatPlayerUntil || 0) ? 'provocado' : dP <= (c.alvo?.jogadorPertoR ?? 4) ? 'perto' : br.rivalFinal && rv.champion ? 'campeao' : br.rivalFinal ? 'final' : 'livre:' + (rv.tgt?.kind || 'nenhum'); W[why] = (W[why] || 0) + 1; } const D = (br.atkDbg = br.atkDbg || {}); const k = `${rv.name}|t:${rv.tgt?.kind}|d${Math.round(dP)}`; D[k] = (D[k] || 0) + 1; } // golpe do rival NO HERÓI (métrica 'ataques ao jogador')
      if (v) rv.lastSt = v.state;
      if (rv.sela && !ctx.br().rivalFinal || rv.fly) { if (stepFly(rv, mon, mp, p, dP, clock, dtMs) && rv.fly) continue; } // voando: o resto (caminho/combate a pé) espera o pouso
      if (br.x1) { mon.aggroR = 40; mon.loseR = 60; mon.leash = 999; mon.x1Atk = RC().x1Ataque || null; rv.tgt = { kind: 'jogador', uid: 0, d: dP }; mon.homeX = Math.floor(p.x); mon.homeY = Math.floor(p.y); } // X1 ⚔: o único alvo é o herói
      else if (br.rivalFinal && rv.champion && c.finalLivre) { mon.aggroR = c.tatica?.aggro ?? c.alvo?.jogadorAlcance ?? 12; mon.loseR = c.alvo?.perdeR ?? 22; rv.tgt = { kind: 'jogador', uid: 0, d: dP }; } // campeão: o desafio final é o herói
      else if (c.alvo && (!br.rivalFinal || c.finalLivre) && (!rv.tgtAt || clock - rv.tgtAt >= (c.alvo.reavaliaMs ?? 700))) {
        const prev = rv.tgt; rv.tgt = stickTarget(rv, prev, pickTarget(rv, mon, mp, p, dP, clock), mp, p, dP, clock); rv.tgtAt = clock; if ((prev?.kind || null) !== (rv.tgt?.kind || null) || prev?.uid !== rv.tgt?.uid) { rv.tgtSince = clock; rv.tgtSwitches = (rv.tgtSwitches || 0) + 1; }
        if (rv.tgt?.kind === 'rival') { { const th = clock < (rv.threatPlayerUntil || 0); mon.aggroR = th ? (c.alvo.defesaR ?? 3.2) : (c.alvo.ignoraR ?? 0.6); mon.loseR = th ? (c.alvo.perdeR ?? 22) : 0.5; } if (!prev || prev.kind !== 'rival' || prev.uid !== rv.tgt.uid) rv.goalAt = -1e9; } // alvo é outro rival: só se defende do herói (perto); caminha até o rival
        else if (c.tatica?.aggro || c.alvo) { // 20261010ajustes: só PERSEGUE o herói quem o escolheu como alvo (proximidade/fraqueza/ameaça); com alvo monstro/nenhum só reage a quem encosta (defesaR) — antes aggro 18 puxava todos para o herói
          { const on = rv.tgt?.kind === 'jogador' || clock < (rv.threatPlayerUntil || 0); mon.aggroR = on ? (c.tatica?.aggro ?? c.alvo.jogadorAlcance ?? 12) : (c.alvo.ignoraR ?? 0.6); mon.loseR = on ? (c.alvo.perdeR ?? 22) : 0.5; } if (prev?.kind === 'rival') rv.goalAt = -1e9; } // sem alvo-herói: solta a perseguição já (loseR curto → RETURN)
      }
      if (rv.fk) stepPowers(rv, mon, mp, p, dP, clock);
      // meta
      const reached = rv.goal && Math.hypot(rv.goal.x + 0.5 - mp.x, rv.goal.y + 0.5 - mp.y) < 1.8;
      const goalDead = (rv.goal?.kind === 'monstro' || rv.goal?.kind === 'rival' || rv.goal?.kind === 'gigante') && !st.monstersAlive.find((o) => o.uid === rv.goal.uid && o.alive);
      const goalOpened = rv.goal?.kind === 'bau' && br.lootOpened.includes(rv.goal.id);
      const wantRetreat = PERSO(rv).recuaFrac && !rv.retreat && !br.rivalFinal && mon.hpMax > 0 && mon.hp < mon.hpMax * PERSO(rv).recuaFrac && clock >= (rv.retreatCd || 0);
      if (!rv.goal || wantRetreat || goalDead || goalOpened || (reached && rv.goal.kind !== 'bau') || clock - rv.goalAt > (br.rivalFinal ? 1500 : 7000) || (rv.goal && rv.goal.kind !== 'rival' && !inZone(rv.goal.x, rv.goal.y, 1)) /* meta 'rival' fora da zona não invalida a cada quadro (travava o caminho) */) {
        rv.goal = pickGoal(rv, mon, mp, p); rv.goalAt = clock; rv.path = null;
      }
      if (rv.goal.kind === 'monstro' || rv.goal.kind === 'rival' || rv.goal.kind === 'gigante') { const o = st.monstersAlive.find((q) => q.uid === rv.goal.uid); if (o) { rv.goal.x = o.x; rv.goal.y = o.y; } }
      const hp = ctx.nearestFree(rv.goal.x, rv.goal.y) || rv.goal;
      if (!engaged) { mon.homeX = hp.x; mon.homeY = hp.y; }
      // longe do herói: IA congelada pelo LOD → anda grosso pelo caminho
      if (dP > lodMed && !engaged) {
        { // 20261024apex: refaz o caminho só se a meta andou > 3 tiles (ou o caminho acabou) e com ORÇAMENTO por quadro (49 rivais)
          const gk = hp.x + hp.y * 10000; const moved = rv.pathGoal != null && rv.pathGoal !== gk && (!bfsLimit || Math.abs(hp.x - (rv.pathGX ?? hp.x)) + Math.abs(hp.y - (rv.pathGY ?? hp.y)) > 3 || rv.pathI >= (rv.path?.length || 0)); // ≤ 30 rivais: igual a antes (refaz a cada mudança de meta)
          if (!rv.path || rv.pathGoal == null || moved) {
            if (!bfsLimit || bfsBudget > 0) { bfsBudget--; rv.path = bfsPath(mon.x, mon.y, hp.x, hp.y) || []; rv.pathI = 0; rv.pathGoal = gk; rv.pathGX = hp.x; rv.pathGY = hp.y; rv.pathAcc = 0; }
            else if (!rv.path) { rv.path = []; rv.pathI = 0; rv.pathGoal = null; bfsDeferred++; }
          }
        }
        // 20261010ajustes: zona final + morte súbita há > 30 s e caminho até o rival-alvo inexistente (separados por parede) → reaparece colado nele, longe do herói (ninguém trava a partida)
        if (((rv.path.length === 0 && rv.pathGoal != null) || br.clock - br.suddenSince > 90000) && rv.goal.kind === 'rival' && br.zone?.stage >= 3 && br.suddenSince && br.clock - br.suddenSince > 30000 && (mon.x !== hp.x || mon.y !== hp.y)) { placeMonster(st, mon.uid, hp.x + 0.5, hp.y + 0.5); rv.moved = (rv.moved || 0) + 1; }
        rv.pathAcc = (rv.pathAcc || 0) + dtS * 2.6 * (mon.walkMult || 1) * (mon.slowMult || 1) * (mon.slowMultR || 1);
        while (rv.pathAcc >= 1 && rv.pathI < rv.path.length) { rv.pathAcc -= 1; rv.pathI++; }
        if (rv.pathI > 0 && rv.path.length) { const W = ctx.map().W; const ci = rv.path[Math.min(rv.pathI, rv.path.length) - 1]; const nx = ci % W, ny = (ci / W) | 0; if (nx !== mon.x || ny !== mon.y) { placeMonster(st, mon.uid, nx + 0.5, ny + 0.5); rv.moved = (rv.moved || 0) + 1; } }
      } else rv.path = null;
      if (!engaged && rv.goal.kind === 'rival' && br.suddenSince && br.clock - br.suddenSince > 90000 && dP > 12 && Math.hypot(hp.x - mp.x, hp.y - mp.y) > 2.5 && clock - (rv.rushAt || -1e9) > 4000) { rv.rushAt = clock; placeMonster(st, mon.uid, hp.x + 0.5, hp.y + 0.5); rv.moved = (rv.moved || 0) + 1; } // última corrida (ver pickGoal): longe do herói, vai colar no rival
      // saque: baú ao lado → aberto (para todos); loot na bolsa do rival
      if (rv.goal.kind === 'bau' && Math.hypot(rv.goal.x + 0.5 - mp.x, rv.goal.y + 0.5 - mp.y) <= (c.saque?.raioBau || 1.4) + 0.6) {
        const sp = [...ctx.map().chests, ...ctx.map().crates].find((q) => q.id === rv.goal.id);
        if (sp && !br.lootOpened.includes(sp.id)) {
          br.lootOpened.push(sp.id); br.lootOpenedDirty.push(sp.id);
          const loots = ctx.rollLootFor(st, sp.loot, { equip: sp.kind === 'bau' ? 1 : 0, mats: [1, 1], rnd: ctx.R });
          rv.bag.push(...loots); rv.chests++; rv.lootPauseUntil = br.clock + (c.saque?.pausaMs ?? 15000); rv.mcb += c.saque?.mcbPorBau || 0;
          ctx.note('rival_loot', { name: rv.name, id: sp.id, n: loots.length });
        }
        rv.goal = null;
      }
      // combate grosso com monstros/rivais (fora do duelo com o herói)
      if (!engaged && clock >= rv.nextSwing && rv.goal?.kind === 'gigante') { const g = st.monstersAlive.find((q) => q.uid === rv.goal.uid && q.alive); if (g && Math.hypot(g.x + 0.5 - mp.x, g.y + 0.5 - mp.y) <= (GC().alcance ?? 3.4)) hitGiant(rv, mon, mp, g, clock); }
      if (!engaged && clock >= rv.nextSwing && !(rv.fk && (rv.fk.s.stunUntil || 0) > clock)) {
        const f = nearestFoe(rv, mon, mp, (C.alcance || 1.7) * (rv.arma === 'cajado' ? 1.8 : 1)); // 20261024apex: bot de CAJADO alcança mais longe (rajada mágica) — o de espada bate colado
        if (f) {
          rv.nextSwing = clock + (C.cadenciaMs || 900) * (PERSO(rv).cadMult || 1) * (0.85 + ctx.R() * 0.3); rv.swingAt = clock; mon.rivalSwingAt = performance.now(); mon.rivalSwingN = (mon.rivalSwingN || 0) + 1;
          const def = st._monsters[mon.id]; const dmg = Math.max(1, Math.round((def.ataque || 10) * 1.6 * (mon.atkScale || 1) * (C.danoMult || 1) * (0.8 + ctx.R() * 0.4)));
          try { onMonsterHit(f.o, { fromX: mp.x, fromY: mp.y, noStun: true, knockbackScale: 0.4, fromRival: !!f.o.rival }); } catch {}
          if (f.o.rival) {
            const orv = list().find((q) => q.uid === f.o.uid);
            // eliminação entre rivais só enquanto sobram mais que "minVivosFinal" (o confronto final sempre tem rival)
            if (orv) { countAtk('rival'); orv.lastAttacker = rv.uid; orv.lastAttackedAt = clock;
              let n = Math.round(dmg * (C.danoEntreRivais ?? 0.6) * (PERSO(rv).danoRivalMult || 1));
              if (rv.fk || orv.fk) n = kitHitRival(rv, mon, orv, f.o, n * (orv.eq || 1), 'melee', null, clock); // poderes: passivas/buffs do atacante × mitigação do alvo (vida igualada → dano na mesma proporção)
              if (n > 0) damageRival(orv, f.o, n, rv.name, !orv.champion || !!br.spectate, rv); }
          } else {
            countAtk('monstro');
            f.o.hp -= dmg;
            if (f.o.hp <= 0) {
              f.o.hp = 0; f.o.alive = false; resetMonsterRuntime(f.o); rv.kills++; br.rivalMonKills = (br.rivalMonKills || 0) + 1; gainXp(rv, st._monsters[f.o.id]?.xp || 0);
              const tier = st._monsters[f.o.id]?.tier || 'comum';
              rv.mcb += tier === 'elite' ? 40 : 6;
              if (ctx.R() < (ctx.cfg().dropMonstro?.[tier] ?? 0.1)) rv.bag.push(...ctx.rollLootFor(st, ctx.regionAt(f.o.x, f.o.y)?.loot || 'basico', { equip: 0, mats: [1, 1], rnd: ctx.R }));
              if (br.event?.kind === 'cacada' && br.event.uid === f.o.uid && !br.event.done) { br.event.done = true; br.event.until = br.clock + 1500; ctx.note('hunt_lost', { by: rv.name }); }
              ctx.note('rival_kill', { name: rv.name, mon: f.o.id });
            }
          }
        }
      }
      if (rv.bb && !engaged && clock - rv.bb.at >= 250) { rv.bb.at = clock; stepRivalBB(rv, mon, mp, p, dP, clock); } // 20261009berco: filhote do rival — só age FORA do duelo com o herói (duelos 1×1 seguem justos/medidos)
      // monstros colados batem no rival (não mata: no máximo até hpMinFrac)
      if (clock >= rv.nextHurt) {
        rv.nextHurt = clock + (C.danoRecebidoMs || 1300);
        let took = 0;
        for (const o of st.monstersAlive) {
          if (!o.alive || o === mon || !o.br || o.rival || o.boss) continue;
          const op = pos(o); if (Math.hypot(op.x - mp.x, op.y - mp.y) > 1.8) continue;
          took += Math.max(1, Math.round((st._monsters[o.id]?.ataque || 8) * 0.6));
        }
        if (rv.eq && rv.eq !== 1) took = took ? Math.max(1, Math.round(took * rv.eq)) : 0; // vida igualada: monstros tiram a mesma FRAÇÃO de antes
        let gtook = 0; for (const g of giantsAlive()) { if (Math.hypot(g.x + 0.5 - mp.x, g.y + 0.5 - mp.y) <= (GC().alcance ?? 3.4) + 0.6) gtook += Math.max(1, Math.round((st._monsters[g.id]?.ataque || 20) * (g.atkScale || 1) * (GC().danoRecebidoMult ?? 0.5))); }
        if (gtook && rv.eq && rv.eq !== 1) gtook = Math.max(1, Math.round(gtook * rv.eq));
        if (gtook) { damageRival(rv, mon, gtook, 'gigante', true); rv.lastHurtAt = clock; if (!mon.alive) continue; } // o gigante revida (pode matar o rival)
        if (took) { damageRival(rv, mon, took, 'monstros', false); rv.lastHurtAt = clock; }
      }
      // fora da zona (depois do aviso): dano da zona (sem matar)
      const z = br.zone;
      if (z.warned && z.phase !== 'wait' && Math.hypot(mp.x - z.cx, mp.y - z.cy) > z.r) { rv.zoneAcc = (rv.zoneAcc || 0) + dtMs; if (rv.zoneAcc >= 1000) { rv.zoneAcc -= 1000; damageRival(rv, mon, ctx.cfg().zonaSegura.danoPorSeg || 4, 'zona', false); } }
      // regeneração fora de combate
      if (!engaged && clock - (rv.lastHurtAt || -1e9) > 5000 && mon.hp < mon.hpMax) mon.hp = Math.min(mon.hpMax, mon.hp + (C.regenPorSeg || 2) * dtS * (mon.hpMax / 260));
    }
    // FAST: pressão em grupo — com ≥ 2 rivais colados no herói eles se espalham em vagas (cerco) e 1 atacante extra é liberado
    const T = c.tatica;
    if (br.zone?.stage >= 3 && alive.length > 1 && alive.length <= (RC().morteSubitaMax ?? 6)) br.suddenSince = br.suddenSince || br.clock; else br.suddenSince = 0; // relógio da morte súbita corre mesmo sem golpes
    if (T?.pressaoGrupo && !br.spectate) {
      const near = alive.filter((rv) => { const m = monOf(rv); return m && Math.hypot(pos(m).x - p.x, pos(m).y - p.y) <= (T.pressaoDist || 13); });
      const on = near.length >= 2;
      for (const rv of alive) { const m = monOf(rv); if (!m) continue; if (on && near.includes(rv)) m.tac = 'swarm'; else if (m.tac === 'swarm') m.tac = null; }
      setAttackerBonus(on ? 1 : 0); br.pressure = on ? near.length : 0;
    } else if (T?.pressaoGrupo) setAttackerBonus(0);
    checkFinal(p);
  }
  function checkFinal(p) {
    const c = RC(); const br = ctx.br(); const z = br.zone; const alive = aliveRivals();
    if (br.spectate) { // jogador caído: a partida só termina quando sobra no máximo 1 rival
      if (alive.length <= 1 && !br.ended) { ctx.note('spectate_end', { winner: alive[0]?.name || null }); ctx.finish('derrotado', { placement: br.playerPlace || null, winner: alive[0]?.name || null, spectated: true }); }
      return;
    }
    if (!br.rivalFinal) {
      const stageHit = z.stage >= (c.campeao?.gatilhoEstagio ?? 3);
      const lastOne = alive.length === 1 && z.stage >= 2;
      if (alive.length && (stageHit || lastOne)) startFinal(alive);
    }
    if (!alive.length && !br.ended && (br.rivalFinal || c.fimUltimoHeroi)) { // todos os rivais mortos = VITÓRIA (FAST: mesmo sem o confronto final ter começado)
      ctx.note('victory', { champion: br.championName });
      ctx.finish('vitoria', { champion: br.championName || null });
    }
  }
  function startFinal(alive) {
    const c = RC(); const br = ctx.br(); const CP = c.campeao || {};
    br.rivalFinal = true;
    let champ = null, best = -1;
    for (const rv of alive) { const m = monOf(rv); const s = m.hp + rv.kills * 20 + rv.chests * 30; if (s > best) { best = s; champ = rv; } }
    const m = monOf(champ);
    champ.champion = true; m.rival.champion = true;
    applyLevel(champ, m, lvlFor(champ), true); // CAMPEÃO: nível (do herói · FAST: o próprio) +2, HP cheio
    m.sizeMult = (m.sizeMult || 1) * (CP.sizeMult || 1.15);
    for (const rv of alive) { const mm = monOf(rv); mm.aggroR = 60; mm.loseR = 999; rv.goal = null; }
    br.championUid = m.uid; br.championName = champ.name;
    ctx.note('rival_final', { name: champ.name, style: champ.style, level: champ.level, hp: m.hpMax, others: alive.length - 1, introMs: CP.introMs || 3200 });
  }
  /** o herói derrubou um rival: bolsa + drop elite + bônus MCB (XP/MCB base vêm do kill hook normal) */
  function onKill(mon) {
    const br = ctx.br(); const rv = list().find((q) => q.uid === mon.uid); if (!rv || rv.out) return;
    const c = RC(); const st = ctx.st();
    rv.out = true; rv.by = 'heroi'; br.rivalsDown++; br.rivalsByHero = (br.rivalsByHero || 0) + 1;
    const loots = rv.bag.splice(0).concat(ctx.rollLootFor(st, 'elite', { equip: 1, mats: [1, 2], rnd: ctx.R }));
    ctx.spawnDrops(mon.x, mon.y, loots, `rival_${rv.idx}`);
    const bonus = (rv.champion ? (c.campeao?.bonusMcb || 200) : (c.bonusMcb || 60)) + (c.bonusMcbPorNivel ?? 8) * (rv.level || 1) + Math.floor(rv.mcb * 0.5);
    ctx.credit(bonus, rv.champion ? 'campeao' : 'rival');
    ctx.note(rv.champion ? 'champion_down' : 'rival_down', { name: rv.name, level: rv.level, bonus, drops: loots.length, left: aliveRivals().length });
  }
  /** o herói acertou um rival vivo → chance de esquiva (passo + i-frames curtos) */
  function onHit(mon, from, info = {}) {
    const br = ctx.br(); const rv = list().find((q) => q.uid === mon.uid); if (!rv || !br) return;
    const E = RC().esquiva || {}; const T = RC().tatica || null; rv.lastHurtAt = br.clock;
    if (br.testCalm?.noDodge) return; // testes
    { // LOTE-b M4 (medido no jogo do Caio, NV27 Complexo): 'provocado' era o motivo nº1 dos golpes no herói — a ÁREA/SUPREMA/mini-dragão
      // RESVALAVAM em rivais que duelavam entre si e todos largavam a briga. Agora: resvalo (pouco dano em 4 s) num rival em DUELO não provoca;
      // golpe de verdade (≥ provocaFrac do HP em 4 s) provoca sempre; rival sem duelo é provocado como antes (respeitando o limite de rivais no herói).
      const A = RC().alvo || {}; const ck = br.clock; const W = A.provocaJanelaMs ?? 4000;
      rv.heroDmg = (rv.heroDmg || []).filter((e) => ck - e.t < W); rv.heroDmg.push({ t: ck, n: +info.dmg || 0 });
      const sum = rv.heroDmg.reduce((a, e) => a + e.n, 0); const strong = sum >= (A.provocaFrac ?? 0.12) * (info.ability ? (A.provocaHabMult ?? 2) : 1) * (mon.hpMax || 1); // poder de ÁREA/SUPREMA precisa do dobro p/ provocar (é resvalo, não escolha de alvo)
      const om = rv.tgt?.kind === 'rival' ? monOf(list().find((q) => q.uid === rv.tgt.uid)) : null;
      const dueling = !!(om && om.alive && Math.hypot(om.x - mon.x, om.y - mon.y) <= (A.soltaDist ?? 20));
      const ally = !!info.source && info.source !== 'player' && info.source !== 'hero'; const direct = !info.ability && !ally; // golpe DIRETO do herói (espada/arma) = escolha de alvo → sempre provoca
      let foeNear = dueling; if (!foeNear && rivalsCanKill()) for (const o of list()) { if (o === rv || o.out) continue; const m2 = monOf(o); if (m2 && m2.alive && Math.hypot(m2.x - mon.x, m2.y - mon.y) <= (A.provocaRivalPertoR ?? 12)) { foeNear = true; break; } }
      const provoke = direct || (strong && !(info.ability && foeNear)) || rv.tgt?.kind === 'jogador' || (!foeNear && !ally && !playerFull(rv)); // ÁREA/SUPREMA com rival brigando com outro rival: nunca provoca (só golpe direto) // resvalo com outro rival por perto: segue na briga entre rivais
      if (provoke) { rv.threatPlayerUntil = ck + (A.ameacaMs ?? 5000); const PW = (br.provWhy = br.provWhy || {}); const k = `${strong ? 'forte' : 'fraco'}|${info.ability ? 'hab' : ally ? (info.source || 'aliado') : 'golpe'}|${foeNear ? 'briga' : 'livre'}|${rv.tgt?.kind || '-'}`; PW[k] = (PW[k] || 0) + 1; } else { rv.grazed = (rv.grazed || 0) + 1; br.grazed = (br.grazed || 0) + 1; }
    }
    const CA = RC().curvaAlta || {}; const ov = T ? 0 : Math.max(0, (rv.forPlayerL || 1) - (CA.aPartirNv ?? 10));
    const chance = T?.esquivaChance ?? Math.min(CA.esquivaMax ?? 0.62, (E.chance ?? 0.45) + (CA.esquivaPorNivel ?? 0) * ov), cd = T?.esquivaCooldownMs ?? E.cooldownMs ?? 2600; // LOTE-b M3: NV alto esquiva mais
    if (br.clock >= rv.dodgeReady && ctx.R() < chance) {
      if (rivalDodge(mon, from.x, from.y, { vel: E.vel || 7, ms: E.duracaoMs || 280 })) {
        rv.dodgeReady = br.clock + cd; rv.dodges = (rv.dodges || 0) + 1;
        mon.rivalIframeUntil = performance.now() + (E.iframesMs || 420);
        mon.rivalDodgeAt = performance.now();
        return;
      }
    }
    // FAST: BLOQUEIO — com a esquiva em recarga, às vezes ergue a guarda (golpes seguintes causam bem menos dano por um instante)
    if (T && br.clock >= (rv.guardReady || 0) && ctx.R() < (T.bloqueioChance ?? 0)) {
      rv.guardReady = br.clock + (T.bloqueioCooldownMs ?? 2200); rv.blocks = (rv.blocks || 0) + 1;
      mon.rivalGuardUntil = performance.now() + (T.bloqueioMs ?? 650); mon.rivalGuardMult = 1 - (T.bloqueioReduz ?? 0.5);
    }
  }
  function view(p) {
    const br = ctx.br(); if (!br?.rivals) return null; const c = RC();
    return {
      bfs: { n: bfsCount, deferred: bfsDeferred }, giantHitsByRivals: br.giantHitsByRivals || 0, hunters: aliveRivals().filter(isHunter).length, giantsByRivals: br.giantsByRivals || 0, grazed: br.grazed || 0, provWhy: { ...(br.provWhy || {}) }, rivalFires: br.rivalFires || 0, clock: br.clock, atk: { ...(br.atk || { jogador: 0, rival: 0, monstro: 0 }) }, atkWhy: { ...(br.atkWhy || {}) }, bbHits: { ...(br.bbHits || { jogador: 0, rival: 0 }) }, final: !!br.rivalFinal, championUid: br.championUid, championName: br.championName || null, down: br.rivalsDown, byHero: br.rivalsByHero || 0, monKills: br.rivalMonKills || 0,
      list: br.rivals.map((rv) => { const m = monOf(rv); const mp = m ? pos(m) : { x: 0, y: 0 };
        return { uid: rv.uid, name: rv.name, level: rv.level || 1, lvlOff: rv.lvlOff || 0, arma: rv.arma || null, passivas: (rv.passivas || []).slice(), tgtKind: rv.tgt?.kind || null, atk: m ? +(m.atkScale || 1).toFixed(2) : 0, style: rv.style, char: rv.char, skin: rv.skin, perso: rv.perso, persoLabel: rv.persoLabel, retreat: rv.retreatUntil > (ctx.br()?.clock || 0) ? rv.retreat : null, retreats: rv.retreats || 0, backs: rv.backs || 0, color: rv.primary, alive: !!(m && m.alive && !rv.out), out: rv.out, by: rv.by, hp: m ? Math.round(m.hp) : 0, hpMax: m?.hpMax || 0,
          x: +mp.x.toFixed(2), y: +mp.y.toFixed(2), dist: p ? +Math.hypot(mp.x - p.x, mp.y - p.y).toFixed(1) : null, goal: rv.goal ? rv.goal.kind : null, sela: rv.sela ? rv.sela.nome || true : null, fly: rv.fly ? { phase: rv.fly.phase, alt: +rv.fly.alt.toFixed(2), leftMs: Math.round(rv.fly.leftMs), fires: rv.fly.fires || 0 } : null, flights: rv.flights || 0, landings: rv.landings || 0, flyCdUntil: rv.flyCdUntil || 0, kills: rv.kills, chests: rv.chests, bag: rv.bag.length, mcb: rv.mcb,
          champion: rv.champion, ownL: rv.ownL || 1, xpTotal: rv.xpTotal || 0, rivalKills: rv.rivalKills || 0, killedBy: rv.killedBy || null, seen: br.clock - rv.seenAt <= (c.lembraMs || 6000), dodges: rv.dodges || 0, blocks: rv.blocks || 0, tac: m?.tac || null, plen: rv.path ? rv.path.length : null, pi: rv.pathI ?? null, pg: rv.pathGoal ?? null, moved: rv.moved || 0, swingAt: rv.swingAt, state: m ? getAiView(m)?.state || null : null, goal: rv.goal?.kind || null, tgt: rv.tgt?.kind || null, tgtUid: rv.tgt?.uid ?? null, bb: rv.bb ? { id: rv.bb.def.id, nome: rv.bb.def.nome, elemento: rv.bb.def.elemento, tipo: bbAbility(rv.bb.def)?.tipo, fired: rv.bb.S.fired, heals: rv.bb.S.heals, shields: rv.bb.S.shields, veils: rv.bb.S.veils, last: rv.bb.S.lastKind } : null }; })
    };
  }
  /** X1 ⚔: nova rodada — rival com HP cheio, kit zerado (recargas/Nexa/estados) e os dois nos cantos */
  function x1Reset(hx, hy, rx, ry) {
    const br = ctx.br(); const rv = list()[0]; const mon = rv && monOf(rv); if (!rv || !mon) return false;
    mon.hp = mon.hpMax; mon.alive = true; rv.dodgeReady = 0; rv.guardReady = 0; rv.nextSwing = 0; rv.retreat = null; rv.path = null; rv.goal = null;
    if (rv.kit) { rv.fk = newFighter(rv.kit, 100, 1, br.clock || 0, ctx.R); rv.fk.rv = rv; }
    mon.rivalGuardUntil = 0; mon.rivalIframeUntil = 0; mon.slowMultR = 1;
    placeMonster(ctx.st(), mon.uid, rx + 0.5, ry + 0.5); mon.homeX = hx; mon.homeY = hy;
    return true;
  }
  /** X1 ⚔: esquiva de REAÇÃO (ao poder do herói) — mesma recarga/velocidade/i-frames da esquiva normal do rival */
  function x1Dodge(px, py, modo = 'ambos') {
    const br = ctx.br(); const rv = list()[0]; const mon = rv && monOf(rv); if (!rv || !mon || !mon.alive) return false;
    const E = RC().esquiva || {}; const T = RC().tatica;
    const guard = () => { if (!T || br.clock < (rv.guardReady || 0)) return false; rv.guardReady = br.clock + (T.bloqueioCooldownMs ?? 2200); rv.blocks = (rv.blocks || 0) + 1; mon.rivalGuardUntil = performance.now() + (T.bloqueioMs ?? 650); mon.rivalGuardMult = 1 - (T.bloqueioReduz ?? 0.5); return 'guarda'; };
    if (modo === 'guarda' || br.clock < (rv.dodgeReady || 0)) return guard();
    if (!rivalDodge(mon, px, py, { vel: E.vel || 7, ms: E.duracaoMs || 280 })) return guard();
    rv.dodgeReady = br.clock + (T?.esquivaCooldownMs ?? E.cooldownMs ?? 2600); rv.dodges = (rv.dodges || 0) + 1;
    mon.rivalIframeUntil = performance.now() + (E.iframesMs || 420); mon.rivalDodgeAt = performance.now();
    return 'esquiva';
  }
  return { update, onKill, onHit, view, spawn, spawnOne, mitigateFromHero, powersView, x1Reset, x1Dodge, byUid: (uid) => list().find((q) => q.uid === uid) || null, startFinal: () => { const a = aliveRivals(); if (a.length && !ctx.br().rivalFinal) startFinal(a); }, aliveRivals, list, debugPlace: (uid, x, y) => { const m = ctx.st().monstersAlive.find((q) => q.uid === uid); const f = ctx.nearestFree(Math.floor(x), Math.floor(y)); if (!m || !f) return false; placeMonster(ctx.st(), uid, f.x + 0.5, f.y + 0.5); const rv = list().find((q) => q.uid === uid); if (rv) { rv.path = null; rv.goalAt = -1e9; } return true; } };
}
