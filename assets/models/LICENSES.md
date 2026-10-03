# NEXARA — modelos 3D GLB (fase MODELOS 3D, build 20261003m3d)

Todos **CC0 1.0 (domínio público)**. Otimizados com gltf-transform (só clipes usados, texturas 256 px,
quantização + EXT_meshopt_compression). Scripts: `/workspace/m3d-src/build*.mjs`.

| Arquivo | Uso no jogo | Origem | Licença |
|---|---|---|---|
| `hero-knight.glb` | Herói CAVALEIRO NEXA + 23 clipes compartilhados (herói e vilões, mesmo rig KayKit) | KayKit Character Pack: Adventurers 1.0 — Kay Lousberg — https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0 | CC0 (LICENSE.txt do repositório) |
| `hero-rogue.glb`, `hero-mage.glb`, `hero-barbarian.glb` | Estilos de herói (fase de estilos) | mesmo pacote (Rogue_Hooded, Mage, Barbarian) | CC0 |
| `hero-props.glb` | Armas/escudos (espada 1M/2M, facas, besta, cajado, machados) | mesmo pacote (props dos 4 personagens) | CC0 |
| `vilao-warrior.glb`, `vilao-rogue.glb`, `vilao-mage.glb`, `vilao-minion.glb` | Vilões (10 tipos → 4 modelos com tinta/brilho por arquétipo) | KayKit Character Pack: Skeletons 1.0 — Kay Lousberg — https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Skeletons-1.0 | CC0 |
| `boss-dragon.glb` | Chefe GIGANTE VERDE (tinta verde-escura/preta, núcleo verde emissivo) | Quaternius "Dragon" — https://poly.pizza/m/VBvzjFIYws | CC0 (Quaternius / Poly Pizza) |
| `mini-dragon.glb` | Mini Dragão companheiro (azul) | Quaternius "Dragon" — https://poly.pizza/m/3rUm1cN3yp | Public Domain (CC0) |

Fallback: `?models=0` (ou falha de rede) mantém os modelos procedurais originais (`game/js/fps/hero-model.js`,
`makeBot3D`, `dragon-view.js`, `boss-dragon-view.js`).

## Fase VILÕES (build 20261003vil) — modelos novos por arquétipo

Todos de **Quaternius** (https://quaternius.com), baixados do Poly Pizza, licença **CC0 1.0 / Public Domain**
(conferida na página de cada modelo). Otimizados por `/workspace/m3d-src/build-vil.mjs` (só clipes usados, meshopt).
`?vil=0` volta aos vilões KayKit acima (preservados).

| Arquivo | Arquétipo (arena / campo) | Modelo original | Página |
|---|---|---|---|
| `mon-esqueleto.glb` | A — Rastreador / Ceifa-Runa | Skeleton (machado) | https://poly.pizza/m/1XZD9GK6Kj |
| `mon-demonio.glb` | A2 — Guardião / Ceifador Carmesim | Demon (Ultimate Monsters) | https://poly.pizza/m/LnfIziKv4o |
| `mon-caveira.glb` | B — Enxame / Faísca Espectral | Ghost Skull (Ultimate Monsters) | https://poly.pizza/m/TX8r9WBXpe |
| `mon-lobo.glb` | B2 — Predador / Sombra Hexa | Wolf (Animated Animals) | https://poly.pizza/m/P1gU3Qkr9r |
| `mon-robo.glb` | C — Arcanista de Plasma | Robot Enemy | https://poly.pizza/m/1gNo5ezvmr |
| `mon-drone.glb` | C2 — Caçador / Bombardeiro Rúnico | Robot Enemy Flying | https://poly.pizza/m/lF3jeRJwiH |
| `mon-yeti.glb` | D — Brutamonte / Golem de Ferro-Vivo | Yeti (Ultimate Monsters) | https://poly.pizza/m/ceRHrn8HHE |
| `mon-zumbi.glb` | E — Mutante / Tecelã da Estática | Zombie | https://poly.pizza/m/VlXjG0N8Eg |
| `mon-demonio-azul.glb` | F — Elite Áureo / Inquisidor Áureo | Blue Demon (Ultimate Monsters) | https://poly.pizza/m/S7jYW6Amye |
| `mon-orc.glb` | G — VARGOS, Sentinela do Portão | Orc (Ultimate Monsters) | https://poly.pizza/m/5vO2YJsPEf |
