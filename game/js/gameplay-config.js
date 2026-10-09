/**
 * NEXARA — CONFIGURAÇÃO CENTRAL DE GAMEPLAY (Bloco 1 · build gp1)
 *
 * Único lugar com os "números mágicos" de movimento, joystick, câmera e
 * (a partir dos Blocos 2-4) combate, IA, esquiva, defesa, especiais e botões.
 *
 * Unidades:
 *   - distâncias de mundo em TILES (1 tile = 2 unidades Three.js)
 *   - velocidades em tiles/s, acelerações em tiles/s²
 *   - ângulos de configuração em GRAUS (convertidos em radianos no código)
 *   - tempos em ms, tamanhos de UI em px CSS
 *
 * Overrides do usuário: localStorage['nexara.settings.v1'] (chave SEPARADA do
 * save do mundo 'nexara_phase01_save' — saves nunca são tocados aqui).
 * O menu de configurações (Bloco 4) só precisa chamar setOverrides({...}).
 *
 * Overrides de teste por URL (não persistem): ?touch=1 força modo touch,
 * ?touch=0 desliga.
 */

export const SETTINGS_STORAGE_KEY = 'nexara.settings.v1';

/** Aparelho de toque (padrão da "Tela inteira automática"). */
const IS_TOUCH = typeof window !== 'undefined' && (
  (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches) ||
  (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0) ||
  /[?&]touch=1\b/.test(window.location?.search || ''));

export const DEFAULTS = Object.freeze({
  version: 1,

  movement: {
    /** Velocidade de caminhada (tiles/s). ~2.4 = passo firme, legível no celular. */
    walkSpeed: 2.4,
    /** Corrida = walkSpeed × runMultiplier (≈1.4). */
    runMultiplier: 1.4,
    /**
     * Corrida no mobile: empurrar o stick até a borda (≥ runThreshold) e
     * segurar por runHoldMs. Teclado: Shift. Evita correr sem querer.
     */
    runThreshold: 0.95,
    runHoldMs: 450,
    /** Fração mínima de walkSpeed logo após a zona morta (analógico preciso). */
    minAnalogSpeed: 0.3,
    /** Aceleração / desaceleração (tiles/s²). Desacel. maior = para sem deslizar. */
    acceleration: 12,
    deceleration: 26,
    /** Abaixo disto (tiles/s) a velocidade zera. */
    stopSpeed: 0.05,
    /** Meia-largura do corpo do herói para colisão (tiles). */
    playerRadius: 0.3,
    /** Rotação do corpo (iso / direção de ataque) — rad/s máx e aceleração rad/s². */
    turnSpeedDeg: 540,
    turnAccelerationDeg: 3600,
    /** Passo máximo de integração (tiles) — sub-passos evitam atravessar paredes. */
    maxSubstep: 0.2,
    /**
     * dt máximo por frame (s) — evita salto após aba em segundo plano. Com
     * sub-passos a colisão continua segura; 0.1 mantém velocidade real até ~10 FPS.
     */
    maxFrameDt: 0.1,
    /** Bloco 5 (menu Controles): multiplicador da velocidade de movimento (× walkSpeed). */
    speedScale: 1.0
  },

  joystick: {
    /** 'fixed' = base fixa no canto; 'floating' = base nasce onde o dedo toca. */
    type: 'fixed',
    /** Raio visual da base (px). */
    baseRadius: 58,
    /** Curso máximo do knob = vetor 1.0 (px). */
    maxRadius: 50,
    /** Área de toque além do círculo visual (px por lado). */
    hitPadding: 44,
    /** Zona morta (0..1 do curso). */
    deadZone: 0.14,
    /** Multiplicador de resposta (1 = linear). */
    sensitivity: 1.0,
    /** Curva de resposta (1 = linear, >1 = mais precisão perto do centro). */
    responseCurve: 1.15,
    /** Tempo de retorno visual do knob ao centro (ms). O vetor zera NA HORA. */
    returnMs: 90,
    /** Margens a partir do canto inferior esquerdo (px, somadas à safe-area). */
    marginLeft: 18,
    marginBottom: 18,
    /** Bloco 5 (menu Controles): escala do joystick (base + curso) — × baseRadius / maxRadius. */
    sizeScale: 1.0
  },

  camera: {
    /** Multiplicador geral de sensibilidade (menu do usuário). */
    sensitivity: 1.0,
    /** Base rad/px — toque (área OLHAR) e mouse (pointer-lock). */
    touchRadPerPx: 0.0052,
    mouseRadPerPx: 0.0022,
    /** Multiplicadores separados horizontal / vertical. */
    horizontalSpeed: 1.0,
    verticalSpeed: 0.8,
    /**
     * Suavização 0..1 (0 = cru, 1 = pesado). Suavização exponencial do yaw/pitch
     * renderizados em direção ao alvo: tau = cameraSmoothness × smoothingMaxTauMs.
     */
    smoothness: 0.45,
    smoothingMaxTauMs: 120,
    /** Limites de pitch (graus). */
    pitchMinDeg: -60,
    pitchMaxDeg: 60,
    defaultPitchDeg: -3,
    invertY: false,
    /** Escala do tremor de câmera ao levar dano (0 = desliga). */
    hitShake: 0.6,
    /** Delta máximo aceito por evento (px) — descarta saltos de toque perdido. */
    maxDeltaPerEventPx: 90,
    /** Campo de visão (graus) e altura do olho (m). */
    fovDeg: 72,
    eyeHeight: 1.68
  },

  /**
   * Bloco V — CÂMERA EM 3ª PESSOA sobre o ombro (padrão). ?fp=1 volta à 1ª pessoa (fallback).
   * Distâncias em METROS (1 tile = 2 m). O olhar (sensibilidade/suavização) é o mesmo do Bloco 1
   * (seção camera); aqui ficam só o braço da câmera, os limites de pitch e o giro do herói.
   */
  thirdPerson: {
    /** Comprimento do braço (pivô no ombro → câmera). */
    distance: 3.2,
    /** Altura do pivô (ombro/nuca do herói) acima do chão. Câmera ≈ pivotHeight + sen(-pitch)·distance ≈ 1,9 m. */
    pivotHeight: 1.5,
    /** Deslocamento lateral do pivô para a DIREITA (herói fica um pouco à esquerda do centro). */
    shoulderOffset: 0.6,
    /** Pitch inicial (negativo = olhando um pouco para baixo) e limites em 3ª pessoa. */
    defaultPitchDeg: -8,
    pitchMinDeg: -50,
    pitchMaxDeg: 28,
    fovDeg: 66,
    /** Retrato (tela estreita): braço mais longo e FOV maior — herói ~1/3 da altura, arena visível. */
    portraitDistance: 4.4,
    portraitFovDeg: 74,
    portraitPivotHeight: 1.6,
    /** Braço-mola: raio da "esfera" da câmera e passo do teste. Se o espaço livre atrás for menor que minDistance, a câmera sobe (nunca entra na parede). */
    collisionRadius: 0.22,
    collisionStep: 0.08,
    minDistance: 0.55,
    /** Volta ao comprimento normal suavemente (1/s). Encurtar é imediato (nunca atravessa parede). */
    easeOutPerSec: 5,
    /** Giro do corpo do herói (graus/s) rumo à direção do movimento / da mira ao atacar. */
    heroTurnSpeedDeg: 720,
    /** Câmera mais perto que isto do pivô → herói some (não tampa a tela). */
    heroHideDistance: 0.75
  },

  graphics: {
    /**
     * Resolução adaptativa: se o frame passa do orçamento, reduz o pixel ratio
     * do WebGL (mesmo visual, menos pixels) e volta a subir quando sobra folga.
     * ?adaptive=0 desliga (screenshots em resolução cheia).
     */
    adaptiveResolution: true,
    maxPixelRatio: 1.75,
    minPixelRatio: 0.5,
    /** Abaixo deste FPS médio reduz; acima de upscaleFps sobe. */
    downscaleFps: 42,
    upscaleFps: 57,
    /** Intervalo mínimo entre ajustes (ms). */
    adjustIntervalMs: 1200,
    /**
     * Bloco V — nível de qualidade: 'auto' | 'low' | 'medium' | 'high'. ?quality=low|medium|high força.
     * auto: touch → medium; desktop → high.
     */
    quality: 'auto',
    /** Automático: GPU por software (SwiftShader/llvmpipe) cai para 'low' (sem pós/sombras). */
    softwareGLLow: true,
    tiers: {
      /**
       * EVO — presets nomeados (sem duplicar sistemas; os mesmos sistemas com orçamentos diferentes):
       *  low    = MOBILE LOW   (GPU fraca / software): sem pós, sem env map, 3 luzes, pixel ratio ≤ 1.
       *  medium = MOBILE MEDIUM (padrão no toque): bloom em meia resolução, SEM env map, ≤ 4 luzes, pixel ratio ≤ 1,25.
       *  high   = DESKTOP: bloom cheio + 1 sombra, env map, 24 luzes.
       * caps = limites por preset (inimigos ativos, partículas, projéteis/zonas de perigo, números de dano).
       */
      low: { label: 'MOBILE LOW', models: false /* M3D: GLB custa ~6–10% no low (medido) → procedural */, composer: false, bloom: false, bloomScale: 0, shadows: false, rain: 140, haze: 2, envMap: false, cityDensity: 0.45, maxPixelRatio: 1.0, pointLights: 3, antialias: false,
        caps: { activeEnemies: 10, particles: 60, projectiles: 10, hazards: 4, damageNumbers: 8 } },
      medium: { label: 'MOBILE MEDIUM', dragonModels: false, enemyModels: true /* VIL: vilões novos (Quaternius) = ~4 draw calls cada (KayKit ~20) → medido: FPS igual ao procedural (11,5–11,8 vs 10,1–12,1, CPU) e −25% draw calls → GLB também no medium */, composer: true, bloom: true, bloomScale: 0.5, shadows: false, rain: 260, haze: 3, envMap: false, cityDensity: 0.7, maxPixelRatio: 1.25, pointLights: 4, antialias: false,
        caps: { activeEnemies: 12, particles: 90, projectiles: 14, hazards: 5, damageNumbers: 10 } },
      high: { label: 'DESKTOP', composer: true, bloom: true, bloomScale: 1, shadows: true, rain: 900, haze: 8, envMap: true, cityDensity: 1, maxPixelRatio: 1.75, pointLights: 24, antialias: true,
        caps: { activeEnemies: 18, particles: 160, projectiles: 24, hazards: 8, damageNumbers: 14 } }
    },
    /**
     * EVO — qualidade adaptativa: abaixo de downscaleFps desliga EFEITOS antes de baixar resolução,
     * nesta ordem; só então reduz o pixel ratio, nunca abaixo de minPixelRatioHardware (0,8) numa GPU real.
     * (Em GPU por software — testes/CI — o piso continua minPixelRatio, documentado como simulado.)
     */
    // M10 fase 9: + chuva e decoração das regiões (Arena). Na Arena tudo isto só começa depois da DENSIDADE (arena-br densCut)
    adaptiveLadder: ['bloom', 'envMap', 'pointLights', 'rain', 'city', 'brDecor'],
    minPixelRatioHardware: 0.8,
    /** Pré-compila shaders da zona (renderer.compileAsync) com VFX visíveis — evita travadas no 1º golpe. */
    precompileShaders: true,
    /** Mescla partes estáticas dos personagens (menos draw calls). */
    mergeCharacterParts: true,
    /** Bloom (UnrealBloomPass): força, raio, limiar (HDR linear). */
    bloomStrength: 0.7,
    bloomRadius: 0.55,
    bloomThreshold: 0.8,
    /** Exposição do tone mapping ACES Filmic. */
    exposure: 1.1,
    /** MASTER 10: luz da ARENA PRINCIPAL (mais clara para celular; noite neon mantida). exposureK multiplica `exposure`. */
    brLight: { exposureK: 1.36, amb: 1.55, hemi: 1.85, dir: 1.25, fogK: 0.88, fogColorK: 0.95, horizon: '#1a3866', skyTop: '#03081a', skyMid: '#0c1f48',
      // M10 fase 8: névoa/céu baixo com a cor de cada região (transição suave ao cruzar a fronteira)
      regionFog: { periferia: '#1a3866', ruinas: '#3a3024', floresta: '#123a2c', complexo: '#18305a', elite: '#3e3216', dragao: '#10331c' }, regionFogMs: 1600 },
    /** Correção de cor teal/laranja (0..1) e vinheta (0..1). */
    gradeAmount: 0.55,
    vignette: 0.45,
    /** Névoa exponencial (densidade por zona). */
    fogDensity: { g6: 0.02, e4: 0.026, ar: 0.016, ca: 0.018 },
    // EVO gráficos: céu em gradiente, piso hexagonal procedural, pilares/cabos/placas holo e selos no Campo/Arena
    evoScenery: true,
    /** EVO (ref. do Caio): faixas de reflexo no chão molhado e dragão voando ao longe (não no LOW). */
    wetReflections: true,
    skyDragon: true
  },

  /** Bloco 2 — ritmo do ataque básico do jogador (tempos em ms, distâncias em tiles). */
  combat: {
    /** Máquina de estados: INÍCIO → PREPARO (startup) → IMPACTO (ativo) → RECUPERAÇÃO. */
    attackStartupMs: 140,
    attackActiveMs: 90,
    attackRecoveryMs: 260,
    /** Espera extra após a recuperação dos golpes 1-2 (0 = pode encadear/atacar logo). */
    attackCooldownMs: 60,
    /** Janela de combo = últimos N ms da recuperação dos golpes 1-2. */
    comboWindowMs: 200,
    /** Sem novo toque até N ms após o fim do golpe → combo volta ao golpe 1. */
    comboResetMs: 450,
    /** Golpe 3 (finalizador): mais dano, arco maior, recuperação/cooldown maiores. */
    hit3DamageMult: 1.35,
    hit3RecoveryMs: 420,
    hit3CooldownMs: 380,
    hit3HalfAngleDeg: 68,
    hit3RangeMult: 1.1,
    /** Buffer de entrada: toque até N ms antes de poder aceitar é guardado (máx. 1). */
    inputBufferMs: 150,
    /** Segurar o botão repete o ataque? (menu do Bloco 4). Padrão: desligado. */
    autoAttack: false,
    /** Toques duplicados (touch + pointer/click) mais próximos que isto são ignorados. */
    inputDedupMs: 35,
    /** ALCANCE (centro do herói → borda do corpo do inimigo) e HITBOX (cone). */
    attackRange: 1.4,
    hitboxHalfAngleDeg: 50,
    /** Inimigo praticamente colado conta como dentro do cone. */
    closeHitRadius: 0.55,
    /** Armas de distância (item ranged): alcance maior, cone estreito, 1 alvo. */
    rangedRange: 4.2,
    rangedHalfAngleDeg: 14,
    /** Assistência de mira: 'off' | 'low' | 'medium' | 'high' (sem girar a câmera). */
    aimAssist: 'low',
    aimAssistExtraAngleDeg: { off: 0, low: 8, medium: 15, high: 24 },
    aimAssistExtraRange: { off: 0, low: 0.1, medium: 0.2, high: 0.3 },
    /** Feedback de impacto. */
    knockback: 0.32,
    hit3Knockback: 0.6,
    knockbackTimeMs: 150,
    hitStopMs: 50,
    hitShake: 2.2,
    attackFovKickDeg: 1.6,
    sparkCount: 10,
    sparkPoolSize: 64,
    sfxVolume: 0.5,
    sfxEnabled: true,
    /** ARENA: música de fundo CC0 (assets/audio/music · créditos em CREDITS.md) */
    musicEnabled: true,
    musicVolume: 0.45,
    /** EVO: teto de vozes simultâneas (sons acima disso são descartados — sem empilhar ruído). */
    sfxMaxVoices: 10,
    /** EVO: sons reais CC0 (assets/audio/sfx) — false = só síntese. */
    sfxSamples: true,
    /** Bases lidas via modifiers.getStat (passivas do Bloco 3 modificam). */
    critChance: 0,
    critMult: 1.5,
    hpRegenPerSec: 0,
    /** Regeneração base de Nexa (pontos/s) — barra Nexa existente; passivas somam % via modifiers. */
    nexaRegenPerSec: 0.5
  },
  /**
   * Bloco 3 — ANALÓGICO DIREITO HÍBRIDO (câmera + ataque).
   * Arrastar = câmera. Toque rápido (distância < minDragDistance px E duração <
   * tapRecognitionTime ms) = 1 ataque básico pelo player-combat. Um gesto nunca
   * faz os dois: enquanto pode ser toque a câmera não se move (deltas guardados);
   * passou do limite → vira arrasto (deltas aplicados, toque cancelado).
   */
  rightStick: {
    /** Multiplicador extra de sensibilidade da câmera no lado direito (× camera.sensitivity). */
    sensitivity: 1.0,
    /** Depois da janela de toque: px mínimos de deslocamento para a câmera começar a girar (tremor do dedo). */
    deadZone: 4,
    /** Toque = deslocamento total < isto (px). Passou → arrasto. */
    minDragDistance: 12,
    /** Toque = soltou antes disto (ms). */
    tapRecognitionTime: 220,
    /** Correção de mira do toque: 'off' | 'low' | 'medium' | 'high' → giro máx. (graus). */
    aimAssist: 'low',
    aimNudgeMaxDeg: { off: 0, low: 7, medium: 12, high: 18 },
    /** Duração do giro suave de correção (ms) — nunca instantâneo. */
    aimNudgeMs: 140,
    /** Toque escolhe o inimigo mais perto da mira dentro do alcance (respeita lock-on se houver). */
    autoTarget: true,
    /** Alvo automático: alcance extra além do alcance do golpe (tiles) e ângulo máx. da mira (graus). */
    autoTargetRangeExtra: 0.6,
    autoTargetMaxAngleDeg: 70
  },
  /**
   * Bloco 3 — PASSIVAS (dados em data/passives.json). Escolha ao subir de nível.
   */
  passives: {
    /** Cartas por escolha. */
    choices: 3,
    /** Tempo da confirmação após escolher (ms) antes de fechar e retomar o combate. */
    confirmMs: 900,
    /** Aviso "NOVA PASSIVA DISPONÍVEL" (ms). */
    noticeMs: 2600,
    /** Tentativas de sorteio para não repetir exatamente o conjunto anterior. */
    rerollAttempts: 12
  },
  /**
   * Bloco 3 — MINI DRAGÃO (companheiro). Distâncias em tiles, tempos em ms,
   * alturas em metros (1 tile = 2 m). Ataques por estágio = dados (dragon.stages).
   */
  dragon: {
    enabled: true,
    /** Herói atinge este nível → estágio 2 (Chama Azul Concentrada). */
    evolveAtHeroLevel: 3,
    /** Bloco V: voa junto ao OMBRO ESQUERDO do herói (tiles; visível na câmera em 3ª pessoa). */
    followForward: 0.35,
    followSide: 0.8,
    /** Em retrato (tela estreita) um pouco mais perto do centro. */
    followSidePortrait: 0.25,
    /** Em retrato um pouco mais à frente. */
    followForwardPortrait: 0.5,
    /** Covil: chefe vivo a ≤ N tiles → voa atrás do ombro (fora da silhueta do chefe na câmera). */
    bossFollowRange: 14,
    followForwardBoss: -0.3,
    followSideBoss: 0.95,
    followSideBossPortrait: 0.55,
    /** Distância aceitável ao ponto de voo (1.2–1.8 tiles do herói na prática). */
    followArriveDist: 0.18,
    hoverHeight: 2.25,
    hoverBobAmp: 0.08,
    /** Velocidades (tiles/s) e aceleração (tiles/s²). */
    speed: 3.8,
    combatSpeed: 2.6,
    acceleration: 14,
    turnSpeedDeg: 420,
    /** Raio de colisão com paredes (tiles). */
    bodyRadius: 0.2,
    /** Iniciativa própria: só engaja inimigos a até isto do HERÓI (tiles). Inimigos que já estão
     *  atacando/perseguindo o herói são engajados até leashTargetRange — o dragão não puxa brigas sozinho. */
    aggroRange: 3.5,
    /** Por quanto tempo o último monstro atingido pelo herói conta como "alvo do herói" (ms). */
    heroTargetMemoryMs: 4000,
    /** Bloco 4: por iniciativa própria o dragão só engaja quem ATACA/prepara golpe no herói ou o alvo
     *  do herói (trava / atingido nos últimos heroTargetMemoryMs). Perseguidores e o "mais próximo" ficam
     *  de fora (o dragão não rouba o começo do jogo). */
    engageChasing: false,
    engageNearest: false,
    /** Bloco 4: golpe do dragão que MATARIA um inimigo ainda não ferido pelo herói deixa 1 HP
     *  (exceto se esse inimigo estiver atacando o herói / atacou nos últimos killGuardAttackMemoryMs). */
    killStealGuard: true,
    killGuardAttackMemoryMs: 3000,
    /** Alcance de disparo (dragão → alvo). */
    attackRange: 4.6,
    /** Coleira: nunca se afasta mais que isto do herói; alvo além de leashTargetRange do herói é abandonado. */
    leashDistance: 2.6,
    leashTargetRange: 7,
    /** Muito longe/sem caminho por teleportAfterMs → reaparece ao lado do herói. */
    teleportDistance: 9,
    teleportAfterMs: 2500,
    /** Intervalo de busca/reavaliação de alvo (ms) e reação ao achar alvo. */
    searchIntervalMs: 250,
    reactionMs: 300,
    /** Pausa após qualquer ataque (nunca dois ataques juntos). */
    globalRecoveryMs: 350,
    /** Dano das chamas obedece a regra de defesa do jogo (defesa/2 do alvo, mín. 1) como o do herói. */
    applyDefense: true,
    /** Altura (m) do alvo atingido e da boca. */
    targetHeight: 1.05,
    maxProjectiles: 24,
    /** Luz pontual só fora do touch (mobile usa só emissivo). */
    pointLightDesktop: true,
    /** Atributos (futuro: HP / nível do dragão; hoje não morre e não há UI de HP). */
    stats: { level: 1, hpMax: 100, speedMult: 1 },
    /** Ataques por estágio (ids de dragon.attacks). */
    stages: {
      1: ['rajada_azul'],
      2: ['rajada_azul', 'chama_concentrada']
      // Futuro (NÃO implementado): 3: [..., 'chama_area'], 4: [..., 'chama_perfurante'],
      // 5: [..., 'chama_eletrica'], 6: [..., 'nexa_explosao'], 7: [..., 'ultimate_dragao']
    },
    attacks: {
      /** Estágio 1: preparo curto (boca brilha) → 5 bolas pequenas em sequência com leve dispersão. */
      rajada_azul: {
        nome: 'RAJADA DE CHAMAS AZUIS',
        priority: 1,
        windupMs: 350,
        count: 5,
        intervalMs: 90,
        spreadDeg: 3.5,
        damage: 5,
        /** Lenta o bastante para as 5 bolas ficarem no ar juntas (leitura da rajada). */
        speed: 6.5,
        radius: 0.12,
        maxRange: 6.5,
        cooldownMs: 2500,
        /** Empurrão (× knockback do herói) e se pode interromper o preparo do inimigo. */
        knockback: 0.25,
        canStun: false,
        nexaCost: 0
      },
      /** Estágio 2: carga longa (orbe crescendo na boca) → 1 chama grande concentrada. */
      chama_concentrada: {
        nome: 'CHAMA AZUL CONCENTRADA',
        priority: 2,
        windupMs: 800,
        count: 1,
        intervalMs: 0,
        spreadDeg: 0,
        damage: 32,
        speed: 7,
        radius: 0.24,
        maxRange: 7,
        cooldownMs: 5000,
        knockback: 1,
        canStun: true,
        nexaCost: 0
      }
    }
  },
  /** Bloco 2 — IA inimiga contínua com telegraph e fichas de ataque. */
  enemyAi: {
    /** Sem ataques por N ms ao entrar numa zona / iniciar o jogo. */
    spawnGraceMs: 1500,
    /** Detecção (tiles, com linha de visão). Arena é maior/aberta. */
    aggroRange: 6,
    aggroRangeArena: 9,
    /** Perde o interesse se o herói passar disto (tiles). */
    loseAggroRange: 10,
    /** Coleira: afastou-se mais que isto do ponto de origem → desiste e volta. */
    maxChaseDistance: 9,
    regenOnReturn: true,
    /** DETECT → ALERT ('!' + olhos acesos) → CHASE após reactionTimeMs no total. */
    detectMs: 120,
    reactionTimeMs: 520,
    /** Velocidades (tiles/s) — perseguição < caminhada do herói (fugir funciona). */
    chaseSpeed: 1.75,
    patrolSpeed: 0.7,
    returnSpeed: 1.5,
    circleSpeed: 0.55,
    acceleration: 8,
    turnSpeedDeg: 300,
    prepareTurnSpeedDeg: 110,
    /** Corpo e distâncias (centro a centro, tiles). */
    bodyRadius: 0.35,
    combatRange: 1.05,
    holdRangeExtra: 0.75,
    /** Golpe do inimigo: acerta só se o herói ainda estiver aqui no frame de impacto. */
    attackHitRange: 1.45,
    attackHalfAngleDeg: 65,
    /** Telegraph (ATTACK_PREPARE) → ATTACK (ativo) → RECOVERY (vulnerável) → cooldown. */
    attackStartupMs: 720,
    attackActiveMs: 120,
    attackRecoveryMs: 700,
    attackCooldownMinMs: 1600,
    attackCooldownMaxMs: 2200,
    /** Fichas: só N inimigos preparando/atacando ao mesmo tempo; intervalo entre fichas. */
    maxSimultaneousAttackers: 1,
    tokenGapMs: 450,
    /** Levar golpe durante o preparo: golpe 3 sempre atordoa; outros com chance. */
    stunMs: 600,
    stunChance: 0.35,
    hitReactMs: 180,
    /** Patrulha em volta do ponto de origem. */
    patrolRadius: 1.6,
    patrolPauseMinMs: 1200,
    patrolPauseMaxMs: 2800
  },
  /** Bloco 4 — prioridade de comandos do herói:
   *  MORTO > ANIM_CRITICA (atordoado / tela de passiva) > ESQUIVA > ESPECIAL/ATAQUE > DEFESA > MOVER. */
  actions: {
    /** Buffer ÚNICO de comando (ataque ou esquiva), ms. Mesmo valor-base do combate. */
    inputBufferMs: 150,
    /** Filtro de toque duplicado nos botões de ação (ms). */
    inputDedupMs: 35,
    /** Atordoamento curto do herói ao levar golpe (bloqueia ações; movimento continua). 0 = desliga. */
    heroHitStunMs: 120
  },
  /** Bloco 4 — esquiva (botão ESQUIVA / Espaço). */
  dodge: {
    /** Distância (tiles), duração (ms) e recarga (ms, contada do início da esquiva). */
    distance: 2.2,
    durationMs: 280,
    cooldownMs: 900,
    /** Janela de invulnerabilidade DENTRO da esquiva (não é a esquiva toda). */
    iFrameStartMs: 20,
    iFrameMs: 180,
    /** Pode cancelar a RECUPERAÇÃO do ataque (nunca preparo/ativo). */
    cancelAttackRecovery: true,
    /** Rastro: quantidade de imagens residuais. */
    afterimages: 4,
    /**
     * Bloco 6 — o botão DASH saiu da tela: ESQUIVA apertada DURANTE o combo (ataque em
     * andamento ou até comboWindowMs depois do último golpe), com Nexa ≥ specials.dash.cost e
     * a investida fora de recarga, vira a INVESTIDA (dash que atravessa e causa dano).
     * Fora disso é a esquiva normal (sem custo). Tecla 3 no PC continua disparando a investida.
     */
    dashStrike: { enabled: true, comboWindowMs: 450 },
    /** ESQUIVA apertada no preparo/impacto do ataque fica guardada até o golpe sair (não se perde). */
    holdBufferDuringAttack: true
  },
  /** Bloco 4 — defesa (segurar DEFESA / Q / botão direito). */
  defense: {
    /** Redução de dano no arco frontal / pelas costas (0–1). */
    frontReduction: 0.6,
    backReduction: 0.2,
    frontArcDeg: 120,
    /** Velocidade de movimento enquanto defende (× andar; sem correr). */
    moveSpeedMult: 0.4,
    /** Gancho de parry (desligado por padrão): bloqueio nos primeiros N ms após apertar. */
    parryEnabled: false,
    perfectBlockWindowMs: 150,
    /** Tremor de tela no bloqueio. */
    blockShake: 0.08
  },
  /** Bloco 4 — especiais (gastam Nexa; +15% do Núcleo Divino via dano de habilidade).
   *  dmgMult = × dano do ataque básico. Tempos em ms, distâncias em tiles. Nomes provisórios. */
  specials: {
    golpe_poderoso: {
      nome: 'GOLPE PODEROSO', cost: 10, cooldownMs: 5000,
      windupMs: 300, activeMs: 120, recoveryMs: 320,
      dmgMult: 2.5, range: 1.8, halfAngleDeg: 40,
      knockbackScale: 2.4, stunMs: 900
    },
    ataque_area: {
      nome: 'ATAQUE EM ÁREA', cost: 18, cooldownMs: 8000,
      windupMs: 150, activeMs: 260, recoveryMs: 300,
      dmgMult: 1.4, radius: 2.0, knockbackScale: 1.2, stunMs: 0
    },
    dash: {
      nome: 'INVESTIDA', cost: 15, cooldownMs: 7000,
      windupMs: 70, durationMs: 240, recoveryMs: 220,
      dmgMult: 1.6, distance: 3.5, hitRadius: 0.8, maxTargets: 3,
      iFrameMs: 260, knockbackScale: 1.0, stunMs: 0
    },
    suprema: {
      nome: 'SUPREMA', cost: 35, cooldownMs: 25000,
      windupMs: 700, activeMs: 220, recoveryMs: 520,
      dmgMult: 4.0, radius: 3.5, knockbackScale: 2.8, stunMs: 1400,
      /** Altura do salto do herói no preparo (m). */
      leapHeight: 0.9
    }
  },
  /** Bloco 4 — trava de alvo (LOCK-ON). Nunca forçada. */
  lockOn: {
    /** 'manual' = só por toque no inimigo/Tab; 'automatico' = trava sozinho em quem te atacar. */
    mode: 'manual',
    /** Alcance de seleção (tiles) e ângulo máximo em relação à mira (graus). */
    range: 7,
    maxAngleDeg: 70,
    /** Solta se passar disto (tiles) ou ficar sem linha de visão por lostLosMs. */
    releaseRange: 8.5,
    lostLosMs: 1200,
    /** Rastreio suave da câmera (1/s; 0 = não segue). O jogador ainda pode girar. */
    trackStrength: 3.5,
    /** Depois de o jogador arrastar a câmera, o rastreio espera isto (ms). */
    nudgeHoldMs: 450,
    /** Duplo toque no lado direito (ms entre toques) e deslize rápido para trocar alvo. */
    doubleTapMs: 300,
    swipeSwitchPx: 70,
    swipeSwitchMs: 240,
    /** Segurar o botão de trava por isto (ms) = soltar. */
    longPressReleaseMs: 450,
    /**
     * Bloco 6 — sem botão ALVO: tocar num inimigo trava; tocar de novo nele (ou em área
     * vazia) solta. Raio de acerto do toque (px CSS) em volta do inimigo projetado na tela.
     */
    tapLock: true,
    tapRadiusPx: 64
  },
  /** Bloco 4 — botões de ação (tamanho em px CSS; retrato / paisagem). */
  buttons: {
    /** Bloco 6: 5 botões de combate (ATAQUE + ESQUIVA + 3 especiais) → alvos maiores. */
    sizePortrait: 60,
    sizeLandscape: 54,
    supremaScale: 1.12,
    lockSize: 34,
    gap: 12,
    /** Bloco 6: botão DEFESA fora da tela por padrão (Q / botão direito continuam). */
    showDefend: false,
    /** Toast de "NEXA INSUFICIENTE" (ms). */
    deniedToastMs: 900,
    /** Bloco 5 (menu Controles): escala geral dos botões e opacidade (1 = opaco). */
    sizeScale: 1.0,
    opacity: 1.0
  },
  /**
   * Bloco 5 — layout personalizado dos controles (editor). Por orientação; cada item:
   * { x, y } = centro em fração da tela (0–1), s = escala (× tamanho padrão), o = opacidade.
   * Itens: joystick, camera (anel CÂMERA + ATAQUE), attack, dodge, defend, golpe_poderoso,
   * ataque_area, suprema (Bloco 6: dash/lock removidos). Vazio = layout padrão.
   */
  layout: { portrait: {}, landscape: {} },
  /** Bloco 5 — ajustes de VFX dos especiais / trava de alvo (legibilidade). */
  vfx: {
    /** Coluna da SUPREMA: opacidade máx. no preparo e no impacto (aditivo + bloom → baixo). */
    supremaChargeOpacity: 0.12, // VIL: mais suave (Caio: coluna escondia o herói)
    supremaColumnOpacity: 0.08,
    supremaInnerOpacity: 0.1,
    /** Anel de trava: raios (m), opacidade, anel externo tracejado e tamanho das setas. */
    lockRingInner: 0.56,
    lockRingOuter: 0.8,
    lockRingOpacity: 0.95,
    lockOuterRing: true,
    lockArrowSize: 0.15
  },
  /**
   * Bloco 6 — PASSIVAS AUTOMÁTICAS: cada passiva escolhida dispara sozinha um efeito visível
   * (aura no herói/dragão + ícone com contagem no HUD + texto flutuante). Tempos em ms,
   * multiplicadores em fração (0.30 = +30%). O bônus base pequeno de data/passives.json continua.
   */
  passiveProcs: {
    enabled: true,
    /** Texto flutuante ao disparar (ms) e ícones do HUD (máx. visíveis). */
    labelMs: 1100,
    maxHudIcons: 6,
    furia_cibernetica: {
      nome: 'SUPER FORÇA', hitsNeeded: 3, chainWindowMs: 2500,
      damageBonus: 0.30, durationMs: 5000, cooldownMs: 1500, color: '#ff3b3b'
    },
    impulso_neural: {
      nome: 'IMPULSO', onKill: true, onDodge: true,
      speedBonus: 0.35, durationMs: 4000, cooldownMs: 600, color: '#39a8ff'
    },
    nucleo_reforcado: {
      nome: 'ESCUDO DE ENERGIA', hpThreshold: 0.30,
      /** Absorve até isto de dano (fração do HP máx.; mínimo absorbMin). */
      absorbFrac: 0.25, absorbMin: 20,
      durationMs: 4000, cooldownMs: 20000, color: '#5ff0ff'
    },
    mira_neural: {
      nome: 'FOCO NEURAL', guaranteedEveryHits: 5,
      /** Depois de um crítico: +chance de crítico por durationMs. */
      critChanceBonus: 0.15, durationMs: 3000, cooldownMs: 0, color: '#ffd23f'
    },
    condutor_de_nexa: {
      nome: 'FLUXO DE NEXA', nexaPerHit: 2, durationMs: 4000, cooldownMs: 0,
      /** Enquanto ativo: regen de Nexa extra (/s). */
      regenPerSec: 1.5, color: '#4f8dff'
    },
    cacador_de_monstros: {
      nome: 'MARCADO', damageBonus: 0.25,
      /** Marca o 1º inimigo atingido (ou o travado); nova marca após a morte (ms). */
      remarkDelayMs: 1200, markDurationMs: 8000, cooldownMs: 0, color: '#ff8a1f'
    },
    nucleo_divino: {
      nome: 'MODO DIVINO', trigger: 'special',
      /** Dano do dragão ×, recarga dos ataques do dragão × (menor = mais rápido), escala visual. */
      dragonDamageMult: 1.6, dragonCooldownMult: 0.6, dragonScale: 1.25,
      durationMs: 6000, cooldownMs: 18000, color: '#ffd76a'
    }
  },
  /** Bloco 5 — editor de layout (limites e passo). */
  /**
   * Bloco 7 — CHEFE DA ARENA: GIGANTE VERDE (dragão inimigo colossal; o Mini Dragão continua
   * companheiro). Distâncias em tiles (1 tile = 2 m), tempos em ms (relógio da IA: pausa junto).
   * HP = HP MÁXIMO REAL do herói no início da tentativa × hpMultiplierOfHero (mín. hpMultiplierMin).
   * Dano de cada ataque = fórmula normal de dano de monstro com ATAQUE × atkMult (data/monsters.json).
   */
  arenaBoss: {
    enabled: true,
    monsterId: 'boss_gigante_verde',
    uid: 9100,
    /** Tile do covil a leste da arena (a arena ganhou uma ala nova; a parte antiga não mudou). hitRadius da investida = alcance além do corpo. */
    spawn: { x: 19, y: 5 },
    hpMultiplierOfHero: 101,
    hpMultiplierMin: 101,
    /** Raio do corpo (colisão com paredes/herói) e altura visual (m). */
    bodyRadius: 1.25,
    visualHeight: 6.4,
    /** Detecção: distância e linha de visão; fora do covil (x < territoryMinX) não persegue. */
    aggroRange: 7.5,
    territoryMinX: 13.2,
    detectMs: 700,
    walkSpeed: 1.7,
    turnSpeedDeg: 110,
    prepareTurnSpeedDeg: 45,
    acceleration: 9,
    /** Entre um ataque e outro (depois da recuperação). */
    attackGapMs: [700, 1300],
    /** Golpes do herói não empurram/atordoam o chefe; especiais que atordoam valem × stunScale. */
    knockbackScale: 0,
    stunScale: 0.35,
    maxStunMs: 600,
    attacks: {
      /** GARRA/CAUDA: varredura em cone à frente, marcador no chão durante o preparo. */
      golpe: { nome: 'GOLPE PESADO', telegraphMs: 950, activeMs: 260, recoveryMs: 1150, range: 3.3, halfAngleDeg: 65, atkMult: 2.3, useMaxDist: 3.6 },
      /** PISÃO + ONDA DE CHOQUE: círculo de perigo em volta do dragão; sair antes do impacto. */
      area: { nome: 'ATAQUE DE ÁREA', telegraphMs: 1400, activeMs: 320, recoveryMs: 1300, radius: 4.2, atkMult: 1.9, useMaxDist: 5.0 },
      /** INVESTIDA RASANTE: linha no chão até o herói; avança reto, para na parede (fica atordoado). */
      investida: { nome: 'INVESTIDA', telegraphMs: 1150, speed: 10, maxDistance: 9, hitRadius: 0.5, atkMult: 1.7, recoveryMs: 1300, wallStunMs: 1500, useMinDist: 3.2 }
    },
    /** EVO — novos ataques do GIGANTE VERDE (todos com telegraph → windup → ataque → recuperação). */
    extraAttacks: {
      /** CAUDA: varredura atrás/lados (pune quem fica nas costas). */
      cauda: { nome: 'CAUDA', telegraphMs: 820, activeMs: 240, recoveryMs: 900, range: 3.8, halfAngleDeg: 115, atkMult: 1.7 },
      /** SOPRO: cone longo de fogo Nexa; 3 pulsos; recuperação longa = janela de punição. */
      sopro: { nome: 'SOPRO NEXA', telegraphMs: 1150, activeMs: 900, tickMs: 300, recoveryMs: 1600, range: 7.0, halfAngleDeg: 24, atkMult: 0.75, useMaxDist: 7.5 },
      /** ANÉIS: pisão que solta 3 anéis de choque; atravesse com ESQUIVA (i-frames) ou fique fora. */
      aneis: { nome: 'ANÉIS DE IMPACTO', telegraphMs: 1250, activeMs: 2300, recoveryMs: 1400, rings: 3, ringGapMs: 520, ringSpeed: 4.4, ringWidth: 0.55, maxRadius: 9, atkMult: 1.2 },
      /** POÇAS: cospe zonas de veneno Nexa no herói e perto dele (aparecem antes de ativar). */
      pocas: { nome: 'POÇAS NEXA', telegraphMs: 950, activeMs: 200, recoveryMs: 900, count: 3, spread: 2.2, radius: 1.5, armMs: 750, durationMs: 5200, tickMs: 500, atkMult: 0.45, slow: 0.4 },
      /** RUGIDO de troca de fase (sem dano; empurra quem estiver colado). */
      rugido: { nome: 'RUGIDO', telegraphMs: 1300, activeMs: 300, recoveryMs: 500, radius: 3.0, atkMult: 0 }
    },
    /**
     * EVO — FASES por % de HP. Cada fase libera ataques; a final encadeia combos.
     * Vulnerabilidades: quebra de postura, investida na parede, recuperação longa do SOPRO.
     */
    phases: [
      { id: 1, nome: 'FASE 1', at: 1.0, attacks: ['golpe', 'cauda'] },
      { id: 2, nome: 'FASE 2', at: 0.7, attacks: ['golpe', 'cauda', 'investida', 'sopro'] },
      { id: 3, nome: 'FASE 3', at: 0.4, attacks: ['golpe', 'cauda', 'investida', 'sopro', 'area', 'aneis', 'pocas'] },
      { id: 4, nome: 'FASE FINAL', at: 0.15, attacks: ['golpe', 'cauda', 'investida', 'sopro', 'area', 'aneis', 'pocas'], combos: true, gapScale: 0.6 }
    ],
    combos: { golpe: 'cauda', investida: 'aneis', sopro: 'pocas' },
    comboChance: 0.65,
    phaseWeights: { golpe: 1, cauda: 0.8, investida: 0.9, sopro: 0.9, area: 0.8, aneis: 0.8, pocas: 0.7 },
    /** Escolha: perto → golpe/área; meio → investida/área; longe → investida (pesos). */
    weights: { near: { golpe: 0.6, area: 0.4 }, mid: { investida: 0.55, area: 0.25, golpe: 0.2 }, far: { investida: 1 } },
    /** Recompensa extra de vitória (além do XP/loot do data): contador permanente no save. */
    victoryStatKey: 'arenaBossWins',
    /** Arena: renasce com HP cheio ao morrer (sem perder nada permanente). */
    respawnFullHp: true,
    /** Câmera: com o chefe engajado/travado e perto, afasta/eleva o braço e abre o FOV (suave). */
    camera: { extraDistance: 1.8, extraDistancePortrait: 2.4, extraHeight: 0.7, extraFovDeg: 6, engageRange: 14, blendPerSec: 2.2 },
    /** Aviso "DERROTADO"/"VITÓRIA" antes de reiniciar a tentativa. */
    endBannerMs: 2600
  },
  /**
   * EVO — 7 ARQUÉTIPOS de inimigo (comportamento real distinto; números aqui, ids em data/monsters.json → "arquetipo").
   * Todo ataque importante: TELEGRAPH (marcador no chão/aviso) → WINDUP (pose de carga) → ATTACK (impacto) → RECOVERY (vulnerável).
   * Monstros antigos sem "arquetipo" continuam na IA genérica (idêntica à anterior).
   * Distâncias em tiles, tempos em ms, atkMult × dano base do monstro.
   */
  archetypes: {
    A: { nome: 'LÂMINA', bodyRadius: 0.36, papel: 'corpo a corpo', speedMult: 1.0, aggro: 9,
      attack: { kind: 'cone', telegraphMs: 480, windupMs: 220, activeMs: 120, recoveryMs: 650, range: 1.5, halfAngleDeg: 60, atkMult: 1.0, cooldownMs: [1400, 2000] } },
    B: { nome: 'VESPA', bodyRadius: 0.3, papel: 'rápido / flanqueia', speedMult: 1.85, aggro: 10, flankRadius: 2.3, flankMs: 1600, retreatMs: 700,
      attack: { kind: 'lunge', telegraphMs: 360, windupMs: 140, activeMs: 200, recoveryMs: 520, lungeDist: 2.0, lungeSpeed: 9, hitRadius: 0.75, atkMult: 0.75, cooldownMs: [1000, 1500] } },
    C: { nome: 'ATIRADOR', bodyRadius: 0.34, papel: 'à distância', speedMult: 0.9, aggro: 10, preferredDist: 4.6, minDist: 3.0, maxDist: 7,
      attack: { kind: 'shot', telegraphMs: 620, windupMs: 220, activeMs: 80, recoveryMs: 520, projSpeed: 6.5, projRadius: 0.28, projLifeMs: 1700, atkMult: 0.85, cooldownMs: [1500, 2100] } },
    D: { nome: 'COURAÇA', bodyRadius: 0.47, papel: 'tanque', speedMult: 0.58, aggro: 8, knockbackScale: 0.2, stunScale: 0.4, hyperArmor: true,
      attack: { kind: 'slam', telegraphMs: 950, windupMs: 320, activeMs: 180, recoveryMs: 1050, radius: 1.9, atkMult: 2.0, cooldownMs: [2000, 2600] } },
    E: { nome: 'TECELÃO', bodyRadius: 0.34, papel: 'controle (zonas de perigo / lentidão)', speedMult: 0.8, aggro: 10, preferredDist: 4.2, minDist: 2.6, maxDist: 7,
      attack: { kind: 'hazard', telegraphMs: 800, windupMs: 250, activeMs: 100, recoveryMs: 700, radius: 1.35, armMs: 650, durationMs: 4200, tickMs: 500, atkMult: 0.35, slow: 0.45, maxPerCaster: 2, cooldownMs: [2600, 3400] } },
    F: { nome: 'ELITE', bodyRadius: 0.42, papel: 'mais forte, habilidade própria (ONDA NEXA)', speedMult: 1.15, aggro: 11, knockbackScale: 0.45, stunScale: 0.6,
      attack: { kind: 'cone', telegraphMs: 520, windupMs: 200, activeMs: 140, recoveryMs: 600, range: 1.7, halfAngleDeg: 65, atkMult: 1.3, cooldownMs: [1200, 1700] },
      special: { kind: 'nova', telegraphMs: 900, windupMs: 300, activeMs: 200, recoveryMs: 900, radius: 2.8, atkMult: 1.6, everyMs: 6500 } },
    /** RIVAIS: herói rival (BOT offline) — golpe rápido de espada (cone), GOLPE GIRATÓRIO e esquiva (enemy-ai.rivalDodge). */
    H: { nome: 'HERÓI RIVAL', bodyRadius: 0.38, papel: 'herói rival (BOT): golpes rápidos, giro e esquiva', speedMult: 1.2, aggro: 11, knockbackScale: 0.6, stunScale: 0.6,
      attack: { kind: 'cone', telegraphMs: 380, windupMs: 170, activeMs: 120, recoveryMs: 480, range: 1.7, halfAngleDeg: 62, atkMult: 1.0, cooldownMs: [900, 1400] },
      special: { kind: 'nova', telegraphMs: 700, windupMs: 260, activeMs: 180, recoveryMs: 800, radius: 2.4, atkMult: 1.35, everyMs: 5500 } },
    G: { nome: 'GUARDIÃO', bodyRadius: 0.6, papel: 'mini-chefe com fases', speedMult: 0.95, aggro: 12, knockbackScale: 0.1, stunScale: 0.35, hyperArmor: true,
      attack: { kind: 'cone', telegraphMs: 640, windupMs: 260, activeMs: 160, recoveryMs: 750, range: 2.0, halfAngleDeg: 70, atkMult: 1.4, cooldownMs: [1100, 1500] },
      charge: { kind: 'charge', telegraphMs: 850, windupMs: 250, activeMs: 900, recoveryMs: 1100, speed: 7.5, maxDist: 6.5, hitRadius: 0.8, atkMult: 1.7, wallStunMs: 1400 },
      nova: { kind: 'nova', telegraphMs: 1050, windupMs: 300, activeMs: 200, recoveryMs: 1000, radius: 3.2, atkMult: 1.5 },
      /** Fases por % de HP: 2 = libera INVESTIDA; 3 = ONDA + zonas de perigo, mais rápido. */
      phases: [{ at: 1.0, moves: ['attack'] }, { at: 0.66, moves: ['attack', 'charge'] }, { at: 0.33, moves: ['attack', 'charge', 'nova'], speedMult: 1.2, cooldownScale: 0.75 }]
    }
  },
  /** EVO — projéteis/zonas de perigo de inimigos (limites globais; o preset pode reduzir). */
  enemyHazards: { slowMoveMult: 0.55, maxProjectiles: 24, maxHazards: 8 },
  /** EVO — spawn controlado (Campo de Ascensão): ativação por distância, teto de ativos, reaproveitamento. */
  spawning: { activationDistance: 13, maxActive: 12, spawnIntervalMs: 650, spawnMinDistFromHero: 4.5 },
  /**
   * EVO — POSTURA / QUEBRA (stagger). Golpes enchem a barra (mais nos fortes); cheia → QUEBRA:
   * inimigo atordoado por breakMs e recebe ×breakDamageMult de dano. Sem golpes por decayDelayMs, ela esvazia.
   */
  posture: {
    enabled: true,
    maxByTier: { comum: 40, elite: 120, mini_chefe: 260, chefe: 900 },
    basicHit: 8, finisherHit: 16,
    specials: { golpe_poderoso: 45, ataque_area: 22, dash: 18, suprema: 80 },
    dragonHit: 4,
    decayDelayMs: 2200, decayPerSec: 14,
    breakMs: 2400, breakMsBoss: 3600,
    breakDamageMult: 1.35,
    /** Nexa devolvida ao quebrar (recompensa pela agressividade). */
    breakNexa: 6
  },
  /** EVO — sensação de combate (curto, sem exagero). */
  feel: {
    perfectDodgeWindowMs: 120, perfectDodgeNexa: 6, perfectDodgeSlowMs: 0,
    hitStopHeavyMs: 70, hitStopBreakMs: 110,
    damageNumberCap: 12
  },
  /**
   * EVO — PROGRESSÃO. Curva de XP: xpNext(n) = round(base × growth^(n−1) + linear × (n−1)) — nível 1 → 100 (igual ao save antigo).
   * Ganhos por nível (somados ao subir; saves antigos ganham só nos próximos níveis).
   */
  progression: {
    xpBase: 100, xpGrowth: 1.16, xpLinear: 15, maxLevel: 30,
    perLevel: { hpMax: 12, nexaMax: 4, ataque: 1.6, defesa: 0.6 },
    /** Direções de build (etiqueta das cartas) e sinergia: 2 / 3 passivas da mesma direção dão bônus extra. */
    builds: {
      COMBO: { nome: 'COMBO', cor: '#ff5a4a', syn2: { stat: 'damage', valor: 0.06 }, syn3: { stat: 'attackSpeed', valor: 0.08 } },
      ESQUIVA: { nome: 'ESQUIVA', cor: '#5ad1ff', syn2: { stat: 'moveSpeed', valor: 0.06 }, syn3: { stat: 'damageTaken', valor: -0.08 } },
      NEXA: { nome: 'NEXA', cor: '#7f6bff', syn2: { stat: 'nexaRegen', valor: 0.2 }, syn3: { stat: 'abilityDamage', valor: 0.12 } },
      PODER: { nome: 'PODER', cor: '#ffc24a', syn2: { stat: 'critChance', valor: 0.04 }, syn3: { stat: 'damage', valor: 0.08 } },
      DEFESA: { nome: 'DEFESA', cor: '#4ae08a', syn2: { stat: 'maxHp', valor: 0.06 }, syn3: { stat: 'damageTaken', valor: -0.1 } }
    },
    /** Direção das passivas originais (não altera o JSON delas). */
    buildOf: {
      furia_cibernetica: 'COMBO', impulso_neural: 'ESQUIVA', nucleo_reforcado: 'DEFESA', mira_neural: 'PODER',
      condutor_de_nexa: 'NEXA', cacador_de_monstros: 'PODER', nucleo_divino: 'NEXA'
    }
  },
  /** EVO — CAMPO DE ASCENSÃO (modo de teste; ondas em data/campo_ascensao.json). */
  campo: {
    enabled: true,
    /** Herói entra com a cópia do personagem; morte reinicia a corrida sem tocar no save. */
    restartOnDeathMs: 2600,
    betweenWavesMs: 2600,
    gateOpenMs: 1800
  },
  /**
   * Bloco 6b — TELA INTEIRA. Android/Chrome: Fullscreen API (requestFullscreen) + trava opcional
   * da orientação atual. iPhone/Safari (sem a API para páginas): manifest "fullscreen" + dica
   * "Adicionar à Tela de Início". Nada é simulado.
   */
  fullscreen: {
    /** Entra em tela inteira no 1º toque em JOGAR / Continuar / Arena (precisa de gesto do usuário). */
    auto: IS_TOUCH,
    /**
     * EVO (pedido do Caio): NÃO trava a orientação — girar o celular gira o jogo (retrato ↔ paisagem),
     * dentro e fora da tela inteira. true = comportamento antigo (trava a orientação atual).
     */
    lockOrientation: false,
    /** Duração da dica do iPhone (ms). */
    tipMs: 6000
  },
  layoutEditor: {
    minScale: 0.6,
    maxScale: 1.6,
    minOpacity: 0.2,
    /** Margem mínima até a borda da tela (px) ao arrastar. */
    edgeMarginPx: 6,
    /** Arrasto abaixo disto (px) = só selecionar. */
    dragThresholdPx: 4
  }
});

/** Bloco 5 — itens editáveis do layout (ids estáveis, salvos em layout.<orientação>). */
export const LAYOUT_ITEMS = Object.freeze(['joystick', 'camera', 'attack', 'dodge', 'defend', 'golpe_poderoso', 'ataque_area', 'suprema']);
/** Bloco 6 — itens de layout que saíram da tela (layouts antigos: descartados na leitura). */
export const REMOVED_LAYOUT_ITEMS = Object.freeze(['dash', 'lock']);
/** Limites de cada campo de um item de layout. */
const LAYOUT_LIMITS = { x: [0, 1], y: [0, 1], s: [0.6, 1.6], o: [0.2, 1] };

/**
 * Bloco 5 — definição do menu CONTROLES (rótulos pt-BR, caminho no config, faixa e passo).
 * Não é override: só descreve os controles da tela (os valores vêm de getConfig()).
 */
export const SETTINGS_UI = Object.freeze([
  { group: 'MOVIMENTO', items: [
    { id: 'speed', label: 'Velocidade de movimento', type: 'range', path: 'movement.speedScale', min: 0.7, max: 1.3, step: 0.05, fmt: 'x' },
    { id: 'moveSens', label: 'Sensibilidade do movimento', type: 'range', path: 'joystick.sensitivity', min: 0.6, max: 2, step: 0.05, fmt: 'x' },
    { id: 'joySize', label: 'Tamanho do joystick', type: 'range', path: 'joystick.sizeScale', min: 0.7, max: 1.4, step: 0.05, fmt: '%' },
    { id: 'joyType', label: 'Joystick', type: 'choice', path: 'joystick.type', options: [['fixed', 'FIXO'], ['floating', 'FLUTUANTE']] }
  ] },
  { group: 'CÂMERA', items: [
    { id: 'camSens', label: 'Sensibilidade da câmera', type: 'range', path: 'camera.sensitivity', min: 0.3, max: 2.5, step: 0.05, fmt: 'x' },
    { id: 'camSmooth', label: 'Suavização da câmera', type: 'range', path: 'camera.smoothness', min: 0, max: 1, step: 0.05, fmt: '%' },
    { id: 'camH', label: 'Velocidade horizontal', type: 'range', path: 'camera.horizontalSpeed', min: 0.3, max: 2, step: 0.05, fmt: 'x' },
    { id: 'camV', label: 'Velocidade vertical', type: 'range', path: 'camera.verticalSpeed', min: 0.3, max: 2, step: 0.05, fmt: 'x' },
    { id: 'invertY', label: 'Inverter eixo vertical', type: 'toggle', path: 'camera.invertY' }
  ] },
  { group: 'COMBATE', items: [
    { id: 'aim', label: 'Assistência de mira', type: 'choice', path: ['combat.aimAssist', 'rightStick.aimAssist'], options: [['off', 'DESLIGADA'], ['low', 'BAIXA'], ['medium', 'MÉDIA'], ['high', 'ALTA']] },
    { id: 'lock', label: 'Trava de alvo', type: 'choice', path: 'lockOn.mode', options: [['manual', 'MANUAL'], ['automatico', 'AUTOMÁTICA']] },
    { id: 'auto', label: 'Ataque automático (segurar ATAQUE)', type: 'toggle', path: 'combat.autoAttack' }
  ] },
  { group: 'BOTÕES', items: [
    { id: 'btnSize', label: 'Tamanho dos botões', type: 'range', path: 'buttons.sizeScale', min: 0.75, max: 1.35, step: 0.05, fmt: '%' },
    { id: 'btnOpacity', label: 'Transparência dos botões', type: 'range', path: 'buttons.opacity', min: 0.3, max: 1, step: 0.05, fmt: 'op' },
    { id: 'showDefend', label: 'Mostrar botão DEFESA', type: 'toggle', path: 'buttons.showDefend' }
  ] },
  { group: 'TELA', items: [
    { id: 'fsAuto', label: 'Tela inteira automática', type: 'toggle', path: 'fullscreen.auto' }
  ] },
  // EVO: som (salvo no aparelho como os outros ajustes)
  { group: 'SOM', items: [
    { id: 'sfxOn', label: 'Efeitos sonoros', type: 'toggle', path: 'combat.sfxEnabled' },
    { id: 'sfxVol', label: 'Volume dos efeitos', type: 'range', path: 'combat.sfxVolume', min: 0, max: 1, step: 0.05, fmt: '%' },
    { id: 'musOn', label: 'Música', type: 'toggle', path: 'combat.musicEnabled' },
    { id: 'musVol', label: 'Volume da música', type: 'range', path: 'combat.musicVolume', min: 0, max: 1, step: 0.05, fmt: '%' },
    { id: 'musCred', type: 'note', label: 'Música (CC0, OpenGameArt): “Another space background track” — yd · “Battle Theme A” — cynicmusic.com · “Ancient Power Of Serpents” — josepharaoh99' }
  ] }
]);

/** Limites aceitos para overrides (protege contra valores quebrados no storage). */
const LIMITS = {
  'arenaBoss.hpMultiplierOfHero': [101, 1000000],
  'arenaBoss.hpMultiplierMin': [101, 1000000],
  'movement.walkSpeed': [0.8, 5],
  'movement.runMultiplier': [1, 2],
  'movement.runThreshold': [0.5, 1],
  'movement.runHoldMs': [0, 3000],
  'movement.minAnalogSpeed': [0, 1],
  'movement.acceleration': [2, 80],
  'movement.deceleration': [2, 120],
  'movement.playerRadius': [0.15, 0.45],
  'movement.turnSpeedDeg': [60, 2000],
  'movement.turnAccelerationDeg': [100, 20000],
  'joystick.baseRadius': [30, 110],
  'joystick.maxRadius': [20, 110],
  'joystick.hitPadding': [0, 120],
  'joystick.deadZone': [0, 0.6],
  'joystick.sensitivity': [0.3, 3],
  'joystick.responseCurve': [0.5, 3],
  'joystick.returnMs': [0, 600],
  'camera.sensitivity': [0.1, 4],
  'camera.touchRadPerPx': [0.0005, 0.03],
  'camera.mouseRadPerPx': [0.0002, 0.02],
  'camera.horizontalSpeed': [0.1, 3],
  'camera.verticalSpeed': [0.1, 3],
  'camera.smoothness': [0, 1],
  'camera.smoothingMaxTauMs': [0, 500],
  'camera.pitchMinDeg': [-85, 0],
  'camera.pitchMaxDeg': [0, 85],
  'camera.maxDeltaPerEventPx': [10, 400],
  'camera.fovDeg': [50, 100],
  'thirdPerson.distance': [1.2, 8],
  'thirdPerson.pivotHeight': [0.8, 2.6],
  'thirdPerson.shoulderOffset': [-1.5, 1.5],
  'thirdPerson.pitchMinDeg': [-85, 0],
  'thirdPerson.pitchMaxDeg': [0, 85],
  'thirdPerson.fovDeg': [45, 100],
  'thirdPerson.heroTurnSpeedDeg': [90, 3000],
  'camera.hitShake': [0, 2],
  'movement.speedScale': [0.5, 1.6],
  'joystick.sizeScale': [0.6, 1.6],
  'buttons.sizeScale': [0.6, 1.6],
  'buttons.opacity': [0.2, 1],
  'graphics.maxPixelRatio': [0.5, 3],
  'graphics.minPixelRatio': [0.3, 2],
  'graphics.downscaleFps': [15, 60],
  'graphics.upscaleFps': [20, 120],
  'graphics.adjustIntervalMs': [300, 10000],
  'graphics.bloomStrength': [0, 3],
  'graphics.bloomRadius': [0, 1],
  'graphics.bloomThreshold': [0, 4],
  'graphics.exposure': [0.3, 3],
  'graphics.gradeAmount': [0, 1],
  'graphics.vignette': [0, 1],
  'combat.attackStartupMs': [40, 600],
  'combat.attackActiveMs': [30, 400],
  'combat.attackRecoveryMs': [80, 1200],
  'combat.attackCooldownMs': [0, 1500],
  'combat.comboWindowMs': [0, 800],
  'combat.comboResetMs': [100, 2000],
  'combat.inputBufferMs': [0, 400],
  'combat.attackRange': [0.6, 3],
  'combat.hitboxHalfAngleDeg': [10, 90],
  'combat.hitStopMs': [0, 150],
  'combat.sfxVolume': [0, 1],
  'combat.musicVolume': [0, 1],
  'combat.critChance': [0, 1],
  'combat.critMult': [1, 5],
  'combat.hpRegenPerSec': [0, 50],
  'combat.nexaRegenPerSec': [0, 20],
  'rightStick.sensitivity': [0.2, 4],
  'rightStick.deadZone': [0, 40],
  'rightStick.minDragDistance': [4, 60],
  'rightStick.tapRecognitionTime': [80, 600],
  'rightStick.aimNudgeMs': [0, 600],
  'passives.choices': [1, 5],
  'dodge.distance': [0.5, 5],
  'dodge.durationMs': [120, 800],
  'dodge.cooldownMs': [0, 5000],
  'dodge.iFrameMs': [0, 800],
  'defense.frontReduction': [0, 1],
  'defense.backReduction': [0, 1],
  'defense.frontArcDeg': [30, 360],
  'defense.moveSpeedMult': [0.1, 1],
  'actions.inputBufferMs': [0, 400],
  'lockOn.range': [2, 15],
  'lockOn.trackStrength': [0, 20],
  'dragon.evolveAtHeroLevel': [2, 99],
  'dragon.speed': [0.5, 8],
  'dragon.aggroRange': [1, 15],
  'dragon.heroTargetMemoryMs': [0, 30000],
  'dragon.attackRange': [1, 12],
  'dragon.leashDistance': [0.5, 8],
  'enemyAi.spawnGraceMs': [0, 10000],
  'enemyAi.chaseSpeed': [0.3, 4],
  'enemyAi.attackStartupMs': [200, 3000],
  'enemyAi.attackRecoveryMs': [100, 3000],
  'enemyAi.attackCooldownMinMs': [200, 8000],
  'enemyAi.attackCooldownMaxMs': [200, 10000],
  'enemyAi.maxSimultaneousAttackers': [1, 4],
  'enemyAi.maxChaseDistance': [1, 40],
  'enemyAi.reactionTimeMs': [0, 3000]
};
const ENUMS = {
  'joystick.type': ['fixed', 'floating'],
  'combat.aimAssist': ['off', 'low', 'medium', 'high'],
  'rightStick.aimAssist': ['off', 'low', 'medium', 'high'],
  'graphics.quality': ['auto', 'low', 'medium', 'high'],
  'lockOn.mode': ['manual', 'automatico']
};

function isObj(v) {
  return v && typeof v === 'object' && !Array.isArray(v);
}

/** Merge profundo SÓ de chaves conhecidas, com checagem de tipo e limites. */
function sanitizeMerge(base, over, path = '') {
  const out = {};
  for (const k of Object.keys(base)) {
    const b = base[k];
    const o = over ? over[k] : undefined;
    const p = path ? `${path}.${k}` : k;
    if (p === 'layout') { out[k] = sanitizeLayout(o); continue; }
    if (isObj(b)) {
      // Seções vazias (reservadas) aceitam chaves livres de tipo primitivo
      if (!Object.keys(b).length && isObj(o)) {
        out[k] = {};
        for (const [kk, vv] of Object.entries(o)) {
          if (['number', 'boolean', 'string'].includes(typeof vv)) out[k][kk] = vv;
        }
      } else {
        out[k] = sanitizeMerge(b, isObj(o) ? o : undefined, p);
      }
      continue;
    }
    if (o === undefined || typeof o !== typeof b) {
      out[k] = b;
      continue;
    }
    if (typeof b === 'number') {
      if (!Number.isFinite(o)) { out[k] = b; continue; }
      const lim = LIMITS[p];
      out[k] = lim ? Math.max(lim[0], Math.min(lim[1], o)) : o;
      continue;
    }
    if (typeof b === 'string' && ENUMS[p] && !ENUMS[p].includes(o)) {
      out[k] = b;
      continue;
    }
    out[k] = o;
  }
  return out;
}

/** Bloco 5: layout do editor — só itens conhecidos, campos numéricos dentro dos limites. */
function sanitizeLayout(o) {
  const out = { portrait: {}, landscape: {} };
  if (!isObj(o)) return out;
  for (const orient of ['portrait', 'landscape']) {
    const src = o[orient];
    if (!isObj(src)) continue;
    for (const id of LAYOUT_ITEMS) {
      const it = src[id];
      if (!isObj(it)) continue;
      const clean = {};
      for (const [f, [lo, hi]] of Object.entries(LAYOUT_LIMITS)) {
        const v = it[f];
        if (typeof v === 'number' && Number.isFinite(v)) clean[f] = Math.max(lo, Math.min(hi, v));
      }
      if (('x' in clean) !== ('y' in clean)) { delete clean.x; delete clean.y; }
      if (Object.keys(clean).length) out[orient][id] = clean;
    }
  }
  return out;
}

function deepFreeze(o) {
  Object.freeze(o);
  for (const v of Object.values(o)) if (isObj(v) && !Object.isFrozen(v)) deepFreeze(v);
  return o;
}

function readStoredOverrides() {
  try {
    const raw = globalThis.localStorage?.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return isObj(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * Bloco 6 — migração: layouts salvos com itens removidos (DASH/ALVO) são limpos no storage
 * (os demais itens do layout ficam como estavam). Nunca lança erro.
 */
export const migrationInfo = { layoutRemoved: [] };
function migrateStoredOverrides(o) {
  try {
    if (!isObj(o) || !isObj(o.layout)) return o;
    let changed = false;
    for (const orient of Object.keys(o.layout)) {
      const src = o.layout[orient];
      if (!isObj(src)) continue;
      for (const id of Object.keys(src)) {
        if (!LAYOUT_ITEMS.includes(id)) {
          delete src[id];
          migrationInfo.layoutRemoved.push(`${orient}.${id}`);
          changed = true;
        }
      }
    }
    if (changed) globalThis.localStorage?.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(o));
  } catch { /* storage indisponível: sanitizeLayout já ignora os ids removidos */ }
  return o;
}

let overrides = migrateStoredOverrides(readStoredOverrides());
let current = deepFreeze(sanitizeMerge(DEFAULTS, overrides));
const listeners = new Set();

/** Config efetiva (defaults + overrides). Objeto congelado — ler, não mutar. */
export function getConfig() {
  return current;
}

/** Overrides crus salvos pelo usuário. */
export function getOverrides() {
  return JSON.parse(JSON.stringify(overrides));
}

function deepAssign(dst, src) {
  for (const [k, v] of Object.entries(src || {})) {
    if (isObj(v)) {
      if (!isObj(dst[k])) dst[k] = {};
      deepAssign(dst[k], v);
    } else {
      dst[k] = v;
    }
  }
  return dst;
}

function rebuild(persist) {
  current = deepFreeze(sanitizeMerge(DEFAULTS, overrides));
  if (persist) {
    try {
      globalThis.localStorage?.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(overrides));
    } catch { /* storage cheio / privado — mantém em memória */ }
  }
  for (const fn of listeners) {
    try { fn(current); } catch (e) { console.warn('[gameplay-config] listener', e); }
  }
  return current;
}

/** Aplica overrides parciais (merge profundo) e persiste. Ex.: setOverrides({camera:{sensitivity:1.3}}) */
export function setOverrides(partial, { persist = true } = {}) {
  deepAssign(overrides, partial);
  return rebuild(persist);
}

/** Bloco 5: substitui o layout de UMA orientação (null = volta ao padrão) e persiste. */
export function setLayout(orient, items, { persist = true } = {}) {
  if (orient !== 'portrait' && orient !== 'landscape') return current;
  if (!isObj(overrides.layout)) overrides.layout = {};
  if (items && Object.keys(items).length) overrides.layout[orient] = JSON.parse(JSON.stringify(items));
  else delete overrides.layout[orient];
  if (!Object.keys(overrides.layout).length) delete overrides.layout;
  return rebuild(persist);
}

/** Bloco 5: remove só as chaves dadas (ex.: ['camera.sensitivity']) — "restaurar" de uma seção. */
export function clearOverridePaths(paths, { persist = true } = {}) {
  for (const path of paths) {
    const parts = path.split('.');
    let o = overrides;
    for (let i = 0; i < parts.length - 1 && o; i++) o = isObj(o[parts[i]]) ? o[parts[i]] : null;
    if (o) delete o[parts[parts.length - 1]];
  }
  return rebuild(persist);
}

/** Remove todos os overrides (volta aos defaults). */
export function resetOverrides({ persist = true } = {}) {
  overrides = {};
  if (persist) {
    try { globalThis.localStorage?.removeItem(SETTINGS_STORAGE_KEY); } catch { /* ignore */ }
  }
  return rebuild(false);
}

/** Recarrega do storage (ex.: outra aba mudou). */
export function reloadOverrides() {
  overrides = readStoredOverrides();
  return rebuild(false);
}

export function onConfigChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === SETTINGS_STORAGE_KEY) reloadOverrides();
  });
}

export const DEG = Math.PI / 180;

/**
 * Modo touch: ?touch=1 força, ?touch=0 desliga; senão detecta
 * (pointer coarse / touch points / tela estreita).
 */
/** Bloco V: modo de câmera. Padrão 3ª pessoa; ?fp=1 força a 1ª pessoa antiga (fallback/testes). */
export function detectViewMode() {
  try {
    const q = new URLSearchParams(location.search);
    if (q.get('fp') === '1') return 'first';
  } catch { /* ignore */ }
  return 'third';
}

/** Bloco V: nível de qualidade efetivo ('low' | 'medium' | 'high'). */
/**
 * Nível de qualidade: ?quality=low|medium|high > graphics.quality fixo > automático.
 * Automático: GPU por software (SwiftShader/llvmpipe — sem aceleração) → low; toque → medium; desktop → high.
 */
export function detectQualityTier(isTouch, opts = {}) {
  let q = null;
  try { q = new URLSearchParams(location.search).get('quality'); } catch { /* ignore */ }
  if (q === 'low' || q === 'medium' || q === 'high') return q;
  const c = getConfig().graphics.quality;
  if (c === 'low' || c === 'medium' || c === 'high') return c;
  if (opts.softwareGL && getConfig().graphics.softwareGLLow) return 'low';
  return isTouch ? 'medium' : 'high';
}

/** true se o WebGL roda em rasterizador por software (sem GPU real). */
export function isSoftwareGL(gl) {
  try {
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const name = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
    return /swiftshader|llvmpipe|softpipe|software/i.test(name) ? name : '';
  } catch { return ''; }
}

export function detectTouchMode() {
  let q = null;
  try { q = new URLSearchParams(location.search).get('touch'); } catch { /* ignore */ }
  if (q === '1') return true;
  if (q === '0') return false;
  const coarse = globalThis.matchMedia?.('(pointer: coarse)').matches;
  const pts = (globalThis.navigator?.maxTouchPoints || 0) > 0;
  const narrow = globalThis.matchMedia?.('(max-width: 900px)').matches;
  return !!(coarse || pts || ('ontouchstart' in globalThis) || narrow);
}
