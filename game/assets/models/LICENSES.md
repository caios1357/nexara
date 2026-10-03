# NEXARA — modelos 3D, ícones e bibliotecas (Bloco V)

## Modelos 3D
Nenhum arquivo de modelo externo é usado. Todos os modelos são **gerados por código** neste projeto
(geometrias primitivas do three.js montadas em grupos articulados) — autoria própria do projeto NEXARA:

| Modelo | Arquivo | Origem / licença |
|---|---|---|
| Herói "cavaleiro cibernético" (capuz, capa em 3 segmentos, armadura escura com linhas ciano, lâmina fina) | `game/js/fps/hero-model.js` | Procedural, original do projeto |
| Bots inimigos (chifres, placas/espinhos, olhos vermelhos, barra de HP) | `game/js/fps/fps-renderer.js` (`makeBot3D`) | Procedural, original do projeto |
| Mini Dragão mecânico azul | `game/js/fps/dragon-view.js` | Procedural, original do projeto (inspirado nas referências do usuário `visual/reference/mini-dragao-ref-*.png`, sem copiar assets) |
| Cidade neon (torres instanciadas, letreiros NEXARA/G6/E4/ARENA/runas, painéis, canos, cabos, vapor) | `game/js/fps/city.js` | Procedural, original do projeto; textos/glifos originais, nenhuma marca real |
| Chuva, névoa, sala neon do env map (PMREM), máscara de poças | `game/js/fps/atmosphere.js` | Procedural, original do projeto |

**Por que não um glTF CC0?** O cavaleiro CC0 da Quaternius só é distribuído em FBX/Blend via Google Drive/itch.io
(download interativo) e não há Blender na máquina de build para converter; os exemplos do three.js com licença CC0
verificável não têm silhueta de cavaleiro encapuzado. Seguindo o plano B do pedido, o herói é um modelo low-poly
articulado com animação procedural (idle, andar/correr, 3 golpes de combo sincronizados às fases
STARTUP/ACTIVE/RECOVERY do combate, reação a dano). Trocar por um glTF CC0 no futuro exige só um novo `hero-model`
com a mesma API (`update`, `hurt`, `getDebug`).

## Ícones
`game/assets/icons/*.svg` e `game/js/icons.js`: **desenhados à mão em SVG para o NEXARA** (originais; nenhum pacote de ícones de terceiros).
Regenerar: `node scripts/export-icons.mjs`.

## Bibliotecas (carregadas por CDN, não redistribuídas aqui)
- three.js r170 (`three`, `three/addons/`: EffectComposer, RenderPass, UnrealBloomPass, ShaderPass, OutputPass) — licença MIT, © 2010-2024 three.js authors.

## M3D (20261003m3d) — modelos GLB CC0
A partir da fase MODELOS 3D o herói, os vilões e os dois dragões usam modelos GLB CC0 (KayKit / Quaternius) —
lista completa, URLs e licenças em `assets/models/LICENSES.md`. Os procedurais acima continuam como fallback.
