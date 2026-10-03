/**
 * NEXARA — ícones ORIGINAIS (Bloco V), desenhados à mão em SVG (sem assets de terceiros).
 * Também exportados como arquivos em game/assets/icons/*.svg (scripts/export-icons.mjs).
 * Todos usam currentColor para herdar a cor de raridade / acento.
 */
const S = (body, vb = '0 0 64 64') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const ICONS = {
  /** Espada fina (botão de ataque). */
  espada: S('<path d="M46 8 L56 8 L56 18 L26 48" /><path d="M46 8 L16 38" /><path d="M14 36 L28 50" stroke-width="4"/><path d="M20 44 L10 54" stroke-width="5"/><circle cx="9" cy="55" r="3" fill="currentColor"/><path d="M50 14 L22 42" stroke-width="1.5" opacity="0.7"/>'),
  cadeado: S('<rect x="16" y="28" width="32" height="26" rx="4"/><path d="M22 28 V20 a10 10 0 0 1 20 0 V28"/><circle cx="32" cy="40" r="3" fill="currentColor"/><path d="M32 43 V48"/>'),
  /** Slots EM DESENVOLVIMENTO (Bloco 4): esquiva, defesa, especial. */
  esquiva: S('<path d="M12 20 L26 32 L12 44"/><path d="M26 20 L40 32 L26 44"/><path d="M40 20 L54 32 L40 44" opacity="0.5"/>'),
  defesa: S('<path d="M32 8 L52 16 V30 C52 44 43 52 32 57 C21 52 12 44 12 30 V16 Z"/><path d="M32 18 V46" opacity="0.6"/>'),
  especial: S('<path d="M32 6 L37 25 L56 32 L37 39 L32 58 L27 39 L8 32 L27 25 Z"/><circle cx="32" cy="32" r="5" fill="currentColor"/>'),
  seta: S('<path d="M20 38 L32 24 L44 38" stroke-width="5"/>'),
  /** Bloco 4: especiais + trava de alvo (originais). */
  golpe_poderoso: S('<path d="M44 6 L54 6 L54 16 L28 42"/><path d="M44 6 L20 30"/><path d="M16 30 L32 46" stroke-width="4"/><path d="M22 40 L12 50" stroke-width="5"/><path d="M8 20 L14 24 M6 32 L13 32 M20 8 L23 15" stroke-width="2.5" opacity="0.8"/><circle cx="41" cy="23" r="6" fill="currentColor" fill-opacity="0.35" stroke-width="2"/>'),
  ataque_area: S('<circle cx="32" cy="32" r="8" fill="currentColor" fill-opacity="0.3"/><path d="M32 8 A24 24 0 0 1 56 32" /><path d="M56 32 L50 28 M56 32 L59 26" stroke-width="2.5"/><path d="M32 56 A24 24 0 0 1 8 32" /><path d="M8 32 L14 36 M8 32 L5 38" stroke-width="2.5"/><path d="M14 16 A24 24 0 0 1 20 11" opacity="0.6"/><path d="M50 48 A24 24 0 0 1 44 53" opacity="0.6"/>'),
  dash: S('<path d="M30 16 L48 32 L30 48" stroke-width="4"/><path d="M40 32 H56" stroke-width="3.5"/><path d="M6 24 H22 M4 32 H26 M6 40 H22" stroke-width="2.5" opacity="0.7"/>'),
  suprema: S('<path d="M32 4 L38 22 L56 16 L44 32 L56 48 L38 42 L32 60 L26 42 L8 48 L20 32 L8 16 L26 22 Z" fill="currentColor" fill-opacity="0.2"/><circle cx="32" cy="32" r="7" fill="currentColor"/><circle cx="32" cy="32" r="14" opacity="0.5" stroke-width="2"/>'),
  alvo: S('<circle cx="32" cy="32" r="18"/><path d="M32 6 V20 M32 44 V58 M6 32 H20 M44 32 H58" stroke-width="3.5"/><path d="M26 32 L32 26 L38 32 L32 38 Z" fill="currentColor"/>'),
  /** Passivas. */
  furia_cibernetica: S('<path d="M18 50 C10 38 16 24 26 18 C24 26 30 28 32 22 C36 30 44 28 44 18 C54 28 54 44 44 52" /><path d="M24 44 L34 26" stroke-width="3.5"/><path d="M31 47 L41 29" stroke-width="3.5"/><path d="M38 49 L46 35" stroke-width="3.5"/>'),
  condutor_de_nexa: S('<path d="M36 6 L16 36 H30 L26 58 L48 26 H34 Z" fill="currentColor" fill-opacity="0.25"/><circle cx="32" cy="32" r="27" opacity="0.35" stroke-width="2"/>'),
  nucleo_reforcado: S('<path d="M32 6 L54 14 V30 C54 45 44 54 32 59 C20 54 10 45 10 30 V14 Z"/><path d="M32 16 L44 22 V31 C44 39 39 44 32 47 C25 44 20 39 20 31 V22 Z" fill="currentColor" fill-opacity="0.3"/>'),
  impulso_neural: S('<path d="M8 40 C20 38 26 30 30 18 C34 30 40 36 56 36"/><path d="M14 50 L26 50" /><path d="M10 58 L30 58" opacity="0.6"/><path d="M36 50 L54 50" opacity="0.6"/><circle cx="30" cy="16" r="4" fill="currentColor"/>'),
  mira_neural: S('<circle cx="32" cy="32" r="20"/><circle cx="32" cy="32" r="8"/><path d="M32 4 V16 M32 48 V60 M4 32 H16 M48 32 H60"/><circle cx="32" cy="32" r="2" fill="currentColor"/>'),
  cacador_de_monstros: S('<path d="M16 12 C18 22 22 26 24 28 M48 12 C46 22 42 26 40 28"/><path d="M20 30 C20 18 44 18 44 30 V40 C44 48 38 54 32 54 C26 54 20 48 20 40 Z"/><circle cx="27" cy="36" r="3" fill="currentColor"/><circle cx="37" cy="36" r="3" fill="currentColor"/><path d="M28 46 H36"/>'),
  nucleo_divino: S('<circle cx="32" cy="32" r="9" fill="currentColor" fill-opacity="0.35"/><path d="M32 4 V16 M32 48 V60 M4 32 H16 M48 32 H60 M12 12 L20 20 M44 44 L52 52 M52 12 L44 20 M20 44 L12 52"/><circle cx="32" cy="32" r="16" opacity="0.5" stroke-width="2"/>'),
  /** EVO: 10 passivas novas — ícones próprios (formas distintas, nada de hexágono genérico). */
  eco_runico: S('<circle cx="32" cy="32" r="24" opacity="0.45" stroke-width="2"/><circle cx="32" cy="32" r="16" opacity="0.7" stroke-width="2"/><path d="M22 44 L32 16 L42 44 M26 34 H38" stroke-width="3.5"/><path d="M8 22 C4 30 4 34 8 42 M56 22 C60 30 60 34 56 42" stroke-width="2.5"/>'),
  fagulha_em_cadeia: S('<path d="M8 14 L22 26 L16 30 L30 40" stroke-width="3.5"/><path d="M30 40 L40 30 L36 26 L56 12" stroke-width="3.5"/><circle cx="8" cy="14" r="4" fill="currentColor"/><circle cx="30" cy="40" r="5" fill="currentColor" fill-opacity="0.5"/><circle cx="56" cy="12" r="4" fill="currentColor"/><path d="M30 46 L26 56 M34 46 L40 56" stroke-width="2.5" opacity="0.7"/>'),
  reflexo_fantasma: S('<path d="M24 12 L40 28 L30 54 L16 32 Z" fill="currentColor" fill-opacity="0.2"/><path d="M40 10 L54 26 L46 46" opacity="0.55"/><path d="M12 16 L6 30 L12 44" opacity="0.4"/><path d="M24 12 L30 54" stroke-width="1.8"/>'),
  telemetria_neural: S('<circle cx="32" cy="34" r="22" stroke-dasharray="6 5"/><path d="M32 34 L46 18" stroke-width="3.5"/><path d="M32 34 L32 12" opacity="0.5" stroke-width="2"/><path d="M32 34 m-12 0 a12 12 0 0 1 12 -12" opacity="0.7"/><circle cx="32" cy="34" r="3" fill="currentColor"/><circle cx="46" cy="18" r="3" fill="currentColor"/>'),
  sobrecarga_de_nexa: S('<path d="M32 6 L56 48 H8 Z" opacity="0.8"/><path d="M32 58 L8 16 H56 Z" opacity="0.8"/><path d="M34 20 L26 34 H33 L29 46 L40 30 H33 Z" fill="currentColor" stroke-width="2"/>'),
  sifao_de_reator: S('<circle cx="32" cy="32" r="8" fill="currentColor" fill-opacity="0.4"/><path d="M6 12 C18 14 22 22 26 28" /><path d="M58 12 C46 14 42 22 38 28"/><path d="M6 52 C18 50 22 42 26 36"/><path d="M58 52 C46 50 42 42 38 36"/><path d="M24 26 L26 28 L23 30 M40 26 L38 28 L41 30" stroke-width="2"/>'),
  quebra_postura: S('<path d="M32 6 L52 14 V30 C52 44 43 52 32 57 C21 52 12 44 12 30 V14 Z"/><path d="M30 8 L36 22 L28 32 L36 42 L32 56" stroke-width="3.5"/><path d="M36 22 L48 26 M28 32 L16 36" stroke-width="2.5"/>'),
  coracao_de_dragao: S('<path d="M32 52 C10 38 10 20 22 16 C28 14 31 18 32 22 C33 18 36 14 42 16 C54 20 54 38 32 52 Z" fill="currentColor" fill-opacity="0.3"/><path d="M20 12 L24 4 L28 12 M36 12 L40 4 L44 12" stroke-width="2.5"/><path d="M26 32 L32 26 L38 32 L32 40 Z" fill="currentColor"/>'),
  blindagem_adaptativa: S('<path d="M22 8 L34 8 L40 18 L34 28 L22 28 L16 18 Z"/><path d="M40 20 L52 20 L58 30 L52 40 L40 40 L34 30 Z" fill="currentColor" fill-opacity="0.3"/><path d="M22 34 L34 34 L40 44 L34 54 L22 54 L16 44 Z"/>'),
  nucleo_de_vigor: S('<circle cx="32" cy="34" r="20"/><path d="M32 22 V46 M20 34 H44" stroke-width="5"/><path d="M14 12 V20 M10 16 H18 M50 8 V14 M47 11 H53" stroke-width="2.5" opacity="0.7"/>'),
  passivas: S('<path d="M32 6 L52 18 V46 L32 58 L12 46 V18 Z"/><path d="M32 18 L42 24 V38 L32 44 L22 38 V24 Z" fill="currentColor" fill-opacity="0.3"/>')
};

export function icon(name) { return ICONS[name] || ICONS.passivas; }
