/** Arquivo Nexara — categories; unknown = DESCONHECIDO */
export const CATEGORIES = [
  'personagens', 'zonas', 'faccoes', 'criaturas', 'quests', 'memorias', 'pistas'
];

export function createEmptyArquivo(data) {
  const a = {};
  for (const c of CATEGORIES) a[c] = {};

  for (const n of data.npcs.npcs) {
    a.personagens[n.id] = { name: n.name, known: false, text: n.description };
  }
  // Zones start unknown; G6 revealed on new game. E4 reveals on visit.
  for (const z of data.zones.zones) {
    a.zonas[z.id] = { name: `${z.code} ${z.name}`, known: false, text: z.description };
  }
  for (const f of data.factions.factions) {
    a.faccoes[f.id] = { name: f.name, known: false, text: f.description };
  }
  for (const m of data.monsters.monsters) {
    a.criaturas[m.id] = { name: m.name, known: false, text: m.description };
  }
  for (const q of data.quests.quests) {
    a.quests[q.id] = { name: q.name, known: false, text: q.description };
  }
  a.memorias['mem_0217'] = {
    name: 'Fragmento 02:17',
    known: false,
    text: 'Visão: dragão contido. Máquinas. Humanos. O dispositivo não apagou.'
  };
  a.pistas['pista_dragao_jovem'] = {
    name: 'Dragão jovem',
    known: false,
    text: 'Alguém fala em ~72 horas. O jovem não está no Núcleo.'
  };
  a.pistas['pista_nao_sou_fonte'] = {
    name: 'NÃO SOU SUA FONTE',
    known: false,
    text: 'Mensagem nos monitores após o blackout.'
  };
  a.pistas['pista_contrato_sangue_verde'] = {
    name: 'Contrato Sangue Verde',
    known: false,
    text: 'Documento/rumor aponta C2 Forja Verde. Sem acesso na Fase 02.'
  };
  a.pistas['pista_torre_fantasma'] = {
    name: 'Torre Fantasma',
    known: false,
    text: 'Cartaz: «ÓRBITA NÃO RESPONDE.» F5 fora de alcance.'
  };
  a.pistas['pista_presenca_sem_nome'] = {
    name: 'Presença Sem Nome',
    known: false,
    text: 'Sentida no Subsolo Negro. Sem rosto, sem contrato, sem explicação.'
  };
  return a;
}

export function reveal(arquivo, category, id) {
  if (arquivo[category] && arquivo[category][id]) {
    arquivo[category][id].known = true;
  }
}

export function label(entry) {
  if (!entry || !entry.known) return 'DESCONHECIDO';
  return entry.name;
}
