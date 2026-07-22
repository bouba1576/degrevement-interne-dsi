/* ====================================================================
   PGD — Primitives UI partagées
   ==================================================================== */
const { useState, useEffect, useRef, useMemo, createContext, useContext } = React;
const E = window.PGD_ENGINE;
const DATA = window.PGD_DATA;

/* ----------------------- Icônes (SVG, trait) ----------------------- */
const ICONS = {
  home: "M3 11.5 12 4l9 7.5M5 10v10h5v-6h4v6h5V10",
  doc: "M6 2h8l4 4v16H6zM14 2v4h4",
  plus: "M12 5v14M5 12h14",
  inbox: "M3 13h5l2 3h4l2-3h5M3 13l3-9h12l3 9v6H3z",
  check: "M4 12l5 5L20 6",
  x: "M6 6l12 12M18 6L6 18",
  chart: "M4 20V4M4 20h16M8 16v-5M13 16V8M18 16v-9",
  shield: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z",
  gear: "M12 9a3 3 0 100 6 3 3 0 000-6zM19 12l2-1-1-3-2 .5a7 7 0 00-1.4-1.4L17 4l-3-1-1 2a7 7 0 00-2 0L10 3 7 4l.4 2.1A7 7 0 006 7.5L4 7 3 10l2 1a7 7 0 000 2l-2 1 1 3 2.1-.5A7 7 0 008 19l1 2 3-1 1-2a7 7 0 002 0l1 2 3-1-.5-2.1A7 7 0 0019 14z",
  bell: "M6 9a6 6 0 1112 0c0 4 1.5 5 2 6H4c.5-1 2-2 2-6zM10 20a2 2 0 004 0",
  clock: "M12 7v5l3 2M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  user: "M12 12a4 4 0 100-8 4 4 0 000 8zM4 21c0-4 4-6 8-6s8 2 8 6",
  users: "M9 11a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM2 20c0-3.3 3-5 7-5s7 1.7 7 5M17 11a3 3 0 000-6M22 20c0-2.6-1.7-4.2-4-4.7",
  lock: "M6 10V8a6 6 0 1112 0v2M5 10h14v10H5zM12 14v3",
  unlock: "M7 10V8a5 5 0 019.6-2M5 10h14v10H5z",
  search: "M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.3-4.3",
  filter: "M3 5h18l-7 8v6l-4-2v-4z",
  download: "M12 3v12m0 0l-4-4m4 4l4-4M4 19h16",
  arrowRight: "M5 12h14M13 6l6 6-6 6",
  arrowLeft: "M19 12H5M11 6l-6 6 6 6",
  paperclip: "M21 11l-9 9a5 5 0 01-7-7l9-9a3.5 3.5 0 015 5l-9 9a2 2 0 01-3-3l8-8",
  send: "M22 2L11 13M22 2l-7 20-4-9-9-4z",
  flag: "M5 21V4m0 0h11l-2 4 2 4H5",
  alert: "M12 3l9 16H3zM12 10v4M12 17v.5",
  info: "M12 21a9 9 0 100-18 9 9 0 000 18zM12 11v5M12 8v.5",
  eye: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 100-6 3 3 0 000 6z",
  edit: "M4 20h4L19 9l-4-4L4 16zM14 6l4 4",
  dots: "M5 12h.01M12 12h.01M19 12h.01",
  logout: "M15 4h4v16h-4M10 12h9m0 0l-4-4m4 4l-4 4",
  calc: "M6 3h12v18H6zM9 7h6M8 11h.5M12 11h.5M16 11h.5M8 14h.5M12 14h.5M16 14h.5M8 17h4",
  scale: "M12 3v18M7 7h10M5 7l-2 6h4zM19 7l-2 6h4zM3 13a2 2 0 004 0M17 13a2 2 0 004 0M8 21h8",
  trash: "M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13",
  refresh: "M4 12a8 8 0 0114-5l2 2M20 12a8 8 0 01-14 5l-2-2M18 4v5h-5M6 20v-5h5",
  chevronD: "M6 9l6 6 6-6",
  chevronR: "M9 6l6 6-6 6",
  building: "M4 21V5l8-2 8 2v16M9 9h.5M9 13h.5M9 17h.5M14.5 9h.5M14.5 13h.5M14.5 17h.5",
  layers: "M12 3l9 5-9 5-9-5zM3 13l9 5 9-5M3 17l9 5 9-5",
  delegate: "M7 8a3 3 0 100-6 3 3 0 000 6zM2 20c0-3 2.5-5 5-5M14 12h7m0 0l-3-3m3 3l-3 3M14 19h7",
  flow: "M5 5h6v4H5zM13 15h6v4h-6zM8 9v3h8M8 12v3",
};
function Icon({ name, size = 18, color, style, stroke = 2, className }) {
  const d = ICONS[name] || ICONS.doc;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color || "currentColor"} strokeWidth={stroke} strokeLinecap="round"
      strokeLinejoin="round" style={style} className={className}>
      {d.split("M").filter(Boolean).map((seg, i) => <path key={i} d={"M" + seg} />)}
    </svg>
  );
}

/* ----------------------- Logo (logo officiel Orange, fallback placeholder) ----------------------- */
function BrandMark({ size }) {
  const [src, setSrc] = useState(undefined);
  useEffect(() => {
    const url = (window.__resources && window.__resources.logo) || "logo-orange.png";
    const img = new Image();
    img.onload = () => setSrc(url);
    img.onerror = () => setSrc(null);
    img.src = url;
  }, []);
  const st = size ? { width: size, height: size } : null;
  if (src) return <div className="brand-mark" style={{ ...st, background: "transparent", padding: 0 }}><img src={src} alt="Orange Côte d'Ivoire" /></div>;
  return <div className="brand-mark" style={st}>{src === undefined ? "" : "OCI"}</div>;
}

/* ----------------------- Badges ----------------------- */
function StatusBadge({ statut, sm }) {
  const s = E.STATUTS[statut] || { label: statut, cls: "b-grey" };
  return <span className={"badge " + s.cls} style={sm ? { fontSize: 11, padding: "2px 7px" } : null}>
    <span className="dot" style={{ background: "currentColor" }} />{s.label}
  </span>;
}
function CircuitPill({ code }) {
  const c = DATA.CIRCUITS[code];
  return <span className={"pill-circuit " + (c?.couleur || "pc-dxc")}>{code}</span>;
}
function Badge({ children, cls = "b-grey", dot }) {
  return <span className={"badge " + cls}>{dot && <span className="dot" style={{ background: "currentColor" }} />}{children}</span>;
}
function TypeActeurBadge({ type }) {
  const map = { V: ["Vérification", "b-blue"], A: ["Validation", "b-orange"], C: ["Contrôle", "b-purple"] };
  const [l, c] = map[type] || ["—", "b-grey"];
  return <span className={"badge " + c}>{l}</span>;
}

/* ----------------------- Avatar ----------------------- */
function Avatar({ user, size = 32 }) {
  if (!user) return null;
  return <div className="avatar" style={{ background: user.couleur, width: size, height: size, fontSize: size * 0.38 }}>
    {user.initiales}
  </div>;
}

/* ----------------------- Money ----------------------- */
function Money({ v, strong, className }) {
  return <span className={"mono " + (className || "")} style={strong ? { fontWeight: 700 } : null}>{E.fmtMoney(v)}</span>;
}

/* ----------------------- Stepper de workflow ----------------------- */
function WorkflowStepper({ dossier }) {
  const taches = dossier.taches || [];
  return (
    <div className="stepper">
      {taches.map((t, i) => {
        let cls = "wait", label = "En attente";
        if (t.etat === "APPROUVEE" || t.etat === "VERIFIEE") { cls = "done"; label = (t.type === "V" ? "Vérifié" : "Approuvé"); }
        else if (t.etat === "REJETEE") { cls = "rejected"; label = "Rejeté"; }
        else if (t.etat === "ESCALADEE") { cls = "done"; label = "Escaladée → N+1"; }
        else if (t.etat === "EN_CORBEILLE" || t.etat === "RECLAMEE") { cls = "current"; label = t.etat === "RECLAMEE" ? "En traitement" : "En corbeille"; }
        const r = DATA.roleByCode[t.role];
        const retard = E.isEnRetard(t);
        return (
          <div className="step" key={t.id}>
            <div className="step-rail">
              <div className={"step-dot " + cls}>
                {cls === "done" ? <Icon name="check" size={14} stroke={3} /> :
                 cls === "rejected" ? <Icon name="x" size={14} stroke={3} /> :
                 t.etat === "ESCALADEE" ? <Icon name="arrowRight" size={14} stroke={3} /> : (i + 1)}
              </div>
              {i < taches.length - 1 && <div className={"step-line " + (cls === "done" ? "done" : "")} />}
            </div>
            <div className="step-body">
              <div className="row gap-8" style={{ flexWrap: "wrap" }}>
                <span className="t">{r?.libelle || t.role}</span>
                <TypeActeurBadge type={t.type} />
                {retard && <Badge cls="b-red" dot>SLA dépassé</Badge>}
              </div>
              <div className="s">
                {label}
                {t.acteurNom && ` · ${t.acteurNom}`}
                {t.dateAction && ` · ${E.fmtDateTime(t.dateAction)}`}
                {t.agentClaim && !t.dateAction && ` · récupéré par ${DATA.userById[t.agentClaim]?.nom}`}
                {!t.acteurNom && (t.etat === "EN_CORBEILLE" || t.etat === "RECLAMEE") && ` · SLA ${E.fmtDuree(t.sla)}`}
              </div>
              {t.commentaire && t.etat === "REJETEE" &&
                <div className="alert alert-red" style={{ marginTop: 8, whiteSpace: "pre-line" }}><Icon name="alert" size={15} />{t.commentaire}</div>}
              {t.revue && t.revue.length > 0 && (t.etat === "APPROUVEE" || t.etat === "VERIFIEE" || t.etat === "REJETEE") && (
                <div style={{ marginTop: 8 }}>
                  <div className="row gap-6" style={{ flexWrap: "wrap" }}>
                    <Badge cls="b-green" dot>{t.revue.filter(r => r.verdict === "ok").length} validé(s)</Badge>
                    {t.revue.some(r => r.verdict === "ko") && <Badge cls="b-red" dot>{t.revue.filter(r => r.verdict === "ko").length} invalide(s)</Badge>}
                  </div>
                  {t.revue.filter(r => r.verdict === "ko").map((r, k) => (
                    <div key={k} className="tiny" style={{ marginTop: 4, color: "var(--red-700)" }}>
                      <b>{r.champ} :</b> {r.commentaire}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })}
      {dossier.controles && dossier.controles.length > 0 && (
        <div className="step">
          <div className="step-rail"><div className="step-dot wait"><Icon name="shield" size={13} /></div></div>
          <div className="step-body">
            <div className="row gap-8" style={{ flexWrap: "wrap" }}>
              <span className="t">Contrôle a posteriori</span><TypeActeurBadge type="C" />
            </div>
            <div className="s">{dossier.controles.map(c => DATA.roleByCode[c.role]?.libelle + (c.etat === "FAIT" ? " ✓" : "")).join(" · ")} — hors chemin bloquant</div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ----------------------- Modal ----------------------- */
function Modal({ title, icon, onClose, children, footer, lg }) {
  useEffect(() => {
    const h = (e) => { if (e.key === "Escape") onClose && onClose(); };
    window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  return (
    <div className="overlay" onClick={onClose}>
      <div className={"modal" + (lg ? " lg" : "")} onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          {icon && <Icon name={icon} size={20} />}
          <h3>{title}</h3>
          <div className="spacer" />
          <button className="iconbtn" onClick={onClose}><Icon name="x" size={16} /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

/* ----------------------- Toasts ----------------------- */
const ToastCtx = createContext(null);
function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const push = (t) => {
    const id = Math.random().toString(36).slice(2);
    setToasts(ts => [...ts, { ...t, id }]);
    setTimeout(() => setToasts(ts => ts.filter(x => x.id !== id)), t.duration || 3800);
  };
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toast-wrap">
        {toasts.map(t => {
          const ic = { success: "check", error: "x", info: "info", warn: "alert" }[t.type] || "info";
          return <div className={"toast " + (t.type || "info")} key={t.id}>
            <Icon name={ic} size={18} />
            <div><b>{t.title}</b>{t.msg && <span className="tmsg">{t.msg}</span>}</div>
          </div>;
        })}
      </div>
    </ToastCtx.Provider>
  );
}
const useToast = () => useContext(ToastCtx);

/* ----------------------- Champs ----------------------- */
function Field({ label, req, hint, error, children }) {
  return (
    <div className="field">
      {label && <label>{label} {req && <span className="req">*</span>}</label>}
      {children}
      {error ? <span className="field-err">{error}</span> : hint ? <span className="hint">{hint}</span> : null}
    </div>
  );
}

/* ----------------------- Empty state ----------------------- */
function Empty({ icon = "inbox", title, children }) {
  return <div className="empty"><div className="ic"><Icon name={icon} size={44} /></div>
    <h4>{title}</h4><div>{children}</div></div>;
}

/* ----------------------- Mini bar chart ----------------------- */
function BarChart({ data, fmt }) {
  const max = Math.max(...data.map(d => d.value), 1);
  return <div className="bars">
    {data.map((d, i) => <div className="bar" key={i}>
      <span className="val">{fmt ? fmt(d.value) : d.value}</span>
      <div className="col-fill" style={{ height: `${(d.value / max) * 100}%`, background: d.color || "var(--orange)" }} />
      <span className="lbl">{d.label}</span>
    </div>)}
  </div>;
}

/* ----------------------- Donut (SVG) ----------------------- */
function Donut({ segments, size = 130, total }) {
  const sum = (total != null ? total : segments.reduce((a, s) => a + s.value, 0)) || 1;
  const r = size / 2 - 14, cx = size / 2, cy = size / 2, C = 2 * Math.PI * r;
  let offset = 0;
  return <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
    <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--g100)" strokeWidth="16" />
    {segments.map((s, i) => {
      const frac = s.value / sum, len = frac * C;
      const el = <circle key={i} cx={cx} cy={cy} r={r} fill="none" stroke={s.color} strokeWidth="16"
        strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-offset}
        transform={`rotate(-90 ${cx} ${cy})`} strokeLinecap="butt" />;
      offset += len; return el;
    })}
    <text x={cx} y={cy - 2} textAnchor="middle" fontSize="22" fontWeight="800" fill="#0a0a0a">{sum}</text>
    <text x={cx} y={cy + 15} textAnchor="middle" fontSize="10" fill="var(--g600)">dossiers</text>
  </svg>;
}

/* ----------------------- Minuteur SLA (compte à rebours) ----------------------- */
function SlaTimer({ task, compact }) {
  const [, tick] = useState(0);
  useEffect(() => { const iv = setInterval(() => tick(x => x + 1), 1000); return () => clearInterval(iv); }, []);
  const ref = task.dateClaim || task.dateEnCorbeille;
  if (!ref) return null;
  const deadline = E.echeanceSla(ref, task.sla);
  const remMs = deadline - Date.now();
  const late = remMs <= 0;
  const abs = Math.abs(remMs);
  const j = Math.floor(abs / 86400000), h = Math.floor((abs % 86400000) / 3600000), m = Math.floor((abs % 3600000) / 60000), s = Math.floor((abs % 60000) / 1000);
  const txt = (j > 0 ? j + "j " : "") + String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
  const warn = !late && remMs < 4 * 3600000; // < 4h restantes
  const color = late ? "var(--red)" : warn ? "var(--yellow-700)" : "var(--green-700)";
  const bg = late ? "var(--red-bg)" : warn ? "var(--yellow-bg)" : "var(--green-bg)";
  if (compact) return <span className="badge" style={{ background: bg, color }}><Icon name="clock" size={12} /> {late ? "Dépassé +" : ""}{txt}</span>;
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 10, padding: "8px 14px", borderRadius: 8, background: bg, border: "1px solid " + color + "44" }}>
      <Icon name="clock" size={18} color={color} />
      <div style={{ lineHeight: 1.1 }}>
        <div className="mono" style={{ fontSize: 18, fontWeight: 800, color }}>{txt}</div>
        <div className="tiny" style={{ color, opacity: .85 }}>{late ? "SLA dépassé" : "restant (heures ouvrées) · échéance " + E.fmtDateTime(deadline)}</div>
      </div>
    </div>
  );
}

Object.assign(window, {
  Icon, BrandMark, StatusBadge, CircuitPill, Badge, TypeActeurBadge, Avatar, Money,
  WorkflowStepper, Modal, ToastProvider, useToast, Field, Empty, BarChart, Donut, SlaTimer,
});
