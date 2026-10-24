/**
 * NEXARA 20261024poder — KITS DOS 9 HERÓIS (poderes + jogabilidade próprios) e as 6 VARIANTES ELEMENTAIS do Guerreiro.
 * Arquivo NOVO de dados (data/*.json intocados). Usado pelo jogador (hero-powers.js), pelos rivais BOT (rival-kits.js),
 * pela tela de seleção (hero-select.js) e pela simulação de equilíbrio (bot × bot).
 *  - Os 3 SLOTS de especial mantêm os IDs (golpe_poderoso · ataque_area · suprema), a Nexa e o layout do editor.
 *  - ESQUIVA, DEFESA e INVESTIDA (dash) continuam iguais para todos.
 *  - `dano` = dano no NV1 contra um rival NV1 (defesa 7); escala com o nível (ataque) e passa pelos modificadores.
 *  - Só vale na PARTIDA JUSTA (todos NV1, armas básicas); fora dela os especiais antigos continuam.
 */
export const SLOTS = ['golpe_poderoso', 'ataque_area', 'suprema'];

export const KITS = {
  cavaleiro: { nome: 'GUERREIRO', hp: 110, vel: 1, atk: 1, papel: 'Equilibrado · lâmina de energia',
    passiva: { tipo: 'escudo_acerto', frac: 0.02, teto: 0.2, nome: 'Guarda Azul', desc: 'Cada acerto gera escudo de 2% da vida (até 20%).' },
    poderes: {
      golpe_poderoso: { id: 'corte_azul', nome: 'CORTE AZUL', tipo: 'projetil', dano: 30, alcance: 7, kind: 'charged', cor: 0x3a9cff, cd: 5000, icon: 'pw_corte', desc: 'Lança uma lâmina de energia (30).' },
      ataque_area: { id: 'grito_guerra', nome: 'GRITO DE GUERRA', tipo: 'buff', dmg: 0.2, dragao: 0.2, dur: 6000, cd: 14000, icon: 'pw_grito', desc: '+20% de dano para você e o mini dragão por 6 s.' },
      suprema: { id: 'lamina_nucleo', nome: 'LÂMINA DO NÚCLEO', tipo: 'linha', dano: 55, alcance: 8, largura: 1.3, cd: 25000, icon: 'pw_linha', desc: 'Corte gigante em linha (55).' } } },
  arqueiro: { nome: 'ARQUEIRO', hp: 95, vel: 1.1, atk: 1.33, papel: 'Rápido · dano de longe',
    passiva: { tipo: 'longe', dist: 3, mult: 0.2, nome: 'Olho de Falcão', desc: '+20% de dano em alvos a 3+ tiles.' },
    poderes: {
      golpe_poderoso: { id: 'flecha_perfurante', nome: 'FLECHA PERFURANTE', tipo: 'projetil', dano: 28, alcance: 9, pierce: 2, kind: 'arrow', cor: 0x9fe8ff, cd: 5000, icon: 'pw_flecha', desc: 'Atravessa até 3 alvos (28).' },
      ataque_area: { id: 'salto_tras', nome: 'SALTO PRA TRÁS', tipo: 'salto_tras', dist: 3, armadilha: { raio: 1.7, dano: 12, lento: 0.5, dur: 2500 }, cd: 10000, icon: 'pw_salto_tras', desc: 'Pula 3 tiles para trás e deixa uma armadilha (12 + lentidão).' },
      suprema: { id: 'chuva_flechas', nome: 'CHUVA DE FLECHAS', tipo: 'area_alvo', alcance: 7, raio: 3.2, dano: 50, ticks: 5, durMs: 3000, cor: 0x9fe8ff, cd: 25000, icon: 'pw_chuva', desc: 'Área grande: 50 em 3 s.' } } },
  mago: { nome: 'MAGO', hp: 95, vel: 1, atk: 1.31, papel: 'Frágil · magia teleguiada',
    passiva: { tipo: 'nexa_regen', mult: 0.3, nome: 'Fluxo Arcano', desc: '+30% de regeneração de Nexa.' },
    poderes: {
      golpe_poderoso: { id: 'orbe_arcano', nome: 'ORBE ARCANO', tipo: 'projetil', dano: 30, alcance: 9, homing: true, kind: 'arcane', cor: 0xb46cff, cd: 5000, icon: 'pw_orbe', desc: 'Orbe teleguiado (30).' },
      ataque_area: { id: 'teleporte', nome: 'TELEPORTE CURTO', tipo: 'teleporte', dist: 4, iframeMs: 350, cd: 9000, icon: 'pw_teleporte', desc: 'Some e reaparece 4 tiles à frente.' },
      suprema: { id: 'meteoro', nome: 'METEORO', tipo: 'area_alvo', alcance: 7, raio: 2.6, dano: 60, atrasoMs: 900, cor: 0xff7a2a, cd: 25000, icon: 'pw_meteoro', desc: 'Meteoro cai após 0,9 s (60 em área).' } } },
  ninja: { nome: 'NINJA', hp: 84, vel: 1.2, atk: 1.3, papel: 'Muito rápido · pelas costas',
    passiva: { tipo: 'costas', mult: 0.5, nome: 'Sombra', desc: '+50% de dano em quem não está te encarando.' },
    poderes: {
      golpe_poderoso: { id: 'shurikens', nome: 'SHURIKENS', tipo: 'leque', n: 3, dano: 10, spreadDeg: 12, alcance: 7, kind: 'bolt', cor: 0xd0d8e8, cd: 5000, icon: 'pw_shuriken', desc: '3 shurikens (3×10).' },
      ataque_area: { id: 'fumaca', nome: 'BOMBA DE FUMAÇA', tipo: 'invisivel', dur: 3000, cd: 14000, icon: 'pw_fumaca', desc: 'Invisível por 3 s: os rivais perdem o alvo (atacar revela).' },
      suprema: { id: 'mil_cortes', nome: 'MIL CORTES', tipo: 'mil_cortes', alvos: 5, raio: 6, dano: 50, cd: 25000, icon: 'pw_mil', desc: 'Teleporta entre até 5 alvos (50 no total).' } } },
  paladino: { nome: 'CAVALEIRO', hp: 135, vel: 0.9, atk: 0.76, papel: 'Lento · muito resistente',
    passiva: { tipo: 'frontal', red: 0.25, nome: 'Escudo Sagrado', desc: '-25% de dano vindo da frente.' },
    poderes: {
      golpe_poderoso: { id: 'escudo_investida', nome: 'ESCUDO INVESTIDA', tipo: 'investida', dist: 2.5, dano: 22, stunMs: 600, kb: 2.2, cd: 6000, icon: 'pw_escudo', desc: 'Avança com o escudo: empurra e atordoa (22).' },
      ataque_area: { id: 'muralha', nome: 'MURALHA', tipo: 'muralha', dur: 4000, cd: 14000, icon: 'pw_muralha', desc: 'Bloqueia projéteis e poderes à distância por 4 s.' },
      suprema: { id: 'martelo_sagrado', nome: 'MARTELO SAGRADO', tipo: 'area_self', raio: 2.8, dano: 45, stunMs: 1000, cor: 0xffd23f, cd: 25000, icon: 'pw_martelo', desc: 'Atordoa todos em volta (45).' } } },
  cacadora: { nome: 'CAÇADORA', hp: 102, vel: 1.1, atk: 1.35, papel: 'Rápida · finalizadora',
    passiva: { tipo: 'execucao', abaixo: 0.5, mult: 0.3, nome: 'Instinto', desc: '+30% de dano em alvos abaixo de 50% de vida.' },
    poderes: {
      golpe_poderoso: { id: 'lanca', nome: 'LANÇA ARREMESSADA', tipo: 'projetil', dano: 28, alcance: 8, puxa: true, kind: 'bolt', cor: 0xffb020, cd: 5000, icon: 'pw_lanca', desc: 'Acerta e puxa o alvo até você (28).' },
      ataque_area: { id: 'marca_presa', nome: 'MARCA DA PRESA', tipo: 'marca', alcance: 10, dur: 8000, mult: 0.25, cd: 12000, icon: 'pw_marca', desc: 'Revela o alvo: +25% de dano nele por 8 s.' },
      suprema: { id: 'fera_interior', nome: 'FERA INTERIOR', tipo: 'buff', vel: 0.4, curaAcerto: 0.03, dur: 6000, cd: 25000, icon: 'pw_fera', desc: '+40% de velocidade e cura ao acertar por 6 s.' } } },
  bruxo: { nome: 'BRUXO', hp: 92, vel: 1, atk: 1.15, papel: 'Veneno · controle',
    passiva: { tipo: 'veneno', dps: 3, dur: 3000, nome: 'Toque Pútrido', desc: 'Golpes envenenam: 3 de dano por segundo (3 s).' },
    poderes: {
      golpe_poderoso: { id: 'maldicao', nome: 'MALDIÇÃO', tipo: 'maldicao', alcance: 7, dano: 10, lento: 0.6, vuln: 0.2, dur: 5000, cd: 9000, icon: 'pw_maldicao', desc: 'Lentidão e +20% de dano recebido por 5 s (10).' },
      ataque_area: { id: 'corrente_almas', nome: 'CORRENTE DE ALMAS', tipo: 'dreno', alcance: 6, dano: 25, cura: 25, cd: 10000, icon: 'pw_corrente', desc: 'Rouba 25 de vida.' },
      suprema: { id: 'portal_sombrio', nome: 'PORTAL SOMBRIO', tipo: 'portal', alcance: 7, raio: 4, dano: 45, atrasoMs: 600, cor: 0x9b4dff, cd: 25000, icon: 'pw_portal', desc: 'Puxa todos para o centro e explode (45).' } } },
  samurai: { nome: 'SAMURAI', hp: 100, vel: 1.1, atk: 0.88, papel: 'Rápido · duelista',
    passiva: { tipo: 'parry_cd', ms: 1000, nome: 'Mente Calma', desc: 'Bloqueio perfeito recarrega 1 s dos poderes.' },
    poderes: {
      golpe_poderoso: { id: 'iaijutsu', nome: 'IAIJUTSU', tipo: 'cone', dano: 30, alcance: 2.6, meioAngulo: 40, instant: true, cd: 5000, icon: 'pw_iai', desc: 'Corte instantâneo (30).' },
      ataque_area: { id: 'postura', nome: 'POSTURA', tipo: 'postura', dur: 2500, refl: 2, cd: 14000, icon: 'pw_postura', desc: 'O próximo golpe recebido é anulado e volta em dobro.' },
      suprema: { id: 'corte_raio', nome: 'CORTE DO RAIO', tipo: 'linha', dano: 60, alcance: 10, largura: 1.2, cd: 25000, icon: 'pw_raio', desc: 'Corte em linha longa (60).' } } },
  berserker: { nome: 'BERSERKER', hp: 105, vel: 0.9, atk: 0.745, papel: 'Lento · fica mais forte ferido',
    passiva: { tipo: 'furia', max: 0.4, nome: 'Sangue Quente', desc: 'Até +40% de dano conforme perde vida.' },
    poderes: {
      golpe_poderoso: { id: 'machado_giratorio', nome: 'MACHADO GIRATÓRIO', tipo: 'giro', raio: 2.1, dano: 35, ticks: 4, durMs: 2000, cor: 0xff4a2a, cd: 7000, icon: 'pw_machado', desc: 'Gira por 2 s (35 no total).' },
      ataque_area: { id: 'salto_brutal', nome: 'SALTO BRUTAL', tipo: 'salto', alcance: 5, raio: 2, dano: 30, stunMs: 700, cor: 0xc87a3a, cd: 10000, icon: 'pw_salto', desc: 'Salta no alvo e atordoa em volta (30).' },
      suprema: { id: 'furia_lava', nome: 'FÚRIA DE LAVA', tipo: 'buff', dmg: 0.5, imortal: true, dur: 6000, cd: 25000, icon: 'pw_lava', desc: '6 s sem morrer e +50% de dano.' } } }
};

/** EQUILÍBRIO (20261024poder; r2 20261024r2: Ninja/Caçadora/Bruxo mais fortes, Terra/Berserker/Mago um pouco menos → 48–51 % em 1000 lutas/par): vida/ataque ajustados pela simulação bot × bot (scripts/sim-equilibrio.mjs) — ver visual/poderes.md.
 *  6 variantes do GUERREIRO (as skins elementais da folha do Caio) — mudam atributos e efeitos de verdade. */
export const VARIANTES = {
  azul: { nome: 'AZUL', hp: 110, atk: 1, desc: 'Equilibrado.' },
  fogo: { nome: 'FOGO', hp: 95, atk: 1.11, queima: { dps: 2, dur: 3000 }, desc: 'Mais ataque · golpes queimam (chamas).' },
  raio: { nome: 'RAIO', hp: 110, atk: 1, vel: 1.15, corteSalta: 3, desc: '+15% de velocidade · Corte Azul salta para 3 inimigos (raio).' },
  veneno: { nome: 'VENENO', hp: 110, atk: 0.79, veneno: { dps: 3, dur: 3000 }, gritoEnfraquece: { raio: 4, mult: 0.2, dur: 6000 }, desc: 'Golpes envenenam · Grito enfraquece em volta (-20% de dano).' },
  terra: { nome: 'TERRA', hp: 115, atk: 0.76, vel: 0.9, dmgTaken: 0.82, desc: '-18% de dano recebido · -10% de velocidade.' },
  vento: { nome: 'VENTO', hp: 95, atk: 1.18, investidaDupla: true, kb: 1.6, desc: 'Investida dupla · mais empurrão.' }
};
export const VARIANTE_IDS = Object.keys(VARIANTES);
export const temVariantes = (id) => id === 'cavaleiro';

/** Kit efetivo (herói + variante do Guerreiro). Objeto novo e congelável (cache por chave). */
const cache = new Map();
export function kitFor(heroId, skin) {
  const base = KITS[heroId]; if (!base) return null;
  const vId = temVariantes(heroId) ? (VARIANTES[skin] ? skin : 'azul') : null;
  const key = heroId + '|' + (vId || ''); if (cache.has(key)) return cache.get(key);
  const v = vId ? VARIANTES[vId] : {};
  const k = { heroi: heroId, variante: vId, nome: base.nome + (vId ? ' ' + VARIANTES[vId].nome : ''), papel: base.papel,
    hp: v.hp ?? base.hp, vel: (base.vel ?? 1) * (v.vel ?? 1), atk: (base.atk ?? 1) * (v.atk ?? 1), dmgTaken: v.dmgTaken ?? 1,
    passiva: base.passiva, poderes: base.poderes, var: v };
  cache.set(key, k); return k;
}
/** linha curta de atributos (seleção / relatório) */
export function statLine(k) {
  const pct = (x) => (x === 1 ? '' : `${x > 1 ? '+' : ''}${Math.round((x - 1) * 100)}%`);
  return [`VIDA ${k.hp}`, k.vel !== 1 ? `VEL ${pct(k.vel)}` : 'VEL normal', k.atk !== 1 ? `ATQ ${pct(k.atk)}` : null, k.dmgTaken !== 1 ? `DANO RECEBIDO ${pct(k.dmgTaken)}` : null].filter(Boolean).join(' · ');
}
