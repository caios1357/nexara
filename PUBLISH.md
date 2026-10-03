# Publicar o NEXARA no GitHub Pages

Link fixo do jogo: **https://caios1357.github.io/nexara/game/?v=<BUILD>**
(a raiz https://caios1357.github.io/nexara/ redireciona para `game/`). Repositório: https://github.com/caios1357/nexara

## Atualizar (um comando)

```bash
/workspace/publish-pages.sh            # copia game/ data/ assets/ rules/ de /workspace/nexara, commita "NEXARA build <BUILD>" e dá push
/workspace/publish-pages.sh --dry-run  # mostra o que mudaria, sem commit/push
SRC=/workspace/nexara-snapshot-20261003arena /workspace/publish-pages.sh   # republicar um snapshot estável
```

O que o script faz:
1. Lê o selo `BUILD xxxx` em `game/index.html`. Ele vira a mensagem do commit e o `?v=` do link.
2. Recusa publicar se algum arquivo foi editado há menos de 2 min (para passar por cima disso: `FORCE=1`). Também recusa se houver erro de sintaxe em JS ou JSON inválido em `data/`.
3. Espelha só o que o jogo usa em runtime: `game/`, `data/`, `assets/` e `rules/`. Fica de fora `node_modules`, `scripts/`, `visual/`, `docs/`, logs etc.
4. Troca caminhos absolutos (`"/data/…"`, `"/game/…"`…) por relativos, porque o Pages serve o site em `/nexara/`. Hoje o jogo já usa só caminhos relativos e nada precisou ser trocado.
5. Mantém `.nojekyll` e o `index.html` da raiz e grava `BUILD.txt`. Bloqueia arquivos com mais de 95 MB.
6. Faz commit e push na `main`. O Pages atualiza em cerca de 1 min (veja o andamento em https://github.com/caios1357/nexara/actions).

Só publique uma build depois de testada. Para conferir de verdade: `cd /workspace/pages-verify && node verify.mjs 'https://caios1357.github.io/nexara/game/?v=<BUILD>' /workspace/nexara-pages-shots/pages`.

No celular, se aparecer versão antiga, abra o link com o `?v=` novo; o cache dos arquivos JS/CSS também usa `?v=<BUILD>`.
