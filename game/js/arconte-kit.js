/**
 * NEXARA 20261025arconte — KIT DO ARCONTE (vilão; RIVAL CHEFE do X1). Arquivo NOVO: os 9 kits de herói (hero-kits.js) ficam intocados.
 * Mesmo formato de kitFor() → o MESMO código de poderes dos bots (rival-kits.botPower/use/mitigate) e a simulação de duelo usam este kit.
 * Equilíbrio "chefe, mas justo" (scripts/sim-arconte.mjs, 1000 duelos bot × bot por kit): mais vida e dano que um herói, poderes
 * TELEGRAFADOS que dá para esquivar/sair da área (i-frames da esquiva anulam, defesa corta metade) — a IA do X1 continua aprendendo.
 */
export const ARCONTE_ID = 'arconte';
export const ARCONTE_NOME = 'ARCONTE';
export const ARCONTE_KIT = Object.freeze({
  heroi: 'arconte', variante: null, chefe: true, nome: 'ARCONTE', papel: 'Chefe rival · energia negra dos 6 Núcleos',
  hp: 125, vel: 0.95, atk: 0.87, dmgTaken: 1,
  passiva: Object.freeze({ tipo: 'nucleos', por: 0.04, max: 6, decaiMs: 4000, nome: 'Soberania dos Núcleos',
    desc: 'Cada acerto acende 1 dos 6 Núcleos do peito: +4% de dano por Núcleo (até +24%). 4 s sem acertar apaga 1.' }),
  poderes: Object.freeze({
    golpe_poderoso: Object.freeze({ id: 'flecha_abismo', nome: 'FLECHA DO ABISMO', tipo: 'projetil', dano: 16, perfura: true, alcance: 9, lento: 0.35, dur: 1500, kind: 'arcane', cor: 0x0a0010, corTexto: 0xc89aff, cd: 6000, icon: 'pw_orbe',
      desc: 'Flecha NEGRA perfurante (fraca): 16 de dano que atravessa a defesa e escudos, + lentidão 35% por 1,5 s. Só a esquiva escapa.' }),
    ataque_area: Object.freeze({ id: 'ciclone_negro', nome: 'CICLONE DA LÂMINA NEGRA', tipo: 'ciclone', raio: 2.6, dano: 36, ticks: 4, durMs: 1600, lento: 0.6, dur: 1200, cor: 0x0a0010, corTexto: 0xc89aff, cd: 11000, icon: 'pw_machado',
      desc: 'Ele GIRA com a espada negra por 1,6 s acertando tudo em volta (4×9) e o último giro PRENDE (60% lento por 1,2 s). Saia do raio de 2,6.' }),
    suprema: Object.freeze({ id: 'eclipse_primordial', nome: 'ECLIPSE PRIMORDIAL', tipo: 'eclipse', alcance: 8, raio: 3, dano: 46, atrasoMs: 1100, guardaHp: 0.75, lento: 0.5, dur: 1500, cor: 0x0a0010, corTexto: 0xffe2a0, cd: 24000, icon: 'pw_portal',
      desc: 'Os 6 Núcleos acendem e uma BOLA GIGANTE de energia negra cresce sobre o alvo, estalando raios das 6 cores; 1,1 s depois ela desaba (46 em área de raio 3). Guardado para a «fase 2»: ao cair a 75% de vida ele recarrega o Nexa uma vez.' })
  }),
  var: Object.freeze({})
});
export const isArconte = (id) => id === ARCONTE_ID;
/** entrada do ELENCO (br-roster) para o X1 com o Arconte de rival */
export function arconteRoster() {
  return [{ nome: 'Arconte', primary: '#9b4dff', glow: '#9b4dff', char: ARCONTE_ID, skin: '', perso: 'equilibrado', persoLabel: 'Soberano', lvlOff: 0, arma: 'espada', chefe: true }];
}
/**
 * 20261025arconte2 — ARCONTE JOGÁVEL (pedido do Caio: "jogar com o Arconte"). Kit do JOGADOR, separado do chefe do X1:
 * mesmos 3 poderes/passiva/VFX, números de HERÓI (sim bot×bot ≈ 50% contra os 9 — scripts/sim-arconte.mjs KIT=jogador).
 * Sem «fase 2» (guardaHp) — o jogador usa o Eclipse quando quiser. Os 9 kits (hero-kits.js) continuam intocados.
 */
export const ARCONTE_JOGADOR = Object.freeze({
  heroi: 'arconte', variante: null, nome: 'ARCONTE', papel: 'Soberano · energia negra dos 6 Núcleos',
  hp: 102, vel: 1, atk: 1.06, dmgTaken: 1,
  passiva: ARCONTE_KIT.passiva,
  poderes: Object.freeze({
    golpe_poderoso: Object.freeze({ ...ARCONTE_KIT.poderes.golpe_poderoso, pierce: 2,
      desc: 'Flecha NEGRA perfurante (fraca): 16 de dano, atravessa até 2 alvos, + lentidão 35% por 1,5 s.' }),
    ataque_area: Object.freeze({ ...ARCONTE_KIT.poderes.ataque_area,
      desc: 'Você GIRA com a espada negra por 1,6 s acertando tudo em volta (4×9, raio 2,6); o último giro deixa 60% lento por 1,2 s.' }),
    suprema: Object.freeze((({ guardaHp, ...p }) => ({ ...p, desc: 'Uma BOLA GIGANTE de energia negra cresce sobre o alvo com raios das 6 cores e desaba após 1,1 s (46 em área de raio 3, 50% lento por 1,5 s).' }))(ARCONTE_KIT.poderes.suprema))
  }),
  var: Object.freeze({})
});
/** entrada da SELEÇÃO de herói (fora de PERSONAGENS → os rivais da Arena/FAST continuam só os 9) */
export const ARCONTE_PICK = Object.freeze({ id: ARCONTE_ID, name: 'ARCONTE', perso: 'equilibrado', skin: '', art: null, extra: true });
