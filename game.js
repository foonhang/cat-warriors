/* Cat Clan RPG light v0.7.0 — walk and talk; color comic originals; player uses color idle for all poses; no combat */
(() => {
  "use strict";

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");

  let CFG = null;
  let STR = null;
  let artImages = {};

  const $ = (id) => document.getElementById(id);
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

  let muted = false;
  let lastSpoken = "";
  function speak(text) {
    lastSpoken = text || "";
    if (muted || !text || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = CFG.TTS_LANG || "en-US";
    u.rate = CFG.TTS_RATE;
    window.speechSynthesis.speak(u);
  }
  function replay() { speak(lastSpoken); }

  const ZONES = ["Camp", "Forest", "Creek"];
  const W = 960, H = 540;

  const state = {
    mode: "title", // title | explore | dialogue | ending | pause
    zone: "Camp",
    player: { x: 160, y: 300, r: 28, facing: 1 },
    companion: { x: 120, y: 320, r: 22 },
    npcs: [],
    dialogueQueue: [],
    dialogueCb: null,
    dialogueSpeaker: null,
    _cutsceneLines: null,
    targetArrow: null,
    moveTarget: null,
    talked: {},
    talkStage: {},
    zoneCoolUntil: 0,
    anim: { walkT: 0, walkFlip: 0 },
  };

  function zoneBgColor(zone) {
    return CFG.placeholderColors[
      zone === "Camp" ? "bgCamp" : zone === "Forest" ? "bgForest" : "bgCreek"
    ];
  }

  function zoneIndex(zone) {
    const i = ZONES.indexOf(zone || state.zone);
    return i < 0 ? 0 : i;
  }

  function npcDef(zone) {
    if (zone === "Camp") {
      return [
        { id: "mama", kind: "mamaCat", name: "Mama Cat", x: 300, y: 240, r: 30, cutscene: "1" },
        { id: "moss", kind: "littleMoss", name: "Little Moss", x: 430, y: 330, r: 28, cutscene: "2" },
        { id: "bug", kind: "bug", name: "Bug", x: 580, y: 250, r: 22, keys: ["bug_0"] },
        { id: "mouse", kind: "mouse", name: "Mouse", x: 700, y: 340, r: 24, keys: ["mouse_0"] },
      ];
    }
    if (zone === "Forest") {
      return [
        { id: "oldGrey", kind: "oldGrey", name: "Old Grey", x: 280, y: 220, r: 30, cutscene: "3" },
        { id: "pebble", kind: "pebble", name: "Pebble", x: 420, y: 320, r: 26, cutscene: "4" },
        { id: "foxCub", kind: "foxCub", name: "Fox Cub", x: 660, y: 260, r: 34, cutscene: "5" },
      ];
    }
    return [
      { id: "oldGreyCreek", kind: "oldGrey", name: "Old Grey", x: 320, y: 250, r: 30, keys: ["creek_teaser_0", "creek_teaser_1"] },
      { id: "pebbleCreek", kind: "pebble", name: "Pebble", x: 520, y: 320, r: 26, keys: ["lv5_post_3"] },
    ];
  }

  function spawnZone(zone, enterFrom) {
    state.zone = zone;
    state.npcs = npcDef(zone).map((n) => ({ ...n }));
    state.moveTarget = null;
    if (enterFrom === "left") {
      state.player.x = 80;
      state.player.y = H / 2;
    } else if (enterFrom === "right") {
      state.player.x = W - 80;
      state.player.y = H / 2;
    } else {
      state.player.x = 160;
      state.player.y = 300;
    }
    state.companion.x = state.player.x - 40;
    state.companion.y = state.player.y + 20;
    state.zoneCoolUntil = performance.now() + 600;
    updateQuestHud();
    saveGame();
  }

  function playerDisplayName() {
    return CFG.PLAYER_NAME || "Kit";
  }

  function interpolatePlayerName(text) {
    return String(text || "").replace(/\{playerName\}/g, playerDisplayName());
  }

  function updateHud() {
    $("ver").textContent = CFG.version;
    const zoneEl = $("zone-text");
    if (zoneEl) zoneEl.textContent = state.zone;
  }

  function updateQuestHud() {
    const q = $("quest-text");
    const ico = $("quest-icon");
    const icons = { Camp: "⛺", Forest: "🌲", Creek: "💧" };
    ico.textContent = icons[state.zone] || "🐱";
    const key = state.zone === "Camp" ? "camp" : state.zone === "Forest" ? "forest" : "creek";
    q.textContent = (STR.quest && STR.quest[key]) || STR.ui.hint_talk;
    updateHud();
    updateArrowTarget();
  }

  function updateArrowTarget() {
    const unread = state.npcs.find((n) => !state.talked[n.id]);
    if (unread) {
      state.targetArrow = { x: unread.x, y: unread.y - 50 };
      return;
    }
    const i = zoneIndex();
    if (i < ZONES.length - 1) {
      state.targetArrow = { x: W - 28, y: H / 2 };
    } else {
      state.targetArrow = null;
    }
  }

  function updateMuteBtn() {
    $("btn-mute").textContent = muted ? "🔇" : "🔊";
  }

  function showToast(msg, ms = 1600) {
    const el = $("toast");
    el.textContent = msg;
    el.classList.remove("hidden");
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => el.classList.add("hidden"), ms);
  }

  function setMode(m) {
    state.mode = m;
    $("dialogue").classList.toggle("hidden", m !== "dialogue");
    $("ending-screen").classList.toggle("hidden", m !== "ending");
    $("pause-screen").classList.toggle("hidden", m !== "pause");
    $("title-screen").classList.toggle("hidden", m !== "title");
  }

  function playCutsceneBlock(block, cb) {
    if (!block || !block.length) {
      if (cb) cb();
      return;
    }
    const keys = block.map((line) => line.key);
    state._cutsceneLines = block.slice();
    state.dialogueQueue = keys.slice();
    state.dialogueCb = () => {
      state._cutsceneLines = null;
      if (cb) cb();
    };
    state.dialogueSpeaker = block[0].speaker;
    setMode("dialogue");
    nextDialogueLine();
  }

  function showDialogue(keys, cb, speakerKind) {
    state.dialogueQueue = keys.slice();
    state.dialogueCb = cb || null;
    state.dialogueSpeaker = speakerKind || null;
    state._cutsceneLines = null;
    setMode("dialogue");
    nextDialogueLine();
  }

  function resolveSpeaker(key) {
    if (state._cutsceneLines) {
      const line = state._cutsceneLines.find((l) => l.key === key);
      if (line) return line.speaker;
    }
    if (/^bug_/.test(key)) return "bug";
    if (/^mouse_/.test(key)) return "mouse";
    if (/^lv1_/.test(key)) return "mamaCat";
    if (/^lv2_/.test(key)) return "littleMoss";
    if (/pebble|lv4_pre_1|lv4_pre_3|lv4_post_0|lv5_pre_3|lv5_post_3|creek_teaser/.test(key)) return "pebble";
    if (/fox|lv5_post_0/.test(key)) return "foxCub";
    if (/oldGrey|lv3_|lv4_pre_0|lv4_post_1|lv5_pre_0|lv5_pre_2|lv5_post_2/.test(key)) return "oldGrey";
    return state.dialogueSpeaker || "player";
  }

  function setDialoguePortrait(kind) {
    const av = $("dlg-avatar");
    const portKey = kind + "Portrait";
    const img = artImages[portKey];
    const col = CFG.placeholderColors[kind] || CFG.placeholderColors.oldGrey || "#9a9a9a";
    if (img && img.complete && img.naturalWidth) {
      av.style.backgroundColor = col;
      av.style.backgroundImage = "url(" + CFG.art[portKey] + ")";
      av.style.backgroundSize = "cover";
      av.style.backgroundPosition = "center";
      av.style.backgroundRepeat = "no-repeat";
    } else {
      av.style.backgroundImage = "none";
      av.style.background = col;
    }
  }

  function nextDialogueLine() {
    if (!state.dialogueQueue.length) {
      const cb = state.dialogueCb;
      state.dialogueCb = null;
      state.dialogueSpeaker = null;
      setMode("explore");
      if (cb) cb();
      updateArrowTarget();
      saveGame();
      return;
    }
    const key = state.dialogueQueue.shift();
    const raw = STR.dialogue[key] || STR.ui[key] || key;
    const text = interpolatePlayerName(raw);
    $("dlg-text").textContent = text;
    let speaker = resolveSpeaker(key);
    if (state._cutsceneLines) {
      const hit = state._cutsceneLines.find((l) => l.key === key);
      if (hit) speaker = hit.speaker;
    }
    setDialoguePortrait(speaker);
    speak(text);
  }

  function startNpcTalk(npc) {
    const after = () => {
      state.talked[npc.id] = true;
      updateArrowTarget();
      saveGame();
    };
    if (npc.cutscene) {
      const block = CFG.CUTSCENES[String(npc.cutscene)] || {};
      const stage = state.talkStage[npc.id] || 0;
      const kind = stage === 0 ? "pre" : "post";
      const lines = block[kind] || block.pre || [];
      playCutsceneBlock(lines, () => {
        state.talkStage[npc.id] = stage === 0 ? 1 : 0;
        after();
      });
      return;
    }
    showDialogue(npc.keys || [], after, npc.kind);
  }

  function saveGame() {
    const key = CFG.LOCALSTORAGE_KEY || "mao_zu_v07";
    const data = {
      version: CFG.version,
      zone: state.zone,
      player: { x: state.player.x, y: state.player.y },
      talked: { ...state.talked },
      talkStage: { ...state.talkStage },
      muted,
    };
    try { localStorage.setItem(key, JSON.stringify(data)); } catch (_) {}
  }

  function loadGame() {
    const key = CFG.LOCALSTORAGE_KEY || "mao_zu_v07";
    let raw;
    try { raw = localStorage.getItem(key); } catch (_) { raw = null; }
    if (!raw) {
      try { raw = localStorage.getItem(CFG.LOCALSTORAGE_LEGACY_KEY || "mao_zu_v04"); } catch (_) { raw = null; }
    }
    if (!raw) return false;
    let data;
    try { data = JSON.parse(raw); } catch (_) { return false; }
    try {
      muted = !!data.muted;
      state.talked = data.talked || {};
      state.talkStage = data.talkStage || {};
      const zone = ZONES.includes(data.zone) ? data.zone : "Camp";
      updateMuteBtn();
      spawnZone(zone, "start");
      if (data.player && Number.isFinite(data.player.x)) {
        state.player.x = clamp(data.player.x, 40, W - 40);
        state.player.y = clamp(data.player.y || 300, 60, H - 40);
      }
      return true;
    } catch (_) { return false; }
  }

  function newGame() {
    state.talked = {};
    state.talkStage = {};
    spawnZone("Camp", "start");
    setMode("explore");
    showToast(STR.ui.hint_talk);
    speak(STR.ui.hint_talk);
  }

  function canvasPos(evt) {
    const rect = canvas.getBoundingClientRect();
    const clientX = evt.touches ? evt.touches[0].clientX : evt.clientX;
    const clientY = evt.touches ? evt.touches[0].clientY : evt.clientY;
    return {
      x: ((clientX - rect.left) / rect.width) * W,
      y: ((clientY - rect.top) / rect.height) * H,
    };
  }

  function dist(a, b) {
    const dx = a.x - b.x, dy = a.y - b.y;
    return Math.hypot(dx, dy);
  }

  function onTap(evt) {
    if (state.mode !== "explore") return;
    evt.preventDefault();
    const p = canvasPos(evt);
    for (const n of state.npcs) {
      if (dist(p, n) < n.r + 20) {
        startNpcTalk(n);
        return;
      }
    }
    state.moveTarget = { x: clamp(p.x, 40, W - 40), y: clamp(p.y, 60, H - 40) };
  }

  canvas.addEventListener("pointerdown", onTap);

  function artLoaded(key) {
    const img = artImages[key];
    return !!(img && img.complete && img.naturalWidth);
  }

  function resolveArtKey(kind, pose) {
    const suffix = { idle: "Idle", walkA: "WalkA", walkB: "WalkB", atk: "Atk" }[pose] || "Idle";
    const keyed = kind + suffix;
    if (CFG.art[keyed] && artLoaded(keyed)) return keyed;
    if (CFG.art[kind] && artLoaded(kind)) return kind;
    return null;
  }

  function pickPose(moving, attacking) {
    if (attacking) return "atk";
    if (moving) return state.anim.walkFlip ? "walkB" : "walkA";
    return "idle";
  }

  function drawPlaceholder(kind, x, y, r, pose) {
    const usePose = pose || "idle";
    const key = resolveArtKey(kind, usePose);
    if (key) {
      const img = artImages[key];
      ctx.drawImage(img, x - r, y - r, r * 2, r * 2);
      return;
    }
    const color = CFG.placeholderColors[kind] || "#888";
    ctx.beginPath();
    ctx.fillStyle = color;
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#333";
    ctx.lineWidth = 2;
    ctx.stroke();
    if (["player", "companion", "oldGrey", "pebble", "mamaCat", "littleMoss", "foxCub"].includes(kind)) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(x - r * 0.7, y - r * 0.5);
      ctx.lineTo(x - r * 0.3, y - r * 1.2);
      ctx.lineTo(x - r * 0.1, y - r * 0.4);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x + r * 0.7, y - r * 0.5);
      ctx.lineTo(x + r * 0.3, y - r * 1.2);
      ctx.lineTo(x + r * 0.1, y - r * 0.4);
      ctx.fill();
    }
    ctx.fillStyle = "#222";
    ctx.font = "bold 11px sans-serif";
    ctx.textAlign = "center";
    const label = kind === "foxCub" ? "Fox" : kind === "oldGrey" ? "Grey" : kind === "littleMoss" ? "Moss" : kind === "mamaCat" ? "Mama" : "";
    if (label) ctx.fillText(label, x, y + 4);
  }

  function draw() {
    const bgKey = state.zone === "Camp" ? "bgCamp" : state.zone === "Forest" ? "bgForest" : "bgCreek";
    const bgImg = artImages[bgKey];
    if (bgImg && bgImg.complete && bgImg.naturalWidth) {
      ctx.drawImage(bgImg, 0, 0, W, H);
    } else {
      ctx.fillStyle = zoneBgColor(state.zone);
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "rgba(255,255,255,0.08)";
      for (let i = 0; i < 8; i++) {
        ctx.fillRect(0, i * 70, W, 30);
      }
    }
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.font = "bold 20px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(state.zone, 16, H - 16);

    for (const n of state.npcs) {
      drawPlaceholder(n.kind, n.x, n.y, n.r, "idle");
    }

    const now = performance.now();
    const c = state.companion;
    const cMoving = Math.hypot(c.x - (state.player.x - 40), c.y - (state.player.y + 20)) > 4;
    drawPlaceholder("companion", c.x, c.y, c.r, pickPose(cMoving, false));

    const pMoving = !!state.moveTarget && state.mode === "explore";
    drawPlaceholder("player", state.player.x, state.player.y, state.player.r, pickPose(pMoving, false));

    const arrow = $("arrow");
    if (state.targetArrow && state.mode === "explore") {
      const rect = canvas.getBoundingClientRect();
      const app = $("app").getBoundingClientRect();
      const sx = rect.left + (state.targetArrow.x / W) * rect.width - app.left;
      const sy = rect.top + (state.targetArrow.y / H) * rect.height - app.top;
      arrow.style.display = "block";
      arrow.style.left = sx + "px";
      arrow.style.top = sy + "px";
    } else {
      arrow.style.display = "none";
    }
  }

  function maybeChangeZone() {
    if (state.mode !== "explore") return;
    if (performance.now() < state.zoneCoolUntil) return;
    const p = state.player;
    const i = zoneIndex();
    if (p.x > W - 42 && i < ZONES.length - 1) {
      const next = ZONES[i + 1];
      spawnZone(next, "left");
      showToast(next);
      speak(next);
    } else if (p.x < 42 && i > 0) {
      const prev = ZONES[i - 1];
      spawnZone(prev, "right");
      showToast(prev);
      speak(prev);
    }
  }

  function update(dt) {
    state.anim.walkT += dt;
    if (state.anim.walkT >= 0.15) {
      state.anim.walkT = 0;
      state.anim.walkFlip = state.anim.walkFlip ? 0 : 1;
    }
    if (state.mode !== "explore") return;
    const p = state.player;
    if (state.moveTarget) {
      const dx = state.moveTarget.x - p.x;
      const dy = state.moveTarget.y - p.y;
      const d = Math.hypot(dx, dy);
      const speed = 220;
      if (d < 4) {
        state.moveTarget = null;
      } else {
        p.x += (dx / d) * speed * dt;
        p.y += (dy / d) * speed * dt;
        p.facing = dx >= 0 ? 1 : -1;
      }
    }
    const c = state.companion;
    const tx = p.x - 40, ty = p.y + 20;
    c.x += (tx - c.x) * 0.08;
    c.y += (ty - c.y) * 0.08;
    maybeChangeZone();
  }

  let last = performance.now();
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    update(dt);
    draw();
    requestAnimationFrame(loop);
  }

  function wire() {
    $("btn-start").onclick = () => { newGame(); };
    $("btn-continue").onclick = () => {
      if (loadGame()) setMode("explore");
    };
    $("btn-next").onclick = () => nextDialogueLine();
    $("btn-replay").onclick = () => replay();
    $("btn-mute").onclick = () => {
      muted = !muted;
      if (muted && window.speechSynthesis) window.speechSynthesis.cancel();
      updateMuteBtn();
      saveGame();
    };
    $("btn-pause").onclick = () => {
      if (state.mode === "explore") setMode("pause");
    };
    $("btn-resume").onclick = () => { setMode("explore"); };
    $("btn-restart").onclick = () => { newGame(); };
    $("btn-end-restart").onclick = () => { newGame(); };

    $("end1").textContent = STR.ui.ending_1;
    $("end2").textContent = STR.ui.ending_2;
  }

  function preloadArt() {
    const keys = Object.keys(CFG.art);
    keys.forEach((k) => {
      const img = new Image();
      img.src = CFG.art[k];
      artImages[k] = img;
    });
  }

  async function boot() {
    const [cRes, sRes] = await Promise.all([
      fetch("config.json"),
      fetch("strings.en.json"),
    ]);
    CFG = await cRes.json();
    STR = await sRes.json();
    preloadArt();
    wire();
    updateMuteBtn();
    updateHud();

    try {
      if (localStorage.getItem(CFG.LOCALSTORAGE_KEY) || localStorage.getItem(CFG.LOCALSTORAGE_LEGACY_KEY)) {
        $("btn-continue").classList.remove("hidden");
      }
    } catch (_) {}

    setMode("title");
    requestAnimationFrame(loop);
  }

  boot();
})();
