"use client";

import { useEffect, useRef, useState } from "react";

// ===========================================================================
// SCHÉMA LIGNE CASABLANCA → MARRAKECH (transcrit des planches fournies)
// Toutes les valeurs (PK, postes, secteurs, PCV/gares, limites) sont ici et
// éditables. PK au format km,m (ex: 370.262 = PK 370+262).
// ===========================================================================
interface Junction {
  top: number; // n° poste Voie 1 (impair)
  bot: number; // n° poste Voie 2 (pair)
  annL: number;
  carL: number;
  carR: number;
  annR: number;
  pcv?: { name: string; pk: number };
  gare?: { name: string; pk: number };
  base?: { name: string; pk: number };
  cross?: boolean;
}

// Ligne découpée en tronçons de 60 km : un poste (croisement) à chaque limite.
const CASA = 351.5;
const SECTOR_LEN = 60; // longueur d'un secteur (km)
// Limites internes des secteurs (= emplacement des postes) : 411.5, 471.5, 531.5, 591.5
const BOUNDS = [1, 2, 3, 4].map((k) => CASA + k * SECTOR_LEN);
const PCV_NAMES = [
  "PCV SIDI EL AIDI",
  "PCV SETTAT",
  "PCV BENGUERIR",
  "PCV SIDI BOU OTHMAN",
];
const JUNCTIONS: Junction[] = BOUNDS.map((b, k) => ({
  top: 2 * k + 1,
  bot: 2 * k + 2,
  annL: b - 6,
  carL: b - 3,
  carR: b + 3,
  annR: b + 6,
  pcv: { name: PCV_NAMES[k], pk: b },
  cross: true,
}));

const LIMITS = [
  { name: "Limite VCBT1 / VCBT2", pk: CASA },
  { name: "Limite VCBT2 / TVE 4", pk: CASA + 300 - 13 },
];

interface Secteur {
  label: string;
  a: number;
  b: number;
  travaux?: boolean; // ZT / chantier dans le secteur
}
// 5 secteurs de 60 km (Voie 1 = parcours de TTx-01)
const makeSectors = () =>
  Array.from({ length: 5 }, (_, k) => ({
    label: `Secteur ${k + 1}`,
    a: CASA + k * SECTOR_LEN,
    b: CASA + (k + 1) * SECTOR_LEN,
  }));
const SECT_V1: Secteur[] = makeSectors();
SECT_V1[1].travaux = true; // Secteur 2 : travaux
const SECT_V2: Secteur[] = makeSectors();

// Occupation par un autre train (index secteur V1)
const OCC_INDEX = 2; // Secteur 3 occupé par MAT-88
const OCC_TRAIN = "MAT-88";
const occPk = (SECT_V1[OCC_INDEX].a + SECT_V1[OCC_INDEX].b) / 2;

const hasWork = (i: number) => !!SECT_V1[i].travaux || i === OCC_INDEX;
const reasonOf = (i: number) =>
  SECT_V1[i].travaux ? "TRAVAUX" : i === OCC_INDEX ? `OCCUPÉ ${OCC_TRAIN}` : "";
const distOf = (i: number) =>
  (SECT_V1[i].b - SECT_V1[i].a).toFixed(1) + " km";
// Poste protégeant l'entrée d'un secteur (poste situé à la limite du secteur)
const junctionBefore = (i: number) =>
  JUNCTIONS.find((jj) => Math.abs((jj.carL + jj.carR) / 2 - SECT_V1[i].a) < 0.1);
const junctionAt = (pk: number) =>
  JUNCTIONS.find((jj) => Math.abs((jj.carL + jj.carR) / 2 - pk) < 0.1);
// Déviation possible si le secteur a AU MOINS un poste (avant OU après).
// Secteur courant = 2 postes (contournement + retour). Secteur terminus = 1 poste
// (1er secteur : poste après ; dernier : poste avant) → bascule sans retour.
const canBypass = (i: number) =>
  !!junctionBefore(i) || !!junctionAt(SECT_V1[i].b);
// Poste de communication le plus proche (pour changer de voie)
const nearestCrossPoste = (pk: number) => {
  let best: Junction | null = null;
  let bd = 4;
  for (const j of JUNCTIONS) {
    if (!j.cross) continue;
    const d = Math.abs((j.carL + j.carR) / 2 - pk);
    if (d < bd) {
      bd = d;
      best = j;
    }
  }
  return best;
};
const SECTOR_KM = 60; // zone d'attention avant un secteur bloqué
const HALF_KM = SECTOR_KM / 2; // 30 km : déclenchement du son d'alarme

const MARRAKECH = CASA + 300; // ligne Casa → Marrakech = 300 km

// Échelle PK → px
const MIN_PK = 350;
const MARGIN = 150;
const PX_DEFAULT = 24; // px par km par défaut
const ZOOM_MIN = 8;
const ZOOM_MAX = 80;

// Géométrie verticale
const TOP_LABEL_Y = 6;
const POSTE_TOP_Y = 64;
const V1_Y = 170;
const V2_Y = 270;
const POSTE_BOT_Y = 312;

// Convoi articulé (loco + wagons)
const NSEG = 6; // nombre de segments (tête + wagons + queue)
const WAGON_LEN = 0.5; // espacement (km) entre segments

const fmtPK = (pk: number) => {
  const km = Math.floor(pk);
  const m = Math.round((pk - km) * 1000);
  return `${km}+${String(m).padStart(3, "0")}`;
};

export default function Home() {
  const trainPK = useRef(CASA);
  const speed = useRef(40);
  const isPaused = useRef(true); // mouvement en pause par défaut
  const dir = useRef(1); // sens : +1 aller (→), -1 retour (←)
  const holdUntil = useRef(0); // arrêt temporaire au terminus (timestamp ms)
  const authSect = useRef<Record<number, boolean[]>>({
    1: SECT_V1.map(() => false),
    2: SECT_V2.map(() => false),
  }); // autorisation par voie + secteur
  const travauxRef = useRef<Record<number, boolean[]>>({
    1: SECT_V1.map((s) => !!s.travaux),
    2: SECT_V2.map((s) => !!s.travaux),
  }); // travaux par voie + secteur
  const bypassRef = useRef<Record<number, boolean[]>>({
    1: SECT_V1.map(() => false),
    2: SECT_V2.map(() => false),
  }); // contournement armé par voie + secteur (déviation auto aux 2 postes)
  const curSec = useRef(-1); // index du secteur courant du convoi
  const curVoie = useRef(1); // voie du secteur courant
  const trainVoie = useRef(1); // voie courante du train (1 ou 2)
  const armRef = useRef(""); // clé d'état des icônes (dédup du rafraîchissement)
  const aigEnabled = useRef(true); // aiguillage autorisé (ON par défaut)
  const pendingTrav = useRef<{ v: number; i: number } | null>(null); // secteur déclaré (pour le popup)
  const soundEnabled = useRef(false); // son de l'alarme danger (coupé par défaut)
  const crossRoute = useRef<
    { startPK: number; endPK: number; fromY: number; toY: number } | null
  >(null); // traversée diagonale en cours
  const pendingRoute = useRef<{ idx: number; side: "L" | "R" } | null>(null); // itinéraire tracé d'avance
  const autoFollow = useRef(true); // recentrage auto sur le train
  const pxRef = useRef(PX_DEFAULT); // px par km — pour la boucle d'animation
  const [pxPerKm, setPxPerKm] = useState(PX_DEFAULT); // px par km — pour le rendu

  // PK → px (rendu, dépend de l'état du zoom)
  const pkToPx = (pk: number) => (pk - MIN_PK) * pxPerKm + MARGIN;
  const occActive = useRef(true); // MAT-88 occupe encore son secteur
  const occTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastStatus = useRef("");
  const lastAlert = useRef("");
  const audioCtx = useRef<AudioContext | null>(null);
  const alarmTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const addLog = (msg: string) => {
    const time = new Date().toTimeString().split(" ")[0];
    const log = document.getElementById("event-log");
    if (!log) return;
    const entry = document.createElement("div");
    entry.textContent = `${time} ${msg}`;
    log.prepend(entry);
  };

  const toggleModal = (id: string) => {
    const m = document.getElementById(id);
    if (!m) return;
    m.classList.toggle("hidden");
    m.classList.toggle("flex");
  };

  // Zoom + / − (garde le centre de la vue stable)
  const applyZoom = (mult: number) => {
    const sc = document.getElementById("sector-scroll");
    let centerPK = trainPK.current;
    if (sc) centerPK = MIN_PK + (sc.scrollLeft + sc.clientWidth / 2 - MARGIN) / pxRef.current;
    const next = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, pxRef.current * mult));
    pxRef.current = next;
    setPxPerKm(next);
    requestAnimationFrame(() => {
      const s = document.getElementById("sector-scroll");
      if (s) s.scrollLeft = (centerPK - MIN_PK) * next + MARGIN - s.clientWidth / 2;
    });
  };

  // Suivi auto du train (recentrage)
  const setFollow = (on: boolean) => {
    autoFollow.current = on;
    const b = document.getElementById("follow-btn");
    if (b) {
      b.textContent = on ? "⊙ SUIVI ON" : "⊙ SUIVI OFF";
      b.classList.toggle("text-secondary", on);
      b.classList.toggle("text-on-surface-variant", !on);
    }
  };

  // État d'un secteur (auth fourni explicitement — pas d'accès ref dans le corps).
  const sectorState = (i: number, auth: boolean) => {
    const work = hasWork(i);
    const blocked = work && !auth;
    const state = blocked ? reasonOf(i) : work && auth ? "AUTORISÉ" : "LIBRE";
    return { work, auth, blocked, state };
  };

  const SECLABEL_BASE =
    "absolute left-1/2 -translate-x-1/2 -top-3 text-[8px] font-telemetry whitespace-nowrap ";
  const SEG_BASE = "absolute h-[3px] -translate-y-1/2 z-10 cursor-pointer ";

  // État "travaux/occupé" dynamique par voie (lit travauxRef — hors rendu)
  const workNow = (v: number, i: number) =>
    travauxRef.current[v][i] || (v === 1 && i === OCC_INDEX && occActive.current);
  const reasonNow = (v: number, i: number) =>
    travauxRef.current[v][i]
      ? "TRAVAUX"
      : v === 1 && i === OCC_INDEX && occActive.current
      ? `OCCUPÉ ${OCC_TRAIN}`
      : "";
  // Motif pour les messages (voie courante)
  const motifNow = (i: number) => {
    const v = trainVoie.current;
    return v === 1 && i === OCC_INDEX && occActive.current && !travauxRef.current[1][i]
      ? `occupé par ${OCC_TRAIN}`
      : "en TRAVAUX";
  };

  // Couleur de la ligne par secteur et par voie :
  // rouge (danger) / bleu vif (occupé) / vert (autorisé) / orange (franchi)
  const paintSeg = (voie: number, i: number) => {
    const seg = document.getElementById(`seg-${voie}-${i}`) as HTMLElement | null;
    if (!seg) return;
    const work = workNow(voie, i);
    const auth = authSect.current[voie][i];
    let bg = "transparent"; // libre / normal (rail bleu) ; l'orange du secteur en cours = cur-trail
    let blink = false;
    if (work && !auth) { bg = "rgba(220,38,38,0.85)"; blink = true; } // occupé (rouge)
    else if (work && auth) bg = "rgba(74,225,118,0.85)"; // autorisé (vert)
    seg.style.background = bg;
    seg.classList.toggle("blink-red", blink);
  };

  // Rafraîchit l'affichage d'un secteur (voie + index) : couleur, libellé, badges, boutons
  const refreshSector = (v: number, i: number) => {
    const auth = authSect.current[v][i];
    const work = workNow(v, i);
    const blocked = work && !auth;
    const state = blocked ? reasonNow(v, i) : work && auth ? "AUTORISÉ" : "LIBRE";
    paintSeg(v, i);
    const label = document.getElementById(`seclabel-${v}-${i}`);
    if (label) {
      label.textContent = `${SECT_V1[i].label} · ${distOf(i)}${work ? " · " + state : ""}`;
      label.className =
        SECLABEL_BASE +
        (blocked ? "text-error" : work && auth ? "text-secondary" : "text-on-surface-variant");
    }
    const badge = document.getElementById(`secbadge-${v}-${i}`);
    if (badge) {
      badge.textContent = state;
      badge.className =
        "text-[9px] font-label-bold px-1 " +
        (blocked ? "bg-red-600 text-white" : "bg-secondary/15 text-secondary");
    }
    const btn = document.getElementById(`secbtn-${v}-${i}`);
    if (btn) btn.textContent = auth ? "RETIRER" : "AUTORISER";
  };
  const refreshAll = () => {
    [1, 2].forEach((v) => SECT_V1.forEach((_, i) => refreshSector(v, i)));
  };

  const updateBlockedCount = () => {
    let n = 0;
    [1, 2].forEach((v) =>
      SECT_V1.forEach((_, i) => {
        if (workNow(v, i) && !authSect.current[v][i]) n++;
      })
    );
    const el = document.getElementById("blk-count");
    if (el) el.textContent = String(n).padStart(2, "0");
  };

  const authorizeSector = (v: number, i: number) => {
    if (!workNow(v, i)) return; // seuls les secteurs bloqués se gèrent
    authSect.current[v][i] = !authSect.current[v][i];
    refreshSector(v, i);
    updateBlockedCount();
    addLog(
      authSect.current[v][i]
        ? `[AUTOR] V${v} ${SECT_V1[i].label} AUTORISÉ`
        : `[AUTOR] V${v} ${SECT_V1[i].label} bloqué (${reasonNow(v, i)})`
    );
  };

  // L'admin sélectionne une voie + un secteur et le déclare (ou lève) en travaux
  const declareTravaux = (v: number, i: number) => {
    const otherV = v === 1 ? 2 : 1;
    // Interdit : déclarer un secteur déjà occupé sur l'autre voie (une voie doit
    // rester libre pour le contournement, sinon le train serait totalement bloqué).
    if (!travauxRef.current[v][i] && workNow(otherV, i)) {
      const msg = `Refusé — ${SECT_V1[i].label} déjà occupé sur la Voie ${otherV}. Une voie doit rester libre pour le contournement.`;
      const m = document.getElementById("trav-msg");
      if (m) {
        m.textContent = "⛔ " + msg;
        m.className = "text-[10px] font-label-bold text-error mt-unit-3 blink-red";
      }
      addLog(`[TRV] Refusé — V${v} ${SECT_V1[i].label} : V${otherV} déjà occupé`);
      return;
    }
    const tm = document.getElementById("trav-msg");
    if (tm) tm.textContent = "";
    travauxRef.current[v][i] = !travauxRef.current[v][i];
    if (!travauxRef.current[v][i]) {
      authSect.current[v][i] = false; // remet l'autorisation à zéro
      bypassRef.current[v][i] = false; // retire le contournement
    }
    refreshSector(v, i);
    updateBlockedCount();
    const b = document.getElementById(`travbtn-${v}-${i}`);
    if (b) {
      b.textContent = travauxRef.current[v][i] ? "LEVER" : "DÉCLARER";
      b.classList.toggle("bg-error", travauxRef.current[v][i]);
      b.classList.toggle("text-on-error", travauxRef.current[v][i]);
    }
    lastStatus.current = "";
    addLog(
      travauxRef.current[v][i]
        ? `[TRV] Travaux DÉCLARÉS — V${v} ${SECT_V1[i].label}`
        : `[TRV] Travaux levés — V${v} ${SECT_V1[i].label}`
    );
    // Contournement proposé seulement si le secteur a un poste avant ET après
    // (pas pour le 1er ni le dernier secteur, côté terminus) — Voie 1 ET Voie 2.
    if (travauxRef.current[v][i]) {
      if (canBypass(i)) openReroutePopup(v, i);
      else {
        const tm2 = document.getElementById("trav-msg");
        if (tm2) {
          tm2.textContent = `ℹ️ V${v} · ${SECT_V1[i].label} (terminus) — contournement impossible : pas de poste des 2 côtés. Le secteur est occupé, le train s'y arrête.`;
          tm2.className = "text-[10px] font-label-bold text-amber-400 mt-unit-3";
        }
        addLog(`[TRV] V${v} ${SECT_V1[i].label} (terminus) — contournement impossible (pas de poste des 2 côtés)`);
      }
    }
  };

  // Popup : à la déclaration d'un secteur occupé, propose le CONTOURNEMENT.
  // Secteur courant (2 postes) → bascule + retour. Secteur terminus (1 poste) →
  // bascule à l'unique poste, le train reste sur l'autre voie jusqu'au terminus.
  const openReroutePopup = (v: number, i: number) => {
    pendingTrav.current = { v, i };
    const jLeft = junctionBefore(i); // poste de gauche (début du secteur)
    const jRight = junctionAt(SECT_V1[i].b); // poste de droite (fin du secteur)
    const set = (id: string, txt: string) => {
      const el = document.getElementById(id);
      if (el) el.textContent = txt;
    };
    const pair = (j: Junction | null | undefined) => (j ? `P${j.top}/P${j.bot}` : "?");
    const other = v === 1 ? 2 : 1;
    set("rr-sector", `Voie ${v} · ${SECT_V1[i].label} déclaré OCCUPÉ (travaux)`);
    const both = !!jLeft && !!jRight;
    if (both) {
      set(
        "rr-postes",
        `Contournement par 2 postes — entrée ${pair(jLeft)} (↙ vers V${other}) · sortie ${pair(jRight)} (↗ retour V${v})`
      );
      set(
        "rr-trains",
        `• TTx-01 contourne le secteur sans s'arrêter :\n  ALLER → bascule à ${pair(jLeft)} puis revient à ${pair(jRight)}\n  RETOUR ← bascule à ${pair(jRight)} puis revient à ${pair(jLeft)}`
      );
    } else {
      // Secteur terminus : un seul poste disponible
      const solo = jLeft ?? jRight; // 1er secteur → poste après (droite) ; dernier → poste avant (gauche)
      const cote = jLeft ? "avant le secteur (dernier secteur)" : "après le secteur (1er secteur)";
      set(
        "rr-postes",
        `Déviation par 1 poste (terminus) — bascule à ${pair(solo)} ${cote} → reste sur V${other} jusqu'au terminus`
      );
      set(
        "rr-trains",
        `• TTx-01 évite le secteur sans s'arrêter :\n  bascule à ${pair(solo)} → V${other}, pas de retour (terminus au bout)`
      );
    }
    const yes = document.getElementById("rr-yes");
    const armed = bypassRef.current[v][i];
    const solo = jLeft ?? jRight;
    if (yes) yes.textContent = armed
      ? "RETIRER LA DÉVIATION"
      : both
      ? `OUI — CONTOURNER (${pair(jLeft)} + ${pair(jRight)})`
      : `OUI — DÉVIER (${pair(solo)})`;
    const m = document.getElementById("reroute-popup");
    m?.classList.remove("hidden");
    m?.classList.add("flex");
  };

  // L'admin confirme : arme (ou retire) le contournement automatique aux 2 postes
  const rerouteConfirm = () => {
    const ctx = pendingTrav.current;
    toggleModal("reroute-popup");
    if (!ctx) return;
    const { v, i } = ctx;
    bypassRef.current[v][i] = !bypassRef.current[v][i];
    const on = bypassRef.current[v][i];
    pendingRoute.current = null;
    lastStatus.current = "";
    const jEntry = junctionBefore(i);
    const jExit = junctionAt(SECT_V1[i].b);
    addLog(
      on
        ? `[AIG] Contournement ARMÉ — V${v} ${SECT_V1[i].label} : déviation auto P${jEntry?.top}↔P${jExit?.top}`
        : `[AIG] Contournement retiré — V${v} ${SECT_V1[i].label}`
    );
    // La déviation ne s'exécutera QUE si l'admin a autorisé l'aiguillage (sécurité).
    if (on && !aigEnabled.current)
      addLog(`[AIG] ⚠️ Activez AIGUILLAGE pour autoriser le changement de voie`);
  };

  // key = "stop:msg" | "appr:msg" | "move:msg"
  const setTrainStatus = (key: string) => {
    if (key === lastStatus.current) return;
    lastStatus.current = key;
    const bar = document.getElementById("alert-bar");
    const txt = document.getElementById("alert-text");
    const card = document.getElementById("status-ttx01");
    const voieBtn = document.getElementById("voie-btn");
    const mode = key.slice(0, 4);
    const msg = key.slice(5);
    if (bar) {
      bar.className =
        "w-[340px] border-l border-outline-variant h-full flex items-center px-unit-3 transition-colors duration-300 " +
        (mode === "move" ? "bg-[#0d1e30]" : "bg-red-900");
    }
    if (txt) {
      txt.textContent =
        (mode === "stop" ? "⛔ " : mode === "appr" ? "🚨 DANGER — " : "✔ ") + msg;
      txt.className =
        "text-[10px] font-label-bold tracking-tight " +
        (mode === "stop" ? "text-white" : mode === "appr" ? "text-amber-300 blink-red" : "text-secondary");
    }
    if (card) {
      card.textContent = mode === "stop" ? "ARRÊT" : mode === "appr" ? "DANGER" : "EN LIGNE";
      card.className =
        "text-[8px] px-1 border border-outline-variant " +
        (mode === "move" ? "bg-secondary/10 text-secondary" : mode === "appr" ? "bg-red-600 text-amber-300 blink-red" : "bg-red-600 text-white");
    }
    // Bouton "changer de voie" mis en avant à l'arrêt / approche
    if (voieBtn) voieBtn.classList.toggle("opacity-40", mode === "move");
    if (mode === "stop") addLog(`[STOP] TTx-01 ${msg}`);
  };

  // Klaxon d'alarme via Web Audio (deux tons)
  const playDanger = () => {
    if (!soundEnabled.current) return; // son coupé par l'admin
    try {
      const w = window as Window & { webkitAudioContext?: typeof AudioContext };
      const Ctx = window.AudioContext || w.webkitAudioContext;
      if (!Ctx) return;
      const ctx = audioCtx.current ?? new Ctx();
      audioCtx.current = ctx;
      if (ctx.state === "suspended") ctx.resume();
      const beep = (freq: number, start: number, dur: number) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = "square";
        o.frequency.value = freq;
        o.connect(g);
        g.connect(ctx.destination);
        const t0 = ctx.currentTime + start;
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(0.18, t0 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        o.start(t0);
        o.stop(t0 + dur + 0.03);
      };
      beep(900, 0, 0.16);
      beep(680, 0.2, 0.16);
    } catch {
      /* audio indisponible */
    }
  };
  const startAlarm = () => {
    if (alarmTimer.current) return;
    playDanger();
    alarmTimer.current = setInterval(playDanger, 1300);
  };
  const stopAlarm = () => {
    if (alarmTimer.current) {
      clearInterval(alarmTimer.current);
      alarmTimer.current = null;
    }
  };

  // Pile de notifications danger (toasts). Dédup via `key`.
  const pushAlerts = (
    key: string,
    cards: { text: string; tone: "danger" | "warn" | "ok" }[]
  ) => {
    if (key === lastAlert.current) return;
    lastAlert.current = key;
    const box = document.getElementById("toasts");
    if (!box) return;
    box.innerHTML = "";
    cards.forEach((c) => {
      const d = document.createElement("div");
      const tone =
        c.tone === "danger"
          ? "bg-red-900/95 border-red-500 text-white"
          : c.tone === "warn"
          ? "bg-[#3a2400]/95 border-amber-500 text-amber-300"
          : "bg-secondary/20 border-secondary text-secondary";
      d.className = `px-3 py-1 border rounded text-[11px] font-label-bold shadow-lg whitespace-nowrap ${tone}`;
      d.textContent = c.text;
      box.appendChild(d);
    });
  };

  // MAT-88 libère son secteur
  const clearOcc = () => {
    if (!occActive.current) return;
    occActive.current = false;
    refreshSector(1, OCC_INDEX);
    updateBlockedCount();
    const m = document.getElementById("mat88");
    if (m) m.style.display = "none";
    const c = document.getElementById("mat88-card");
    if (c) {
      c.textContent = "DÉGAGÉ";
      c.className = "text-[8px] px-1 bg-secondary/15 text-secondary border border-secondary/30";
    }
    lastStatus.current = "";
    addLog(`[OCC] ${OCC_TRAIN} a libéré ${SECT_V1[OCC_INDEX].label}`);
  };

  const OCC_DELAY = 16000; // délai avant libération (ms)
  const startOccTimer = () => {
    if (occTimer.current) clearTimeout(occTimer.current);
    occTimer.current = setTimeout(clearOcc, OCC_DELAY);
  };

  const resetSimulation = () => {
    trainPK.current = CASA;
    trainVoie.current = 1;
    dir.current = 1;
    holdUntil.current = 0;
    crossRoute.current = null;
    pendingRoute.current = null;
    setAig(true); // aiguillage autorisé (ON par défaut)
    armRef.current = "";
    curSec.current = -1;
    curVoie.current = 1;
    travauxRef.current = { 1: SECT_V1.map((s) => !!s.travaux), 2: SECT_V2.map((s) => !!s.travaux) };
    authSect.current = { 1: SECT_V1.map(() => false), 2: SECT_V2.map(() => false) };
    bypassRef.current = { 1: SECT_V1.map(() => false), 2: SECT_V2.map(() => false) };
    [1, 2].forEach((v) =>
      SECT_V1.forEach((_, i) => {
        const b = document.getElementById(`travbtn-${v}-${i}`);
        if (b) {
          const on = travauxRef.current[v][i];
          b.textContent = on ? "LEVER" : "DÉCLARER";
          b.classList.toggle("bg-error", on);
          b.classList.toggle("text-on-error", on);
        }
      })
    );
    occActive.current = true;
    const m = document.getElementById("mat88");
    if (m) m.style.display = "";
    const c = document.getElementById("mat88-card");
    if (c) {
      c.textContent = "EN SECTEUR";
      c.className = "text-[8px] px-1 bg-error/15 text-error border border-error/30";
    }
    const tv = document.getElementById("train-voie-val");
    if (tv) tv.textContent = "V1";
    const cv = document.getElementById("card-voie");
    if (cv) cv.textContent = "1";
    const te = document.getElementById("train-ttx01");
    if (te) te.style.top = V1_Y + "px";
    refreshAll();
    updateBlockedCount();
    startOccTimer();
    lastStatus.current = "";
    pushAlerts("reset", []);
    addLog("[SYS] Simulation réinitialisée");
  };

  const handleSlider = (e: React.ChangeEvent<HTMLInputElement>) => {
    speed.current = parseInt(e.target.value);
    const sv = document.getElementById("train-speed-val");
    if (sv) sv.textContent = speed.current + "km/h";
    const cs = document.getElementById("card-speed-ttx01");
    if (cs) cs.textContent = String(speed.current);
  };

  const handlePause = (e: React.MouseEvent<HTMLButtonElement>) => {
    isPaused.current = !isPaused.current;
    const btn = e.currentTarget;
    btn.textContent = isPaused.current ? "REPRENDRE" : "PAUSE";
    btn.classList.toggle("bg-primary-container");
    addLog(isPaused.current ? "[MOUV] Pause" : "[MOUV] Reprise");
  };

  // Aiguillage rapide (bouton bas) : poste le plus proche, point de la voie courante, branche droite
  const handleChangeVoie = () => {
    const j = nearestCrossPoste(trainPK.current);
    if (!j) {
      addLog("[AIG] Changement impossible — convoi hors poste");
      return;
    }
    routeVoie(JUNCTIONS.indexOf(j), trainVoie.current, "R");
  };

  // Son de l'alarme danger on/off
  const toggleSound = () => {
    soundEnabled.current = !soundEnabled.current;
    const b = document.getElementById("sound-btn");
    if (b) {
      b.textContent = soundEnabled.current ? "🔊" : "🔇";
      b.classList.toggle("text-secondary", soundEnabled.current);
      b.classList.toggle("text-error", !soundEnabled.current);
    }
    if (soundEnabled.current) playDanger(); // bip de confirmation + débloque l'audio
    addLog(soundEnabled.current ? "[SON] Alarme activée" : "[SON] Alarme coupée");
  };

  // Activation de l'aiguillage par l'admin (toutes les icônes deviennent cliquables)
  const setAig = (on: boolean) => {
    aigEnabled.current = on;
    armRef.current = ""; // force le rafraîchissement des icônes
    const b = document.getElementById("aig-btn");
    if (b) {
      b.textContent = on ? "🔀 AIGUILLAGE ON" : "🔀 AIGUILLAGE OFF";
      b.classList.toggle("text-secondary", on);
      b.classList.toggle("text-on-surface-variant", !on);
    }
    addLog(on ? "[ADMIN] Aiguillage ACTIVÉ" : "[ADMIN] Aiguillage désactivé");
  };

  // Arme les 2 icônes (gauche/droite) du point de la voie courante
  const armAiguillage = (idx: number) => {
    const key = `${idx}|${aigEnabled.current ? 1 : 0}|${trainVoie.current}`;
    if (key === armRef.current) return;
    armRef.current = key;
    const en = aigEnabled.current; // actives seulement si l'admin a activé
    const v = trainVoie.current;
    JUNCTIONS.forEach((j, k) => {
      if (!j.cross) return;
      const near = k === idx;
      (["1L", "1R", "2L", "2R"] as const).forEach((suf) => {
        const b = document.getElementById(`aig-${k}-${suf}`);
        if (!b) return;
        const blink = en && near && Number(suf[0]) === v; // icône recommandée près du convoi
        b.classList.toggle("opacity-30", !en); // estompées si aiguillage OFF
        b.classList.toggle("blink-red", blink);
        b.classList.toggle("bg-secondary", blink);
        b.classList.toggle("text-on-secondary", blink);
        b.classList.toggle("border-secondary", en);
        b.classList.toggle("scale-125", blink);
      });
      const lbl = document.getElementById(`aiglabel-${k}`);
      if (lbl) lbl.classList.toggle("hidden", !(en && near));
    });
  };

  // Exécute la traversée le long du bras du V — bidirectionnel (aller → / retour ←)
  const doCross = (idx: number, side: "L" | "R") => {
    const j = JUNCTIONS[idx];
    const mid = (j.carL + j.carR) / 2; // apex du V (sur l'autre voie)
    const from = trainVoie.current;
    const to = from === 1 ? 2 : 1;
    trainVoie.current = to;
    const d = dir.current;
    let startPK: number, endPK: number;
    if (from === 1) {
      // V1 → V2 : descend depuis la position courante jusqu'à l'apex
      startPK = trainPK.current;
      endPK = mid;
    } else {
      // V2 → V1 : reste sur V2 jusqu'à l'apex puis monte vers le carré aval (sens de marche)
      startPK = mid;
      endPK = d > 0 ? j.carR : j.carL;
    }
    if (Math.abs(endPK - startPK) < 0.2) endPK = startPK + (endPK >= startPK ? 0.2 : -0.2);
    crossRoute.current = {
      startPK,
      endPK,
      fromY: from === 1 ? V1_Y : V2_Y,
      toY: to === 1 ? V1_Y : V2_Y,
    };
    const vv = document.getElementById("train-voie-val");
    if (vv) vv.textContent = "V" + to;
    const cv = document.getElementById("card-voie");
    if (cv) cv.textContent = String(to);
    // branche choisie en vert
    document.getElementById(`xl-${idx}`)?.setAttribute("stroke", side === "L" ? "#4ae176" : "#ef4444");
    document.getElementById(`xr-${idx}`)?.setAttribute("stroke", side === "R" ? "#4ae176" : "#ef4444");
    pendingRoute.current = null;
    lastStatus.current = "";
    addLog(
      `[AIG] Poste ${j.top}/${j.bot} — Voie ${from} → ${to}, aiguille ${side === "L" ? "GAUCHE" : "DROITE"} (apex PK ${fmtPK(mid)})`
    );
  };

  // Clic sur une icône : fromVoie = voie du point, side = gauche/droite
  const routeVoie = (idx: number, fromVoie: number, side: "L" | "R") => {
    if (!aigEnabled.current) {
      addLog("[AIG] Aiguillage désactivé — activez-le (bouton AIGUILLAGE)");
      return;
    }
    if (trainVoie.current !== fromVoie) {
      addLog(`[AIG] Point Voie ${fromVoie} inactif — convoi sur Voie ${trainVoie.current}`);
      return;
    }
    const j = JUNCTIONS[idx];
    if (trainPK.current >= j.carL && trainPK.current <= j.carR) {
      doCross(idx, side); // déjà dans le croisement
    } else {
      pendingRoute.current = { idx, side };
      const b = document.getElementById(`aig-${idx}-${fromVoie}${side}`);
      if (b) {
        b.classList.remove("blink-red");
        b.classList.add("bg-secondary", "text-on-secondary");
      }
      const lbl = document.getElementById(`aiglabel-${idx}`);
      if (lbl) lbl.textContent = `Itinéraire tracé ✓ ${side === "L" ? "GAUCHE" : "DROITE"} (Poste ${j.top})`;
      lastStatus.current = "";
      addLog(`[AIG] Itinéraire tracé Poste ${j.top} (Voie ${fromVoie} → ${fromVoie === 1 ? 2 : 1}, ${side === "L" ? "GAUCHE" : "DROITE"})`);
    }
  };

  useEffect(() => {
    const trainEl = document.getElementById("train-ttx01");
    const pkVal = document.getElementById("train-pk-val");
    const cardPk = document.getElementById("card-pk-ttx01");
    const scroller = document.getElementById("sector-scroll");
    refreshAll();
    updateBlockedCount();
    startOccTimer();

    // Molette = défilement horizontal + met le suivi en pause (l'utilisateur prend la main)
    const onWheel = (e: WheelEvent) => {
      if (!scroller) return;
      if (Math.abs(e.deltaY) >= Math.abs(e.deltaX)) {
        scroller.scrollLeft += e.deltaY;
        e.preventDefault();
      }
      if (autoFollow.current) setFollow(false);
    };
    scroller?.addEventListener("wheel", onWheel, { passive: false });

    // Glisser-déposer pour défiler horizontalement (clic maintenu + déplacement)
    let panning = false, panStartX = 0, panStartScroll = 0;
    const onPointerDown = (e: PointerEvent) => {
      if (!scroller) return;
      panning = true;
      panStartX = e.clientX;
      panStartScroll = scroller.scrollLeft;
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!panning || !scroller) return;
      const dx = e.clientX - panStartX;
      if (Math.abs(dx) > 3) {
        if (autoFollow.current) setFollow(false);
        scroller.scrollLeft = panStartScroll - dx;
      }
    };
    const onPointerUp = () => {
      panning = false;
    };
    scroller?.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);

    // PK → px live (lit le zoom courant via pxRef, pour la boucle d'animation)
    const pxAt = (pk: number) => (pk - MIN_PK) * pxRef.current + MARGIN;

    // Position (x, y, angle) d'un point du convoi le long du tracé (V1 → bras du V → V2)
    const pathPos = (pk: number) => {
      let y = trainVoie.current === 1 ? V1_Y : V2_Y;
      let ang = 0;
      const c = crossRoute.current;
      if (c && c.endPK !== c.startPK) {
        // t borné 0..1 — fonctionne dans les deux sens (startPK > ou < endPK)
        const t = Math.min(1, Math.max(0, (pk - c.startPK) / (c.endPK - c.startPK)));
        y = c.fromY + (c.toY - c.fromY) * t;
        if (t > 0 && t < 1) {
          const dx = Math.abs((c.endPK - c.startPK) * pxRef.current);
          ang = (Math.atan2(c.toY - c.fromY, dx) * 180) / Math.PI;
        }
      }
      return { x: pxAt(pk), y, ang };
    };

    const clockId = setInterval(() => {
      const now = new Date();
      const clock = document.getElementById("system-clock");
      if (clock) clock.textContent = now.toTimeString().split(" ")[0];
    }, 1000);

    // Bloquant seulement sur la voie 1 (sur voie 2 / contre-voie, libre)
    const isBlocked = (i: number) => {
      const v = trainVoie.current;
      return workNow(v, i) && !authSect.current[v][i];
    };

    let raf = 0;
    const animate = () => {
      if (!isPaused.current) {
        // Demi-tour au terminus : le train RESTE sur la même voie à l'aller comme
        // au retour. Il ne change de voie que par contournement ou aiguille manuelle.
        const turnAround = () => {
          crossRoute.current = null;
          pendingRoute.current = null;
          curSec.current = -1; // recalcule la coloration du secteur courant
          holdUntil.current = Date.now() + 1500;
          lastStatus.current = "";
        };
        if (dir.current > 0 && trainPK.current >= MARRAKECH - 0.02) {
          trainPK.current = MARRAKECH;
          dir.current = -1;
          turnAround();
          addLog(`[MOUV] Arrivée MARRAKECH — demi-tour (Voie ${trainVoie.current}, retour ←)`);
        } else if (dir.current < 0 && trainPK.current <= CASA + 0.02) {
          trainPK.current = CASA;
          dir.current = 1;
          turnAround();
          addLog(`[MOUV] Arrivée CASABLANCA — repart (Voie ${trainVoie.current}, aller →)`);
        }

        const holding = Date.now() < holdUntil.current;
        const prevPK = trainPK.current;

        // Secteur bloqué le plus proche dans le sens de marche (mêmes conditions aller ET retour)
        const blockEntry = (i: number) =>
          dir.current > 0
            ? junctionBefore(i)?.carL ?? SECT_V1[i].a
            : junctionAt(SECT_V1[i].b)?.carR ?? SECT_V1[i].b;
        let stopIdx = -1;
        let bound = dir.current > 0 ? MARRAKECH : CASA;
        for (let i = 0; i < SECT_V1.length; i++) {
          if (!isBlocked(i)) continue;
          // dévié : pas d'arrêt si l'aiguillage est AUTORISÉ et qu'un poste d'entrée
          // existe dans le sens de marche (sinon le train s'arrête — sécurité).
          if (aigEnabled.current && bypassRef.current[trainVoie.current][i]) {
            const jEdir = dir.current > 0 ? junctionBefore(i) : junctionAt(SECT_V1[i].b);
            if (jEdir) continue;
          }
          const e = blockEntry(i);
          if (
            dir.current > 0
              ? e >= trainPK.current - 0.001 && e < bound
              : e <= trainPK.current + 0.001 && e > bound
          ) {
            bound = e;
            stopIdx = i;
          }
        }
        if (!holding) {
          const delta = speed.current / 800;
          trainPK.current =
            dir.current > 0
              ? Math.min(trainPK.current + delta, bound)
              : Math.max(trainPK.current - delta, bound);
        }
        const moving = Math.abs(trainPK.current - prevPK) > 1e-6;
        const dStop = stopIdx >= 0 ? Math.abs(bound - trainPK.current) : Infinity;

        // Couleur de la ligne : secteur courant en bleu (occupé), secteur quitté en orange
        const curVoieSectors = trainVoie.current === 1 ? SECT_V1 : SECT_V2;
        const cs = curVoieSectors.findIndex(
          (s) => trainPK.current >= s.a && trainPK.current <= s.b
        );
        if (cs !== curSec.current || trainVoie.current !== curVoie.current) {
          if (curSec.current >= 0) paintSeg(curVoie.current, curSec.current); // secteur quitté → libre (bleu)
          curVoie.current = trainVoie.current;
          curSec.current = cs;
        }
        // Traînée orange progressive : la partie déjà parcourue du secteur courant
        const trail = document.getElementById("cur-trail") as HTMLElement | null;
        if (trail) {
          const sct = trainVoie.current === 1 ? SECT_V1 : SECT_V2;
          const s = curSec.current >= 0 ? sct[curSec.current] : null;
          if (s) {
            const a = dir.current > 0 ? s.a : trainPK.current;
            const b = dir.current > 0 ? trainPK.current : s.b;
            const w = Math.abs(pxAt(b) - pxAt(a));
            trail.style.left = pxAt(Math.min(a, b)) + "px";
            trail.style.width = w + "px";
            trail.style.top = (trainVoie.current === 1 ? V1_Y : V2_Y) + "px";
            trail.style.display = w > 0.5 ? "block" : "none";
          } else {
            trail.style.display = "none";
          }
        }
        const blockJ =
          stopIdx >= 0
            ? dir.current > 0
              ? junctionBefore(stopIdx)
              : junctionAt(SECT_V1[stopIdx].b)
            : undefined;

        // Déviation auto : à l'entrée du croisement, basculer pour éviter le secteur
        // occupé. Secteur courant (2 postes) → revient à l'autre poste après le
        // secteur. Secteur terminus (1 poste) → reste sur l'autre voie (pas de retour).
        if (aigEnabled.current && !crossRoute.current && !pendingRoute.current) {
          const tvc = trainVoie.current;
          for (let i = 0; i < SECT_V1.length; i++) {
            if (!bypassRef.current[tvc][i]) continue;
            if (!(workNow(tvc, i) && !authSect.current[tvc][i])) continue; // bloqué sur ma voie
            const jE = dir.current > 0 ? junctionBefore(i) : junctionAt(SECT_V1[i].b); // entrée (sens de marche)
            const jX = dir.current > 0 ? junctionAt(SECT_V1[i].b) : junctionBefore(i); // sortie
            if (!jE) continue; // pas de poste avant le secteur dans ce sens → pas de déviation
            if (trainPK.current >= jE.carL && trainPK.current <= jE.carR) {
              doCross(JUNCTIONS.indexOf(jE), dir.current > 0 ? "L" : "R"); // sort vers l'autre voie
              if (jX) pendingRoute.current = { idx: JUNCTIONS.indexOf(jX), side: dir.current > 0 ? "R" : "L" }; // revient après (si poste de sortie)
              break;
            }
          }
        }

        // Itinéraire tracé : bascule automatique à l'arrivée au croisement
        if (pendingRoute.current) {
          const pj = JUNCTIONS[pendingRoute.current.idx];
          if (trainPK.current >= pj.carL && trainPK.current <= pj.carR)
            doCross(pendingRoute.current.idx, pendingRoute.current.side);
        }
        let armIdx = -1;

        // Convoi articulé : chaque segment suit le tracé (les wagons suivent la tête)
        const cr = crossRoute.current;
        if (cr) {
          const tail = (NSEG - 1) * WAGON_LEN;
          const done =
            cr.endPK >= cr.startPK
              ? trainPK.current > cr.endPK + tail
              : trainPK.current < cr.endPK - tail;
          if (done) crossRoute.current = null; // traversée terminée pour tout le convoi
        }
        for (let k = 0; k < NSEG; k++) {
          const seg = document.getElementById(`tseg-${k}`);
          if (!seg) continue;
          const segPk = Math.min(MARRAKECH, Math.max(MIN_PK, trainPK.current - dir.current * k * WAGON_LEN));
          const p = pathPos(segPk);
          seg.style.left = p.x + "px";
          seg.style.top = p.y + "px";
          seg.style.transform = `translate(-50%,-50%) rotate(${p.ang}deg)`;
        }
        const head = pathPos(trainPK.current);
        if (trainEl) {
          trainEl.style.left = head.x + "px";
          trainEl.style.top = head.y + "px";
        }
        if (autoFollow.current && scroller)
          scroller.scrollLeft = head.x - scroller.clientWidth / 2;
        const lbl = "PK " + fmtPK(trainPK.current);
        if (pkVal) pkVal.textContent = lbl;
        if (cardPk) cardPk.textContent = lbl;

        const tv = trainVoie.current;
        const otherV = tv === 1 ? 2 : 1;
        if (holding) {
          setTrainStatus("move:⏸ DEMI-TOUR au terminus");
          pushAlerts("hold", []);
          stopAlarm();
        } else if (stopIdx >= 0 && !moving) {
          // Arrêt au poste avant un secteur bloqué — sur Voie 1 OU Voie 2
          const n = blockJ ? (tv === 1 ? blockJ.top : blockJ.bot) : "?";
          setTrainStatus(
            `stop:Poste ${n} — V${tv} ${SECT_V1[stopIdx].label} ${motifNow(stopIdx)} — CHANGER DE VOIE`
          );
          pushAlerts(`stop-${tv}-${stopIdx}`, [
            { text: `⛔ ARRÊT — Poste ${n} : ${SECT_V1[stopIdx].label} ${motifNow(stopIdx)} (Voie ${tv})`, tone: "danger" },
            { text: `👉 Cliquez une aiguille (L/R) au Poste ${n} pour basculer en Voie ${otherV}`, tone: "danger" },
            { text: `… ou attendez la libération du secteur`, tone: "warn" },
          ]);
          startAlarm();
          armIdx = blockJ ? JUNCTIONS.indexOf(blockJ) : -1;
        } else if (stopIdx >= 0 && dStop <= SECTOR_KM) {
          // Zone d'attention de 60 km avant le secteur bloqué — Voie 1 OU Voie 2
          const n = blockJ ? (tv === 1 ? blockJ.top : blockJ.bot) : "?";
          const soundOn = dStop <= HALF_KM;
          setTrainStatus(
            `appr:V${tv} ${SECT_V1[stopIdx].label} ${motifNow(stopIdx)} — basculez Voie ${otherV} (Poste ${n}) pour ne pas stopper`
          );
          const cards: { text: string; tone: "danger" | "warn" | "ok" }[] = [
            { text: `🚨 DANGER — Voie ${tv} : ${SECT_V1[stopIdx].label} ${motifNow(stopIdx)}`, tone: "danger" },
            { text: `⚠️ ATTENTION — arrêt dans ${dStop.toFixed(0)} km si rien n'est fait`, tone: "warn" },
            { text: `👉 Aiguille L/R au Poste ${n} → Voie ${otherV} (évite l'arrêt)`, tone: "warn" },
          ];
          if (soundOn) cards.push({ text: `🔊 ALARME — basculez MAINTENANT`, tone: "danger" });
          pushAlerts(`appr-${tv}-${stopIdx}-${Math.ceil(dStop)}`, cards);
          if (soundOn) startAlarm();
          else stopAlarm();
          armIdx = blockJ ? JUNCTIONS.indexOf(blockJ) : -1;
        } else if (tv === 2) {
          setTrainStatus(
            dir.current < 0 ? "move:Voie 2 ← — retour / déviation" : "move:Voie 2 → — déviation"
          );
          pushAlerts("v2", [{ text: `↪ Voie 2 — circulation normale`, tone: "ok" }]);
          stopAlarm();
        } else {
          setTrainStatus(
            dir.current > 0
              ? "move:Voie 1 → — aller vers MARRAKECH"
              : "move:Voie 1 ← — retour vers CASABLANCA"
          );
          pushAlerts(dir.current > 0 ? "clear-a" : "clear-r", []);
          stopAlarm();
        }

        // Arme l'aiguillage : poste du secteur bloqué visé, sinon poste le plus proche
        if (armIdx < 0) {
          const nearJ = nearestCrossPoste(trainPK.current);
          armIdx = nearJ ? JUNCTIONS.indexOf(nearJ) : -1;
        }
        armAiguillage(armIdx);
      }
      raf = requestAnimationFrame(animate);
    };
    raf = requestAnimationFrame(animate);

    return () => {
      clearInterval(clockId);
      cancelAnimationFrame(raf);
      if (occTimer.current) clearTimeout(occTimer.current);
      stopAlarm();
      scroller?.removeEventListener("wheel", onWheel);
      scroller?.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, []);

  // --- Sous-composants -------------------------------------------------------
  const Carre = ({ pk, y }: { pk: number; y: number }) => (
    <div className="absolute -translate-x-1/2 w-5 h-5 bg-black border border-white/70 z-20" style={{ left: pkToPx(pk), top: y }} title={`Carré PK ${fmtPK(pk)}`}>
      <div className="absolute inset-0" style={{ background: "linear-gradient(135deg, transparent 40%, #facc15 40%, #facc15 60%, transparent 60%)" }} />
    </div>
  );
  const Annonce = ({ pk, n, y }: { pk: number; n: number; y: number }) => (
    <div className="absolute -translate-x-1/2 w-4 h-8 bg-surface-container-highest border border-outline-variant flex items-center justify-center z-20" style={{ left: pkToPx(pk), top: y }} title={`Poste ${n} à 1500m — PK ${fmtPK(pk)}`}>
      <span className="text-[6px] font-telemetry text-on-surface-variant whitespace-nowrap" style={{ writingMode: "vertical-rl" }}>P{n} 1500</span>
    </div>
  );
  const PosteBox = ({ n, pk, y }: { n: number; pk: number; y: number }) => (
    <div className="absolute -translate-x-1/2 flex flex-col items-center z-20" style={{ left: pkToPx(pk), top: y }}>
      <div className="w-6 h-6 bg-black border border-white/80 flex items-center justify-center text-white text-[8px] font-bold">P{n}</div>
      <span className="text-[7px] font-label-bold text-error whitespace-nowrap mt-px">Poste {n}</span>
    </div>
  );
  const Conn = ({ pk, top, height }: { pk: number; top: number; height: number }) => (
    <div className="absolute w-px bg-on-surface-variant/40 -translate-x-1/2" style={{ left: pkToPx(pk), top, height }} />
  );
  const TopBox = ({ name, pk, tone }: { name: string; pk: number; tone: "pcv" | "gare" | "base" | "limite" }) => {
    const cls = { pcv: "border-outline-variant text-on-surface-variant", gare: "border-primary text-primary", base: "border-amber-500 text-amber-500 bg-amber-500/10", limite: "border-error text-error bg-error/10" }[tone];
    return (
      <>
        <Conn pk={pk} top={TOP_LABEL_Y + 22} height={V1_Y - (TOP_LABEL_Y + 22)} />
        <div className={`absolute -translate-x-1/2 px-1 py-px border bg-surface-container text-[7px] font-label-bold text-center leading-tight z-30 ${cls}`} style={{ left: pkToPx(pk), top: TOP_LABEL_Y, maxWidth: 110 }}>
          {name}
          <div className="text-[6px] opacity-80 font-telemetry">{fmtPK(pk)}</div>
        </div>
      </>
    );
  };

  const TRACK_WIDTH = pkToPx(MARRAKECH) + MARGIN; // largeur dépend du zoom

  return (
    <>
      {/* TopNavBar */}
      <header className="fixed top-0 w-full h-[40px] z-50 flex items-center justify-between px-unit-3 bg-surface-container border-b border-outline-variant">
        <div className="flex items-center gap-unit-4">
          <span className="font-display-md text-[18px] font-bold text-primary-container">◈ TCO — SFERIS RAIL</span>
          <div className="h-4 w-px bg-outline-variant"></div>
          <span className="text-label-bold font-telemetry text-on-surface-variant" id="system-clock">14:32:05</span>
          <span className="text-label-bold font-telemetry text-primary">LGV CASA — MARRAKECH</span>
          <span className="text-label-bold font-telemetry text-on-surface-variant opacity-60">OP. DURAND</span>
        </div>
        <div className="flex items-center gap-unit-6">
          <div className="flex items-center gap-unit-2">
            <span className="w-2 h-2 bg-secondary rounded-full blink-red"></span>
            <span className="text-label-bold font-telemetry text-secondary">SYSTÈME ACTIF</span>
          </div>
          <div className="flex gap-unit-3">
            <span className="material-symbols-outlined text-[18px] text-on-surface-variant hover:text-primary cursor-pointer">schedule</span>
            <span className="material-symbols-outlined text-[18px] text-on-surface-variant hover:text-primary cursor-pointer">location_on</span>
            <span className="material-symbols-outlined text-[18px] text-on-surface-variant hover:text-primary cursor-pointer">account_circle</span>
          </div>
        </div>
      </header>

      <div className="flex flex-1 mt-[40px] mb-[30px] overflow-hidden">
        {/* SideNavBar */}
        <aside className="fixed left-0 top-[40px] bottom-[30px] w-[140px] z-40 bg-surface-container-low border-r border-outline-variant flex flex-col custom-scrollbar overflow-y-auto">
          <div className="p-unit-2 border-b border-outline-variant bg-surface-container-highest/20"><span className="font-label-bold text-[10px] text-primary block uppercase tracking-widest">Legend</span></div>
          <div className="p-unit-2 flex flex-col gap-unit-1 text-[10px] text-on-surface-variant font-telemetry">
            <div className="flex items-center gap-unit-2"><span className="w-4 h-[2px] bg-[#5b8db8]"></span> Voie</div>
            <div className="flex items-center gap-unit-2"><span className="w-4 h-[3px] bg-red-600/80"></span> Secteur occupé</div>
            <div className="flex items-center gap-unit-2"><span className="w-4 h-[3px] bg-secondary/80"></span> Secteur autorisé</div>
            <div className="flex items-center gap-unit-2"><span className="w-4 h-[3px] bg-amber-500/80"></span> Secteur en cours</div>
            <div className="flex items-center gap-unit-2"><span className="w-3 h-3 bg-black border border-white/80 flex items-center justify-center text-[6px] text-white font-bold">P</span> Poste</div>
            <div className="flex items-center gap-unit-2"><span className="w-3 h-[2px] bg-red-500 rotate-45"></span> Communication</div>
          </div>
          <div className="p-unit-2 border-y border-outline-variant bg-surface-container-highest/20 mt-unit-4"><span className="font-label-bold text-[10px] text-primary block uppercase tracking-widest">Admin</span></div>
          <nav className="flex flex-col">
            <button className="flex flex-col items-center justify-center py-unit-3 border-b border-outline-variant hover:bg-surface-variant transition-colors group" onClick={() => toggleModal("add-train-modal")}>
              <span className="material-symbols-outlined text-primary group-hover:scale-110 transition-transform">add_circle</span>
              <span className="text-[9px] mt-1 font-label-bold text-on-surface-variant">AJOUTER TRAIN</span>
            </button>
            <button className="flex flex-col items-center justify-center py-unit-3 border-b border-outline-variant hover:bg-surface-variant transition-colors group" onClick={() => toggleModal("travaux-modal")}>
              <span className="material-symbols-outlined text-on-surface-variant group-hover:text-primary">construction</span>
              <span className="text-[9px] mt-1 font-label-bold text-on-surface-variant">ZONES TRAVAUX</span>
            </button>
            <button className="flex flex-col items-center justify-center py-unit-3 border-b border-outline-variant hover:bg-surface-variant transition-colors group" onClick={() => toggleModal("auth-modal")} title="Autoriser les secteurs bloqués">
              <span className="material-symbols-outlined text-secondary group-hover:scale-110 transition-transform">vpn_key</span>
              <span className="text-[9px] mt-1 font-label-bold text-on-surface-variant">AUTORISATIONS</span>
            </button>
            <button className="flex flex-col items-center justify-center py-unit-3 border-b border-outline-variant hover:bg-surface-variant transition-colors group" onClick={() => toggleModal("postes-modal")}>
              <span className="material-symbols-outlined text-on-surface-variant group-hover:text-primary">hexagon</span>
              <span className="text-[9px] mt-1 font-label-bold text-on-surface-variant">GÉRER POSTES</span>
            </button>
          </nav>
          <div className="p-unit-2 border-y border-outline-variant bg-surface-container-highest/20 mt-auto"><span className="font-label-bold text-[10px] text-primary block uppercase tracking-widest">Filters</span></div>
          <div className="p-unit-2 flex flex-col gap-unit-2 text-[10px] text-on-surface-variant font-telemetry">
            <label className="flex items-center gap-2 cursor-pointer"><input defaultChecked className="w-3 h-3 bg-background border-outline rounded-none text-primary focus:ring-0" type="checkbox" /> Secteurs</label>
            <label className="flex items-center gap-2 cursor-pointer"><input defaultChecked className="w-3 h-3 bg-background border-outline rounded-none text-primary focus:ring-0" type="checkbox" /> Trains</label>
            <label className="flex items-center gap-2 cursor-pointer"><input defaultChecked className="w-3 h-3 bg-background border-outline rounded-none text-primary focus:ring-0" type="checkbox" /> Postes</label>
          </div>
        </aside>

        {/* Center Canvas */}
        <main className="ml-[140px] mr-[210px] flex-1 relative tco-grid overflow-hidden" id="tco-canvas">
          {/* Pile de notifications danger (fixe au-dessus du canvas) */}
          <div id="toasts" className="absolute top-2 left-1/2 -translate-x-1/2 z-40 flex flex-col gap-1 items-center pointer-events-none"></div>
          {/* Zoom + / − */}
          <div className="absolute top-2 left-2 z-40 flex flex-col gap-1">
            <button onClick={() => applyZoom(1.3)} title="Zoom avant" className="w-6 h-6 bg-surface-container border border-outline-variant text-on-surface text-[16px] leading-none font-bold hover:bg-surface-variant hover:text-primary">+</button>
            <button onClick={() => applyZoom(1 / 1.3)} title="Zoom arrière" className="w-6 h-6 bg-surface-container border border-outline-variant text-on-surface text-[16px] leading-none font-bold hover:bg-surface-variant hover:text-primary">−</button>
            <button id="sound-btn" onClick={toggleSound} title="Son de l'alarme danger on/off" className="w-6 h-6 bg-surface-container border border-outline-variant text-error text-[13px] leading-none hover:bg-surface-variant">🔇</button>
          </div>
          <div className="absolute inset-0 overflow-x-auto overflow-y-auto custom-scrollbar cursor-grab active:cursor-grabbing" id="sector-scroll">
            <div className="relative" style={{ width: TRACK_WIDTH, height: 380 }}>
              <span className="absolute font-display-md text-[13px] font-bold text-error -translate-y-1/2" style={{ left: 6, top: (V1_Y + V2_Y) / 2 }}>CASABLANCA</span>
              <span className="absolute font-display-md text-[13px] font-bold text-error -translate-y-1/2 -translate-x-full whitespace-nowrap" style={{ left: TRACK_WIDTH - 6, top: (V1_Y + V2_Y) / 2 }}>MARRAKECH</span>

              {LIMITS.map((l) => (<TopBox key={l.name} name={l.name} pk={l.pk} tone="limite" />))}
              {JUNCTIONS.map((j) => (
                <span key={`tb-${j.top}`}>
                  {j.pcv && <TopBox name={j.pcv.name} pk={j.pcv.pk} tone="pcv" />}
                  {j.gare && <TopBox name={j.gare.name} pk={j.gare.pk} tone="gare" />}
                  {j.base && <TopBox name={j.base.name} pk={j.base.pk} tone="base" />}
                </span>
              ))}

              {/* Voie 1 */}
              <div className="absolute left-0 h-px bg-[#5b8db8] shadow-[0_0_8px_rgba(91,141,184,0.3)]" style={{ top: V1_Y, width: TRACK_WIDTH }}>
                <div className="absolute inset-0 rail-sleeper opacity-30 h-4 -top-2"></div>
              </div>
              <span className="absolute left-2 text-[10px] font-label-bold text-[#5b8db8] z-20" style={{ top: V1_Y - 14 }}>VOIE 1 →</span>

              {/* Voie 2 */}
              <div className="absolute left-0 h-px bg-[#5b8db8] shadow-[0_0_8px_rgba(91,141,184,0.3)]" style={{ top: V2_Y, width: TRACK_WIDTH }}>
                <div className="absolute inset-0 rail-sleeper opacity-30 h-4 -top-2"></div>
              </div>
              <span className="absolute left-2 text-[10px] font-label-bold text-[#5b8db8] z-20" style={{ top: V2_Y + 4 }}>VOIE 2 ←</span>

              {/* Communications */}
              <svg className="absolute left-0 z-10 pointer-events-none" style={{ top: V1_Y, width: TRACK_WIDTH, height: V2_Y - V1_Y }} width={TRACK_WIDTH} height={V2_Y - V1_Y}>
                {JUNCTIONS.map((j, idx) => {
                  if (!j.cross) return null;
                  const x1 = pkToPx(j.carL), x2 = pkToPx(j.carR), mid = (x1 + x2) / 2, h = V2_Y - V1_Y;
                  return (<g key={`x-${idx}`} strokeWidth={1.4} fill="none"><line id={`xl-${idx}`} x1={x1} y1={0} x2={mid} y2={h} stroke="#ef4444" /><line id={`xr-${idx}`} x1={x2} y1={0} x2={mid} y2={h} stroke="#ef4444" /></g>);
                })}
              </svg>

              {/* Secteurs Voie 1 — segments colorés (bloqué = rouge) + label + distance */}
              {SECT_V1.map((s, i) => {
                const st = sectorState(i, false);
                const x = pkToPx(s.a), w = pkToPx(s.b) - x;
                return (
                  <span key={`v1-${i}`}>
                    <div
                      id={`seg-1-${i}`}
                      onClick={() => authorizeSector(1, i)}
                      title={`${s.label} V1 — ${st.state}`}
                      className={SEG_BASE + (st.blocked ? "bg-red-600/80 blink-red" : "bg-transparent")}
                      style={{ left: x, width: w, top: V1_Y }}
                    />
                    <div className="absolute" style={{ left: x, width: w, top: V1_Y + 18 }}>
                      <div className={`h-px w-full ${st.blocked ? "bg-error/40" : "bg-secondary/40"}`} />
                      <span id={`seclabel-1-${i}`} className={SECLABEL_BASE + (st.blocked ? "text-error" : st.work && st.auth ? "text-secondary" : "text-on-surface-variant")}>
                        {`${s.label} · ${distOf(i)}${hasWork(i) ? " · " + st.state : ""}`}
                      </span>
                    </div>
                  </span>
                );
              })}
              {/* Secteurs Voie 2 — couleur de ligne + libellé d'état (comme Voie 1) */}
              {SECT_V2.map((s, i) => {
                const x = pkToPx(s.a), w = pkToPx(s.b) - x;
                return (
                  <span key={`v2-${i}`}>
                    <div id={`seg-2-${i}`} onClick={() => authorizeSector(2, i)} title={`${s.label} V2`} className={SEG_BASE + "bg-transparent"} style={{ left: x, width: w, top: V2_Y }} />
                    <div className="absolute" style={{ left: x, width: w, top: V2_Y + 16 }}>
                      <div className="h-px w-full bg-secondary/40" />
                      <span id={`seclabel-2-${i}`} className={SECLABEL_BASE + "text-on-surface-variant"}>{`${s.label} · ${distOf(i)}`}</span>
                    </div>
                  </span>
                );
              })}

              {/* Postes + signalisation */}
              {JUNCTIONS.map((j, ji) => (
                <span key={`j-${j.top}`}>
                  <Annonce pk={j.annL} n={j.top} y={POSTE_TOP_Y + 4} />
                  <Conn pk={j.annL} top={POSTE_TOP_Y + 36} height={V1_Y - (POSTE_TOP_Y + 36)} />
                  <Carre pk={j.carL} y={POSTE_TOP_Y + 60} />
                  <Conn pk={j.carL} top={POSTE_TOP_Y + 80} height={V1_Y - (POSTE_TOP_Y + 80)} />
                  <PosteBox n={j.top} pk={(j.carL + j.carR) / 2} y={POSTE_TOP_Y} />
                  <Carre pk={j.carR} y={POSTE_TOP_Y + 60} />
                  <Conn pk={j.carR} top={POSTE_TOP_Y + 80} height={V1_Y - (POSTE_TOP_Y + 80)} />
                  <Annonce pk={j.annR} n={j.top} y={POSTE_TOP_Y + 4} />
                  <Conn pk={j.annR} top={POSTE_TOP_Y + 36} height={V1_Y - (POSTE_TOP_Y + 36)} />

                  <Conn pk={j.annL} top={V2_Y} height={POSTE_BOT_Y - V2_Y} />
                  <Annonce pk={j.annL} n={j.bot} y={POSTE_BOT_Y} />
                  <Conn pk={j.carL} top={V2_Y} height={POSTE_BOT_Y - V2_Y - 4} />
                  <Carre pk={j.carL} y={POSTE_BOT_Y - 4} />
                  <PosteBox n={j.bot} pk={(j.carL + j.carR) / 2} y={POSTE_BOT_Y} />
                  <Conn pk={j.carR} top={V2_Y} height={POSTE_BOT_Y - V2_Y - 4} />
                  <Carre pk={j.carR} y={POSTE_BOT_Y - 4} />
                  <Conn pk={j.annR} top={V2_Y} height={POSTE_BOT_Y - V2_Y} />
                  <Annonce pk={j.annR} n={j.bot} y={POSTE_BOT_Y} />

                  {[j.annL, j.carL, j.carR, j.annR].map((p, k) => (
                    <span key={`pk-${j.top}-${k}`} className="absolute text-[8px] font-telemetry text-on-surface whitespace-nowrap -translate-x-1/2 z-20" style={{ left: pkToPx(p), top: (V1_Y + V2_Y) / 2 + (k % 2 ? 8 : -4) }}>{fmtPK(p)}</span>
                  ))}

                  {/* 2 points (Voie 1 aller / Voie 2 arrivée), chacun 2 icônes : gauche ↙↖ et droite ↘↗ */}
                  {j.cross && (
                    <>
                      {/* Point Voie 1 (→) : 2 aiguilles */}
                      <button id={`aig-${ji}-1L`} onClick={() => routeVoie(ji, 1, "L")} title={`Voie 1 — aiguille GAUCHE — Poste ${j.top}`} className="absolute -translate-x-1/2 -translate-y-1/2 z-30 w-4 h-4 flex items-center justify-center text-[11px] leading-none bg-surface-container-highest border border-outline-variant text-on-surface-variant hover:text-secondary opacity-30" style={{ left: pkToPx((j.carL + j.carR) / 2 - 1.2), top: V1_Y }}>↙</button>
                      <button id={`aig-${ji}-1R`} onClick={() => routeVoie(ji, 1, "R")} title={`Voie 1 — aiguille DROITE — Poste ${j.top}`} className="absolute -translate-x-1/2 -translate-y-1/2 z-30 w-4 h-4 flex items-center justify-center text-[11px] leading-none bg-surface-container-highest border border-outline-variant text-on-surface-variant hover:text-secondary opacity-30" style={{ left: pkToPx((j.carL + j.carR) / 2 + 1.2), top: V1_Y }}>↘</button>
                      {/* Point Voie 2 (←) : 2 aiguilles */}
                      <button id={`aig-${ji}-2L`} onClick={() => routeVoie(ji, 2, "L")} title={`Voie 2 — aiguille GAUCHE — Poste ${j.top}`} className="absolute -translate-x-1/2 -translate-y-1/2 z-30 w-4 h-4 flex items-center justify-center text-[11px] leading-none bg-surface-container-highest border border-outline-variant text-on-surface-variant hover:text-secondary opacity-30" style={{ left: pkToPx((j.carL + j.carR) / 2 - 1.2), top: V2_Y }}>↖</button>
                      <button id={`aig-${ji}-2R`} onClick={() => routeVoie(ji, 2, "R")} title={`Voie 2 — aiguille DROITE — Poste ${j.top}`} className="absolute -translate-x-1/2 -translate-y-1/2 z-30 w-4 h-4 flex items-center justify-center text-[11px] leading-none bg-surface-container-highest border border-outline-variant text-on-surface-variant hover:text-secondary opacity-30" style={{ left: pkToPx((j.carL + j.carR) / 2 + 1.2), top: V2_Y }}>↗</button>
                      {/* Labels L / R au-dessus de chaque icône */}
                      <span className="absolute -translate-x-1/2 z-30 text-[7px] font-bold text-primary pointer-events-none" style={{ left: pkToPx((j.carL + j.carR) / 2 - 1.2), top: V1_Y - 11 }}>L</span>
                      <span className="absolute -translate-x-1/2 z-30 text-[7px] font-bold text-primary pointer-events-none" style={{ left: pkToPx((j.carL + j.carR) / 2 + 1.2), top: V1_Y - 11 }}>R</span>
                      <span className="absolute -translate-x-1/2 z-30 text-[7px] font-bold text-primary pointer-events-none" style={{ left: pkToPx((j.carL + j.carR) / 2 - 1.2), top: V2_Y - 11 }}>L</span>
                      <span className="absolute -translate-x-1/2 z-30 text-[7px] font-bold text-primary pointer-events-none" style={{ left: pkToPx((j.carL + j.carR) / 2 + 1.2), top: V2_Y - 11 }}>R</span>
                      <div id={`aiglabel-${ji}`} className="absolute -translate-x-1/2 z-30 hidden text-[9px] font-label-bold text-secondary blink-red whitespace-nowrap pointer-events-none bg-surface-container px-1 border border-secondary" style={{ left: pkToPx((j.carL + j.carR) / 2), top: (V1_Y + V2_Y) / 2 }}>Aiguillez ici (L / R)</div>
                    </>
                  )}
                </span>
              ))}

              {/* Autre train (MAT-88) qui occupe le Secteur 9-11 */}
              <div id="mat88" className="absolute -translate-y-1/2 -translate-x-1/2 z-20 flex flex-col items-center" style={{ left: pkToPx(occPk), top: V1_Y }} title={`${OCC_TRAIN} — occupe ${SECT_V1[OCC_INDEX].label}`}>
                <div className="bg-surface-container-highest px-1 border border-error text-[8px] font-telemetry whitespace-nowrap -mt-8"><span className="text-error">{OCC_TRAIN}</span> ⛔</div>
                <div className="flex items-center mt-px">
                  <div className="w-10 h-3 bg-error/70 border-y border-error mx-px"></div>
                  <div className="w-3 h-3 bg-error"></div>
                </div>
              </div>

              {/* Traînée orange progressive (partie parcourue du secteur courant) */}
              <div id="cur-trail" className="absolute h-[3px] -translate-y-1/2 z-20 pointer-events-none" style={{ left: pkToPx(CASA), width: 0, top: V1_Y, background: "rgba(245,158,11,0.9)", display: "none" }} />

              {/* Étiquette du convoi (suit la tête, reste droite) */}
              <div id="train-ttx01" className="absolute z-30 flex flex-col items-center pointer-events-none" style={{ left: pkToPx(CASA), top: V1_Y, transform: "translate(-50%, -150%)", transition: "left 0.1s linear, top 0.12s linear" }}>
                <div className="bg-surface-container-highest px-1 border border-outline-variant text-[9px] font-telemetry whitespace-nowrap"><span className="text-primary">TTx-01</span> <span id="train-voie-val" className="text-secondary">V1</span> | <span id="train-speed-val">40km/h</span></div>
                <div className="text-[8px] text-on-surface-variant opacity-60 whitespace-nowrap" id="train-pk-val">PK {fmtPK(CASA)}</div>
              </div>
              {/* Convoi articulé : tête (k=0) → wagons → queue (k=NSEG-1) */}
              {Array.from({ length: NSEG }, (_, k) => (
                <div
                  key={`tseg-${k}`}
                  id={`tseg-${k}`}
                  className={
                    "absolute z-30 " +
                    (k === 0
                      ? "w-4 h-3 bg-sky-500 gps-pulse"
                      : k === NSEG - 1
                      ? "w-3 h-3 bg-red-600 rounded-full shadow-[0_0_5px_red]"
                      : "w-3 h-3 bg-sky-600/80 border-y border-sky-400")
                  }
                  style={{ left: pkToPx(CASA), top: V1_Y, transform: "translate(-50%,-50%)", transition: "left 0.1s linear, top 0.12s linear, transform 0.12s linear" }}
                />
              ))}
            </div>
          </div>
        </main>

        {/* Right Panel */}
        <aside className="fixed right-0 top-[40px] bottom-[30px] w-[210px] z-40 bg-surface-container border-l border-outline-variant flex flex-col overflow-hidden">
          <div className="grid grid-cols-2 gap-px bg-outline-variant border-b border-outline-variant">
            <div className="bg-surface-container p-unit-2 flex flex-col"><span className="text-[9px] font-label-bold text-on-surface-variant opacity-60">TRAINS ACTIFS</span><span className="text-headline font-telemetry text-primary">02</span></div>
            <div className="bg-surface-container p-unit-2 flex flex-col"><span className="text-[9px] font-label-bold text-on-surface-variant opacity-60">SECTEURS</span><span className="text-headline font-telemetry text-secondary">05</span></div>
            <div className="bg-surface-container p-unit-2 flex flex-col"><span className="text-[9px] font-label-bold text-on-surface-variant opacity-60">BLOQUÉS</span><span id="blk-count" className="text-headline font-telemetry text-error">03</span></div>
            <div className="bg-surface-container p-unit-2 flex flex-col"><span className="text-[9px] font-label-bold text-on-surface-variant opacity-60">POSTES</span><span className="text-headline font-telemetry text-amber-500">08</span></div>
          </div>

          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="p-unit-2 bg-surface-container-high border-b border-outline-variant"><span className="text-[10px] font-label-bold text-on-surface">UNITÉS EN MOUVEMENT</span></div>
            <div className="flex-1 overflow-y-auto custom-scrollbar p-unit-2 space-y-unit-2">
              <div className="p-unit-2 bg-surface-container-low border border-outline-variant hover:border-primary cursor-pointer transition-all" id="card-ttx01">
                <div className="flex justify-between items-center mb-1"><span className="text-[11px] font-bold text-primary">TTx-01</span><span className="text-[8px] px-1 bg-secondary/10 text-secondary border border-outline-variant" id="status-ttx01">EN LIGNE</span></div>
                <div className="grid grid-cols-2 text-[9px] font-telemetry text-on-surface-variant"><span>V<span id="card-voie">1</span> @ <span id="card-speed-ttx01">40</span>km/h</span><span className="text-right" id="card-pk-ttx01">PK {fmtPK(CASA)}</span></div>
              </div>
              <div className="p-unit-2 bg-surface-container-low border border-error/40">
                <div className="flex justify-between items-center mb-1"><span className="text-[11px] font-bold text-error">{OCC_TRAIN}</span><span id="mat88-card" className="text-[8px] px-1 bg-error/15 text-error border border-error/30">EN SECTEUR</span></div>
                <div className="grid grid-cols-2 text-[9px] font-telemetry text-on-surface-variant"><span>V1 @ 0km/h</span><span className="text-right">PK {fmtPK(occPk)}</span></div>
              </div>
            </div>
          </div>

          <div className="h-1/3 border-t border-outline-variant bg-surface-container-lowest flex flex-col">
            <div className="p-1 px-2 bg-surface-container-high border-b border-outline-variant"><span className="text-[9px] font-label-bold text-on-surface-variant">LOG ÉVÉNEMENTS</span></div>
            <div className="flex-1 overflow-y-auto font-telemetry text-[10px] p-2 space-y-1 text-on-surface-variant/80 custom-scrollbar" id="event-log">
              <div>14:30:01 [SYS] Connexion OP. DURAND</div>
              <div>14:31:12 [TRV] Travaux Secteur 2</div>
              <div>14:32:00 [OCC] {OCC_TRAIN} en {SECT_V1[OCC_INDEX].label}</div>
            </div>
          </div>
        </aside>
      </div>

      {/* Footer */}
      <footer className="fixed bottom-0 w-full h-[30px] z-50 flex items-center bg-surface-dim border-t border-outline-variant">
        <div className="w-[140px] flex items-center justify-center border-r border-outline-variant h-full"><span className="text-error font-telemetry text-[10px] font-bold">MODE: OPÉRATION</span></div>
        <div className="flex-1 flex items-center px-unit-4 gap-unit-8">
          <div className="flex items-center gap-unit-3"><span className="text-[9px] font-label-bold text-on-surface-variant">T1 SPD</span><input className="w-24" id="speed-slider" max="120" min="0" type="range" defaultValue="40" onChange={handleSlider} /></div>
          <div className="h-4 w-px bg-outline-variant"></div>
          <button className="px-2 h-5 bg-secondary-container text-on-secondary-container border border-outline-variant text-[9px] font-label-bold hover:opacity-90 transition" onClick={() => toggleModal("auth-modal")}>AUTORISATIONS ▸</button>
          <button id="aig-btn" className="px-2 h-5 bg-surface-variant border border-outline-variant text-[9px] font-label-bold text-secondary hover:opacity-90 transition" onClick={() => setAig(!aigEnabled.current)} title="ADMIN : autoriser/verrouiller le changement de voie (manuel ET contournement auto)">🔀 AIGUILLAGE ON</button>
          <button id="voie-btn" className="px-2 h-5 bg-primary-container text-on-primary-container border border-outline-variant text-[9px] font-label-bold hover:opacity-90 transition opacity-40" onClick={handleChangeVoie} title="Aiguillage : changer la voie du train au poste le plus proche">⇄ CHANGER VOIE</button>
          <button id="follow-btn" className="px-2 h-5 bg-surface-variant border border-outline-variant text-[9px] font-label-bold text-secondary hover:opacity-90 transition" onClick={() => setFollow(!autoFollow.current)} title="Recentrage automatique sur le train (la molette le met en pause)">⊙ SUIVI ON</button>
          <div className="flex gap-unit-2">
            <button className="px-2 h-5 bg-surface-variant bg-primary-container border border-outline-variant text-[9px] font-label-bold hover:opacity-90 transition-colors" id="pause-btn" onClick={handlePause}>REPRENDRE</button>
            <button className="px-2 h-5 bg-surface-variant border border-outline-variant text-[9px] font-label-bold hover:bg-error-container hover:text-on-error-container transition-colors" onClick={resetSimulation}>RESET</button>
          </div>
        </div>
        <div className="w-[320px] bg-[#0d1e30] border-l border-outline-variant h-full flex items-center px-unit-3 transition-colors duration-300" id="alert-bar"><span className="text-[10px] font-label-bold text-secondary tracking-tight" id="alert-text">✔ EN LIGNE — circulation normale</span></div>
      </footer>

      {/* Modal AUTORISATIONS — secteur par secteur */}
      <div className="fixed inset-0 z-[100] bg-background/80 backdrop-blur-sm hidden items-center justify-center" id="auth-modal">
        <div className="bg-[#0d1e30] border border-outline-variant w-[520px] max-h-[80vh] flex flex-col p-unit-6 shadow-2xl">
          <div className="flex justify-between items-center mb-unit-4 border-b border-outline-variant pb-2">
            <h3 className="text-primary font-display-md text-[16px]">AUTORISATIONS — VOIES 1 &amp; 2</h3>
            <button className="material-symbols-outlined text-on-surface-variant hover:text-error" onClick={() => toggleModal("auth-modal")}>close</button>
          </div>
          <div className="overflow-y-auto custom-scrollbar space-y-unit-2">
            {[1, 2].map((v) => (
              <div key={`authv-${v}`}>
                <div className="text-[10px] font-label-bold text-primary mt-1 mb-1 border-b border-outline-variant/40">VOIE {v}</div>
                {SECT_V1.map((s, i) => {
                  const w0 = v === 1 && (!!s.travaux || i === OCC_INDEX);
                  return (
                    <div key={`auth-${v}-${i}`} className="flex items-center justify-between gap-unit-2 border-b border-outline-variant/20 pb-1">
                      <span className="text-[11px] font-label-bold text-on-surface">{s.label}</span>
                      <div className="flex items-center gap-unit-2">
                        <span id={`secbadge-${v}-${i}`} className={"text-[9px] font-label-bold px-1 " + (w0 ? "bg-red-600 text-white" : "bg-secondary/15 text-secondary")}>{w0 ? (v === 1 && i === OCC_INDEX ? "OCCUPÉ MAT-88" : "TRAVAUX") : "LIBRE"}</span>
                        <button id={`secbtn-${v}-${i}`} className="px-2 h-5 bg-surface-variant border border-outline-variant text-[9px] font-label-bold hover:bg-secondary hover:text-on-secondary transition-colors" onClick={() => authorizeSector(v, i)}>AUTORISER</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
          <p className="text-[9px] font-telemetry text-on-surface-variant/60 mt-unit-3">{"Autorise un secteur bloqué (rouge) sur l'une ou l'autre voie. On peut aussi cliquer directement le tronçon rouge sur la carte."}</p>
        </div>
      </div>

      {/* Modal ZONES TRAVAUX — déclarer un secteur en travaux */}
      <div className="fixed inset-0 z-[100] bg-background/80 backdrop-blur-sm hidden items-center justify-center" id="travaux-modal">
        <div className="bg-[#0d1e30] border border-outline-variant w-[520px] max-h-[80vh] flex flex-col p-unit-6 shadow-2xl">
          <div className="flex justify-between items-center mb-unit-4 border-b border-outline-variant pb-2">
            <h3 className="text-primary font-display-md text-[16px]">ZONES TRAVAUX — VOIES 1 &amp; 2</h3>
            <button className="material-symbols-outlined text-on-surface-variant hover:text-error" onClick={() => toggleModal("travaux-modal")}>close</button>
          </div>
          <div className="overflow-y-auto custom-scrollbar space-y-unit-2">
            {[1, 2].map((v) => (
              <div key={`trvv-${v}`}>
                <div className="text-[10px] font-label-bold text-primary mt-1 mb-1 border-b border-outline-variant/40">VOIE {v}</div>
                {SECT_V1.map((s, i) => {
                  const on = v === 1 && !!s.travaux;
                  return (
                    <div key={`trv-${v}-${i}`} className="flex items-center justify-between gap-unit-2 border-b border-outline-variant/20 pb-1">
                      <span className="text-[11px] font-label-bold text-on-surface">{s.label} <span className="text-on-surface-variant font-telemetry">· {distOf(i)}</span></span>
                      <button id={`travbtn-${v}-${i}`} className={"px-2 h-5 border border-outline-variant text-[9px] font-label-bold transition-colors " + (on ? "bg-error text-on-error" : "bg-surface-variant hover:bg-error hover:text-on-error")} onClick={() => declareTravaux(v, i)}>{on ? "LEVER" : "DÉCLARER"}</button>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
          <div id="trav-msg"></div>
          <p className="text-[9px] font-telemetry text-on-surface-variant/60 mt-unit-3">{"Déclarer un secteur en travaux le rend rouge (occupé) : le convoi s'y arrête (mêmes alertes), sauf autorisation ou contournement. Un secteur ne peut être occupé que sur UNE voie à la fois (l'autre reste libre pour la déviation)."}</p>
        </div>
      </div>

      {/* Popup déroutement — à la déclaration d'un secteur occupé */}
      <div className="fixed inset-0 z-[110] bg-background/80 backdrop-blur-sm hidden items-center justify-center" id="reroute-popup">
        <div className="bg-[#0d1e30] border border-error w-[440px] p-unit-6 shadow-2xl">
          <div className="flex justify-between items-center mb-unit-3 border-b border-outline-variant pb-2">
            <h3 className="text-error font-display-md text-[16px]">⚠️ SECTEUR OCCUPÉ — DÉROUTEMENT</h3>
            <button className="material-symbols-outlined text-on-surface-variant hover:text-error" onClick={() => toggleModal("reroute-popup")}>close</button>
          </div>
          <div className="space-y-unit-2 text-[11px] font-telemetry text-on-surface">
            <div id="rr-sector" className="text-error font-label-bold">—</div>
            <div id="rr-postes" className="text-on-surface-variant text-[10px]">—</div>
            <div className="border-t border-outline-variant/40 pt-2">
              <div className="text-[10px] font-label-bold text-primary mb-1">CONVOIS CONCERNÉS</div>
              <div id="rr-trains" className="text-on-surface-variant whitespace-pre-line text-[10px]">—</div>
            </div>
            <div className="text-amber-300 mt-2">Contourner le secteur par les 2 postes (entrée + sortie) pour éviter l&apos;arrêt — aller ET retour ?</div>
          </div>
          <div className="flex gap-unit-2 mt-unit-4">
            <button id="rr-yes" className="flex-1 bg-secondary-container text-on-secondary-container font-label-bold py-2 text-[10px] hover:opacity-90 active:scale-[0.98] transition" onClick={rerouteConfirm}>OUI — DÉROUTER</button>
            <button className="px-3 bg-surface-variant border border-outline-variant font-label-bold py-2 text-[10px] hover:opacity-90 transition" onClick={() => toggleModal("reroute-popup")}>PLUS TARD</button>
          </div>
        </div>
      </div>

      {/* Modal GÉRER POSTES */}
      <div className="fixed inset-0 z-[100] bg-background/80 backdrop-blur-sm hidden items-center justify-center" id="postes-modal">
        <div className="bg-[#0d1e30] border border-outline-variant w-[640px] max-h-[80vh] flex flex-col p-unit-6 shadow-2xl">
          <div className="flex justify-between items-center mb-unit-4 border-b border-outline-variant pb-2">
            <h3 className="text-primary font-display-md text-[16px]">POSTES & SECTEURS — VALEURS SCHÉMA</h3>
            <button className="material-symbols-outlined text-on-surface-variant hover:text-error" onClick={() => toggleModal("postes-modal")}>close</button>
          </div>
          <div className="overflow-y-auto custom-scrollbar">
            <table className="w-full text-[10px] font-telemetry text-on-surface-variant">
              <thead className="text-primary sticky top-0 bg-[#0d1e30]"><tr className="text-left border-b border-outline-variant"><th className="py-1 pr-2">Poste</th><th className="pr-2">Voie</th><th className="pr-2">Annonce G</th><th className="pr-2">Carré G</th><th className="pr-2">Carré D</th><th className="pr-2">Annonce D</th><th className="pr-2">PCV / Gare</th></tr></thead>
              <tbody>
                {JUNCTIONS.map((j) => (
                  <tr key={`r-${j.top}`} className="border-b border-outline-variant/30">
                    <td className="py-1 pr-2 text-error font-bold">P{j.top} / P{j.bot}</td>
                    <td className="pr-2">V1 / V2</td>
                    <td className="pr-2">{fmtPK(j.annL)}</td><td className="pr-2">{fmtPK(j.carL)}</td>
                    <td className="pr-2">{fmtPK(j.carR)}</td><td className="pr-2">{fmtPK(j.annR)}</td>
                    <td className="pr-2 text-[9px]">{j.pcv ? `${j.pcv.name} (${fmtPK(j.pcv.pk)})` : ""}{j.gare ? ` · ${j.gare.name} (${fmtPK(j.gare.pk)})` : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-unit-4 grid grid-cols-2 gap-unit-2 text-[10px] font-telemetry">
              <div><div className="text-primary font-label-bold mb-1">SECTEURS VOIE 1</div>{SECT_V1.map((s, i) => (<div key={s.label} className={hasWork(i) ? "text-error" : "text-secondary"}>{s.label} · {fmtPK(s.a)} → {fmtPK(s.b)} · {distOf(i)}</div>))}</div>
              <div><div className="text-primary font-label-bold mb-1">SECTEURS VOIE 2</div>{SECT_V2.map((s) => (<div key={s.label} className="text-secondary">{s.label} · {fmtPK(s.a)} → {fmtPK(s.b)}</div>))}</div>
            </div>
            <div className="mt-unit-4 text-[10px] font-telemetry"><div className="text-primary font-label-bold mb-1">LIMITES</div>{LIMITS.map((l) => (<div key={l.name} className="text-error">{l.name} · {fmtPK(l.pk)}</div>))}</div>
          </div>
        </div>
      </div>

      {/* Modal Ajouter Train */}
      <div className="fixed inset-0 z-[100] bg-background/80 backdrop-blur-sm hidden items-center justify-center" id="add-train-modal">
        <div className="bg-[#0d1e30] border border-outline-variant w-[400px] p-unit-6 shadow-2xl">
          <div className="flex justify-between items-center mb-unit-4 border-b border-outline-variant pb-2">
            <h3 className="text-primary font-display-md text-[18px]">AJOUTER UNITÉ</h3>
            <button className="material-symbols-outlined text-on-surface-variant hover:text-error" onClick={() => toggleModal("add-train-modal")}>close</button>
          </div>
          <div className="space-y-unit-4">
            <div><label className="block text-[10px] font-label-bold text-on-surface-variant mb-1">ID DU TRAIN</label><input className="w-full bg-background border border-outline-variant text-primary font-telemetry p-2 focus:ring-1 focus:ring-primary outline-none" placeholder="TTx-00" type="text" /></div>
            <div><label className="block text-[10px] font-label-bold text-on-surface-variant mb-1">VOIE INITIALE</label><select className="w-full bg-background border border-outline-variant text-on-surface font-telemetry p-2 outline-none"><option>VOIE 1 (V1)</option><option>VOIE 2 (V2)</option></select></div>
            <button className="w-full bg-primary-container text-on-primary-container font-label-bold py-2 mt-4 hover:opacity-90 active:scale-[0.98] transition-all">INITIALISER SUR TCO</button>
          </div>
        </div>
      </div>
    </>
  );
}
