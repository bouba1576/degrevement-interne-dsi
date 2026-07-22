/* ====================================================================
   PGD — Écrans : Mes demandes · Corbeilles · Détail dossier
   ==================================================================== */
const { useState: uS2, useMemo: uM2 } = React;
const E2 = window.PGD_ENGINE, D2 = window.PGD_DATA;

/* ======================== MES DEMANDES ======================== */
function MesDemandesScreen() {
  const store = window.useStore();
  const { user, dossiers, go } = store;
  const [corb, setCorb] = uS2("encours");
  const mine = dossiers.filter(d => d.createdBy === user.id || d.createdByName === user.nom);
  const enCours = mine.filter(d => d.statut === "soumis" || d.statut === "en_cours");
  const valides = mine.filter(d => d.statut === "valide");
  const rejetes = mine.filter(d => d.statut === "rejete");
  const corbeilles = [
    { k: "encours", label: "Demandes en cours", ic: "refresh", color: "var(--orange)", list: enCours },
    { k: "valides", label: "Demandes validées", ic: "check", color: "var(--green)", list: valides },
    { k: "rejetes", label: "Demandes rejetées", ic: "x", color: "var(--red)", list: rejetes },
  ];
  const active = corbeilles.find(c => c.k === corb) || corbeilles[0];
  const rejetEnRetard = rejetes.filter(d => E2.rejetSla(d).retard).length;

  return (
    <div className="fade-in">
      <div className="page-head">
        <div><h2>Mes demandes</h2><p>Vos trois corbeilles d'initiateur. Les demandes rejetées sont à corriger sous le SLA du processus initié.</p></div>
        <div className="spacer" />
        <button className="btn btn-primary" onClick={() => go("nouvelle")}><Icon name="plus" size={16} /> Nouvelle demande</button>
      </div>
      <div className="tabbar">
        {corbeilles.map(cb => (
          <button key={cb.k} className={"tab" + (corb === cb.k ? " active" : "")} onClick={() => setCorb(cb.k)}>
            <span className="row gap-8" style={{ alignItems: "center" }}>
              <Icon name={cb.ic} size={14} color={corb === cb.k ? cb.color : "currentColor"} />
              {cb.label}
              <span className="badge" style={{ background: corb === cb.k ? cb.color + "22" : "var(--g100)", color: corb === cb.k ? cb.color : "var(--g600)", fontWeight: 700 }}>{cb.list.length}</span>
              {cb.k === "rejetes" && rejetEnRetard > 0 && <span className="badge b-red" style={{ fontWeight: 700 }}>{rejetEnRetard} hors SLA</span>}
            </span>
          </button>
        ))}
      </div>
      {corb === "rejetes"
        ? <RejetsCorbeille dossiers={active.list} onOpen={id => go("detail", id)} />
        : <DossierExplorer dossiers={active.list} defaultStatut="tous" onOpen={id => go("detail", id)} />}}
    </div>
  );
}

/* ===== Corbeille spécialisée des demandes rejetées — SLA du processus initié ===== */
function RejetsCorbeille({ dossiers, onOpen }) {
  const rows = uM2(() => dossiers
    .map(d => ({ d, sla: E2.rejetSla(d) }))
    .sort((a, b) => (b.sla.retard - a.sla.retard) || (a.sla.echeance - b.sla.echeance)), [dossiers]);
  if (!rows.length) return <div className="card"><Empty icon="check" title="Aucune demande rejetée">Toutes vos demandes sont en cours ou validées.</Empty></div>;
  const slaActif = (D2.CONFIG.rejets || {}).slaActif !== false;
  return (
    <div className="col gap-8">
      {slaActif
        ? <div className="alert alert-blue"><Icon name="info" size={15} /><div className="tiny">Chaque rejet doit être corrigé et resoumis sous le <b>{(D2.CONFIG.rejets || {}).mode === "fixe" ? "délai de correction paramétré" : "SLA du processus du dossier initié"}</b>. Le compteur démarre à la date de rejet{(D2.CONFIG.rejets || {}).heuresOuvrees !== false ? " (heures ouvrées)" : ""}.</div></div>
        : <div className="alert alert-grey"><Icon name="info" size={15} /><div className="tiny">L'application d'un SLA sur les demandes rejetées est <b>désactivée</b> dans la configuration. Les rejets sont à corriger sans délai contraint.</div></div>}
      {rows.map(({ d, sla }) => {
        const rt = d.taches && d.taches.find(t => t.etat === "REJETEE");
        const accent = !sla.actif ? "var(--g300)" : sla.retard ? "var(--red)" : sla.alerte ? "var(--orange)" : "var(--green)";
        return (
          <div key={d.id} className="card card-pad" style={{ borderLeft: "3px solid " + accent, cursor: "pointer" }} onClick={() => onOpen(d.id)}>
            <div className="row gap-8 wrap" style={{ alignItems: "center" }}>
              <span className="mono" style={{ fontWeight: 700, fontSize: 12.5 }}>{d.ref}</span>
              <CircuitPill code={d.circuit} />
              <StatusBadge statut="rejete" sm />
              {sla.actif && (sla.retard
                ? <Badge cls="b-red" dot>SLA dépassé · {E2.fmtDuree(sla.depasse)}</Badge>
                : <Badge cls={sla.alerte ? "b-orange" : "b-green"} dot>À corriger sous {E2.fmtDuree(sla.restant)}</Badge>)}
              <span className="spacer" style={{ marginLeft: "auto" }} />
              <span className="mono" style={{ fontWeight: 700 }}>{E2.fmtMoney(d.ttc)}</span>
            </div>
            <div style={{ marginTop: 6, fontWeight: 600 }}>{d.client.nom} — {d.libelle}</div>
            <div className="alert alert-red tiny" style={{ marginTop: 8 }}><Icon name="x" size={14} /><div><b>Rejeté par {d.rejetePar || (rt && rt.acteurNom) || "—"}</b> · Motif : {d.motifRejet || (rt && rt.commentaire) || "—"}</div></div>
            <div className="row gap-12 tiny muted" style={{ marginTop: 8 }}>
              <span>Rejeté {E2.fmtAgo(sla.rejTs)}</span>
              {sla.actif && <span>Échéance correction : <b style={{ color: sla.retard ? "var(--red)" : "inherit" }}>{E2.fmtDate(sla.echeance)}</b></span>}
              {sla.actif && <span>{sla.mode === "fixe" ? "Délai" : "SLA processus"} : {E2.fmtDuree(sla.slaH)}</span>}
              <span className="spacer" style={{ marginLeft: "auto" }} />
              <button className="btn btn-primary btn-sm" onClick={e => { e.stopPropagation(); onOpen(d.id); }}><Icon name="refresh" size={13} /> Corriger &amp; resoumettre</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ======================== TABLE RÉUTILISABLE ======================== */
function DossierTable({ dossiers, onOpen, showInitiateur = true, extraCol, sort, onSort }) {
  if (!dossiers.length) return <div className="card"><Empty icon="doc" title="Aucun dossier">Aucun résultat ne correspond à ces critères.</Empty></div>;
  const SortTh = ({ k, children, num }) => (
    <th className={num ? "num" : ""} style={{ cursor: onSort ? "pointer" : "default", userSelect: "none" }}
      onClick={() => onSort && onSort(k)}>
      <span className="row gap-6" style={{ display: "inline-flex", justifyContent: num ? "flex-end" : "flex-start" }}>
        {children}{onSort && sort && sort.key === k && <Icon name={sort.dir === "asc" ? "chevronD" : "chevronR"} size={12} style={{ transform: sort.dir === "asc" ? "rotate(180deg)" : "rotate(90deg)" }} />}
      </span>
    </th>
  );
  return (
    <div className="card" style={{ overflow: "hidden" }}>
      <table className="table">
        <thead><tr>
          <SortTh k="ref">Référence</SortTh><SortTh k="circuit">Circuit</SortTh>
          <SortTh k="client">Client</SortTh><SortTh k="motif">Motif</SortTh>
          <SortTh k="ttc" num>Montant TTC</SortTh><th>Étape</th>
          <SortTh k="statut">Statut</SortTh><SortTh k="date">Soumis</SortTh>
          {extraCol && <th></th>}
        </tr></thead>
        <tbody>
          {dossiers.map(d => {
            const ct = E2.currentTask(d);
            return (
              <tr key={d.id} onClick={() => onOpen(d.id)}>
                <td><span className="mono" style={{ fontWeight: 600, fontSize: 12.5 }}>{d.ref}</span>{d.masse && <span className="badge b-purple" style={{ marginLeft: 6, fontSize: 9 }}>Lot</span>}</td>
                <td><CircuitPill code={d.circuit} /></td>
                <td><div style={{ fontWeight: 600 }}>{d.client.nom}</div><div className="tiny muted">{d.client.compte}</div></td>
                <td><div style={{ maxWidth: 180 }}>{d.motif}</div></td>
                <td className="num"><b>{E2.fmtMoney(d.ttc)}</b></td>
                <td>{d.statut === "valide" || d.statut === "rejete" || d.statut === "abandonne"
                  ? <span className="muted tiny">—</span>
                  : <div className="tiny">{ct ? E2.roleLabel(ct.role) : "—"}<div className="muted">{d.etapeCourante + 1}/{d.taches.length}</div></div>}</td>
                <td><StatusBadge statut={d.statut} sm /></td>
                <td className="tiny muted nowrap">{E2.fmtDate(d.dateSoumission)}</td>
                {extraCol && <td>{extraCol(d)}</td>}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* Explorateur : recherche + filtres multicritères + tri (PGD : consultation) */
function DossierExplorer({ dossiers, onOpen, defaultStatut = "tous" }) {
  const [q, setQ] = uS2("");
  const [circ, setCirc] = uS2("tous");
  const [statut, setStatut] = uS2(defaultStatut);
  const [initiateur, setInitiateur] = uS2("tous");
  const [sort, setSort] = uS2({ key: "date", dir: "desc" });

  const initiateurs = uM2(() => [...new Set(dossiers.map(d => d.createdByName).filter(Boolean))], [dossiers]);
  function onSort(k) { setSort(s => s.key === k ? { key: k, dir: s.dir === "asc" ? "desc" : "asc" } : { key: k, dir: "asc" }); }

  const filtered = uM2(() => {
    let arr = dossiers.filter(d => {
      if (circ !== "tous" && d.circuit !== circ) return false;
      if (statut !== "tous" && d.statut !== statut) return false;
      if (initiateur !== "tous" && d.createdByName !== initiateur) return false;
      if (q) { const hay = `${d.ref} ${d.client.nom} ${d.client.compte} ${d.motif} ${d.libelle}`.toLowerCase(); if (!hay.includes(q.toLowerCase())) return false; }
      return true;
    });
    const dir = sort.dir === "asc" ? 1 : -1;
    const val = (d) => ({ ref: d.ref, circuit: d.circuit, client: d.client.nom, motif: d.motif, ttc: d.ttc, statut: d.statut, date: d.dateSoumission || 0 }[sort.key]);
    arr.sort((a, b) => { const x = val(a), y = val(b); return (typeof x === "number" ? x - y : String(x).localeCompare(String(y))) * dir; });
    return arr;
  }, [dossiers, q, circ, statut, initiateur, sort]);

  return (
    <>
      <div className="card card-pad mb-16">
        <div className="row gap-8 wrap" style={{ alignItems: "flex-end" }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div className="input-addon"><input className="input" placeholder="Rechercher (référence, client, compte, motif, libellé…)" value={q} onChange={e => setQ(e.target.value)} style={{ paddingLeft: 36 }} />
              <span style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)" }}><Icon name="search" size={15} color="var(--g500)" /></span></div>
          </div>
          <Field label="Circuit"><select className="select" value={circ} onChange={e => setCirc(e.target.value)} style={{ minWidth: 120 }}><option value="tous">Tous</option>{Object.keys(D2.CIRCUITS).map(k => <option key={k}>{k}</option>)}</select></Field>
          <Field label="Statut"><select className="select" value={statut} onChange={e => setStatut(e.target.value)} style={{ minWidth: 130 }}>
            <option value="tous">Tous</option>{Object.entries(E2.STATUTS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></Field>
          <Field label="Initiateur"><select className="select" value={initiateur} onChange={e => setInitiateur(e.target.value)} style={{ minWidth: 140 }}><option value="tous">Tous</option>{initiateurs.map(i => <option key={i}>{i}</option>)}</select></Field>
        </div>
      </div>
      <div className="row mb-8"><span className="tiny muted">{filtered.length} dossier(s) · tri par {sort.key} ({sort.dir === "asc" ? "↑" : "↓"})</span></div>
      <DossierTable dossiers={filtered} onOpen={onOpen} sort={sort} onSort={onSort} />
    </>
  );
}

/* ======================== CONSULTATION GLOBALE ======================== */
function ConsultationScreen() {
  const store = window.useStore();
  const { dossiers, go } = store;
  return (
    <div className="fade-in">
      <div className="page-head"><div><h2>Consultation des dossiers</h2>
        <p>Recherche, filtres multicritères (circuit, statut, initiateur) et tri par colonne sur l'ensemble des demandes.</p></div></div>
      <DossierExplorer dossiers={dossiers} onOpen={id => { store.back = "consultation"; go("detail", id); }} />
    </div>
  );
}

/* ======================== CORBEILLES ======================== */
function CorbeillesScreen() {
  const store = window.useStore();
  const toast = window.useToast();
  const { user, dossiers, go } = store;

  // rôles de validation/vérification de l'utilisateur
  const myRoles = user.roles.filter(r => ["V", "A"].includes(D2.roleByCode[r]?.type));
  const [activeRole, setActiveRole] = uS2(myRoles[0]);

  // tâches par rôle
  function tasksForRole(role) {
    const res = [];
    dossiers.forEach(d => {
      (d.taches || []).forEach(t => {
        if (t.role === role && (t.etat === "EN_CORBEILLE" || t.etat === "RECLAMEE")) res.push({ d, t });
      });
    });
    return res;
  }
  const tasks = tasksForRole(activeRole);
  const enCorbeille = tasks.filter(x => x.t.etat === "EN_CORBEILLE");
  const mesReclamees = tasks.filter(x => x.t.etat === "RECLAMEE" && x.t.agentClaim === user.id);
  const autresReclamees = tasks.filter(x => x.t.etat === "RECLAMEE" && x.t.agentClaim !== user.id);

  return (
    <div className="fade-in">
      <div className="page-head">
        <div><h2>Corbeilles partagées</h2><p>Affectation par rôle (pull). Tous les membres voient les tâches non réclamées — aucun blocage en cas d'absence.</p></div>
      </div>

      {/* sélecteur de corbeille (rôle) */}
      <div className="row gap-8 mb-24 wrap">
        {myRoles.map(r => {
          const n = tasksForRole(r).filter(x => x.t.etat === "EN_CORBEILLE").length;
          const role = D2.roleByCode[r];
          return <button key={r} className={"chip clickable" + (activeRole === r ? " active" : "")} onClick={() => setActiveRole(r)}>
            {role.libelle} {n > 0 && <span className="badge b-orange" style={{ marginLeft: 4, padding: "1px 6px" }}>{n}</span>}
          </button>;
        })}
      </div>

      {/* info corbeille */}
      <CorbeilleInfo role={activeRole} />

      {mesReclamees.length > 0 && <>
        <h3 style={{ fontSize: 14, margin: "20px 0 10px" }}>Mes tâches récupérées ({mesReclamees.length})</h3>
        <div className="col gap-12">{mesReclamees.map(({ d, t }) => <TaskCard key={t.id} d={d} t={t} mine go={go} />)}</div>
      </>}

      <h3 style={{ fontSize: 14, margin: "20px 0 10px" }}>File de la corbeille ({enCorbeille.length})</h3>
      {enCorbeille.length === 0
        ? <div className="card"><Empty icon="inbox" title="Corbeille vide">Aucune tâche en attente pour ce rôle.</Empty></div>
        : <div className="col gap-12">{enCorbeille.map(({ d, t }) => <TaskCard key={t.id} d={d} t={t} go={go} />)}</div>}

      {autresReclamees.length > 0 && <>
        <h3 style={{ fontSize: 14, margin: "20px 0 10px" }} className="muted">Récupérées par un collègue ({autresReclamees.length})</h3>
        <div className="col gap-12">{autresReclamees.map(({ d, t }) => <TaskCard key={t.id} d={d} t={t} locked go={go} />)}</div>
      </>}
    </div>
  );
}

function CorbeilleInfo({ role }) {
  const r = D2.roleByCode[role];
  const members = E2.membersOfRole(role);
  return <div className="card card-pad" style={{ background: "var(--g50)" }}>
    <div className="row gap-16 wrap">
      <div><div className="tiny muted">Corbeille = rôle = groupe AD</div><div style={{ fontWeight: 700 }}>{r.libelle}</div>
        <div className="mono tiny muted">{r.ad}</div></div>
      <div className="vdivider" style={{ minHeight: 36 }} />
      <div><div className="tiny muted">Membres habilités</div>
        <div className="row gap-6" style={{ marginTop: 4 }}>
          {members.map(u => <div key={u.id} title={u.nom}><Avatar user={u} size={26} /></div>)}
          <span className="tiny muted" style={{ marginLeft: 4 }}>{members.length} personne(s)</span>
        </div></div>
      <div className="spacer" />
      <div className="alert alert-blue tiny" style={{ maxWidth: 320 }}><Icon name="info" size={14} />
        Récupérer une tâche pose un verrou de 4 h. Sans action, elle revient automatiquement en corbeille.</div>
    </div>
  </div>;
}

function TaskCard({ d, t, mine, locked, go }) {
  const store = window.useStore();
  const toast = window.useToast();
  const retard = E2.isEnRetard(t);
  const claimer = t.agentClaim ? D2.userById[t.agentClaim] : null;
  return (
    <div className="card card-pad" style={{ borderLeft: retard ? "3px solid var(--red)" : mine ? "3px solid var(--orange)" : null }}>
      <div className="row gap-16 wrap">
        <div className="col" style={{ minWidth: 220, flex: 1 }}>
          <div className="row gap-8 wrap">
            <span className="mono" style={{ fontWeight: 700 }}>{d.ref}</span>
            <CircuitPill code={d.circuit} />
            <TypeActeurBadge type={t.type} />
            {retard && <Badge cls="b-red" dot>SLA dépassé · {E2.fmtDuree(E2.ageHeures(t))}</Badge>}
            {mine && <Badge cls="b-orange" dot>Récupéré par vous</Badge>}
            {locked && <Badge cls="b-purple" dot>⛔ En cours · {claimer?.nom}</Badge>}
          </div>
          <div style={{ marginTop: 6, fontWeight: 600 }}>{d.client.nom} — {d.libelle}</div>
          <div className="tiny muted">{d.motif} · soumis {E2.fmtAgo(d.dateSoumission)} · étape {t.ordre + 1}/{d.taches.length}</div>
        </div>
        <div className="col center" style={{ minWidth: 130 }}>
          <div className="tiny muted">Montant TTC</div>
          <div className="mono" style={{ fontSize: 17, fontWeight: 800 }}>{E2.fmtMoney(d.ttc)}</div>
          {mine && <div style={{ marginTop: 6 }}><SlaTimer task={t} compact /></div>}
        </div>
        <div className="col gap-8" style={{ minWidth: 150 }}>
          {mine ? <>
            <button className="btn btn-success btn-sm btn-block" onClick={() => go("detail", d.id)}><Icon name="check" size={15} /> Traiter</button>
            <button className="btn btn-ghost btn-sm btn-block" onClick={() => { store.unclaim(d.id, t.id); toast({ type: "info", title: "Tâche libérée" }); }}>
              <Icon name="unlock" size={14} /> Libérer</button>
          </> : locked ? (
            <div className="lock-banner"><Icon name="lock" size={15} /> Récupérée par {claimer?.nom}</div>
          ) : (
            <button className="btn btn-dark btn-sm btn-block" onClick={() => { store.claim(d.id, t.id); toast({ type: "success", title: "Tâche récupérée", msg: "Verrou posé pour 4 h." }); }}>
              <Icon name="lock" size={14} /> Récupérer</button>
          )}
          <button className="btn-link tiny" onClick={() => go("detail", d.id)}>Voir le dossier</button>
        </div>
      </div>
    </div>
  );
}

/* ======================== DÉTAIL DOSSIER ======================== */
function DossierDetailScreen({ dossierId }) {
  const store = window.useStore();
  const toast = window.useToast();
  const { user, go } = store;
  const d = store.dossiers.find(x => x.id === dossierId);
  const [tab, setTab] = uS2("apercu");
  const [modal, setModal] = uS2(null); // approve | reject | delegate | abandon | modify

  if (!d) return <div className="empty">Dossier introuvable.</div>;
  const c = D2.CIRCUITS[d.circuit];
  const ct = E2.currentTask(d);
  // l'utilisateur peut-il agir sur la tâche courante ?
  const canActRole = ct && user.roles.includes(ct.role);
  const isClaimedByMe = ct && ct.etat === "RECLAMEE" && ct.agentClaim === user.id;
  const isClaimedByOther = ct && ct.etat === "RECLAMEE" && ct.agentClaim !== user.id;
  const sod = ct && E2.sodViolation(d, ct.ordre, user.id);

  function doApprove(payload) {
    // payload = { decision, commentaire, revue }
    if (payload && payload.decision === "rejete") {
      const r = store.reject(d.id, ct.id, payload.commentaire, payload.revue);
      if (!r.ok) { toast({ type: "error", title: r.sod ? "SoD — action bloquée" : "Rejet impossible", msg: r.msg }); return; }
      toast({ type: "warn", title: "Dossier rejeté", msg: "Champs invalides signalés — renvoyé à l'initiateur." });
      setModal(null); return;
    }
    const comment = payload && typeof payload === "object" ? payload.commentaire : payload;
    const revue = payload && typeof payload === "object" ? payload.revue : null;
    const r = store.approve(d.id, ct.id, comment, revue);
    if (!r.ok) { toast({ type: "error", title: r.sod ? "SoD — action bloquée" : "Action impossible", msg: r.msg }); return; }
    toast({ type: "success", title: r.final ? "Dossier validé ✓" : "Étape approuvée", msg: r.final ? "Transmis au SI de facturation." : "Transmis à l'étape suivante." });
    setModal(null);
  }
  function doReject(motif) {
    const r = store.reject(d.id, ct.id, motif);
    if (!r.ok) { toast({ type: "error", title: "Rejet impossible", msg: r.msg }); return; }
    toast({ type: "warn", title: "Dossier rejeté", msg: "Renvoyé à l'initiateur avec motif." });
    setModal(null);
  }
  function doDelegate(toId, note) {
    store.delegate(d.id, ct.id, toId, note);
    toast({ type: "info", title: "Validation déléguée", msg: "Note d'intérim conservée pour l'audit." });
    setModal(null);
  }
  function doAbandon(motif) { const r = store.abandon(d.id, motif); if (!r.ok) { toast({ type: "error", title: "Abandon impossible", msg: r.msg }); return; } toast({ type: "info", title: "Demande abandonnée" }); setModal(null); }
  function doModify(changes) {
    const r = store.modifyResubmit(d.id, changes);
    toast({ type: "success", title: "Dossier corrigé & re-routé", msg: r.trancheChange ? "Changement de tranche — chaîne recalculée." : "Replacé dans le circuit de validation." });
    setModal(null);
  }
  const isCreator = user.id === d.createdBy || user.nom === d.createdByName;
  const canAbandon = isCreator && E2.canAbandon(d);
  const isSuper = user.roles.includes("SUPERVISEUR") || user.roles.includes("ADMIN");
  const dossierActif = d.statut === "soumis" || d.statut === "en_cours";

  return (
    <div className="fade-in">
      <div className="page-head">
        <div>
          <button className="btn-link" onClick={() => go(store.back || "home")}><Icon name="arrowLeft" size={13} /> Retour</button>
          <div className="row gap-12" style={{ marginTop: 6 }}>
            <h2 className="mono" style={{ fontSize: 22 }}>{d.ref}</h2>
            <CircuitPill code={d.circuit} /><StatusBadge statut={d.statut} />
          </div>
          <p>{d.client.nom} · {d.motif} · {d.libelle}</p>
        </div>
        <div className="spacer" />
        {canAbandon && <button className="btn btn-ghost" onClick={() => setModal("abandon")}><Icon name="trash" size={15} /> Abandonner</button>}
        {isCreator && (d.statut === "soumis" || d.statut === "en_cours") && <button className="btn btn-ghost" onClick={() => { const r = store.rappeler(d.id); toast({ type: r.ok ? "warn" : "error", title: r.ok ? "Dossier rappelé" : "Rappel impossible", msg: r.msg }); }}><Icon name="refresh" size={15} /> Rappeler</button>}
        {d.statut === "valide" && <button className="btn btn-ghost" onClick={() => { store.publipostage(d.id); toast({ type: "success", title: "Courrier généré", msg: "Lettre de réponse client (publipostage) prête." }); }}><Icon name="send" size={15} /> Publipostage</button>}
        {(d.statut === "valide" || d.statut === "rejete" || d.statut === "abandonne") && !d.archive && <button className="btn btn-ghost" onClick={() => { store.archiver(d.id); toast({ type: "info", title: "Dossier archivé" }); }}><Icon name="doc" size={15} /> Archiver</button>}
        {d.archive && <Badge cls="b-grey" dot>Archivé</Badge>}
        <button className="btn btn-ghost" onClick={() => store.exportDossier(d)}><Icon name="download" size={15} /> CSV</button>
        <button className="btn btn-ghost" onClick={() => store.exportDossierXLS(d)}><Icon name="download" size={15} /> Excel</button>
        <button className="btn btn-ghost" onClick={() => store.exportPDF(d)}><Icon name="doc" size={15} /> PDF</button>
      </div>

      {/* bandeau action si tâche pour moi */}
      {ct && canActRole && d.statut !== "valide" && d.statut !== "rejete" && (
        <div className="card card-pad mb-16" style={{ borderLeft: "3px solid var(--orange)", background: "var(--orange-50)" }}>
          {sod ? (
            <div className="alert alert-red" style={{ background: "none", border: "none", padding: 0 }}><Icon name="shield" size={18} />
              <div><b>Séparation des tâches (SoD)</b><div className="tiny">Vous avez déjà agi à l'étape précédente : vous ne pouvez pas valider celle-ci.</div></div></div>
          ) : isClaimedByOther ? (
            <div className="lock-banner"><Icon name="lock" size={16} /> Tâche récupérée par {D2.userById[ct.agentClaim]?.nom}. Libération automatique à expiration du verrou.</div>
          ) : (
            <div className="row gap-12 wrap">
              <div style={{ flex: 1, minWidth: 200 }}>
                <div className="row gap-8"><Icon name="bell" size={17} color="var(--orange-600)" />
                  <b>Action requise — {E2.roleLabel(ct.role)}</b><TypeActeurBadge type={ct.type} /></div>
                <div className="tiny muted" style={{ marginTop: 2 }}>
                  {isClaimedByMe ? "Tâche récupérée par vous. " : "Récupérez la tâche pour la traiter. "}
                  SLA {E2.fmtDuree(ct.sla)}{E2.isEnRetard(ct) && " · dépassé"}</div>
                {isClaimedByMe && <div style={{ marginTop: 10 }}><SlaTimer task={ct} /></div>}
              </div>
              {!isClaimedByMe && ct.etat === "EN_CORBEILLE" &&
                <button className="btn btn-dark" onClick={() => { store.claim(d.id, ct.id); toast({ type: "success", title: "Tâche récupérée" }); }}>
                  <Icon name="lock" size={15} /> Récupérer</button>}
              {isClaimedByMe && <>
                <button className="btn btn-ghost btn-sm" onClick={() => { store.unclaim(d.id, ct.id); toast({ type: "info", title: "Libérée" }); }}>Libérer</button>
                <button className="btn btn-ghost" onClick={() => setModal("delegate")}><Icon name="delegate" size={15} /> Déléguer</button>
                <button className="btn btn-danger" onClick={() => setModal("reject")}><Icon name="x" size={15} /> Rejeter</button>
                <button className="btn btn-success" onClick={() => setModal("approve")}><Icon name="eye" size={15} /> Examiner {ct.type === "V" ? "(vérification)" : "(validation)"}</button>
              </>}
            </div>
          )}
        </div>
      )}
      {d.statut === "rejete" && <div className="alert alert-red mb-16"><Icon name="x" size={17} /><div><b>Rejeté par {d.rejetePar}</b><div className="tiny">Motif : {d.motifRejet}</div>{isCreator && <button className="btn btn-ghost btn-sm mt-8" onClick={() => setModal("modify")}><Icon name="edit" size={14} /> Corriger & resoumettre</button>}</div></div>}
      {d.statut === "valide" && <div className="alert alert-green mb-16"><Icon name="check" size={17} /><div><b>Dossier validé</b><div className="tiny">Toutes les étapes bloquantes approuvées · transmis au SI de facturation{d.controles?.some(c => c.etat === "A_CONTROLER") ? " · contrôle a posteriori en attente" : ""}.</div></div></div>}

      {isSuper && dossierActif && ct && (
        <div className="card card-pad mb-16" style={{ borderLeft: "3px solid var(--purple)", background: "var(--purple-bg)" }}>
          <div className="row gap-12 wrap">
            <div style={{ flex: 1, minWidth: 200 }}>
              <div className="row gap-8"><Icon name="shield" size={17} color="#6b3fa0" /><b>Pilotage superviseur — gestion des exceptions</b></div>
              <div className="tiny muted" style={{ marginTop: 2 }}>Relancer la corbeille, réaffecter à un autre rôle, ou forcer le déblocage d'un verrou. Toute action est journalisée.</div>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={() => { const r = store.relancer(d.id); toast({ type: "info", title: "Corbeille relancée", msg: "Notification renvoyée aux membres." }); }}><Icon name="bell" size={14} /> Relancer</button>
            {ct.etat === "RECLAMEE" && <button className="btn btn-ghost btn-sm" onClick={() => { const r = store.debloquer(d.id); if (r.ok) toast({ type: "warn", title: "Verrou forcé", msg: "Tâche remise en corbeille." }); }}><Icon name="unlock" size={14} /> Débloquer</button>}
            <button className="btn btn-dark btn-sm" onClick={() => setModal("reaffecter")}><Icon name="delegate" size={14} /> Réaffecter</button>
          </div>
        </div>
      )}

      <div className="tabbar">
        {[["apercu", "Aperçu"], ["circuit", "Circuit de validation"], ["pieces", `Pièces (${d.pieces.length})`], ["audit", `Journal d'audit (${d.audit.length})`]].map(([k, l]) =>
          <button key={k} className={"tab" + (tab === k ? " active" : "")} onClick={() => setTab(k)}>{l}</button>)}
      </div>

      {tab === "apercu" && <ApercuTab d={d} c={c} />}
      {tab === "circuit" && <div className="grid" style={{ gridTemplateColumns: "1fr 320px", alignItems: "start" }}>
        <div className="card card-pad"><WorkflowStepper dossier={d} /></div>
        <RoutageInfo d={d} />
      </div>}
      {tab === "pieces" && <PiecesTab d={d} />}
      {tab === "audit" && <AuditTab d={d} />}

      {modal === "approve" && <ApproveModal d={d} c={c} ct={ct} onClose={() => setModal(null)} onConfirm={doApprove} />}
      {modal === "reject" && <RejectModal onClose={() => setModal(null)} onConfirm={doReject} />}
      {modal === "delegate" && <DelegateModal ct={ct} user={user} onClose={() => setModal(null)} onConfirm={doDelegate} />}
      {modal === "abandon" && <AbandonModal d={d} onClose={() => setModal(null)} onConfirm={doAbandon} />}
      {modal === "modify" && <ModifyModal d={d} onClose={() => setModal(null)} onConfirm={doModify} />}
      {modal === "reaffecter" && <ReaffecterModal d={d} ct={ct} onClose={() => setModal(null)}
        onConfirm={(role, note) => { const r = store.reaffecter(d.id, role, note); if (r.ok) toast({ type: "success", title: "Tâche réaffectée" }); setModal(null); }} />}
    </div>
  );
}

/* Champs de la demande (partagé entre l'aperçu et la revue de validation) */
function buildFieldRows(d, c) {
  const rows = [
    ["Circuit", `${c.nom} (${d.circuit} · ${d.segment})`], ["Sous-flux", d.sousFlux],
    ["Date de demande", d.dateDemande ? E2.fmtDate(d.dateDemande) : "—"],
    ["Date de saisie", d.dateSaisie ? E2.fmtDate(d.dateSaisie) : E2.fmtDateTime(d.dateCreation)],
    ["Motif", d.motif], ["Libellé", d.libelle], ["Numéro Case (JADE)", d.numeroCase],
    [d.circuit === "DF" ? "Opérateur" : "Client", `${d.client.nom} — ${d.client.compte}`],
    ["Agent initiateur", `${d.agent}${d.matricule ? " (" + d.matricule + ")" : ""}`], ["Agent de saisie", `${d.agentSaisie || "—"}${d.matriculeSaisie ? " (" + d.matriculeSaisie + ")" : ""}`],
  ];
  if (d.refClient) rows.splice(5, 0, ["Référence client", d.refClient]);
  if (d.circuit === "DXC") {
    rows.push(["Formule Internet", d.client.formule], ["Récurrent mensuel", d.recurrent ? "Oui" : "Non"]);
  }
  if (d.circuit === "DOBB") {
    rows.push(["Formule d'abonnement", d.client.formule], ["Numéro d'appel", d.numeroAppel],
      ["Descriptif contestation", d.descriptifContestation], ["Localisation", d.localisation], ["Canal de remontée", d.canal],
      ["Période contestée", d.periode ? `${d.periode.debut} → ${d.periode.fin} (${d.periode.jours} j)` : "—"],
      ["Point de contact", d.pointContact], ["Récurrent mensuel", d.recurrent ? "Oui" : "Non"],
      ["Responsabilité — direction", d.responsabiliteDirection], ["Responsabilité — service", d.responsabiliteService],
      ["Agent responsable", d.agentResponsable],
      ["Date réception BO", d.dateReceptionBO], ["Date réception OCI", d.dateReceptionOCI]);
  }
  if (d.circuit === "DF") {
    rows.push(["De", d.memoDe], ["À", d.memoA], ["Objet", d.memoObjet], ["Objectif", d.memoObjectif],
      ["Contexte", d.memoContexte], ["Observation", d.memoObservation],
      ["Montant en €", d.montantEuro != null ? new Intl.NumberFormat("fr-FR").format(d.montantEuro) + " €" : "—"]);
  }
  // montants (toujours revus)
  rows.push(["Montant HT", E2.fmtMoney(d.ht)], ["TSC (3 %)", E2.fmtMoney(d.tsc)],
    [`TVA (${d.tauxTva * 100} %)${d.tvaBase === "htTsc" ? " · sur HT+TSC" : " · sur HT"}`, E2.fmtMoney(d.tva)], ["Total TTC", E2.fmtMoney(d.ttc)]);
  if (d.contactClient) rows.push(["Contact client", d.contactClient]);
  if (d.commentaire) rows.push(["Commentaire", d.commentaire]);
  return rows.filter(([, v]) => v != null && v !== "");
}

function ApercuTab({ d, c }) {
  const rows = buildFieldRows(d, c).filter(([k]) => !["Montant HT", "TSC (3 %)", "Total TTC"].includes(k) && !/^TVA/.test(k));
  return (
    <div className="grid" style={{ gridTemplateColumns: "1fr 320px", alignItems: "start" }}>
      <div className="col gap-16">
      <div className="card">
        <div className="card-head"><Icon name="doc" size={17} /><h3>Informations de la demande</h3>{d.masse && <span className="badge b-purple" style={{ marginLeft: 6 }}>Lot · {d.lignes.length} lignes</span>}</div>
        <div className="card-pad">
          {rows.map(([k, v], i) => <div key={i} className="row" style={{ padding: "8px 0", borderBottom: "1px solid var(--g100)", alignItems: "flex-start" }}>
            <div className="muted" style={{ width: 180, flexShrink: 0, fontSize: 13 }}>{k}</div>
            <div style={{ fontWeight: 500, flex: 1 }}>{v || "—"}</div>
          </div>)}
        </div>
      </div>
      {d.masse && <div className="card">
        <div className="card-head"><Icon name="layers" size={17} /><h3>Lignes du lot ({d.lignes.length})</h3>
          {d.commentaire && <span className="tiny muted" style={{ marginLeft: "auto" }}>{d.commentaire}</span>}</div>
        <div style={{ overflowX: "auto" }}>
          <table className="table compact" style={{ minWidth: d.lignes[0]?.fibre ? 760 : 420 }}>
            <thead><tr><th>#</th><th>Client</th>{d.lignes[0]?.fibre && <><th>Numéro Fibre</th><th>NCLI</th><th>CASE</th><th>Période</th><th className="num">Récur. HT</th><th className="num">Jours</th></>}{!d.lignes[0]?.fibre && <th>Compte</th>}<th className="num">Restitué HT</th><th className="num">TTC</th></tr></thead>
            <tbody>{d.lignes.map((l, i) => <tr key={i} className="norow">
              <td className="muted tiny">{i + 1}</td><td>{l.nom}</td>
              {l.fibre ? <><td className="mono tiny muted">{l.fibre}</td><td className="mono tiny muted">{l.ncli}</td><td className="mono tiny muted">{l.numeroCase}</td><td className="tiny muted">{l.periode || "—"}</td><td className="num mono tiny">{E2.fmtNum(l.recurrent || 0)}</td><td className="num tiny">{l.jours}</td></> : <td className="mono tiny muted">{l.compte}</td>}
              <td className="num mono tiny"><b>{E2.fmtMoney(l.ht)}</b></td><td className="num mono tiny">{E2.fmtMoney(l.ttc)}</td></tr>)}</tbody></table>
        </div>
      </div>}
      </div>
      <div className="card">
        <div className="card-head"><Icon name="calc" size={17} /><h3>Montants</h3></div>
        <div className="card-pad">
          <CalcRow label="Montant HT" v={d.ht} />
          {D2.CONFIG.taxes.tsc.actif && d.applyTsc !== false && <CalcRow label={`TSC (${+(D2.CONFIG.taxes.tsc.taux * 100).toFixed(2)} %)`} v={d.tsc} />}
          {D2.CONFIG.afficherHtPlusTsc && d.applyTsc !== false && <CalcRow label="HT + TSC" v={d.ht + d.tsc} />}
          {D2.CONFIG.taxes.tva.actif && d.applyTva !== false && <CalcRow label={`TVA (${+(d.tauxTva * 100).toFixed(2)} %) · ${d.tvaBase === "htTsc" ? "sur HT+TSC" : "sur HT"}`} v={d.tva} />}
          {(d.applyTsc === false || d.applyTva === false) && <div className="tiny muted" style={{ padding: "4px 0" }}>{[d.applyTsc === false ? "TSC non appliquée" : null, d.applyTva === false ? "TVA non appliquée" : null].filter(Boolean).join(" · ")}</div>}
          <div className="divider" style={{ margin: "8px 0" }} />
          <div className="row" style={{ justifyContent: "space-between" }}>
            <b>Total TTC</b><b className="mono" style={{ fontSize: 17, color: "var(--orange-600)" }}>{E2.fmtMoney(d.ttc)}</b>
          </div>
          {d.tranche && <div className="chip active" style={{ marginTop: 12 }}>Tranche {d.tranche}</div>}
        </div>
      </div>
    </div>
  );
}
function CalcRow({ label, v }) {
  return <div className="row" style={{ justifyContent: "space-between", padding: "5px 0" }}>
    <span className="muted" style={{ fontSize: 13 }}>{label}</span><span className="mono" style={{ fontWeight: 600 }}>{E2.fmtMoney(v)}</span></div>;
}
function RoutageInfo({ d }) {
  return <div className="card">
    <div className="card-head"><Icon name="flow" size={17} /><h3>Règle appliquée</h3></div>
    <div className="card-pad col gap-8">
      <div className="row" style={{ justifyContent: "space-between" }}><span className="muted tiny">Circuit</span><CircuitPill code={d.circuit} /></div>
      <div className="row" style={{ justifyContent: "space-between" }}><span className="muted tiny">Tranche</span><b className="tiny">{d.tranche}</b></div>
      <div className="row" style={{ justifyContent: "space-between" }}><span className="muted tiny">Étapes bloquantes</span><b className="tiny">{d.taches.filter(t => t.bloquant).length}</b></div>
      <div className="row" style={{ justifyContent: "space-between" }}><span className="muted tiny">Contrôle a posteriori</span><b className="tiny">{d.controles?.length || 0}</b></div>
      <div className="alert alert-grey tiny mt-8"><Icon name="info" size={14} />Chaîne déterminée par la matrice de décision consolidée — aucune règle codée en dur.</div>
    </div>
  </div>;
}
function PiecesTab({ d }) {
  return <div className="card card-pad">
    {d.pieces.length === 0 ? <Empty icon="paperclip" title="Aucune pièce jointe" /> :
      <div className="col gap-8">{d.pieces.map((p, i) => <div className="fileitem" key={i}>
        <Icon name="doc" size={18} color="var(--g600)" />
        <div style={{ flex: 1 }}><div style={{ fontWeight: 600 }}>{p.nom}</div><div className="tiny muted">{p.type}{p.taille != null ? " · " + (p.taille < 1048576 ? (p.taille / 1024).toFixed(0) + " Ko" : (p.taille / 1048576).toFixed(1) + " Mo") : ""}</div></div>
        {p.url
          ? <a className="iconbtn" href={p.url} download={p.nom} title="Télécharger la pièce"><Icon name="download" size={15} /></a>
          : <button className="iconbtn" title="Pièce de démonstration — non téléchargeable" disabled style={{ opacity: .4, cursor: "not-allowed" }}><Icon name="download" size={15} /></button>}
      </div>)}</div>}
  </div>;
}
function AuditTab({ d }) {
  const map = window.recentActivityMap || {};
  return <div className="card card-pad">
    <div className="stepper">
      {d.audit.slice().reverse().map((a, i) => (
        <div className="timeline-item" key={i}>
          <div className="timeline-ic"><Icon name="dots" size={14} /></div>
          <div style={{ flex: 1 }}>
            <div className="row gap-8 wrap"><b style={{ fontSize: 13 }}>{a.action}</b><span className="muted tiny">par {a.acteur}</span></div>
            {a.commentaire && <div className="tiny muted">{a.commentaire}</div>}
          </div>
          <div className="tiny muted nowrap">{E2.fmtDateTime(a.ts)}</div>
        </div>
      ))}
    </div>
  </div>;
}

/* ----------------------- Modals d'action ----------------------- */
function ApproveModal({ d, c, ct, onClose, onConfirm }) {
  const fields = uM2(() => buildFieldRows(d, c), [d, c]);
  const [flags, setFlags] = uS2({});         // idx -> true si anomalie signalée
  const [comments, setComments] = uS2({});   // idx -> texte
  const [globalExtra, setGlobalExtra] = uS2("");
  const [showErr, setShowErr] = uS2(false);
  const [detail, setDetail] = uS2(false);    // afficher la revue détaillée champ par champ
  const isFinal = ct.ordre === d.taches.length - 1;

  function toggleFlag(i) { setFlags(s => ({ ...s, [i]: !s[i] })); }
  function setC(i, v) { setComments(s => ({ ...s, [i]: v })); }

  const total = fields.length;
  const flagged = fields.map((_, i) => i).filter(i => flags[i]);
  const nbKo = flagged.length;
  const hasInvalid = nbKo > 0;
  const koSansComment = flagged.some(i => !(comments[i] && comments[i].trim()));

  // commentaire global = récap auto des anomalies signalées
  const recap = flagged.map(i => `• ${fields[i][0]} : ${comments[i] && comments[i].trim() ? comments[i].trim() : "(motif manquant)"}`).join("\n");
  const commentGlobal = [recap, globalExtra.trim()].filter(Boolean).join("\n");

  function confirm() {
    if (hasInvalid && koSansComment) { setShowErr(true); return; }
    // par défaut tous les champs non signalés sont considérés valides
    const revue = fields.map((f, i) => ({ champ: f[0], valeur: String(f[1]), verdict: flags[i] ? "ko" : "ok", commentaire: comments[i] || "" }));
    onConfirm({ decision: hasInvalid ? "rejete" : "approuve", commentaire: commentGlobal, revue });
  }

  return <Modal title={ct.type === "V" ? "Vérification de la demande" : "Validation de la demande"} icon={ct.type === "V" ? "eye" : "check"} onClose={onClose} lg
    footer={<>
      <div className="row gap-8" style={{ marginRight: "auto", alignItems: "center" }}>
        {nbKo > 0 ? <Badge cls="b-red" dot>{nbKo} anomalie(s) signalée(s)</Badge> : <Badge cls="b-green" dot>Aucune anomalie</Badge>}
      </div>
      <button className="btn btn-ghost" onClick={onClose}>Annuler</button>
      {hasInvalid
        ? <button className="btn btn-danger" onClick={confirm}><Icon name="x" size={15} /> Rejeter avec motifs</button>
        : <button className="btn btn-success" onClick={confirm}><Icon name="check" size={15} /> {ct.type === "V" ? "Valider la vérification" : "Approuver la demande"}</button>}
    </>}>
    <div className="alert alert-grey mb-16"><Icon name="info" size={15} />
      <div><b>{d.ref}</b> · {E2.fmtMoney(d.ttc)} · {E2.roleLabel(ct.role)}
        <div className="tiny">Par défaut, la demande est considérée conforme. <b>Signalez uniquement les champs en anomalie</b> (un motif est alors requis). {isFinal ? "Sans anomalie, le dossier sera « validé »." : "Sans anomalie, la demande avance à l'étape suivante."}</div></div></div>

    {/* Récap synthétique + accès à la revue détaillée */}
    <div className="row mb-8" style={{ justifyContent: "space-between", alignItems: "center" }}>
      <b style={{ fontSize: 13 }}>{detail ? "Revue détaillée — signaler les anomalies" : "Synthèse de la demande"}</b>
      <button className="btn-link tiny" onClick={() => setDetail(v => !v)}><Icon name={detail ? "eye" : "edit"} size={12} /> {detail ? "Masquer le détail" : "Examiner champ par champ"}</button>
    </div>

    {!detail ? (
      <div className="card" style={{ overflow: "hidden" }}>
        <table className="table compact"><tbody>
          {fields.slice(0, 8).map((f, i) => <tr key={i} className="norow"><td className="muted tiny" style={{ width: 170 }}>{f[0]}</td><td className="tiny" style={{ fontWeight: 600 }}>{f[1]}</td></tr>)}
        </tbody></table>
        {fields.length > 8 && <div className="tiny muted center" style={{ padding: 8 }}>+ {fields.length - 8} autres champs — « Examiner champ par champ » pour tout voir</div>}
      </div>
    ) : (
      <div className="review-list">
        {fields.map((f, i) => {
          const ko = !!flags[i];
          const missing = showErr && ko && !(comments[i] && comments[i].trim());
          return (
            <div className={"review-row" + (ko ? " is-ko" : "") + (missing ? " is-missing" : "")} key={i}>
              <div className="rr-main">
                <div className="rr-field"><div className="rr-label">{f[0]}</div><div className="rr-value">{f[1]}</div></div>
                <div className="rr-actions">
                  <button className={"rr-btn ko" + (ko ? " on" : "")} onClick={() => toggleFlag(i)} title="Signaler une anomalie">
                    <Icon name={ko ? "x" : "flag"} size={14} /> {ko ? "Anomalie" : "Signaler"}</button>
                </div>
              </div>
              {ko && <input className={"input" + (missing ? " err" : "")} style={{ marginTop: 8 }} value={comments[i] || ""}
                onChange={e => setC(i, e.target.value)} placeholder="Motif de l'anomalie (obligatoire)…" />}
            </div>
          );
        })}
      </div>
    )}

    {showErr && koSansComment && (
      <div className="alert alert-red mt-16"><Icon name="alert" size={15} />Chaque anomalie signalée doit comporter un motif.</div>
    )}

    {(hasInvalid || globalExtra) && <>
      <div className="divider"></div>
      <Field label="Commentaire global" hint="Récapitulatif automatique des anomalies — complétable.">
        <textarea className="textarea" style={{ minHeight: 70 }} value={commentGlobal}
          onChange={e => { const val = e.target.value; if (recap && val.startsWith(recap)) setGlobalExtra(val.slice(recap.length).replace(/^\n/, "")); else if (!recap) setGlobalExtra(val); }}
          placeholder="Observation éventuelle…" />
      </Field>
    </>}
  </Modal>;
}
function RejectModal({ onClose, onConfirm }) {
  const [m, setM] = uS2(""); const [err, setErr] = uS2(false);
  return <Modal title="Rejeter la demande" icon="x" onClose={onClose}
    footer={<><button className="btn btn-ghost" onClick={onClose}>Annuler</button>
      <button className="btn btn-danger" onClick={() => { if (!m.trim()) { setErr(true); return; } onConfirm(m); }}><Icon name="x" size={15} /> Confirmer le rejet</button></>}>
    <div className="alert alert-red mb-16"><Icon name="alert" size={15} />Le motif est obligatoire. La demande sera renvoyée à l'initiateur.</div>
    <Field label="Motif du rejet" req error={err ? "Le motif est obligatoire." : null}>
      <textarea className={"textarea" + (err ? " err" : "")} value={m} onChange={e => { setM(e.target.value); setErr(false); }} placeholder="ex. Pièces justificatives incomplètes…" /></Field>
  </Modal>;
}
function DelegateModal({ ct, user, onClose, onConfirm }) {
  const candidats = E2.membersOfRole(ct.role).filter(u => u.id !== user.id);
  const others = candidats.length ? candidats : D2.USERS.filter(u => u.id !== user.id).slice(0, 4);
  const [to, setTo] = uS2(others[0]?.id); const [note, setNote] = uS2("");
  return <Modal title="Déléguer la validation" icon="delegate" onClose={onClose}
    footer={<><button className="btn btn-ghost" onClick={onClose}>Annuler</button>
      <button className="btn btn-dark" onClick={() => onConfirm(to, note)}><Icon name="delegate" size={15} /> Déléguer</button></>}>
    <div className="alert alert-grey mb-16"><Icon name="info" size={15} />Pour couvrir une absence planifiée. La délégation est tracée et nominative ; la note d'intérim est conservée pour l'audit.</div>
    <Field label="Déléguer à"><select className="select" value={to} onChange={e => setTo(e.target.value)}>
      {others.map(u => <option key={u.id} value={u.id}>{u.nom} — {u.titre}</option>)}</select></Field>
    <Field label="Note d'intérim (conservée pour l'audit)"><textarea className="textarea" value={note} onChange={e => setNote(e.target.value)} placeholder="ex. Absence congés du 12 au 20/05…" /></Field>
  </Modal>;
}

function AbandonModal({ d, onClose, onConfirm }) {
  const [m, setM] = uS2("");
  return <Modal title="Abandonner la demande" icon="trash" onClose={onClose}
    footer={<><button className="btn btn-ghost" onClick={onClose}>Annuler</button>
      <button className="btn btn-danger" onClick={() => onConfirm(m)}><Icon name="trash" size={15} /> Confirmer l'abandon</button></>}>
    <div className="alert alert-orange mb-16"><Icon name="alert" size={15} />
      <div><b>{d.ref}</b> sera retirée du circuit.<div className="tiny">L'abandon n'est possible qu'avant la première approbation (étape critique). L'action est journalisée.</div></div></div>
    <Field label="Motif de l'abandon (optionnel)"><textarea className="textarea" value={m} onChange={e => setM(e.target.value)} placeholder="ex. Doublon, demande créée par erreur…" /></Field>
  </Modal>;
}

function ModifyModal({ d, onClose, onConfirm }) {
  const c = D2.CIRCUITS[d.circuit];
  const [ht, setHt] = uS2(d.ht);
  const [libelle, setLibelle] = uS2(d.libelle);
  const [commentaire, setCommentaire] = uS2(d.commentaire || "");
  const [applyTsc, setApplyTsc] = uS2(d.applyTsc !== false);
  const [applyTva, setApplyTva] = uS2(d.applyTva !== false);
  const [tvaBase, setTvaBase] = uS2(d.tvaBase || "ht");
  const htN = Number(ht) || 0;
  const m = E2.calcMontants(htN, c.tva, { tsc: applyTsc, tva: applyTva, tvaBase });
  const ancienneTr = E2.selectTranche(d.circuit, d.ttc);
  const nouvelleTr = htN > 0 ? E2.selectTranche(d.circuit, m.ttc) : null;
  const changeTr = nouvelleTr && ancienneTr && nouvelleTr.label !== ancienneTr.label;
  return <Modal title="Corriger & resoumettre" icon="edit" onClose={onClose} lg
    footer={<><button className="btn btn-ghost" onClick={onClose}>Annuler</button>
      <button className="btn btn-primary" disabled={!htN || !libelle.trim()} onClick={() => onConfirm({ ht: htN, libelle, commentaire, applyTsc, applyTva, tvaBase })}><Icon name="refresh" size={15} /> Resoumettre dans le circuit</button></>}>
    <div className="alert alert-blue mb-16"><Icon name="info" size={15} />
      <div>Motif du rejet : <b>{d.motifRejet}</b><div className="tiny">La correction recalcule TSC/TVA/TTC et replace le dossier dans le circuit de validation (recalcul de la chaîne si la tranche change).</div></div></div>
    <div className="grid grid-2">
      <Field label="Montant HT (FCFA)" req>
        <div className="input-addon"><input className="input" type="number" min="0" value={ht} onChange={e => setHt(e.target.value)} style={{ paddingRight: 52 }} /><span className="suffix">FCFA</span></div>
      </Field>
      <Field label="Libellé" req><input className="input" value={libelle} onChange={e => setLibelle(e.target.value)} /></Field>
    </div>
    <Field label="Commentaire"><textarea className="textarea" value={commentaire} onChange={e => setCommentaire(e.target.value)} style={{ minHeight: 60 }} /></Field>
    {(D2.CONFIG.taxes.tsc.actif || D2.CONFIG.taxes.tva.actif) && <div className="row gap-16 mb-8" style={{ flexWrap: "wrap" }}>
      {D2.CONFIG.taxes.tsc.actif && <div className="switch-row"><button type="button" className={"switch" + (applyTsc ? " on" : "")} onClick={() => setApplyTsc(v => !v)} /><span style={{ fontSize: 13, fontWeight: 600 }}>Appliquer la TSC</span></div>}
      {D2.CONFIG.taxes.tva.actif && <div className="switch-row"><button type="button" className={"switch" + (applyTva ? " on" : "")} onClick={() => setApplyTva(v => !v)} /><span style={{ fontSize: 13, fontWeight: 600 }}>Appliquer la TVA</span></div>}
    </div>}
    {D2.CONFIG.taxes.tva.actif && applyTva && D2.CONFIG.taxes.tsc.actif && applyTsc && <div className="col gap-6 mb-8" style={{ padding: "8px 10px", background: "var(--g50)", borderRadius: 8 }}>
      <div className="tiny muted" style={{ fontWeight: 700 }}>Assiette de la TVA</div>
      <label className="row gap-8" style={{ alignItems: "flex-start", cursor: "pointer" }}><input type="radio" name="tvaBaseCorr" checked={tvaBase === "ht"} onChange={() => setTvaBase("ht")} style={{ marginTop: 3 }} /><span style={{ fontSize: 12.5, lineHeight: 1.35 }}><b>Nouvelle règle</b> — TVA sur le <b>montant HT</b></span></label>
      <label className="row gap-8" style={{ alignItems: "flex-start", cursor: "pointer" }}><input type="radio" name="tvaBaseCorr" checked={tvaBase === "htTsc"} onChange={() => setTvaBase("htTsc")} style={{ marginTop: 3 }} /><span style={{ fontSize: 12.5, lineHeight: 1.35 }}><b>Ancienne règle</b> — TVA sur <b>HT + TSC</b></span></label>
    </div>}
    <div className="card card-pad" style={{ background: "var(--g50)" }}>
      <div className="row" style={{ justifyContent: "space-between" }}><span className="muted tiny">Nouveau TTC</span><b className="mono">{E2.fmtMoney(m.ttc)}</b></div>
      <div className="row" style={{ justifyContent: "space-between", marginTop: 6 }}><span className="muted tiny">Tranche</span>
        {nouvelleTr ? <span className="chip active">{nouvelleTr.label}</span> : <span className="tiny muted">—</span>}</div>
      {changeTr && <div className="alert alert-orange tiny mt-8"><Icon name="alert" size={14} />Changement de tranche : « {ancienneTr.label} » → « {nouvelleTr.label} ». La chaîne de validation sera recalculée.</div>}
    </div>
  </Modal>;
}

function ReaffecterModal({ d, ct, onClose, onConfirm }) {
  const _mr = D2.rolesInMatrix();
  const roles = D2.ROLES.filter(r => ["V", "A"].includes(r.type) && (r.circuit === d.circuit || r.circuit === "*") && _mr.has(r.code));
  const [role, setRole] = uS2(ct ? ct.role : roles[0]?.code);
  const [note, setNote] = uS2("");
  return <Modal title="Réaffecter la tâche" icon="delegate" onClose={onClose}
    footer={<><button className="btn btn-ghost" onClick={onClose}>Annuler</button><button className="btn btn-dark" onClick={() => onConfirm(role, note)}><Icon name="delegate" size={15} /> Réaffecter</button></>}>
    <div className="alert alert-grey mb-16"><Icon name="info" size={15} /><div>Redirige la tâche courante vers une autre corbeille (rôle) pour débloquer une situation exceptionnelle. Action tracée.</div></div>
    <Field label="Tâche courante"><input className="input" value={ct ? E2.roleLabel(ct.role) : "—"} readOnly /></Field>
    <Field label="Réaffecter à la corbeille">
      <select className="select" value={role} onChange={e => setRole(e.target.value)}>
        {roles.map(r => <option key={r.code} value={r.code}>{r.libelle} {r.circuit === "*" ? "(pivot)" : "(" + r.circuit + ")"}</option>)}
      </select>
    </Field>
    <Field label="Motif / note"><textarea className="textarea" value={note} onChange={e => setNote(e.target.value)} placeholder="ex. Surcharge de la corbeille, dossier prioritaire…" /></Field>
  </Modal>;
}

Object.assign(window, { MesDemandesScreen, DossierTable, DossierExplorer, ConsultationScreen, CorbeillesScreen, DossierDetailScreen });
