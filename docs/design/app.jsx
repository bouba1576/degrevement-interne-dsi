/* ====================================================================
   PGD — Application : store global, navigation RBAC, bascule de rôle
   ==================================================================== */
const { useState: uSA, useEffect: uEA, useMemo: uMA, useRef: uRA } = React;
const EA = window.PGD_ENGINE, DA = window.PGD_DATA;

const StoreCtx = React.createContext(null);
window.useStore = () => React.useContext(StoreCtx);

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "accent": "#FF7900",
  "sidebar": "#000000",
  "density": "regular"
}/*EDITMODE-END*/;

function darken(hex, amt = 0.14) {
  const h = hex.replace("#", "");
  let r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  r = Math.round(r * (1 - amt)); g = Math.round(g * (1 - amt)); b = Math.round(b * (1 - amt));
  return "#" + [r, g, b].map(x => x.toString(16).padStart(2, "0")).join("");
}

function App() {
  const [tw, setTweak] = useTweaks(TWEAK_DEFAULTS);
  uEA(() => {
    const root = document.documentElement;
    root.style.setProperty("--orange", tw.accent);
    root.style.setProperty("--orange-600", darken(tw.accent, 0.16));
    root.style.setProperty("--sidebar-bg", tw.sidebar);
    document.body.classList.toggle("dense", tw.density === "compact");
  }, [tw]);

  const [dossiers, setDossiers] = uSA(() => window.PGD_SEED());
  const [userId, setUserId] = uSA(null);          // null = non authentifié
  const [route, setRoute] = uSA("home");
  const [param, setParam] = uSA(null);
  const [notifOpen, setNotifOpen] = uSA(false);
  const [roleMenuOpen, setRoleMenuOpen] = uSA(false);
  const [mfaPending, setMfaPending] = uSA(null);   // user en attente de 2FA (bascule)
  const tick = uRA(0);

  // ---- moteur automatique en temps réel (expiration verrou + escalade SLA) ----
  // Placé AVANT la gate d'authentification pour respecter les règles des Hooks.
  uEA(() => {
    const iv = setInterval(() => {
      const evts = EA.runAutoEngine(dossiers, Date.now());
      if (evts.length) setDossiers(d => [...d]);
    }, 20000);
    return () => clearInterval(iv);
  }, [dossiers]);

  // ---- gate d'authentification ----
  if (!userId) return <LoginScreen onAuthenticated={(id) => { setUserId(id); go(DA.defaultRouteFor(DA.userById[id])); }} />;

  const user = DA.userById[userId];
  const touch = () => setDossiers(d => [...d]);

  // ---- bascule de rôle (avec re-challenge 2FA si rôle sensible) ----
  function switchTo(id) {
    const target = DA.userById[id];
    setRoleMenuOpen(false);
    if (id !== userId && DA.requiresMfa(target)) { setMfaPending(target); return; }
    setUserId(id); go(DA.defaultRouteFor(target));
  }
  function logout() { window.PGD_SECLOG && window.secLog && window.secLog({ login: user.login, nom: user.nom, type: "Déconnexion", ok: true }); setUserId(null); setRoute("home"); }

  // ---- navigation ----
  function go(r, p) {
    if (r === "detail") { /* mémorise l'origine */ }
    setRoute(r); setParam(p || null); setNotifOpen(false);
    window.scrollTo(0, 0);
  }

  // ---- tâches pour l'utilisateur courant ----
  function tasksForUser(u) {
    const res = [];
    dossiers.forEach(d => (d.taches || []).forEach(t => {
      const inRole = u.roles.includes(t.role);
      if (inRole && t.etat === "EN_CORBEILLE") res.push({ d, t });
      else if (t.etat === "RECLAMEE" && t.agentClaim === u.id) res.push({ d, t });
    }));
    return res;
  }

  // ---- actions workflow ----
  const store = {
    dossiers, user, route, param, go, tasksForUser,
    get back() { return _backRef.current; },
    set back(v) { _backRef.current = v; },
    createAndSubmit(input) {
      const d = EA.createDossier(input);
      EA.submit(d, input.createdByName, Date.now());
      setDossiers(arr => [d, ...arr]);
      return d;
    },
    claim(did, tid) { const d = find(did); EA.claim(d, tid, user); touch(); },
    unclaim(did, tid) { const d = find(did); EA.unclaim(d, tid, user); touch(); },
    approve(did, tid, c, revue) { const d = find(did); const r = EA.approve(d, tid, user, c, revue); if (r.ok) touch(); return r; },
    reject(did, tid, m, revue) { const d = find(did); const r = EA.reject(d, tid, user, m, revue); if (r.ok) touch(); return r; },
    delegate(did, tid, to, note) { const d = find(did); const r = EA.delegate(d, tid, user, to, note); touch(); return r; },
    abandon(did, m) { const d = find(did); const r = EA.abandon(d, user, m); if (r.ok) touch(); return r; },
    modifyResubmit(did, changes) { const d = find(did); const r = EA.modifyResubmit(d, user, changes); touch(); return r; },
    controler(did, cid, constat, conforme) { const d = find(did); EA.controler(d, cid, user, constat, conforme); touch(); },
    escalader(did, tid, motif) { const d = find(did); const r = EA.escalader(d, tid, user, motif); if (r.ok) touch(); return r; },
    advanceTime(hours) { const evts = EA.advanceTime(dossiers, hours); touch(); return evts; },
    relancer(did) { const d = find(did); const r = EA.relancer(d, user); touch(); return r; },
    reaffecter(did, role, note) { const d = find(did); const r = EA.reaffecter(d, role, user, note); if (r.ok) touch(); return r; },
    debloquer(did) { const d = find(did); const r = EA.debloquer(d, user); if (r.ok) touch(); return r; },
    rappeler(did) { const d = find(did); const r = EA.rappeler(d, user); if (r.ok) touch(); return r; },
    publipostage(did) { const d = find(did); const r = EA.publipostage(d, user); touch(); return r; },
    archiver(did) { const d = find(did); const r = EA.archiver(d, user); touch(); return r; },
    createMasseAndSubmit(input) { const d = EA.createDossierMasse(input); EA.submit(d, input.createdByName, Date.now()); setDossiers(arr => [d, ...arr]); return d; },
    importFromCRM() {
      const samples = [
        { circuit: "DXC", motif: "Réclamation client", client: DA.CLIENTS_DXC[1], ht: 95000, libelle: "Réclamation importée du CRM — hors-forfait" },
        { circuit: "DOBB", motif: "Contestation de facture", client: DA.CLIENTS_DOBB[2], ht: 1250000, libelle: "Réclamation CRM — standard IP" },
      ];
      const s = samples[Math.floor(Math.random() * samples.length)];
      const d = EA.createDossier({ ...s, agent: user.nom, matricule: "M-2041", contactClient: "Importé via CRM", createdBy: user.id, createdByName: user.nom });
      EA.logAudit(d, "Adaptateur CRM", "Import CRM", "Réclamation récupérée via l'API CRM (bouchon)", Date.now());
      setDossiers(arr => [d, ...arr]);
      return d;
    },
    exportDossier(d) { exportCSV(`${d.ref}.csv`, dossierToRows(d)); },
    exportDossierXLS(d) { exportXLS(`${d.ref}.xls`, dossierToRows(d), d.ref); },
    exportPDF(d) { exportDossierPDF(d); },
    exportAudit(rows) { exportCSV(`journal_audit.csv`, auditToRows(rows)); },
    exportAuditXLS(rows) { exportXLS(`journal_audit.xls`, auditToRows(rows), "Journal"); },
  };
  function find(id) { return dossiers.find(x => x.id === id); }

  const myTasks = tasksForUser(user);
  // Alertes initiateur : dossiers que j'ai créés et qui ont été rejetés par un valideur
  const myAlerts = dossiers.filter(d => (d.createdBy === user.id || d.createdByName === user.nom) && d.statut === "rejete");

  // ---- titres de page ----
  const titles = {
    home: ["Tableau de bord", "Plateforme de Gestion des Dégrèvements"],
    nouvelle: ["Nouvelle demande", "Saisie d'une fiche d'ajustement"],
    masse: ["Ajustement en masse", "Traitement multi-lignes"],
    mes: ["Mes demandes", "Suivi de mes dossiers"],
    corbeilles: ["Corbeilles", "Tâches à traiter"],
    detail: ["Dossier", "Détail & suivi"],
    dashboard: ["Tableau de bord", "Pilotage & KPI"],
    controle: ["Contrôle", "Contrôle a posteriori"],
    consultation: ["Consultation", "Recherche & filtres multicritères"],
    admin: ["Administration", "Configuration du moteur"],
    integrations: ["Intégrations", "Adaptateurs systèmes externes"],
    modules: ["Modules", "Extensibilité de la plateforme"],
    audit: ["Journal d'audit", "Traçabilité"],
  };
  const [tTitle, tSub] = titles[route] || titles.home;

  return (
    <StoreCtx.Provider value={store}>
      <div className="app">
        <Sidebar route={route} go={go} user={user} myTasks={myTasks} dossiers={dossiers} />
        <div className="main">
          <div className="topbar">
            <div><h1>{tTitle}</h1></div>
            <span className="sub">· {tSub}</span>
            <div className="topbar-spacer" />

            {/* notifications */}
            <div style={{ position: "relative" }}>
              <button className="iconbtn" onClick={() => setNotifOpen(o => !o)} style={{ position: "relative" }}>
                <Icon name="bell" size={18} />
                {(myTasks.length + myAlerts.length) > 0 && <span style={{ position: "absolute", top: -4, right: -4, background: myAlerts.length ? "var(--red)" : "var(--orange)", color: myAlerts.length ? "#fff" : "#000", fontSize: 10, fontWeight: 800, minWidth: 16, height: 16, borderRadius: 8, display: "grid", placeItems: "center", padding: "0 4px" }}>{myTasks.length + myAlerts.length}</span>}
              </button>
              {notifOpen && <NotifDropdown myTasks={myTasks} myAlerts={myAlerts} go={go} onClose={() => setNotifOpen(false)} />}
            </div>

            {/* bascule de rôle */}
            <div style={{ position: "relative" }}>
              <div className="role-switch" onClick={() => setRoleMenuOpen(o => !o)}>
                <Avatar user={user} />
                <div className="who"><b>{user.nom}</b><span>{user.direction ? DA.directionLabel(user.direction) + (user.service ? " · " + user.service : "") : personaLabel(userId)}</span></div>
                <Icon name="chevronD" size={15} color="var(--g500)" />
              </div>
              {roleMenuOpen && <RoleMenu current={userId} onPick={switchTo} onLogout={logout} onClose={() => setRoleMenuOpen(false)} />}
            </div>
          </div>

          <div className={"content" + (route === "dashboard" || route === "admin" ? " wide" : "")} key={route + (param || "")}>
            {route === "home" && <HomeScreen />}
            {route === "dashboard" && <HomeScreen />}
            {route === "nouvelle" && <NouvelleDemandeScreen />}
            {route === "masse" && <MasseScreen />}
            {route === "mes" && <MesDemandesScreen />}
            {route === "corbeilles" && <CorbeillesScreen />}
            {route === "detail" && <DossierDetailScreen dossierId={param} />}
            {route === "controle" && <ControleScreen />}
            {route === "consultation" && <ConsultationScreen />}
            {route === "admin" && <AdminScreen />}
            {route === "integrations" && <IntegrationsScreen />}
            {route === "modules" && <ModulesScreen />}
            {route === "audit" && <AuditScreen />}
          </div>
        </div>
      </div>
      <TweaksPanel title="Apparence">
        <TweakSection label="Marque" />
        <TweakColor label="Couleur d'accent" value={tw.accent}
          options={["#FF7900", "#F16E00", "#E8590C", "#FF9E1B"]}
          onChange={(v) => setTweak("accent", v)} />
        <TweakColor label="Fond du menu" value={tw.sidebar}
          options={["#000000", "#141414", "#1a1207", "#3a1d00"]}
          onChange={(v) => setTweak("sidebar", v)} />
        <TweakSection label="Mise en page" />
        <TweakRadio label="Densité" value={tw.density}
          options={["regular", "compact"]}
          onChange={(v) => setTweak("density", v)} />
      </TweaksPanel>
      {mfaPending && <MfaChallenge user={mfaPending}
        onOk={() => { const id = mfaPending.id; setMfaPending(null); setUserId(id); go(DA.defaultRouteFor(DA.userById[id])); }}
        onClose={() => setMfaPending(null)} />}
    </StoreCtx.Provider>
  );
}

// petite ref pour "back" sans re-render
const _backRef = { current: "home" };
function store_back() { return _backRef.current; }

function personaLabel(id) {
  const p = DA.PERSONAS.find(x => x.id === id);
  if (p) return p.label;
  const u = DA.userById[id];
  return DA.roleByCode[u.roles[0]]?.libelle || "Utilisateur";
}

/* ----------------------- Sidebar ----------------------- */
function Sidebar({ route, go, user, myTasks, dossiers }) {
  const roles = user.roles;
  const has = (type) => roles.some(r => DA.roleByCode[r]?.type === type);
  const isInit = has("I"), isVA = has("V") || has("A"), isCtrl = has("C");
  const isSup = roles.includes("SUPERVISEUR"), isAdmin = roles.includes("ADMIN");
  const seeDash = isSup || roles.includes("DF") || roles.includes("DGA_DG") || isAdmin;
  const seeAudit = isSup || isAdmin || isCtrl;
  const mesCount = dossiers.filter(d => d.createdBy === user.id || d.createdByName === user.nom).length;

  const items = [{ k: "home", l: "Tableau de bord", ic: "chart", show: true }];
  if (isInit) items.push({ k: "nouvelle", l: "Nouvelle demande", ic: "plus", show: true });
  if (isInit) items.push({ k: "mes", l: "Mes demandes", ic: "doc", show: true, count: mesCount });
  if (isVA) items.push({ k: "corbeilles", l: "Corbeilles", ic: "inbox", show: true, count: myTasks.length });
  if (isCtrl) items.push({ k: "controle", l: "Contrôle a posteriori", ic: "shield", show: true });

  const pilot = [];
  if (seeDash || isCtrl) pilot.push({ k: "consultation", l: "Consultation", ic: "search" });
  if (seeAudit) pilot.push({ k: "audit", l: "Journal d'audit", ic: "lock" });
  if (isAdmin) pilot.push({ k: "admin", l: "Administration", ic: "gear" });
  if (isAdmin) pilot.push({ k: "integrations", l: "Intégrations", ic: "flow" });
  if (isAdmin) pilot.push({ k: "modules", l: "Modules", ic: "layers" });

  return (
    <div className="sidebar">
      <div className="sidebar-brand">
        <BrandMark />
        <div className="brand-text"><b>Dégrèvements</b><span>Orange CI · PGD</span></div>
      </div>
      <div className="nav">
        <div className="nav-group-label">Espace de travail</div>
        {items.map(it => <NavItem key={it.k} {...it} active={route === it.k} onClick={() => go(it.k)} />)}
        {pilot.length > 0 && <>
          <div className="nav-group-label">Pilotage</div>
          {pilot.map(it => <NavItem key={it.k} {...it} active={route === it.k} onClick={() => go(it.k)} />)}
        </>}
      </div>
      <div className="sidebar-foot">
        <div className="row gap-8"><Icon name="info" size={13} /> MVP — données simulées</div>
        <div style={{ marginTop: 4, opacity: .7 }}>Systèmes externes (CRM, AD, GED, SMTP) en bouchon.</div>
      </div>
    </div>
  );
}
function NavItem({ l, ic, active, onClick, count }) {
  return <button className={"nav-item" + (active ? " active" : "")} onClick={onClick}>
    <span className="ic"><Icon name={ic} size={18} /></span>{l}
    {count > 0 && <span className="badge-count">{count}</span>}
  </button>;
}

/* ----------------------- Role menu ----------------------- */
function RoleMenu({ current, onPick, onLogout, onClose }) {
  uEA(() => {
    const h = () => onClose();
    setTimeout(() => window.addEventListener("click", h), 0);
    return () => window.removeEventListener("click", h);
  }, []);
  return (
    <div className="notif-dropdown" style={{ width: 296 }} onClick={e => e.stopPropagation()}>
      <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--g100)" }}>
        <b style={{ fontSize: 13 }}>Changer de rôle</b>
        <div className="tiny muted">RBAC effectif · 2FA exigé pour les rôles financiers</div>
      </div>
      <div style={{ maxHeight: 340, overflowY: "auto" }}>
        {DA.PERSONAS.map(p => {
          const u = DA.userById[p.id]; const mfa = DA.requiresMfa(u);
          return <button key={p.id} className="notif-item" style={{ width: "100%", textAlign: "left", border: "none", background: current === p.id ? "var(--orange-50)" : "#fff", cursor: "pointer", alignItems: "center" }}
            onClick={() => onPick(p.id)}>
            <Avatar user={u} size={32} />
            <div style={{ flex: 1 }}><div className="row gap-6" style={{ alignItems: "center" }}><span style={{ fontWeight: 700, fontSize: 13 }}>{p.label}</span>{mfa && <Icon name="shield" size={12} color="var(--orange-600)" />}</div><div className="tiny muted">{u.nom} · {p.desc}</div></div>
            {current === p.id && <Icon name="check" size={16} color="var(--orange-600)" />}
          </button>;
        })}
      </div>
      <button className="notif-item" style={{ width: "100%", textAlign: "left", border: "none", borderTop: "1px solid var(--g100)", background: "#fff", cursor: "pointer", alignItems: "center", color: "var(--red-700)", fontWeight: 600 }}
        onClick={(e) => { e.stopPropagation(); onClose(); onLogout(); }}>
        <span className="timeline-ic" style={{ background: "var(--red-bg)", color: "var(--red-700)" }}><Icon name="logout" size={15} /></span>
        Se déconnecter
      </button>
    </div>
  );
}

/* ----------------------- Notif dropdown ----------------------- */
function NotifDropdown({ myTasks, myAlerts = [], go, onClose }) {
  uEA(() => {
    const h = () => onClose();
    setTimeout(() => window.addEventListener("click", h), 0);
    return () => window.removeEventListener("click", h);
  }, []);
  return (
    <div className="notif-dropdown" onClick={e => e.stopPropagation()}>
      <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--g100)" }} className="row">
        <b style={{ fontSize: 13 }}>Notifications</b>
        <span className="badge b-orange" style={{ marginLeft: "auto" }}>{myTasks.length + myAlerts.length}</span>
      </div>
      <div style={{ maxHeight: 380, overflowY: "auto" }}>
        {myAlerts.map(d => (
          <button key={"a-" + d.id} className="notif-item unread" style={{ width: "100%", textAlign: "left", border: "none", borderBottom: "1px solid var(--g100)", borderLeft: "3px solid var(--red)", cursor: "pointer" }}
            onClick={() => { onClose(); go("detail", d.id); }}>
            <div className="timeline-ic" style={{ background: "var(--red-bg)", color: "var(--red-700)" }}><Icon name="x" size={15} /></div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>Demande rejetée — à corriger</div>
              <div className="tiny muted">{d.ref} · {d.motifRejet ? d.motifRejet.slice(0, 48) : "motif précisé dans le dossier"}</div>
            </div>
          </button>
        ))}
        {(myTasks.length + myAlerts.length) === 0 ? <div className="empty" style={{ padding: 30 }}><Icon name="check" size={28} /><div className="tiny mt-8">Aucune notification</div></div> :
          myTasks.map(({ d, t }) => (
            <button key={t.id} className="notif-item unread" style={{ width: "100%", textAlign: "left", border: "none", borderBottom: "1px solid var(--g100)", cursor: "pointer" }}
              onClick={() => { onClose(); go("detail", d.id); }}>
              <div className="timeline-ic" style={{ background: "var(--orange-50)", color: "var(--orange-600)" }}><Icon name="inbox" size={15} /></div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12.5 }}><b>{EA.roleLabel(t.role)}</b> — action requise</div>
                <div className="tiny muted">{d.ref} · {d.client.nom} · {EA.fmtMoneyShort(d.ttc)} FCFA</div>
              </div>
            </button>
          ))}
      </div>
    </div>
  );
}

/* ----------------------- Export Excel (SpreadsheetML .xls, ouvrable Excel) ----------------------- */
function exportXLS(filename, rows, sheet) {
  const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const isNum = (v) => typeof v === "number" || (typeof v === "string" && v !== "" && /^-?\d+(\.\d+)?$/.test(v));
  const body = rows.map((r, ri) => {
    const cells = r.map(c => {
      if (ri === 0) return `<Cell ss:StyleID="h"><Data ss:Type="String">${esc(c)}</Data></Cell>`;
      return isNum(c)
        ? `<Cell><Data ss:Type="Number">${esc(c)}</Data></Cell>`
        : `<Cell><Data ss:Type="String">${esc(c)}</Data></Cell>`;
    }).join("");
    return `<Row>${cells}</Row>`;
  }).join("");
  const xml = `<?xml version="1.0"?>\n<?mso-application progid="Excel.Sheet"?>\n<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">\n<Styles><Style ss:ID="h"><Font ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#FF7900" ss:Pattern="Solid"/></Style></Styles>\n<Worksheet ss:Name="${esc(sheet || "Export")}"><Table>${body}</Table></Worksheet>\n</Workbook>`;
  const blob = new Blob(["\uFEFF" + xml], { type: "application/vnd.ms-excel;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = filename; a.click();
}

/* ----------------------- Export CSV ----------------------- */
function exportCSV(filename, rows) {
  const csv = rows.map(r => r.map(c => `"${String(c ?? "").replace(/"/g, '""')}"`).join(";")).join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = filename; a.click();
}
function dossierToRows(d) {
  const rows = [["Champ", "Valeur"]];
  rows.push(["Référence", d.ref], ["Circuit", d.circuit], ["Segment", d.segment], ["Statut", EA.STATUTS[d.statut].label],
    ["Client", d.client.nom], ["Compte", d.client.compte], ["Contact client", d.contactClient || ""], ["Motif", d.motif], ["Libellé", d.libelle],
    ["Montant HT", d.ht], ["TSC", Math.round(d.tsc)], ["TVA", Math.round(d.tva)], ["TTC", Math.round(d.ttc)],
    ["Tranche", d.tranche], ["Soumis le", EA.fmtDateTime(d.dateSoumission)]);
  rows.push([], ["Journal d'audit"], ["Horodatage", "Acteur", "Action", "Détail"]);
  d.audit.forEach(a => rows.push([EA.fmtDateTime(a.ts), a.acteur, a.action, a.commentaire]));
  return rows;
}
function auditToRows(acts) {
  const rows = [["Horodatage", "Référence", "Acteur", "Action", "Détail"]];
  acts.forEach(a => rows.push([EA.fmtDateTime(a.ts), a.ref, a.acteur, a.action, a.commentaire]));
  return rows;
}

/* ----------------------- Export PDF (impression navigateur) ----------------------- */
function exportDossierPDF(d) {
  const c = DA.CIRCUITS[d.circuit];
  const row = (k, v) => `<tr><td style="color:#767676;padding:5px 10px;border-bottom:1px solid #eee;width:200px">${k}</td><td style="padding:5px 10px;border-bottom:1px solid #eee;font-weight:600">${v ?? "—"}</td></tr>`;
  const money = (n) => EA.fmtMoney(n);
  const audit = d.audit.map(a => `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;font-size:11px;color:#767676">${EA.fmtDateTime(a.ts)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;font-size:11px"><b>${a.acteur}</b></td><td style="padding:4px 8px;border-bottom:1px solid #eee;font-size:11px">${a.action}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;font-size:11px;color:#767676">${a.commentaire || ""}</td></tr>`).join("");
  const w = window.open("", "_blank");
  if (!w) return;
  w.document.write(`<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><title>${d.ref}</title>
  <style>body{font-family:Helvetica,Arial,sans-serif;color:#0a0a0a;padding:40px;max-width:820px;margin:auto}
  h1{font-size:22px;margin:0} .ref{font-family:monospace;color:#E96B00;font-weight:700}
  .bar{height:6px;background:#FF7900;margin:14px 0 22px} h2{font-size:14px;margin:24px 0 8px;text-transform:uppercase;letter-spacing:.05em;color:#595959}
  table{width:100%;border-collapse:collapse} .head{display:flex;justify-content:space-between;align-items:flex-start}
  .mark{width:40px;height:40px;background:#FF7900;display:flex;align-items:center;justify-content:center;font-weight:800;color:#000;font-size:12px}
  .tot{font-size:18px;font-weight:800;color:#E96B00}</style></head><body>
  <div class="head"><div><h1>Fiche de dégrèvement</h1><div class="ref">${d.ref}</div></div><div class="mark">OCI</div></div>
  <div class="bar"></div>
  <h2>Informations</h2><table>
  ${row("Circuit", c.nom + " (" + d.circuit + " · " + d.segment + ")")}
  ${row("Sous-flux", d.sousFlux)}${row("Date de demande", d.dateDemande ? EA.fmtDate(d.dateDemande) : "—")}
  ${row("Statut", EA.STATUTS[d.statut].label)}${row("Client", d.client.nom + " — " + d.client.compte)}
  ${row("Contact client", d.contactClient)}${row("Motif", d.motif)}${row("Libellé", d.libelle)}
  ${row("Agent", d.agent + " (" + d.matricule + ")")}</table>
  <h2>Montants</h2><table>
  ${row("Montant HT", money(d.ht))}${row("TSC (3 %)", money(d.tsc))}${row("HT + TSC", money(d.ht + d.tsc))}
  ${row("TVA (" + (d.tauxTva * 100) + " %)", money(d.tva))}
  <tr><td style="padding:8px 10px"><b>Total TTC</b></td><td style="padding:8px 10px" class="tot">${money(d.ttc)}</td></tr>
  ${row("Tranche", d.tranche || "—")}</table>
  <h2>Journal d'audit</h2><table>${audit}</table>
  <p style="margin-top:30px;font-size:11px;color:#999">Orange Côte d'Ivoire — PGD · document généré le ${EA.fmtDateTime(Date.now())} · confidentiel</p>
  <script>window.onload=()=>window.print()<\/script></body></html>`);
  w.document.close();
}

window.recentActivityMap = {};
ReactDOM.createRoot(document.getElementById("root")).render(
  <ToastProvider><App /></ToastProvider>
);
