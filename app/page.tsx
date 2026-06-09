"use client";

import { useEffect, useRef } from "react";

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

const JUNCTIONS: Junction[] = [
  { top: 3, bot: 4, annL: 368.762, carL: 370.262, carR: 372.879, annR: 374.379, pcv: { name: "PCV SIDI EL AIDI", pk: 371.505 }, base: { name: "BASE TRAVAUX SIDI EL AIDI", pk: 371.6 }, cross: true },
  { top: 5, bot: 6, annL: 388.933, carL: 390.433, carR: 392.708, annR: 394.208, pcv: { name: "PCV SETTAT", pk: 391.57 }, cross: true },
  { top: 7, bot: 8, annL: 409.875, carL: 411.375, carR: 414.971, annR: 416.471, pcv: { name: "PCVE EL KHEMSSET", pk: 413.184 }, cross: true },
  { top: 9, bot: 10, annL: 440.731, carL: 442.231, carR: 444.506, annR: 446.006, pcv: { name: "PCV SIDI ABDELLAH", pk: 443.369 }, cross: true },
  { top: 11, bot: 12, annL: 476.342, carL: 477.842, carR: 484.927, annR: 486.427, pcv: { name: "PCV BENGUERIR", pk: 479.106 }, gare: { name: "GARE VILLE VERTE", pk: 483.25 }, base: { name: "BASE TRAVAUX BENGUERIR", pk: 479.2 }, cross: true },
  { top: 13, bot: 14, annL: 504.969, carL: 506.469, carR: 508.744, annR: 510.244, pcv: { name: "PCV SIDI BOU OTHMAN", pk: 507.606 }, cross: true },
  { top: 15, bot: 16, annL: 530.17, carL: 531.67, carR: 533.045, annR: 534.545, pcv: { name: "PCV KOUDIA EL BEIDA", pk: 532.807 }, cross: true },
];

const LIMITS = [
  { name: "Limite VCBT1 / VCBT2", pk: 351.5 },
  { name: "Limite VCBT2 / TVE 4", pk: 538.145 },
];

interface Secteur {
  label: string;
  a: number;
  b: number;
  travaux?: boolean; // ZT / chantier dans le secteur
}
// Voie 1 — secteurs parcourus par TTx-01
const SECT_V1: Secteur[] = [
  { label: "Secteur Fin de chantier - 3", a: 351.5, b: 370.262 },
  { label: "Secteur 3 - 5", a: 372.879, b: 390.433 },
  { label: "Secteur 5 - 7", a: 392.708, b: 411.375, travaux: true },
  { label: "Secteur 7 - 9", a: 414.971, b: 442.231 },
  { label: "Secteur 9 - 11", a: 444.506, b: 477.842 }, // occupé par un autre train
  { label: "Secteur 11 - 13", a: 484.927, b: 506.469 },
  { label: "Secteur 13 - 15", a: 508.744, b: 531.67 },
  { label: "Secteur 15 - Fin de chantier", a: 533.045, b: 538.145, travaux: true },
];
const SECT_V2: Secteur[] = [
  { label: "Secteur Fin de chantier - 4", a: 351.5, b: 370.262 },
  { label: "Secteur 4 - 6", a: 372.879, b: 390.433 },
  { label: "Secteur 6 - 8", a: 392.708, b: 411.375 },
  { label: "Secteur 8 - 10", a: 414.971, b: 442.231 },
  { label: "Secteur 10 - 12", a: 444.506, b: 477.842 },
  { label: "Secteur 12 - 14", a: 484.927, b: 506.469 },
  { label: "Secteur 14 - 16", a: 508.744, b: 531.67 },
  { label: "Secteur 16 - Fin de chantier", a: 533.045, b: 538.145 },
];

// Occupation par un autre train (index secteur V1)
const OCC_INDEX = 4;
const OCC_TRAIN = "MAT-88";
const occPk = (SECT_V1[OCC_INDEX].a + SECT_V1[OCC_INDEX].b) / 2;

const hasWork = (i: number) => !!SECT_V1[i].travaux || i === OCC_INDEX;
const reasonOf = (i: number) =>
  SECT_V1[i].travaux ? "TRAVAUX" : i === OCC_INDEX ? `OCCUPÉ ${OCC_TRAIN}` : "";
const distOf = (i: number) =>
  (SECT_V1[i].b - SECT_V1[i].a).toFixed(1) + " km";
const motifText = (i: number) =>
  i === OCC_INDEX ? `occupé par ${OCC_TRAIN}` : "en TRAVAUX";
// Poste protégeant l'entrée d'un secteur (carré droit ≈ début secteur)
const junctionBefore = (i: number) =>
  JUNCTIONS.find((jj) => Math.abs(jj.carR - SECT_V1[i].a) < 0.05);
const posteBefore = (i: number) => {
  const j = junctionBefore(i);
  return j ? j.top : null;
};
// Poste de communication le plus proche (pour changer de voie)
const nearestCrossPoste = (pk: number) => {
  let best: Junction | null = null;
  let bd = 2.5;
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
const APPROACH_KM = 3; // distance d'alerte avant un secteur bloqué
const CROSS_LEN = 2.2; // longueur (km) de la traversée diagonale du croisement

const CASA = 351.5;
const MARRAKECH = 539.145;

// Échelle PK → px
const MIN_PK = 350;
const PX_PER_KM = 38;
const MARGIN = 150;
const pkToPx = (pk: number) => (pk - MIN_PK) * PX_PER_KM + MARGIN;
const TRACK_WIDTH = pkToPx(MARRAKECH) + MARGIN;

// Géométrie verticale
const TOP_LABEL_Y = 6;
const POSTE_TOP_Y = 64;
const V1_Y = 170;
const V2_Y = 270;
const POSTE_BOT_Y = 312;

const fmtPK = (pk: number) => {
  const km = Math.floor(pk);
  const m = Math.round((pk - km) * 1000);
  return `${km}+${String(m).padStart(3, "0")}`;
};

export default function Home() {
  const trainPK = useRef(CASA);
  const speed = useRef(40);
  const isPaused = useRef(false);
  const authSect = useRef<boolean[]>(SECT_V1.map(() => false)); // autorisation par secteur
  const trainVoie = useRef(1); // voie courante du train (1 ou 2)
  const armRef = useRef(-1); // poste dont l'aiguillage est armé (train proche)
  const crossRoute = useRef<
    { startPK: number; endPK: number; fromY: number; toY: number } | null
  >(null); // traversée diagonale en cours
  const occActive = useRef(true); // MAT-88 occupe encore son secteur
  const occTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastStatus = useRef("");
  const lastAlert = useRef("");

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

  const updateSectorDOM = (i: number) => {
    const auth = authSect.current[i];
    const work = !!SECT_V1[i].travaux || (i === OCC_INDEX && occActive.current);
    const blocked = work && !auth;
    const state = blocked ? reasonOf(i) : work && auth ? "AUTORISÉ" : "LIBRE";
    const label = document.getElementById(`seclabel-${i}`);
    const seg = document.getElementById(`seg-${i}`);
    const badge = document.getElementById(`secbadge-${i}`);
    const btn = document.getElementById(`secbtn-${i}`);
    if (label) {
      label.textContent = `${SECT_V1[i].label} · ${distOf(i)}${
        work ? " · " + state : ""
      }`;
      label.className =
        SECLABEL_BASE +
        (blocked ? "text-error" : work && auth ? "text-secondary" : "text-on-surface-variant");
    }
    if (seg) {
      seg.className = SEG_BASE + (blocked ? "bg-red-600/80 blink-red" : "bg-secondary/80");
    }
    if (badge) {
      badge.textContent = state;
      badge.className =
        "text-[9px] font-label-bold px-1 " +
        (blocked ? "bg-red-600 text-white" : "bg-secondary/15 text-secondary");
    }
    if (btn) btn.textContent = auth ? "RETIRER" : "AUTORISER";
  };

  const updateBlockedCount = () => {
    const n = SECT_V1.filter(
      (s, i) =>
        (!!s.travaux || (i === OCC_INDEX && occActive.current)) &&
        !authSect.current[i]
    ).length;
    const el = document.getElementById("blk-count");
    if (el) el.textContent = String(n).padStart(2, "0");
  };

  const authorizeSector = (i: number) => {
    if (!hasWork(i)) return; // seuls les secteurs bloqués se gèrent
    authSect.current[i] = !authSect.current[i];
    updateSectorDOM(i);
    updateBlockedCount();
    addLog(
      authSect.current[i]
        ? `[AUTOR] ${SECT_V1[i].label} AUTORISÉ`
        : `[AUTOR] ${SECT_V1[i].label} bloqué (${reasonOf(i)})`
    );
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
          ? "bg-red-900/95 border-red-500 text-white blink-red"
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
    updateSectorDOM(OCC_INDEX);
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
    crossRoute.current = null;
    authSect.current = SECT_V1.map(() => false);
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
    SECT_V1.forEach((_, i) => updateSectorDOM(i));
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

  // Aiguillage rapide (bouton bas) : utilise le poste le plus proche, branche droite
  const handleChangeVoie = () => {
    const j = nearestCrossPoste(trainPK.current);
    if (!j) {
      addLog("[AIG] Changement impossible — train hors poste");
      return;
    }
    routeVoie(JUNCTIONS.indexOf(j), "R");
  };

  // Arme/désarme visuellement les aiguilles du poste proche du train
  const armAiguillage = (idx: number) => {
    if (idx === armRef.current) return;
    armRef.current = idx;
    JUNCTIONS.forEach((j, k) => {
      if (!j.cross) return;
      const on = k === idx;
      (["L", "R"] as const).forEach((s) => {
        const b = document.getElementById(`aig-${k}-${s}`);
        if (b) {
          b.classList.toggle("opacity-30", !on);
          b.classList.toggle("border-secondary", on);
          b.classList.toggle("text-secondary", on);
          b.classList.toggle("animate-pulse", on);
        }
      });
    });
  };

  // Aiguillage GAUCHE/DROITE au poste : route le train sur l'autre voie
  const routeVoie = (idx: number, side: "L" | "R") => {
    const j = JUNCTIONS[idx];
    if (nearestCrossPoste(trainPK.current) !== j) {
      addLog(`[AIG] Poste ${j.top}: train trop loin pour aiguiller`);
      return;
    }
    const crossPk = side === "L" ? j.carL : j.carR;
    const from = trainVoie.current;
    const to = from === 1 ? 2 : 1;
    trainVoie.current = to;
    // Le train suit la diagonale de la communication jusqu'au carré opposé (apex du V)
    const startPK = trainPK.current;
    const endPK = j.carR > startPK + 0.3 ? j.carR : startPK + CROSS_LEN;
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
    // branche choisie en vert, l'autre en rouge
    document.getElementById(`xl-${idx}`)?.setAttribute("stroke", side === "L" ? "#4ae176" : "#ef4444");
    document.getElementById(`xr-${idx}`)?.setAttribute("stroke", side === "R" ? "#4ae176" : "#ef4444");
    lastStatus.current = "";
    addLog(
      `[AIG] Poste ${j.top}/${j.bot} — itinéraire ${side === "L" ? "GAUCHE" : "DROITE"} (PK ${fmtPK(crossPk)}) — Voie ${from} → ${to}`
    );
  };

  useEffect(() => {
    const trainEl = document.getElementById("train-ttx01");
    const pkVal = document.getElementById("train-pk-val");
    const cardPk = document.getElementById("card-pk-ttx01");
    const scroller = document.getElementById("sector-scroll");
    SECT_V1.forEach((_, i) => updateSectorDOM(i));
    updateBlockedCount();
    startOccTimer();

    const clockId = setInterval(() => {
      const now = new Date();
      const clock = document.getElementById("system-clock");
      if (clock) clock.textContent = now.toTimeString().split(" ")[0];
    }, 1000);

    // Bloquant seulement sur la voie 1 (sur voie 2 / contre-voie, libre)
    const isBlocked = (i: number) =>
      trainVoie.current === 1 &&
      (!!SECT_V1[i].travaux || (i === OCC_INDEX && occActive.current)) &&
      !authSect.current[i];

    let raf = 0;
    const animate = () => {
      if (!isPaused.current) {
        if (trainPK.current >= MARRAKECH - 0.02) trainPK.current = CASA;

        // Borne d'avance = entrée du 1er secteur bloqué devant le train
        let allowedMax = MARRAKECH;
        let stopIdx = -1;
        for (let i = 0; i < SECT_V1.length; i++) {
          if (!isBlocked(i)) continue;
          // arrêt à l'entrée du croisement (carré gauche du poste protecteur)
          const stopPk = junctionBefore(i)?.carL ?? SECT_V1[i].a;
          if (stopPk >= trainPK.current - 0.001 && stopPk < allowedMax) {
            allowedMax = stopPk;
            stopIdx = i;
          }
        }

        const newPk = Math.min(trainPK.current + speed.current / 800, allowedMax);
        const moving = newPk > trainPK.current + 1e-6;
        trainPK.current = newPk;

        if (trainEl) {
          trainEl.style.left = pkToPx(trainPK.current) + "px";
          // top : diagonale pendant la traversée du croisement, sinon voie courante
          let topY = trainVoie.current === 1 ? V1_Y : V2_Y;
          const cr = crossRoute.current;
          if (cr) {
            if (trainPK.current <= cr.endPK) {
              const t = Math.min(1, Math.max(0, (trainPK.current - cr.startPK) / (cr.endPK - cr.startPK)));
              topY = cr.fromY + (cr.toY - cr.fromY) * t;
            } else {
              crossRoute.current = null; // traversée terminée
            }
          }
          trainEl.style.top = topY + "px";
        }
        if (scroller)
          scroller.scrollLeft = pkToPx(trainPK.current) - scroller.clientWidth / 2;
        const lbl = "PK " + fmtPK(trainPK.current);
        if (pkVal) pkVal.textContent = lbl;
        if (cardPk) cardPk.textContent = lbl;

        if (!moving && stopIdx >= 0) {
          // Arrêt au poste avant le secteur bloqué
          const n = posteBefore(stopIdx) ?? "?";
          setTrainStatus(
            `stop:Poste ${n} — ${SECT_V1[stopIdx].label} ${motifText(stopIdx)} — CHANGER DE VOIE`
          );
          pushAlerts(`stop-${stopIdx}`, [
            { text: `⛔ ARRÊT — Poste ${n} : ${SECT_V1[stopIdx].label} ${motifText(stopIdx)}`, tone: "danger" },
            { text: `👉 Cliquez ◢ DROITE (ou ◣ GAUCHE) au Poste ${n} pour changer de voie`, tone: "danger" },
            { text: `… ou attendez la libération du secteur`, tone: "warn" },
          ]);
        } else if (trainVoie.current === 1) {
          // Alerte d'approche d'un secteur occupé / en travaux
          let appr = -1;
          for (let i = 0; i < SECT_V1.length; i++) {
            const a = SECT_V1[i].a;
            if (isBlocked(i) && a > trainPK.current && a - trainPK.current <= APPROACH_KM) {
              appr = i;
              break;
            }
          }
          if (appr >= 0) {
            const n = posteBefore(appr) ?? "?";
            const d = (SECT_V1[appr].a - trainPK.current).toFixed(1);
            setTrainStatus(
              `appr:${SECT_V1[appr].label} ${motifText(appr)} — changer de voie au Poste ${n}`
            );
            pushAlerts(`appr-${appr}`, [
              { text: `🚨 DANGER — ${SECT_V1[appr].label} ${motifText(appr)}`, tone: "danger" },
              { text: `⚠️ ATTENTION — TTx-01 approche (${d} km)`, tone: "warn" },
              { text: `👉 Préparez l'aiguillage ◢ au Poste ${n}`, tone: "warn" },
            ]);
          } else {
            setTrainStatus("move:Voie 1 — circulation normale");
            pushAlerts("clear1", []);
          }
        } else {
          setTrainStatus("move:Voie 2 (contre-voie) — circulation normale");
          pushAlerts("cross-ok", [
            { text: `✔ Voie 2 (contre-voie) — secteur contourné`, tone: "ok" },
          ]);
        }

        // Arme l'aiguillage du poste le plus proche
        const nearJ = nearestCrossPoste(trainPK.current);
        armAiguillage(nearJ ? JUNCTIONS.indexOf(nearJ) : -1);
      }
      raf = requestAnimationFrame(animate);
    };
    raf = requestAnimationFrame(animate);

    return () => {
      clearInterval(clockId);
      cancelAnimationFrame(raf);
      if (occTimer.current) clearTimeout(occTimer.current);
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
  const SectorBarV2 = ({ s, y }: { s: Secteur; y: number }) => {
    const x = pkToPx(s.a);
    const w = pkToPx(s.b) - x;
    return (
      <div className="absolute" style={{ left: x, width: w, top: y }}>
        <div className="h-px w-full bg-secondary/40" />
        <span className="absolute left-1/2 -translate-x-1/2 top-1 text-[8px] font-telemetry whitespace-nowrap text-on-surface-variant">{s.label}</span>
      </div>
    );
  };
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
            <div className="flex items-center gap-unit-2"><span className="w-4 h-[3px] bg-red-600/80"></span> Secteur bloqué</div>
            <div className="flex items-center gap-unit-2"><span className="w-4 h-[3px] bg-secondary/80"></span> Secteur autorisé</div>
            <div className="flex items-center gap-unit-2"><span className="w-3 h-3 bg-black border border-white/80 flex items-center justify-center text-[6px] text-white font-bold">P</span> Poste</div>
            <div className="flex items-center gap-unit-2"><span className="w-3 h-[2px] bg-red-500 rotate-45"></span> Communication</div>
          </div>
          <div className="p-unit-2 border-y border-outline-variant bg-surface-container-highest/20 mt-unit-4"><span className="font-label-bold text-[10px] text-primary block uppercase tracking-widest">Admin</span></div>
          <nav className="flex flex-col">
            <button className="flex flex-col items-center justify-center py-unit-3 border-b border-outline-variant hover:bg-surface-variant transition-colors group" onClick={() => toggleModal("add-train-modal")}>
              <span className="material-symbols-outlined text-primary group-hover:scale-110 transition-transform">add_circle</span>
              <span className="text-[9px] mt-1 font-label-bold text-on-surface-variant">AJOUTER TRAIN</span>
            </button>
            <button className="flex flex-col items-center justify-center py-unit-3 border-b border-outline-variant hover:bg-surface-variant transition-colors group">
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
          <div className="absolute inset-0 overflow-x-auto overflow-y-auto custom-scrollbar" id="sector-scroll">
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
                    {hasWork(i) && (
                      <div
                        id={`seg-${i}`}
                        onClick={() => authorizeSector(i)}
                        title={`${s.label} — ${st.state}`}
                        className={SEG_BASE + (st.blocked ? "bg-red-600/80 blink-red" : "bg-secondary/80")}
                        style={{ left: x, width: w, top: V1_Y }}
                      />
                    )}
                    <div className="absolute" style={{ left: x, width: w, top: V1_Y + 18 }}>
                      <div className={`h-px w-full ${st.blocked ? "bg-error/40" : "bg-secondary/40"}`} />
                      <span id={`seclabel-${i}`} className={SECLABEL_BASE + (st.blocked ? "text-error" : st.work && st.auth ? "text-secondary" : "text-on-surface-variant")}>
                        {`${s.label} · ${distOf(i)}${hasWork(i) ? " · " + st.state : ""}`}
                      </span>
                    </div>
                  </span>
                );
              })}
              {/* Secteurs Voie 2 */}
              {SECT_V2.map((s) => (<SectorBarV2 key={s.label} s={s} y={V2_Y - 14} />))}

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

                  {/* Aiguille du poste : GAUCHE / DROITE (s'arme quand le train est proche) */}
                  {j.cross && (
                    <>
                      <button id={`aig-${ji}-L`} onClick={() => routeVoie(ji, "L")} title={`Aiguille GAUCHE — Poste ${j.top} (PK ${fmtPK(j.carL)})`} className="absolute -translate-x-1/2 -translate-y-1/2 z-30 w-4 h-4 flex items-center justify-center text-[10px] bg-surface-container-highest border border-outline-variant text-on-surface-variant hover:text-secondary opacity-30" style={{ left: pkToPx(j.carL), top: (V1_Y + V2_Y) / 2 + 22 }}>◣</button>
                      <button id={`aig-${ji}-R`} onClick={() => routeVoie(ji, "R")} title={`Aiguille DROITE — Poste ${j.top} (PK ${fmtPK(j.carR)})`} className="absolute -translate-x-1/2 -translate-y-1/2 z-30 w-4 h-4 flex items-center justify-center text-[10px] bg-surface-container-highest border border-outline-variant text-on-surface-variant hover:text-secondary opacity-30" style={{ left: pkToPx(j.carR), top: (V1_Y + V2_Y) / 2 + 22 }}>◢</button>
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

              {/* Train TTx-01 (Voie 1) */}
              <div className="absolute -translate-y-1/2 z-30 flex items-center group cursor-pointer" id="train-ttx01" style={{ left: pkToPx(CASA), top: V1_Y, transition: "left 0.1s linear, top 0.12s linear" }}>
                <div className="flex flex-col items-center -mt-12 mr-2">
                  <div className="bg-surface-container-highest px-1 border border-outline-variant text-[9px] font-telemetry whitespace-nowrap"><span className="text-primary">TTx-01</span> <span id="train-voie-val" className="text-secondary">V1</span> | <span id="train-speed-val">40km/h</span></div>
                  <div className="text-[8px] text-on-surface-variant opacity-60 whitespace-nowrap" id="train-pk-val">PK {fmtPK(CASA)}</div>
                </div>
                <div className="flex items-center">
                  <div className="w-3 h-3 bg-red-600 rounded-full shadow-[0_0_5px_red]"></div>
                  <div className="w-12 h-3 bg-sky-600/80 border-y border-sky-400 mx-px"></div>
                  <div className="w-8 h-3 bg-sky-600/80 border-y border-sky-400 mx-px"></div>
                  <div className="w-3 h-3 bg-sky-500"></div>
                  <div className="w-3 h-3 bg-secondary rounded-full gps-pulse ml-2"></div>
                </div>
              </div>
            </div>
          </div>
        </main>

        {/* Right Panel */}
        <aside className="fixed right-0 top-[40px] bottom-[30px] w-[210px] z-40 bg-surface-container border-l border-outline-variant flex flex-col overflow-hidden">
          <div className="grid grid-cols-2 gap-px bg-outline-variant border-b border-outline-variant">
            <div className="bg-surface-container p-unit-2 flex flex-col"><span className="text-[9px] font-label-bold text-on-surface-variant opacity-60">TRAINS ACTIFS</span><span className="text-headline font-telemetry text-primary">02</span></div>
            <div className="bg-surface-container p-unit-2 flex flex-col"><span className="text-[9px] font-label-bold text-on-surface-variant opacity-60">SECTEURS</span><span className="text-headline font-telemetry text-secondary">16</span></div>
            <div className="bg-surface-container p-unit-2 flex flex-col"><span className="text-[9px] font-label-bold text-on-surface-variant opacity-60">BLOQUÉS</span><span id="blk-count" className="text-headline font-telemetry text-error">03</span></div>
            <div className="bg-surface-container p-unit-2 flex flex-col"><span className="text-[9px] font-label-bold text-on-surface-variant opacity-60">POSTES</span><span className="text-headline font-telemetry text-amber-500">14</span></div>
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
              <div>14:31:12 [TRV] Travaux Secteur 5-7 &amp; 15-Fin</div>
              <div>14:32:00 [OCC] {OCC_TRAIN} en Secteur 9-11</div>
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
          <button id="voie-btn" className="px-2 h-5 bg-primary-container text-on-primary-container border border-outline-variant text-[9px] font-label-bold hover:opacity-90 transition opacity-40" onClick={handleChangeVoie} title="Aiguillage : changer la voie du train au poste le plus proche">⇄ CHANGER VOIE</button>
          <div className="flex gap-unit-2">
            <button className="px-2 h-5 bg-surface-variant border border-outline-variant text-[9px] font-label-bold hover:bg-primary-container hover:text-on-primary-container transition-colors" id="pause-btn" onClick={handlePause}>PAUSE</button>
            <button className="px-2 h-5 bg-surface-variant border border-outline-variant text-[9px] font-label-bold hover:bg-error-container hover:text-on-error-container transition-colors" onClick={resetSimulation}>RESET</button>
          </div>
        </div>
        <div className="w-[320px] bg-[#0d1e30] border-l border-outline-variant h-full flex items-center px-unit-3 transition-colors duration-300" id="alert-bar"><span className="text-[10px] font-label-bold text-secondary tracking-tight" id="alert-text">✔ EN LIGNE — circulation normale</span></div>
      </footer>

      {/* Modal AUTORISATIONS — secteur par secteur */}
      <div className="fixed inset-0 z-[100] bg-background/80 backdrop-blur-sm hidden items-center justify-center" id="auth-modal">
        <div className="bg-[#0d1e30] border border-outline-variant w-[520px] max-h-[80vh] flex flex-col p-unit-6 shadow-2xl">
          <div className="flex justify-between items-center mb-unit-4 border-b border-outline-variant pb-2">
            <h3 className="text-primary font-display-md text-[16px]">AUTORISATIONS — VOIE 1</h3>
            <button className="material-symbols-outlined text-on-surface-variant hover:text-error" onClick={() => toggleModal("auth-modal")}>close</button>
          </div>
          <div className="overflow-y-auto custom-scrollbar space-y-unit-2">
            {SECT_V1.map((s, i) => {
              const st = sectorState(i, false);
              return (
                <div key={`auth-${i}`} className="flex items-center justify-between gap-unit-2 border-b border-outline-variant/30 pb-1">
                  <div className="flex flex-col">
                    <span className="text-[11px] font-label-bold text-on-surface">{s.label}</span>
                    <span className="text-[9px] font-telemetry text-on-surface-variant">{fmtPK(s.a)} → {fmtPK(s.b)} · {distOf(i)}</span>
                  </div>
                  <div className="flex items-center gap-unit-2">
                    <span id={`secbadge-${i}`} className={"text-[9px] font-label-bold px-1 " + (st.blocked ? "bg-red-600 text-white" : "bg-secondary/15 text-secondary")}>{st.state}</span>
                    {hasWork(i) ? (
                      <button id={`secbtn-${i}`} className="px-2 h-5 bg-surface-variant border border-outline-variant text-[9px] font-label-bold hover:bg-secondary hover:text-on-secondary transition-colors" onClick={() => authorizeSector(i)}>{st.auth ? "RETIRER" : "AUTORISER"}</button>
                    ) : (
                      <span className="text-[9px] text-on-surface-variant/50 px-2">—</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-[9px] font-telemetry text-on-surface-variant/60 mt-unit-3">Un secteur est bloqué (rouge) s'il y a des travaux (ZT) ou un autre train. Le train TTx-01 s'arrête à son entrée tant qu'il n'est pas autorisé.</p>
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
