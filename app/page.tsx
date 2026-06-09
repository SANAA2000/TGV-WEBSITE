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
  annL: number; // annonce gauche "à 1500m"
  carL: number; // carré gauche
  carR: number; // carré droite
  annR: number; // annonce droite "à 1500m"
  pcv?: { name: string; pk: number };
  gare?: { name: string; pk: number };
  base?: { name: string; pk: number };
  cross?: boolean; // communication entre voies
}

const JUNCTIONS: Junction[] = [
  {
    top: 3, bot: 4, annL: 368.762, carL: 370.262, carR: 372.879, annR: 374.379,
    pcv: { name: "PCV SIDI EL AIDI", pk: 371.505 },
    base: { name: "BASE TRAVAUX SIDI EL AIDI", pk: 371.6 }, cross: true,
  },
  {
    top: 5, bot: 6, annL: 388.933, carL: 390.433, carR: 392.708, annR: 394.208,
    pcv: { name: "PCV SETTAT", pk: 391.57 }, cross: true,
  },
  {
    top: 7, bot: 8, annL: 409.875, carL: 411.375, carR: 414.971, annR: 416.471,
    pcv: { name: "PCVE EL KHEMSSET", pk: 413.184 }, cross: true,
  },
  {
    top: 9, bot: 10, annL: 440.731, carL: 442.231, carR: 444.506, annR: 446.006,
    pcv: { name: "PCV SIDI ABDELLAH", pk: 443.369 }, cross: true,
  },
  {
    top: 11, bot: 12, annL: 476.342, carL: 477.842, carR: 484.927, annR: 486.427,
    pcv: { name: "PCV BENGUERIR", pk: 479.106 },
    gare: { name: "GARE VILLE VERTE", pk: 483.25 },
    base: { name: "BASE TRAVAUX BENGUERIR", pk: 479.2 }, cross: true,
  },
  {
    top: 13, bot: 14, annL: 504.969, carL: 506.469, carR: 508.744, annR: 510.244,
    pcv: { name: "PCV SIDI BOU OTHMAN", pk: 507.606 }, cross: true,
  },
  {
    top: 15, bot: 16, annL: 530.17, carL: 531.67, carR: 533.045, annR: 534.545,
    pcv: { name: "PCV KOUDIA EL BEIDA", pk: 532.807 }, cross: true,
  },
];

const LIMITS = [
  { name: "Limite VCBT1 / VCBT2", pk: 351.5 },
  { name: "Limite VCBT2 / TVE 4", pk: 538.145 },
];

interface Secteur {
  label: string;
  a: number;
  b: number;
  fin?: boolean;
}
const SECT_V1: Secteur[] = [
  { label: "Secteur Fin de chantier - 3", a: 351.5, b: 370.262, fin: true },
  { label: "Secteur 3 - 5", a: 372.879, b: 390.433 },
  { label: "Secteur 5 - 7", a: 392.708, b: 411.375 },
  { label: "Secteur 7 - 9", a: 414.971, b: 442.231 },
  { label: "Secteur 9 - 11", a: 444.506, b: 477.842 },
  { label: "Secteur 11 - 13", a: 484.927, b: 506.469 },
  { label: "Secteur 13 - 15", a: 508.744, b: 531.67 },
  { label: "Secteur 15 - Fin de chantier", a: 533.045, b: 538.145, fin: true },
];
const SECT_V2: Secteur[] = [
  { label: "Secteur Fin de chantier - 4", a: 351.5, b: 370.262, fin: true },
  { label: "Secteur 4 - 6", a: 372.879, b: 390.433 },
  { label: "Secteur 6 - 8", a: 392.708, b: 411.375 },
  { label: "Secteur 8 - 10", a: 414.971, b: 442.231 },
  { label: "Secteur 10 - 12", a: 444.506, b: 477.842 },
  { label: "Secteur 12 - 14", a: 484.927, b: 506.469 },
  { label: "Secteur 14 - 16", a: 508.744, b: 531.67 },
  { label: "Secteur 16 - Fin de chantier", a: 533.045, b: 538.145, fin: true },
];

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
const POSTE_TOP_Y = 64; // postes Voie 1 (au-dessus)
const V1_Y = 170;
const V2_Y = 270;
const POSTE_BOT_Y = 312; // postes Voie 2 (en-dessous)

const fmtPK = (pk: number) => {
  const km = Math.floor(pk);
  const m = Math.round((pk - km) * 1000);
  return `${km}+${String(m).padStart(3, "0")}`;
};

export default function Home() {
  const trainPK = useRef(CASA);
  const speed = useRef(40);
  const isPaused = useRef(false);
  const authorized = useRef(false); // circulation autorisée par l'admin
  const lastSect = useRef("");

  const addLog = (msg: string) => {
    const time = new Date().toTimeString().split(" ")[0];
    const log = document.getElementById("event-log");
    if (!log) return;
    const entry = document.createElement("div");
    entry.textContent = `${time} ${msg}`;
    log.prepend(entry);
  };

  const toggleModal = (id: string) => {
    const modal = document.getElementById(id);
    if (!modal) return;
    modal.classList.toggle("hidden");
    modal.classList.toggle("flex");
  };

  const setAuthUI = () => {
    const a = authorized.current;
    const bar = document.getElementById("alert-bar");
    const txt = document.getElementById("alert-text");
    const badge = document.getElementById("auth-badge");
    const card = document.getElementById("status-ttx01");
    if (bar) {
      bar.classList.toggle("bg-red-900", !a);
      bar.classList.toggle("bg-[#0d1e30]", a);
    }
    if (txt) {
      txt.textContent = a
        ? "✔ CIRCULATION AUTORISÉE — OP. DURAND"
        : "⛔ CIRCULATION NON AUTORISÉE";
      txt.classList.toggle("text-secondary", a);
      txt.classList.toggle("text-white", !a);
    }
    if (badge) {
      badge.textContent = a ? "AUTORISÉ" : "NON AUTORISÉ";
      badge.classList.toggle("text-secondary", a);
      badge.classList.toggle("text-error", !a);
    }
    if (card) {
      card.textContent = a ? "EN LIGNE" : "ARRÊT";
      card.classList.toggle("bg-secondary/10", a);
      card.classList.toggle("text-secondary", a);
      card.classList.toggle("bg-red-600", !a);
      card.classList.toggle("text-white", !a);
    }
  };

  const toggleAuth = () => {
    authorized.current = !authorized.current;
    setAuthUI();
    addLog(
      authorized.current
        ? "[AUTOR] Circulation TTx-01 AUTORISÉE"
        : "[AUTOR] Autorisation RETIRÉE — train à l'arrêt"
    );
  };

  const resetSimulation = () => {
    trainPK.current = CASA;
    authorized.current = false;
    lastSect.current = "";
    setAuthUI();
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

  useEffect(() => {
    const trainEl = document.getElementById("train-ttx01");
    const pkVal = document.getElementById("train-pk-val");
    const cardPk = document.getElementById("card-pk-ttx01");
    const scroller = document.getElementById("sector-scroll");
    setAuthUI();

    const clockId = setInterval(() => {
      const now = new Date();
      const clock = document.getElementById("system-clock");
      if (clock) clock.textContent = now.toTimeString().split(" ")[0];
    }, 1000);

    const sectorAt = (pk: number) =>
      SECT_V1.find((s) => pk >= s.a && pk <= s.b)?.label ?? "";

    let raf = 0;
    const animate = () => {
      // Le train n'avance QUE si l'admin a autorisé la circulation
      if (authorized.current && !isPaused.current) {
        trainPK.current += speed.current / 800;
        if (trainPK.current > MARRAKECH) trainPK.current = CASA;

        if (trainEl) trainEl.style.left = pkToPx(trainPK.current) + "px";
        if (scroller)
          scroller.scrollLeft =
            pkToPx(trainPK.current) - scroller.clientWidth / 2;

        const label = "PK " + fmtPK(trainPK.current);
        if (pkVal) pkVal.textContent = label;
        if (cardPk) cardPk.textContent = label;

        const sect = sectorAt(trainPK.current);
        if (sect && sect !== lastSect.current) {
          lastSect.current = sect;
          addLog(`[MOUV] TTx-01 entre ${sect}`);
        }
      }
      raf = requestAnimationFrame(animate);
    };
    raf = requestAnimationFrame(animate);

    return () => {
      clearInterval(clockId);
      cancelAnimationFrame(raf);
    };
  }, []);

  // --- Sous-composants de signalisation --------------------------------------

  // Carré (signal noir à barre jaune)
  const Carre = ({ pk, y }: { pk: number; y: number }) => (
    <div
      className="absolute -translate-x-1/2 w-5 h-5 bg-black border border-white/70 z-20"
      style={{ left: pkToPx(pk), top: y }}
      title={`Carré PK ${fmtPK(pk)}`}
    >
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(135deg, transparent 40%, #facc15 40%, #facc15 60%, transparent 60%)",
        }}
      />
    </div>
  );

  // Annonce "Poste N à 1500m" (boîte verticale)
  const Annonce = ({ pk, n, y }: { pk: number; n: number; y: number }) => (
    <div
      className="absolute -translate-x-1/2 w-4 h-8 bg-surface-container-highest border border-outline-variant flex items-center justify-center z-20"
      style={{ left: pkToPx(pk), top: y }}
      title={`Poste ${n} à 1500m — PK ${fmtPK(pk)}`}
    >
      <span
        className="text-[6px] font-telemetry text-on-surface-variant whitespace-nowrap"
        style={{ writingMode: "vertical-rl" }}
      >
        P{n} 1500
      </span>
    </div>
  );

  // Boîte Poste (symbole noir + label rouge)
  const PosteBox = ({ n, pk, y }: { n: number; pk: number; y: number }) => (
    <div
      className="absolute -translate-x-1/2 flex flex-col items-center z-20"
      style={{ left: pkToPx(pk), top: y }}
    >
      <div className="w-6 h-6 bg-black border border-white/80 flex items-center justify-center text-white text-[8px] font-bold">
        P{n}
      </div>
      <span className="text-[7px] font-label-bold text-error whitespace-nowrap mt-px">
        Poste {n}
      </span>
    </div>
  );

  // Trait de liaison vertical vers la voie
  const Conn = ({ pk, top, height }: { pk: number; top: number; height: number }) => (
    <div
      className="absolute w-px bg-on-surface-variant/40 -translate-x-1/2"
      style={{ left: pkToPx(pk), top, height }}
    />
  );

  // Barre de secteur (vert / rouge si fin de chantier)
  const SectorBar = ({ s, y }: { s: Secteur; y: number }) => {
    const color = s.fin ? "text-error" : "text-secondary";
    const bg = s.fin ? "bg-error/60" : "bg-secondary/60";
    const x = pkToPx(s.a);
    const w = pkToPx(s.b) - x;
    return (
      <div className="absolute" style={{ left: x, width: w, top: y }}>
        <div className={`h-px w-full ${bg}`} />
        <span
          className={`absolute left-1/2 -translate-x-1/2 -top-3 text-[8px] font-telemetry whitespace-nowrap ${color}`}
        >
          {s.label}
        </span>
      </div>
    );
  };

  // Boîte d'info supérieure (PCV / Gare / Base / Limite)
  const TopBox = ({
    name,
    pk,
    tone,
  }: {
    name: string;
    pk: number;
    tone: "pcv" | "gare" | "base" | "limite";
  }) => {
    const cls = {
      pcv: "border-outline-variant text-on-surface-variant",
      gare: "border-primary text-primary",
      base: "border-amber-500 text-amber-500 bg-amber-500/10",
      limite: "border-error text-error bg-error/10",
    }[tone];
    return (
      <>
        <Conn pk={pk} top={TOP_LABEL_Y + 22} height={V1_Y - (TOP_LABEL_Y + 22)} />
        <div
          className={`absolute -translate-x-1/2 px-1 py-px border bg-surface-container text-[7px] font-label-bold text-center leading-tight z-30 ${cls}`}
          style={{ left: pkToPx(pk), top: TOP_LABEL_Y, maxWidth: 110 }}
        >
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
          <span className="font-display-md text-[18px] font-bold text-primary-container">
            ◈ TCO — SFERIS RAIL
          </span>
          <div className="h-4 w-px bg-outline-variant"></div>
          <span className="text-label-bold font-telemetry text-on-surface-variant" id="system-clock">
            14:32:05
          </span>
          <span className="text-label-bold font-telemetry text-primary">
            LGV CASA — MARRAKECH
          </span>
          <span className="text-label-bold font-telemetry text-on-surface-variant opacity-60">
            OP. DURAND
          </span>
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
          <div className="p-unit-2 border-b border-outline-variant bg-surface-container-highest/20">
            <span className="font-label-bold text-[10px] text-primary block uppercase tracking-widest">Legend</span>
          </div>
          <div className="p-unit-2 flex flex-col gap-unit-1 text-[10px] text-on-surface-variant font-telemetry">
            <div className="flex items-center gap-unit-2"><span className="w-4 h-[2px] bg-[#5b8db8]"></span> Voie</div>
            <div className="flex items-center gap-unit-2"><span className="w-3 h-3 bg-black border border-white/70 inline-block" style={{ background: "linear-gradient(135deg,transparent 40%,#facc15 40%,#facc15 60%,transparent 60%)", backgroundColor: "#000" }}></span> Carré</div>
            <div className="flex items-center gap-unit-2"><span className="w-3 h-3 bg-black border border-white/80 flex items-center justify-center text-[6px] text-white font-bold">P</span> Poste</div>
            <div className="flex items-center gap-unit-2"><span className="w-4 h-[2px] bg-secondary/60"></span> Secteur</div>
            <div className="flex items-center gap-unit-2"><span className="w-4 h-[2px] bg-error/60"></span> Fin chantier</div>
            <div className="flex items-center gap-unit-2"><span className="w-3 h-[2px] bg-red-500 rotate-45"></span> Communication</div>
          </div>
          <div className="p-unit-2 border-y border-outline-variant bg-surface-container-highest/20 mt-unit-4">
            <span className="font-label-bold text-[10px] text-primary block uppercase tracking-widest">Admin</span>
          </div>
          <nav className="flex flex-col">
            <button className="flex flex-col items-center justify-center py-unit-3 border-b border-outline-variant hover:bg-surface-variant transition-colors group" onClick={() => toggleModal("add-train-modal")}>
              <span className="material-symbols-outlined text-primary group-hover:scale-110 transition-transform">add_circle</span>
              <span className="text-[9px] mt-1 font-label-bold text-on-surface-variant">AJOUTER TRAIN</span>
            </button>
            <button className="flex flex-col items-center justify-center py-unit-3 border-b border-outline-variant hover:bg-surface-variant transition-colors group">
              <span className="material-symbols-outlined text-on-surface-variant group-hover:text-primary">construction</span>
              <span className="text-[9px] mt-1 font-label-bold text-on-surface-variant">ZONES TRAVAUX</span>
            </button>
            <button className="flex flex-col items-center justify-center py-unit-3 border-b border-outline-variant hover:bg-surface-variant transition-colors group" onClick={toggleAuth} title="Autoriser / retirer la circulation du train">
              <span className="material-symbols-outlined text-secondary group-hover:scale-110 transition-transform">vpn_key</span>
              <span className="text-[9px] mt-1 font-label-bold text-on-surface-variant">AUTORISATIONS</span>
              <span id="auth-badge" className="text-[8px] font-label-bold text-error mt-px">NON AUTORISÉ</span>
            </button>
            <button className="flex flex-col items-center justify-center py-unit-3 border-b border-outline-variant hover:bg-surface-variant transition-colors group" onClick={() => toggleModal("postes-modal")}>
              <span className="material-symbols-outlined text-on-surface-variant group-hover:text-primary">hexagon</span>
              <span className="text-[9px] mt-1 font-label-bold text-on-surface-variant">GÉRER POSTES</span>
            </button>
          </nav>
          <div className="p-unit-2 border-y border-outline-variant bg-surface-container-highest/20 mt-auto">
            <span className="font-label-bold text-[10px] text-primary block uppercase tracking-widest">Filters</span>
          </div>
          <div className="p-unit-2 flex flex-col gap-unit-2 text-[10px] text-on-surface-variant font-telemetry">
            <label className="flex items-center gap-2 cursor-pointer"><input defaultChecked className="w-3 h-3 bg-background border-outline rounded-none text-primary focus:ring-0" type="checkbox" /> Secteurs</label>
            <label className="flex items-center gap-2 cursor-pointer"><input defaultChecked className="w-3 h-3 bg-background border-outline rounded-none text-primary focus:ring-0" type="checkbox" /> Trains</label>
            <label className="flex items-center gap-2 cursor-pointer"><input defaultChecked className="w-3 h-3 bg-background border-outline rounded-none text-primary focus:ring-0" type="checkbox" /> Postes</label>
          </div>
        </aside>

        {/* Center Canvas — schéma ligne continue */}
        <main className="ml-[140px] mr-[210px] flex-1 relative tco-grid overflow-hidden" id="tco-canvas">
          <div className="absolute inset-0 overflow-x-auto overflow-y-auto custom-scrollbar" id="sector-scroll">
            <div className="relative" style={{ width: TRACK_WIDTH, height: 380 }}>
              {/* CASABLANCA / MARRAKECH */}
              <span className="absolute font-display-md text-[13px] font-bold text-error -translate-y-1/2" style={{ left: 6, top: (V1_Y + V2_Y) / 2 }}>CASABLANCA</span>
              <span className="absolute font-display-md text-[13px] font-bold text-error -translate-y-1/2 -translate-x-full whitespace-nowrap" style={{ left: TRACK_WIDTH - 6, top: (V1_Y + V2_Y) / 2 }}>MARRAKECH</span>

              {/* Limites VCBT */}
              {LIMITS.map((l) => (
                <TopBox key={l.name} name={l.name} pk={l.pk} tone="limite" />
              ))}

              {/* PCV / Gares / Bases */}
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

              {/* Communications (croisements rouges) */}
              <svg className="absolute left-0 z-10 pointer-events-none" style={{ top: V1_Y, width: TRACK_WIDTH, height: V2_Y - V1_Y }} width={TRACK_WIDTH} height={V2_Y - V1_Y}>
                {JUNCTIONS.filter((j) => j.cross).map((j) => {
                  const x1 = pkToPx(j.carL);
                  const x2 = pkToPx(j.carR);
                  const mid = (x1 + x2) / 2;
                  const h = V2_Y - V1_Y;
                  return (
                    <g key={`x-${j.top}`} stroke="#ef4444" strokeWidth={1.2} fill="none">
                      <line x1={x1} y1={0} x2={mid} y2={h} />
                      <line x1={x2} y1={0} x2={mid} y2={h} />
                    </g>
                  );
                })}
              </svg>

              {/* Secteurs Voie 1 (sous la voie 1) */}
              {SECT_V1.map((s) => (
                <SectorBar key={s.label} s={s} y={V1_Y + 16} />
              ))}
              {/* Secteurs Voie 2 (au-dessus de la voie 2) */}
              {SECT_V2.map((s) => (
                <SectorBar key={s.label} s={s} y={V2_Y - 16} />
              ))}

              {/* Postes + signalisation par jonction */}
              {JUNCTIONS.map((j) => (
                <span key={`j-${j.top}`}>
                  {/* --- Voie 1 (haut) --- */}
                  <Annonce pk={j.annL} n={j.top} y={POSTE_TOP_Y + 4} />
                  <Conn pk={j.annL} top={POSTE_TOP_Y + 36} height={V1_Y - (POSTE_TOP_Y + 36)} />
                  <Carre pk={j.carL} y={POSTE_TOP_Y + 60} />
                  <Conn pk={j.carL} top={POSTE_TOP_Y + 80} height={V1_Y - (POSTE_TOP_Y + 80)} />
                  <PosteBox n={j.top} pk={(j.carL + j.carR) / 2} y={POSTE_TOP_Y} />
                  <Carre pk={j.carR} y={POSTE_TOP_Y + 60} />
                  <Conn pk={j.carR} top={POSTE_TOP_Y + 80} height={V1_Y - (POSTE_TOP_Y + 80)} />
                  <Annonce pk={j.annR} n={j.top} y={POSTE_TOP_Y + 4} />
                  <Conn pk={j.annR} top={POSTE_TOP_Y + 36} height={V1_Y - (POSTE_TOP_Y + 36)} />

                  {/* --- Voie 2 (bas) --- */}
                  <Conn pk={j.annL} top={V2_Y} height={POSTE_BOT_Y - V2_Y} />
                  <Annonce pk={j.annL} n={j.bot} y={POSTE_BOT_Y} />
                  <Conn pk={j.carL} top={V2_Y} height={POSTE_BOT_Y - V2_Y - 4} />
                  <Carre pk={j.carL} y={POSTE_BOT_Y - 4} />
                  <PosteBox n={j.bot} pk={(j.carL + j.carR) / 2} y={POSTE_BOT_Y} />
                  <Conn pk={j.carR} top={V2_Y} height={POSTE_BOT_Y - V2_Y - 4} />
                  <Carre pk={j.carR} y={POSTE_BOT_Y - 4} />
                  <Conn pk={j.annR} top={V2_Y} height={POSTE_BOT_Y - V2_Y} />
                  <Annonce pk={j.annR} n={j.bot} y={POSTE_BOT_Y} />

                  {/* PK labels (entre-voie) */}
                  {[j.annL, j.carL, j.carR, j.annR].map((p, k) => (
                    <span key={`pk-${j.top}-${k}`} className="absolute text-[8px] font-telemetry text-on-surface whitespace-nowrap -translate-x-1/2 z-20" style={{ left: pkToPx(p), top: (V1_Y + V2_Y) / 2 + (k % 2 ? 8 : -4) }}>
                      {fmtPK(p)}
                    </span>
                  ))}
                </span>
              ))}

              {/* Train TTx-01 (Voie 1) — immobile tant que non autorisé */}
              <div className="absolute -translate-y-1/2 z-30 flex items-center group cursor-pointer transition-[left] duration-100" id="train-ttx01" style={{ left: pkToPx(CASA), top: V1_Y }}>
                <div className="flex flex-col items-center -mt-12 mr-2">
                  <div className="bg-surface-container-highest px-1 border border-outline-variant text-[9px] font-telemetry whitespace-nowrap">
                    <span className="text-primary">TTx-01</span> | <span id="train-speed-val">40km/h</span>
                  </div>
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
            <div className="bg-surface-container p-unit-2 flex flex-col"><span className="text-[9px] font-label-bold text-on-surface-variant opacity-60">TRAINS ACTIFS</span><span className="text-headline font-telemetry text-primary">03</span></div>
            <div className="bg-surface-container p-unit-2 flex flex-col"><span className="text-[9px] font-label-bold text-on-surface-variant opacity-60">SECTEURS</span><span className="text-headline font-telemetry text-secondary">16</span></div>
            <div className="bg-surface-container p-unit-2 flex flex-col"><span className="text-[9px] font-label-bold text-on-surface-variant opacity-60">POSTES</span><span className="text-headline font-telemetry text-amber-500">14</span></div>
            <div className="bg-surface-container p-unit-2 flex flex-col"><span className="text-[9px] font-label-bold text-on-surface-variant opacity-60">PCV / GARES</span><span className="text-headline font-telemetry text-on-surface-variant">08</span></div>
          </div>

          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="p-unit-2 bg-surface-container-high border-b border-outline-variant"><span className="text-[10px] font-label-bold text-on-surface">UNITÉS EN MOUVEMENT</span></div>
            <div className="flex-1 overflow-y-auto custom-scrollbar p-unit-2 space-y-unit-2">
              <div className="p-unit-2 bg-surface-container-low border border-outline-variant hover:border-primary cursor-pointer transition-all" id="card-ttx01">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-[11px] font-bold text-primary">TTx-01</span>
                  <span className="text-[8px] px-1 bg-red-600 text-white border border-outline-variant" id="status-ttx01">ARRÊT</span>
                </div>
                <div className="grid grid-cols-2 text-[9px] font-telemetry text-on-surface-variant">
                  <span>V1 @ <span id="card-speed-ttx01">40</span>km/h</span>
                  <span className="text-right" id="card-pk-ttx01">PK {fmtPK(CASA)}</span>
                </div>
              </div>
              <div className="p-unit-2 bg-surface-container-low border border-outline-variant opacity-60">
                <div className="flex justify-between items-center mb-1"><span className="text-[11px] font-bold text-sky-400">MAT-88</span><span className="text-[8px] px-1 bg-on-surface-variant/10 text-on-surface-variant border border-outline-variant">GARÉ</span></div>
                <div className="grid grid-cols-2 text-[9px] font-telemetry text-on-surface-variant"><span>V2 @ 0km/h</span><span className="text-right">PK 483+250</span></div>
              </div>
            </div>
          </div>

          <div className="h-1/3 border-t border-outline-variant bg-surface-container-lowest flex flex-col">
            <div className="p-1 px-2 bg-surface-container-high border-b border-outline-variant"><span className="text-[9px] font-label-bold text-on-surface-variant">LOG ÉVÉNEMENTS</span></div>
            <div className="flex-1 overflow-y-auto font-telemetry text-[10px] p-2 space-y-1 text-on-surface-variant/80 custom-scrollbar" id="event-log">
              <div>14:30:01 [SYS] Connexion OP. DURAND</div>
              <div>14:31:12 [GPS] TTx-01 Signal Lock: OK</div>
              <div>14:32:00 [INFO] TTx-01 stationné CASABLANCA</div>
            </div>
          </div>
        </aside>
      </div>

      {/* Footer */}
      <footer className="fixed bottom-0 w-full h-[30px] z-50 flex items-center bg-surface-dim border-t border-outline-variant">
        <div className="w-[140px] flex items-center justify-center border-r border-outline-variant h-full">
          <span className="text-error font-telemetry text-[10px] font-bold">MODE: OPÉRATION</span>
        </div>
        <div className="flex-1 flex items-center px-unit-4 gap-unit-8">
          <div className="flex items-center gap-unit-3">
            <span className="text-[9px] font-label-bold text-on-surface-variant">T1 SPD</span>
            <input className="w-24" id="speed-slider" max="120" min="0" type="range" defaultValue="40" onChange={handleSlider} />
          </div>
          <div className="h-4 w-px bg-outline-variant"></div>
          <button className="px-2 h-5 bg-secondary-container text-on-secondary-container border border-outline-variant text-[9px] font-label-bold hover:opacity-90 transition" onClick={toggleAuth}>AUTORISER ▸</button>
          <div className="flex gap-unit-2">
            <button className="px-2 h-5 bg-surface-variant border border-outline-variant text-[9px] font-label-bold hover:bg-primary-container hover:text-on-primary-container transition-colors" id="pause-btn" onClick={handlePause}>PAUSE</button>
            <button className="px-2 h-5 bg-surface-variant border border-outline-variant text-[9px] font-label-bold hover:bg-error-container hover:text-on-error-container transition-colors" onClick={resetSimulation}>RESET</button>
          </div>
        </div>
        <div className="w-[300px] bg-red-900 border-l border-outline-variant h-full flex items-center px-unit-3 transition-colors duration-300" id="alert-bar">
          <span className="text-[10px] font-label-bold text-white tracking-tight" id="alert-text">⛔ CIRCULATION NON AUTORISÉE</span>
        </div>
      </footer>

      {/* Modal GÉRER POSTES — toutes les valeurs du schéma */}
      <div className="fixed inset-0 z-[100] bg-background/80 backdrop-blur-sm hidden items-center justify-center" id="postes-modal">
        <div className="bg-[#0d1e30] border border-outline-variant w-[640px] max-h-[80vh] flex flex-col p-unit-6 shadow-2xl">
          <div className="flex justify-between items-center mb-unit-4 border-b border-outline-variant pb-2">
            <h3 className="text-primary font-display-md text-[16px]">POSTES & SECTEURS — VALEURS SCHÉMA</h3>
            <button className="material-symbols-outlined text-on-surface-variant hover:text-error" onClick={() => toggleModal("postes-modal")}>close</button>
          </div>
          <div className="overflow-y-auto custom-scrollbar">
            <table className="w-full text-[10px] font-telemetry text-on-surface-variant">
              <thead className="text-primary sticky top-0 bg-[#0d1e30]">
                <tr className="text-left border-b border-outline-variant">
                  <th className="py-1 pr-2">Poste</th><th className="pr-2">Voie</th>
                  <th className="pr-2">Annonce G</th><th className="pr-2">Carré G</th>
                  <th className="pr-2">Carré D</th><th className="pr-2">Annonce D</th>
                  <th className="pr-2">PCV / Gare</th>
                </tr>
              </thead>
              <tbody>
                {JUNCTIONS.map((j) => (
                  <tr key={`r-${j.top}`} className="border-b border-outline-variant/30">
                    <td className="py-1 pr-2 text-error font-bold">P{j.top} / P{j.bot}</td>
                    <td className="pr-2">V1 / V2</td>
                    <td className="pr-2">{fmtPK(j.annL)}</td>
                    <td className="pr-2">{fmtPK(j.carL)}</td>
                    <td className="pr-2">{fmtPK(j.carR)}</td>
                    <td className="pr-2">{fmtPK(j.annR)}</td>
                    <td className="pr-2 text-[9px]">
                      {j.pcv ? `${j.pcv.name} (${fmtPK(j.pcv.pk)})` : ""}
                      {j.gare ? ` · ${j.gare.name} (${fmtPK(j.gare.pk)})` : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-unit-4 grid grid-cols-2 gap-unit-2 text-[10px] font-telemetry">
              <div>
                <div className="text-primary font-label-bold mb-1">SECTEURS VOIE 1</div>
                {SECT_V1.map((s) => (
                  <div key={s.label} className={s.fin ? "text-error" : "text-secondary"}>
                    {s.label} · {fmtPK(s.a)} → {fmtPK(s.b)}
                  </div>
                ))}
              </div>
              <div>
                <div className="text-primary font-label-bold mb-1">SECTEURS VOIE 2</div>
                {SECT_V2.map((s) => (
                  <div key={s.label} className={s.fin ? "text-error" : "text-secondary"}>
                    {s.label} · {fmtPK(s.a)} → {fmtPK(s.b)}
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-unit-4 text-[10px] font-telemetry text-on-surface-variant">
              <div className="text-primary font-label-bold mb-1">LIMITES</div>
              {LIMITS.map((l) => (
                <div key={l.name} className="text-error">{l.name} · {fmtPK(l.pk)}</div>
              ))}
            </div>
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
            <div>
              <label className="block text-[10px] font-label-bold text-on-surface-variant mb-1">ID DU TRAIN</label>
              <input className="w-full bg-background border border-outline-variant text-primary font-telemetry p-2 focus:ring-1 focus:ring-primary outline-none" placeholder="TTx-00" type="text" />
            </div>
            <div>
              <label className="block text-[10px] font-label-bold text-on-surface-variant mb-1">VOIE INITIALE</label>
              <select className="w-full bg-background border border-outline-variant text-on-surface font-telemetry p-2 outline-none">
                <option>VOIE 1 (V1)</option>
                <option>VOIE 2 (V2)</option>
              </select>
            </div>
            <button className="w-full bg-primary-container text-on-primary-container font-label-bold py-2 mt-4 hover:opacity-90 active:scale-[0.98] transition-all">INITIALISER SUR TCO</button>
          </div>
        </div>
      </div>
    </>
  );
}
