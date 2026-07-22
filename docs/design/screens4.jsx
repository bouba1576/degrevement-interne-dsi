/* ====================================================================
   PGD — Écrans : Ajustement en masse · Intégrations · Modules
   Couvre PGD-27 (masse), PGD-25 (intégrations API), PGD-26 (extensibilité).
   ==================================================================== */
const { useState: uS4, useMemo: uM4 } = React;
const E4 = window.PGD_ENGINE, D4 = window.PGD_DATA;

/* ======================== AJUSTEMENT EN MASSE ========================
   Fidèle à la fiche réelle "FICHIER AJUSTEMENT" — B2C, dérangement
   individuel sur la ligne du client · Process PO5-G-07-ERQ1.
   Restitution calculée au prorata : récurrent mensuel HT / 30 × jours. */
function MasseScreen() {
  const store = window.useStore();
  const toast = window.useToast();
  const { user, go } = store;
  const circuit = "DXC";
  const c = D4.CIRCUITS[circuit];
  const today = new Date().toISOString().slice(0, 10);

  const [matricule, setMatricule] = uS4("M-2041");
  const [dateDemande, setDateDemande] = uS4(today);
  const [commentaire, setCommentaire] = uS4("Ajustement suite à dérangement individuel sur la ligne du client — Process PO5-G-07-ERQ1");
  const [lignes, setLignes] = uS4(() => seedLignes());
  const [modal, setModal] = uS4(null); // { index|null, data }

  function seedLignes() {
    return [
      { nom: "Kouassi Adjoua", fibre: "FTTH-4471902", ncli: "B2C-4471902", numeroCase: "CASE-100231", formule: "Livebox Fibre 100M", recurrent: 25000, pDebut: "2026-05-01", pFin: "2026-05-12", jours: 12 },
      { nom: "Diallo Mamadou", fibre: "FTTH-3390215", ncli: "B2C-3390215", numeroCase: "CASE-100244", formule: "Livebox Fibre 200M", recurrent: 35000, pDebut: "2026-05-04", pFin: "2026-05-11", jours: 8 },
      { nom: "Touré Aminata", fibre: "FTTH-5582100", ncli: "B2C-5582100", numeroCase: "CASE-100258", formule: "Livebox Fibre 100M", recurrent: 25000, pDebut: "2026-04-20", pFin: "2026-05-09", jours: 20 },
    ];
  }
  function restitHT(l) {
    const r = Number(l.recurrent) || 0, j = Number(l.jours) || 0;
    if (l.htManuel != null && l.htManuel !== "") return Number(l.htManuel) || 0;
    return Math.round(r / 30 * j);
  }
  function saveLigne(data) {
    if (modal.index == null) setLignes(ls => [...ls, data]);
    else setLignes(ls => ls.map((l, j) => j === modal.index ? data : l));
    setModal(null);
  }
  function delLigne(i) { setLignes(ls => ls.filter((_, j) => j !== i)); }

  const htTotal = lignes.reduce((a, l) => a + restitHT(l), 0);
  const m = E4.calcMontants(htTotal, c.tva);
  const tranche = htTotal > 0 ? E4.selectTranche(circuit, m.ttc) : null;

  function submit() {
    const valides = lignes.filter(l => l.nom.trim() && restitHT(l) > 0).map(l => ({
      nom: l.nom, compte: l.ncli, fibre: l.fibre, ncli: l.ncli, numeroCase: l.numeroCase,
      formule: l.formule, recurrent: Number(l.recurrent) || 0, jours: Number(l.jours) || 0, ht: restitHT(l),
      periode: (l.pDebut || l.pFin) ? `${l.pDebut || "?"} → ${l.pFin || "?"}` : "",
    }));
    if (valides.length < 2) { toast({ type: "error", title: "Lot insuffisant", msg: "Au moins 2 lignes valides (client + jours)." }); return; }
    const d = store.createMasseAndSubmit({
      circuit, sousFlux: "Réclamation", motif: "Dérangement individuel (restitution)",
      libelle: `Ajustement en masse B2C — ${valides.length} lignes (PO5-G-07-ERQ1)`, lignes: valides,
      lot: "LOT-B2C-" + new Date().getFullYear() + "-" + Math.floor(Math.random() * 900 + 100),
      commentaire, dateDemande: new Date(dateDemande).getTime(),
      createdBy: user.id, createdByName: user.nom, agent: user.nom, matricule,
    });
    toast({ type: "success", title: "Lot soumis", msg: `${d.ref} · ${valides.length} lignes · routé sur « ${tranche.label} »` });
    go("detail", d.id);
  }

  const nbValides = lignes.filter(l => l.nom.trim() && restitHT(l) > 0).length;

  return (
    <div className="fade-in">
      <div className="page-head">
        <div><button className="btn-link" onClick={() => go("home")}><Icon name="arrowLeft" size={13} /> Tableau de bord</button>
          <h2 style={{ marginTop: 6 }}>Ajustement en masse — B2C</h2>
          <p>Fiche de restitution pour dérangement individuel sur la ligne du client. Le montant est calculé au prorata (récurrent mensuel HT ÷ 30 × jours).</p></div>
      </div>
      <div className="alert alert-orange mb-16"><Icon name="alert" size={16} />
        <div><b>Usage encadré</b><div className="tiny">Le traitement en masse est réservé aux cas collectifs avérés (ex. dérangement réseau impactant plusieurs clients). Pour toute demande individuelle, privilégiez le <button className="btn-link" style={{ fontSize: "inherit" }} onClick={() => go("nouvelle")}>formulaire unitaire</button>.</div></div>
      </div>

      <div className="card card-pad mb-16" style={{ background: "var(--blue-bg)", borderColor: "#c5e6f5" }}>
        <div className="row gap-12 wrap" style={{ alignItems: "center" }}>
          <Badge cls="b-blue" dot>Process PO5-G-07-ERQ1</Badge>
          <span className="tiny" style={{ color: "var(--blue-700)" }}>Service (pôle) : <b>B2C</b> · Circuit de signature : Gestionnaire → Chargé du pôle → Responsable → Directeur Expérience Client</span>
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: "1fr 340px", alignItems: "start" }}>
        <div className="col gap-16" style={{ minWidth: 0 }}>
          <div className="card">
            <div className="card-head"><Icon name="user" size={17} /><h3>En-tête de la fiche</h3></div>
            <div className="card-pad grid grid-2">
              <Field label="Réf. saisie AGENT B2C" hint="Générée à la soumission."><input className="input" value="(auto)" readOnly /></Field>
              <Field label="Agent B2C / Matricule"><div className="row gap-8"><input className="input" value={user.nom} readOnly /><input className="input" style={{ maxWidth: 110 }} value={matricule} onChange={e => setMatricule(e.target.value)} /></div></Field>
              <Field label="Date demande"><input className="input" type="date" value={dateDemande} onChange={e => setDateDemande(e.target.value)} /></Field>
              <Field label="Date de saisie ajustement"><input className="input" value={today} readOnly /></Field>
              <div style={{ gridColumn: "1 / -1" }}><Field label="Commentaire"><textarea className="textarea" style={{ minHeight: 54 }} value={commentaire} onChange={e => setCommentaire(e.target.value)} /></Field></div>
            </div>
          </div>

          <div className="card">
            <div className="card-head"><Icon name="layers" size={17} /><h3>Lignes du fichier d'ajustement</h3>
              <span className="muted" style={{ marginLeft: "auto" }}>{lignes.length} ligne(s)</span>
              <button className="btn btn-dark btn-sm" onClick={() => setModal({ index: null, data: { nom: "", fibre: "", ncli: "", numeroCase: "", formule: "Livebox Fibre 100M", recurrent: "", pDebut: "", pFin: "", jours: "" } })}><Icon name="plus" size={14} /> Ajouter une ligne</button>
            </div>
            {lignes.length === 0 ? <Empty icon="layers" title="Aucune ligne">Cliquez sur « Ajouter une ligne » pour saisir un client.</Empty> : (
              <div style={{ overflowX: "auto" }}>
                <table className="table compact">
                  <thead><tr><th>#</th><th>Client / NCLI</th><th>Numéro CASE</th><th>Formule</th><th>Période non connexion</th><th className="num">Jours</th><th className="num">Récur. HT</th><th className="num">Restitué HT</th><th className="num">TTC</th><th></th></tr></thead>
                  <tbody>
                    {lignes.map((l, i) => { const ht = restitHT(l); const lm = E4.calcMontants(ht, c.tva);
                      return <tr key={i} onClick={() => setModal({ index: i, data: { ...l } })}>
                        <td className="muted tiny">{i + 1}</td>
                        <td><div style={{ fontWeight: 600 }}>{l.nom || <span className="muted">—</span>}</div><div className="tiny muted mono">{l.ncli}{l.fibre ? " · " + l.fibre : ""}</div></td>
                        <td className="mono tiny muted">{l.numeroCase || "—"}</td>
                        <td className="tiny">{l.formule}</td>
                        <td className="tiny muted">{(l.pDebut || l.pFin) ? `${E4.fmtDate(new Date(l.pDebut).getTime())} → ${E4.fmtDate(new Date(l.pFin).getTime())}` : "—"}</td>
                        <td className="num tiny">{l.jours || "—"}</td>
                        <td className="num mono tiny">{E4.fmtNum(Number(l.recurrent) || 0)}</td>
                        <td className="num mono tiny"><b>{E4.fmtNum(ht)}</b></td>
                        <td className="num mono tiny">{E4.fmtNum(lm.ttc)}</td>
                        <td onClick={e => e.stopPropagation()}><div className="row gap-6"><button className="iconbtn" title="Modifier" onClick={() => setModal({ index: i, data: { ...l } })}><Icon name="edit" size={13} /></button><button className="iconbtn" title="Supprimer" onClick={() => delLigne(i)}><Icon name="trash" size={13} /></button></div></td>
                      </tr>; })}
                  </tbody>
                </table>
              </div>
            )}
            <div style={{ padding: "12px 16px" }} className="tiny muted">Cliquez sur une ligne pour la modifier. Restitué HT = Récurrent mensuel HT ÷ 30 × jours.</div>
          </div>
        </div>

        <div className="col gap-16" style={{ position: "sticky", top: 86 }}>
          <div className="card">
            <div className="card-head"><Icon name="calc" size={17} /><h3>Total du lot</h3></div>
            <div className="card-pad">
              <div className="row" style={{ justifyContent: "space-between", padding: "5px 0" }}><span className="muted tiny">Lignes valides</span><b>{nbValides}</b></div>
              <div className="row" style={{ justifyContent: "space-between", padding: "5px 0" }}><span className="muted tiny">Montant restitué HT</span><span className="mono">{E4.fmtMoney(htTotal)}</span></div>
              <div className="row" style={{ justifyContent: "space-between", padding: "5px 0" }}><span className="muted tiny">Montant TSC (3 %)</span><span className="mono">{E4.fmtMoney(m.tsc)}</span></div>
              <div className="row" style={{ justifyContent: "space-between", padding: "5px 0" }}><span className="muted tiny">Montant restitué TVA (18 %)</span><span className="mono">{E4.fmtMoney(m.tva)}</span></div>
              <div className="divider" style={{ margin: "8px 0" }} />
              <div className="row" style={{ justifyContent: "space-between" }}><b>Montant restitué TTC</b><b className="mono" style={{ fontSize: 17, color: "var(--orange-600)" }}>{E4.fmtMoney(m.ttc)}</b></div>
              {tranche && <div className="chip active" style={{ marginTop: 12 }}>Tranche {tranche.label}</div>}
            </div>
          </div>
          <button className="btn btn-primary btn-lg btn-block" onClick={submit} disabled={!tranche}><Icon name="send" size={16} /> Soumettre le lot</button>
        </div>
      </div>

      {modal && <LigneMasseModal initial={modal.data} isEdit={modal.index != null} tva={c.tva}
        onClose={() => setModal(null)} onSave={saveLigne} />}
    </div>
  );
}

/* Modal de saisie/édition d'une ligne — alimente le tableau */
function LigneMasseModal({ initial, isEdit, tva, onClose, onSave }) {
  const [d, setD] = uS4({ ...initial });
  const [autoJours, setAutoJours] = uS4(true);
  function set(k, v) { setD(s => ({ ...s, [k]: v })); }
  // calcule les jours depuis la période si auto
  React.useEffect(() => {
    if (autoJours && d.pDebut && d.pFin) {
      const j = Math.max(0, Math.round((new Date(d.pFin) - new Date(d.pDebut)) / 86400000) + 1);
      setD(s => ({ ...s, jours: j }));
    }
  }, [d.pDebut, d.pFin, autoJours]);
  const r = Number(d.recurrent) || 0, j = Number(d.jours) || 0;
  const ht = Math.round(r / 30 * j);
  const mm = E4.calcMontants(ht, tva);
  const valid = d.nom.trim() && ht > 0;
  return <Modal title={isEdit ? "Modifier la ligne" : "Ajouter une ligne"} icon={isEdit ? "edit" : "plus"} onClose={onClose} lg
    footer={<><button className="btn btn-ghost" onClick={onClose}>Annuler</button>
      <button className="btn btn-primary" disabled={!valid} onClick={() => onSave({ ...d })}><Icon name="check" size={15} /> {isEdit ? "Enregistrer" : "Ajouter au tableau"}</button></>}>
    <div className="grid grid-2">
      <Field label="Nom du client" req><input className="input" value={d.nom} onChange={e => set("nom", e.target.value)} placeholder="Nom et prénoms" /></Field>
      <Field label="Numéro Fibre"><input className="input mono" value={d.fibre} onChange={e => set("fibre", e.target.value)} placeholder="FTTH-…" /></Field>
      <Field label="NCLI"><input className="input mono" value={d.ncli} onChange={e => set("ncli", e.target.value)} placeholder="NCLI" /></Field>
      <Field label="Numéro CASE"><input className="input mono" value={d.numeroCase} onChange={e => set("numeroCase", e.target.value)} placeholder="CASE-…" /></Field>
      <Field label="Formule d'abonnement"><input className="input" value={d.formule} onChange={e => set("formule", e.target.value)} /></Field>
      <Field label="Récurrent mensuel HT"><div className="input-addon"><input className="input mono" type="number" value={d.recurrent} onChange={e => set("recurrent", e.target.value)} style={{ paddingRight: 44 }} /><span className="suffix">FCFA</span></div></Field>
      <Field label="Période de non connexion — début"><input className="input" type="date" value={d.pDebut} onChange={e => { setAutoJours(true); set("pDebut", e.target.value); }} /></Field>
      <Field label="Période de non connexion — fin"><input className="input" type="date" value={d.pFin} onChange={e => { setAutoJours(true); set("pFin", e.target.value); }} /></Field>
      <Field label="Nombre de jours à restituer" hint={autoJours && d.pDebut && d.pFin ? "Calculé depuis la période (modifiable)." : null}>
        <input className="input mono" type="number" value={d.jours} onChange={e => { setAutoJours(false); set("jours", e.target.value); }} />
      </Field>
    </div>
    <div className="card card-pad mt-8" style={{ background: "var(--g50)" }}>
      <div className="grid grid-4" style={{ gap: 10 }}>
        <div><div className="tiny muted">Restitué HT</div><b className="mono">{E4.fmtNum(ht)}</b></div>
        <div><div className="tiny muted">TSC 3 %</div><b className="mono">{E4.fmtNum(mm.tsc)}</b></div>
        <div><div className="tiny muted">TVA 18 %</div><b className="mono">{E4.fmtNum(mm.tva)}</b></div>
        <div><div className="tiny muted">Restitué TTC</div><b className="mono" style={{ color: "var(--orange-600)" }}>{E4.fmtNum(mm.ttc)}</b></div>
      </div>
    </div>
  </Modal>;
}

/* ======================== INTÉGRATIONS (PGD-25) ======================== */
function IntegrationsScreen() {
  const store = window.useStore();
  const toast = window.useToast();
  const adapters = [
    { code: "CRM", nom: "Adaptateur CRM", iface: "API REST", desc: "Récupère les réclamations de dégrèvement.", ic: "inbox", color: "#4BB4E6" },
    { code: "AD", nom: "Active Directory / LDAP", iface: "LDAP + 2FA", desc: "Authentifie, résout les groupes GG-DGR-*.", ic: "users", color: "#32C832" },
    { code: "GED", nom: "Gestion documentaire", iface: "API / WebDAV", desc: "Stocke et récupère les pièces jointes.", ic: "doc", color: "#A885D8" },
    { code: "SMTP", nom: "Messagerie", iface: "SMTP", desc: "Envoie les notifications par e-mail.", ic: "send", color: "#FF7900" },
  ];
  const seclog = (window.PGD_SECLOG || []).length;
  return (
    <div className="fade-in">
      <div className="page-head"><div><h2>Intégrations</h2>
        <p>Adaptateurs à interface stable. Au MVP : bouchons remplaçables sans toucher au cœur applicatif (architecture en couches).</p></div></div>
      <div className="alert alert-blue mb-24"><Icon name="info" size={15} />Les quatre dépendances externes sont simulées. En production, seuls les bouchons sont remplacés ; les contrats d'interface restent identiques.</div>
      <div className="grid grid-2 mb-24">
        {adapters.map(a => (
          <div className="card card-pad" key={a.code}>
            <div className="row gap-12">
              <div style={{ width: 42, height: 42, borderRadius: 8, display: "grid", placeItems: "center", background: a.color + "22", color: a.color }}><Icon name={a.ic} size={22} /></div>
              <div style={{ flex: 1 }}><div style={{ fontWeight: 700 }}>{a.nom}</div><div className="tiny muted mono">{a.iface}</div></div>
              <Badge cls="b-green" dot>Bouchon actif</Badge>
            </div>
            <div className="tiny muted" style={{ marginTop: 10 }}>{a.desc}</div>
            <div className="row gap-8" style={{ marginTop: 12 }}>
              {a.code === "CRM" && <button className="btn btn-ghost btn-sm" onClick={() => { const d = store.importFromCRM(); toast({ type: "success", title: "Réclamation importée du CRM", msg: `${d.ref} créée en brouillon` }); store.go("detail", d.id); }}><Icon name="download" size={14} /> Importer une réclamation</button>}
              {a.code === "SMTP" && <button className="btn btn-ghost btn-sm" onClick={() => toast({ type: "info", title: "File SMTP", msg: "Notifications simulées — voir le journal ci-dessous." })}><Icon name="eye" size={14} /> Voir la file</button>}
              {a.code === "AD" && <span className="tiny muted">{seclog} événement(s) d'authentification</span>}
              {a.code === "GED" && <span className="tiny muted">Stockage local de démonstration</span>}
            </div>
          </div>
        ))}
      </div>
      <div className="card">
        <div className="card-head"><Icon name="send" size={17} /><h3>Journal des notifications (bouchon SMTP)</h3></div>
        <div style={{ overflow: "hidden" }}>
          <table className="table compact"><thead><tr><th>Horodatage</th><th>Destinataire (rôle)</th><th>Objet</th></tr></thead>
            <tbody>{notifLog(store.dossiers).slice(0, 12).map((n, i) => <tr key={i} className="norow">
              <td className="mono tiny muted nowrap">{E4.fmtDateTime(n.ts)}</td><td className="tiny">{n.dest}</td><td className="tiny">{n.objet}</td></tr>)}
              {notifLog(store.dossiers).length === 0 && <tr className="norow"><td colSpan="3" className="center muted tiny" style={{ padding: 18 }}>Aucune notification émise.</td></tr>}
            </tbody></table>
        </div>
      </div>
    </div>
  );
}
function notifLog(dossiers) {
  const out = [];
  dossiers.forEach(d => (d.audit || []).forEach(a => {
    if (a.action === "Soumission") out.push({ ts: a.ts, dest: E4.roleLabel(d.taches?.[0]?.role || ""), objet: `Nouvelle tâche — ${d.ref}` });
    if (a.action === "Approbation" || a.action === "Escalade automatique") out.push({ ts: a.ts, dest: "Initiateur + corbeille suivante", objet: `Avancement — ${d.ref}` });
    if (a.action === "Rejet") out.push({ ts: a.ts, dest: "Initiateur", objet: `Demande rejetée — ${d.ref}` });
    if (a.action === "Validation finale") out.push({ ts: a.ts, dest: "Initiateur", objet: `Dossier validé — ${d.ref}` });
  }));
  return out.sort((a, b) => b.ts - a.ts);
}

/* ======================== MODULES / EXTENSIBILITÉ (PGD-26) ======================== */
function ModulesScreen() {
  const toast = window.useToast();
  const [mods, setMods] = uS4([
    { code: "core", nom: "Cœur Workflow", desc: "Saisie, routage, corbeilles, validation, audit.", on: true, lock: true, v: "1.0" },
    { code: "auth", nom: "Authentification AD + 2FA", desc: "LDAP, double authentification, RBAC.", on: true, lock: true, v: "1.0" },
    { code: "kpi", nom: "Tableau de bord KPI", desc: "Délais, volumes, taux, charge.", on: true, v: "1.0" },
    { code: "controle", nom: "Contrôle a posteriori", desc: "Contrôles à froid N1 / N2.", on: true, v: "1.0" },
    { code: "masse", nom: "Ajustement en masse", desc: "Traitement multi-lignes d'un lot.", on: true, v: "0.9" },
    { code: "sla", nom: "Moteur SLA & escalade", desc: "Expiration verrou, escalade automatique.", on: true, v: "0.9" },
    { code: "designer", nom: "Designer de processus (no-code)", desc: "Édition de la matrice de décision.", on: true, v: "0.8" },
    { code: "bi", nom: "Connecteur BI externe", desc: "Export vers Power BI / Tableau (à venir).", on: false, v: "—" },
    { code: "esign", nom: "Signature électronique qualifiée", desc: "Cachet serveur eIDAS (à venir).", on: false, v: "—" },
  ]);
  function toggle(code) { setMods(ms => ms.map(m => m.code === code ? { ...m, on: !m.on } : m)); const mm = mods.find(m => m.code === code); toast({ type: "info", title: (mm.on ? "Module désactivé" : "Module activé"), msg: mm.nom }); }
  return (
    <div className="fade-in">
      <div className="page-head"><div><h2>Modules & extensibilité</h2>
        <p>Architecture en couches : des modules peuvent être activés/ajoutés sans refonte. Le cœur reste inchangé.</p></div></div>
      <div className="grid grid-2">
        {mods.map(m => (
          <div className="card card-pad" key={m.code} style={{ opacity: m.on ? 1 : .68 }}>
            <div className="row gap-12">
              <div style={{ width: 40, height: 40, borderRadius: 8, display: "grid", placeItems: "center", background: m.on ? "var(--orange-50)" : "var(--g100)", color: m.on ? "var(--orange-600)" : "var(--g500)" }}><Icon name="layers" size={20} /></div>
              <div style={{ flex: 1 }}><div className="row gap-8"><span style={{ fontWeight: 700 }}>{m.nom}</span><span className="badge b-grey" style={{ fontSize: 10 }}>v{m.v}</span></div><div className="tiny muted">{m.desc}</div></div>
              {m.lock ? <Badge cls="b-grey">Cœur</Badge> : <button className={"switch" + (m.on ? " on" : "")} onClick={() => toggle(m.code)} />}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

Object.assign(window, { MasseScreen, IntegrationsScreen, ModulesScreen });
