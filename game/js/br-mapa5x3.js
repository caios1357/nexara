/**
 * NEXARA — ETAPA 1 · MAPA NOVO 5×3 (20261029mapa). Aprovado: 00-mapa-completo-5x3.png.
 * Transforma (CÓPIA) a config de PROJETO da ARENA (data/arena_br.json intacto) numa grade 5 colunas × 3 linhas de quadrados do tamanho de um distrito.
 *   Linha 1 (norte): FAVELA · ZONA DE GUERRA FINAL · CASTELO DO ARCONTE (bloqueado) · ZONA DE GUERRA FINAL · CIDADE 2 · ELITE
 *   Linha 2:         FAVELA · FAVELA · ZONA DE GUERRA FINAL · CIDADE 2 · ELITE · TERRAÇO DO DRAGÃO
 *   Linha 3 (sul):   ACESSO DE AVANÇO · RESIDÊNCIA · GUILDA · LABIRINTO · TORRE DE VIGIA · ARMAZÉM NERVO
 * Os 6 distritos antigos mantêm id/conteúdo (só mudam de lugar e de nome exibido):
 *   floresta → Acesso de Avanço · periferia → Residência · Guilda · complexo → Labirinto · ruinas → Torre de Vigia · elite → Armazém Nervo · dragao → Terraço do Dragão
 * ?mapa=6 volta ao mapa antigo de 6 distritos (rollback). FAST e X1 NÃO passam por aqui (partem de arena_br_design).
 */
export const MAPA5X3_CELL = { w: 30, h: 25 }; // unidades de PROJETO (×escala 2 = 60×50 tiles por quadrado)

export function mapa5x3Ativo() {
  try { const q = new URLSearchParams(globalThis.location?.search || '').get('mapa'); if (q === '6' || q === 'antigo') return false; } catch { /* sem URL */ }
  return true;
}

const MON = {
  favela: { mon_br_rastreador: 3, mon_br_enxame: 2, mon_br_cacador: 1 },
  guerra: { mon_br_brutamonte: 2, mon_br_cacador: 2, mon_br_mutante: 2, mon_br_guardiao: 1 },
  cidade2: { mon_br_guardiao: 2, mon_br_cacador: 2, mon_br_elite: 1, mon_br_predador: 1 }
};

export function applyMapa5x3(cfg0) {
  if (!cfg0?.regioes || cfg0._mapa5x3 || !mapa5x3Ativo()) return cfg0;
  const c = JSON.parse(JSON.stringify(cfg0));
  const CW = MAPA5X3_CELL.w, CH = MAPA5X3_CELL.h;
  const cell = (col, row) => ({ x0: 1 + col * CW, x1: CW + col * CW, y0: 1 + row * CH, y1: CH + row * CH });
  const byId = Object.fromEntries(c.regioes.map((r) => [r.id, r]));
  const OLD = { // id → [col,row, nome novo]
    floresta: [0, 2, 'Acesso de Avanço'], periferia: [1, 2, 'Residência · Guilda'], complexo: [2, 2, 'Labirinto'],
    ruinas: [3, 2, 'Torre de Vigia'], elite: [4, 2, 'Armazém Nervo'], dragao: [4, 1, 'Terraço do Dragão']
  };
  for (const [id, [col, row, nome]] of Object.entries(OLD)) { const r = byId[id]; if (!r) continue; Object.assign(r, cell(col, row)); r.nomeAntigo = r.nome; r.nome = nome; }
  if (byId.periferia) byId.periferia.guilda = true;
  const NEW = [
    { id: 'favela_n', col: 0, row: 0, nome: 'Favela', estilo: 'favela', cor: '#ff8a3a', risco: 1, loot: 'basico', altura: 0, densidade: 0.6 },
    { id: 'favela_c', col: 0, row: 1, nome: 'Favela · Casa do Charles', estilo: 'favela', cor: '#ff8a3a', risco: 1, loot: 'basico', altura: 0, densidade: 0.6 },
    { id: 'favela_l', col: 1, row: 1, nome: 'Favela', estilo: 'favela', cor: '#ff8a3a', risco: 1, loot: 'basico', altura: 0, densidade: 0.6 },
    { id: 'guerra_o', col: 1, row: 0, nome: 'Zona de Guerra Final', estilo: 'guerra', cor: '#ff3b3b', risco: 4, loot: 'alto', altura: 0, densidade: 0.75 },
    { id: 'guerra_c', col: 2, row: 1, nome: 'Zona de Guerra Final', estilo: 'guerra', cor: '#ff3b3b', risco: 4, loot: 'alto', altura: 0, densidade: 0.75 },
    { id: 'guerra_l', col: 3, row: 0, nome: 'Zona de Guerra Final', estilo: 'guerra', cor: '#ff3b3b', risco: 4, loot: 'alto', altura: 0, densidade: 0.75 },
    { id: 'castelo', col: 2, row: 0, nome: 'Castelo do Arconte', estilo: 'castelo', cor: '#b36bff', risco: 5, loot: 'lendario', altura: 0, densidade: 0, bloqueado: true },
    { id: 'cidade2_n', col: 4, row: 0, nome: 'Cidade 2 · Elite', estilo: 'cidade2', cor: '#ffe08a', risco: 3, loot: 'avancado', altura: 0.45, densidade: 0.8 },
    { id: 'cidade2_s', col: 3, row: 1, nome: 'Cidade 2 · Elite', estilo: 'cidade2', cor: '#ffe08a', risco: 3, loot: 'avancado', altura: 0.45, densidade: 0.8 }
  ];
  let n = Math.max(...c.regioes.map((r) => r.n)) + 1;
  for (const d of NEW) { const { col, row, ...rest } = d; c.regioes.push({ ...rest, n: n++, ...cell(col, row), monstros: d.bloqueado ? {} : { ...MON[d.estilo] } }); }
  c.zona = { ...c.zona, width: 5 * CW + 2, height: 3 * CH + 2 };
  c.spawnHeroi = { x: 10, y: 44 }; // FAVELA (Casa do Charles) → Acesso de Avanço (sul) → Residência/Guilda (leste)
  const dc = cell(4, 1);
  c.dragao.x = Math.round((dc.x0 + dc.x1) / 2); c.dragao.y = Math.round((dc.y0 + dc.y1) / 2);
  c.dragao.territorio = { x0: dc.x0 + 3, x1: dc.x1 - 2, y0: dc.y0 + 3, y1: dc.y1 - 2 };
  for (const p of c.extracao?.pontos || []) { if (p.id === 'ext_sul') { p.x = 100; p.y = 72; } else if (p.id === 'ext_norte') { p.x = 6; p.y = 4; } }
  const z = c.zonaSegura; z.centro = { x: Math.round((5 * CW + 2) / 2), y: Math.round(CH * 1.5) + 1 };
  const RAIOS = [50, 35, 22, 11]; // ~0,59 da meia-diagonal (o antigo 46 era ~0,73 de um mapa menor): cantos (Favela, Residência, Terraço) começam fora
  z.estagios = z.estagios.map((e, i) => ({ ...e, raio: RAIOS[i] ?? e.raio }));
  for (const d of NEW) {
    const b = d.bloqueado ? 0 : d.estilo === 'favela' ? 4 : 5; const k = d.bloqueado ? 0 : d.estilo === 'cidade2' ? 4 : 5;
    c.bausPorRegiao[d.id] = b; c.caixasPorRegiao[d.id] = k;
  }
  // áreas de ninho/emboscada dos estilos novos
  const nin = c.diretor?.encontros?.ninhos?.areas; if (nin) { for (const d of NEW) if (!d.bloqueado) nin[d.id] = d.estilo === 'guerra' ? ['cratera', 'ruina_saque'] : d.estilo === 'cidade2' ? ['jardim', 'praca'] : ['deposito', 'praca']; }
  c.rotas = [
    { id: 'C1', nome: 'Rota do Capítulo 1 — Favela → Acesso de Avanço → Residência · Guilda', via: ['favela_c', 'floresta', 'periferia'] },
    { id: 'A', nome: 'Rota A — Zona de Guerra → Cidade 2 → Terraço do Dragão', via: ['favela_l', 'guerra_c', 'cidade2_s', 'dragao'] },
    { id: 'B', nome: 'Rota B — Labirinto → Torre de Vigia → Armazém Nervo', via: ['periferia', 'complexo', 'ruinas', 'elite'] }
  ];
  c._mapa5x3 = true;
  return c;
}
