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
