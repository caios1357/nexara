import { reveal } from './arquivo.js?v=20261009fast';
import { pushLog } from './state.js?v=20261009fast';
import { addToInventory } from '../../rules/loot.js?v=20261009fast';

/** Event 02:17 — 17s blackout then messages + Mara vision */
export async function maybeTrigger0217(state, ui) {
  if (state.flags.event_0217_done) return false;
  // After intro progress: quest accepted + first kill OR combat step done
  const q = state.quests.progress['G6-Q01'];
  const ready =
    state.flags.event_0217_ready ||
    (state.flags.first_kill && state.quests.active.includes('G6-Q01')) ||
    (q && q.step_combat);
  if (!ready) return false;
  if (state.flags.event_0217_done) return false;
  if (state.flags.event_0217_playing) return false;

  state.flags.event_0217_playing = true;
  pushLog(state, 'As luzes tremem...', 'warn');
  ui.refresh();

  const overlay = document.getElementById('blackout-overlay');
  const msg1 = document.getElementById('bo-msg1');
  const msg2 = document.getElementById('bo-msg2');
  overlay.classList.add('active');
  msg1.classList.remove('show');
  msg2.classList.remove('show');

  await wait(17000); // 17s blackout

  msg1.textContent = 'ELE ESTÁ ACORDANDO.';
  msg1.classList.add('show');
  await wait(3500);
  msg2.textContent = 'NÃO SOU SUA FONTE.';
  msg2.classList.add('show');
  await wait(3500);

  overlay.classList.remove('active');
  msg1.classList.remove('show');
  msg2.classList.remove('show');

  // Mara finds device — short vision
  const vision = document.getElementById('vision-overlay');
  vision.classList.add('active');
  vision.innerHTML = `
    <h2 style="color:var(--nexa);margin-bottom:1rem;">Fragmento</h2>
    <p>Mara segura um aparelho que <em>não apagou</em>.</p>
    <p>Dentro do brilho: um dragão contido. Máquinas. Humanos.</p>
    <p style="color:var(--muted);font-size:0.9rem;">…</p>
    <button class="primary" id="vision-ok">Registrar no Arquivo</button>
  `;
  await new Promise((resolve) => {
    document.getElementById('vision-ok').onclick = () => {
      vision.classList.remove('active');
      resolve();
    };
  });

  reveal(state.arquivo, 'memorias', 'mem_0217');
  reveal(state.arquivo, 'pistas', 'pista_nao_sou_fonte');
  state.journal.push({
    id: 'j_0217',
    title: '02:17',
    text: 'Blackout. ELE ESTÁ ACORDANDO. NÃO SOU SUA FONTE. Dispositivo de Mara. Visão.',
    at: Date.now()
  });
  const item = state._items['item_dispositivo_nexa'];
  if (item && !state.inventory.some((i) => i.item_id === 'item_dispositivo_nexa')) {
    // Device stays with Mara narratively; player gets memory. Optional tiny follow-up gives item.
  }
  state.flags.event_0217_done = true;
  state.flags.event_0217_playing = false;
  pushLog(state, 'Memória registrada no Arquivo Nexara.', 'sys');
  ui.refresh();
  return true;
}

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export function checkEventReady(state) {
  if (state.flags.first_kill && state.quests.active.includes('G6-Q01')) {
    state.flags.event_0217_ready = true;
  }
}
