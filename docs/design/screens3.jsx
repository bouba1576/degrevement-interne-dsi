/* ====================================================================
   PGD — Écrans : Dashboard KPI · Contrôle · Administration · Journal
   ==================================================================== */
const { useState: uS3, useMemo: uM3 } = React;
const E3 = window.PGD_ENGINE, D3 = window.PGD_DATA;

/* ======================== TABLEAU DE BORD ======================== */
function DashboardScreen({ embedded }) {
  const store = window.useStore();
  const toast = window.useToast();
  const { dossiers, go, user } = store;
  const [periode, setPeriode] = uS3("30");
  const [circuitF, setCircuitF] = uS3("tous");
  const [esc, setEsc] = uS3(null);
  const canEscalate = user.roles.includes("SUPERVISEUR") || user.roles.includes("ADMIN");

  const data = uM3(() => {
    let ds = dossiers;
    if (circuitF !== "tous") ds = ds.filter(d => d.circuit === circuitF);
    // Filtre par période (bilan jour / semaine / mois / trimestre / année — retour pôle DOBB)
    if (periode !== "all") {
      const spanDays = { "1": 1, "7": 7, "30": 30, "90": 90, "365": 365 }[periode];
      if (spanDays) { const from = Date.now() - spanDays * 86400000; ds = ds.filter(d => (d.dateSoumission || d.dateCreation || 0) >= from); }
    }
    const total = ds.length;
    const valide = ds.filter(d => d.statut === "valide").length;
    const rejete = ds.filter(d => d.statut === "rejete").length;
    const enCours = ds.filter(d => d.statut === "soumis" || d.statut === "en_cours").length;
    const tauxAppro = (valide + rejete) ? Math.round(valide / (valide + rejete) * 100) : 0;
    // délai moyen (validés) en heures
    const delais = ds.filter(d => d.statut === "valide" && d.dateValidation).map(d => (d.dateValidation - d.dateSoumission) / 3600000);
    const delaiMoy = delais.length ? delais.reduce((a, b) => a + b, 0) / delais.length : 0;
    const montantValide = ds.filter(d => d.statut === "valide").reduce((a, d) => a + d.ttc, 0);
    // en retard
    let retard = 0;
    ds.forEach(d => (d.taches || []).forEach(t => { if (E3.isEnRetard(t)) retard++; }));
    // par circuit
    const parCircuit = ["DXC", "DOBB", "DF"].map(code => ({
      label: code, value: dossiers.filter(d => d.circuit === code).length,
      color: { DXC: "#4BB4E6", DOBB: "#FF7900", DF: "#A885D8" }[code],
    }));
    // charge par corbeille
    const charge = {};
    ds.forEach(d => (d.taches || []).forEach(t => {
      if (t.etat === "EN_CORBEILLE" || t.etat === "RECLAMEE") charge[t.role] = (charge[t.role] || 0) + 1;
    }));
    const chargeArr = Object.entries(charge).map(([r, n]) => ({ role: r, n })).sort((a, b) => b.n - a.n);

    // ----- Stats par motif (volume, montant, % du global) -----
    const motifMap = {}; const totMontant = ds.reduce((a, d) => a + d.ttc, 0) || 1;
    ds.forEach(d => { const o = motifMap[d.motif] = motifMap[d.motif] || { v: 0, m: 0 }; o.v++; o.m += d.ttc; });
    const parMotif = Object.entries(motifMap).map(([m, o]) => ({ label: m, value: o.v, montant: o.m, pct: Math.round(o.m / totMontant * 100) })).sort((a, b) => b.montant - a.montant).slice(0, 6);
    // top motif par univers
    const motifUniv = {};
    ds.forEach(d => { const u = d.univers || "—"; const k = u + "||" + d.motif; motifUniv[k] = (motifUniv[k] || 0) + d.ttc; });
    const topMotifParUnivers = ["Fixe", "Mobile", "Internet"].map(u => {
      const list = Object.entries(motifUniv).filter(([k]) => k.startsWith(u + "||")).map(([k, m]) => ({ motif: k.split("||")[1], m })).sort((a, b) => b.m - a.m);
      return { univers: u, top: list[0] || null };
    });

    // ----- KPIs Initiateur (demandes créées par l'utilisateur) -----
    const mineI = ds.filter(d => d.createdBy === user.id || d.createdByName === user.nom);
    const initStats = {
      initiees: mineI.length,
      enCours: mineI.filter(d => d.statut === "soumis" || d.statut === "en_cours").length,
      validees: mineI.filter(d => d.statut === "valide").length,
      rejetees: mineI.filter(d => d.statut === "rejete").length,
    };
    let initRetard = 0, initTot = 0;
    mineI.forEach(d => (d.taches || []).forEach(t => { if (t.etat === "EN_CORBEILLE" || t.etat === "RECLAMEE") { initTot++; if (E3.isEnRetard(t)) initRetard++; } }));
    initStats.slaOk = initTot ? Math.round((initTot - initRetard) / initTot * 100) : 100;

    // ----- KPIs Validateur (tâches sur les rôles de l'utilisateur) -----
    const myRoles = user.roles;
    let vAttente = 0, vEnCours = 0;
    const vDossiers = new Set();
    dossiers.forEach(d => (d.taches || []).forEach(t => {
      if (myRoles.includes(t.role)) {
        if (t.etat === "EN_CORBEILLE") { vAttente++; vDossiers.add(d.id); }
        else if (t.etat === "RECLAMEE") { vEnCours++; vDossiers.add(d.id); }
      }
    }));
    let vValidees = 0, vRejetees = 0, vRetard = 0, vTot = 0;
    dossiers.forEach(d => (d.taches || []).forEach(t => {
      if (myRoles.includes(t.role) && t.acteur === user.id) {
        if (t.decision === "rejete") vRejetees++; else if (t.decision) vValidees++;
      }
      if (myRoles.includes(t.role) && (t.etat === "EN_CORBEILLE" || t.etat === "RECLAMEE")) { vTot++; if (E3.isEnRetard(t)) vRetard++; }
    }));
    const valStats = { attente: vAttente, enCours: vEnCours, validees: vValidees, rejetees: vRejetees, slaOk: vTot ? Math.round((vTot - vRetard) / vTot * 100) : 100 };

    // ----- Stats par univers FMI, facteur, responsabilité (réf. feuille KPI) -----
    const univ = {}; const fact = { interne: { v: 0, m: 0 }, externe: { v: 0, m: 0 } };
    const dir = {}; const serv = {};
    ds.forEach(d => {
      const u = d.univers || "—"; univ[u] = univ[u] || { v: 0, ht: 0, ttc: 0 }; univ[u].v++; univ[u].ht += d.ht; univ[u].ttc += d.ttc;
      const f = d.facteur || "interne"; if (fact[f]) { fact[f].v++; fact[f].m += d.ttc; }
      if (d.responsabiliteDirection) { dir[d.responsabiliteDirection] = (dir[d.responsabiliteDirection] || 0) + d.ttc; }
      if (d.responsabiliteService) { serv[d.responsabiliteService] = (serv[d.responsabiliteService] || 0) + d.ttc; }
    });
    const parUnivers = Object.entries(univ).map(([k, o]) => ({ label: k, ...o })).sort((a, b) => b.ttc - a.ttc);
    // univers pour les dossiers TRAITÉS (validés) + saisis dans le SI
    const univT = {}; let saisiSI = 0, saisiSIm = 0;
    ds.filter(d => d.statut === "valide").forEach(d => {
      const u = d.univers || "—"; univT[u] = univT[u] || { v: 0, ttc: 0 }; univT[u].v++; univT[u].ttc += d.ttc;
      if (d.saisiSI) { saisiSI++; saisiSIm += d.ttc; }
    });
    const parUniversTraites = Object.entries(univT).map(([k, o]) => ({ label: k, ...o })).sort((a, b) => b.ttc - a.ttc);
    // évolution M-1 vs M par univers
    const _now = new Date(); const _mois = _now.getMonth(), _an = _now.getFullYear();
    const inMoisRef = (d, dm) => { const x = new Date(d.dateSoumission || d.dateCreation); const t = new Date(_an, _mois - dm, 1); return x.getMonth() === t.getMonth() && x.getFullYear() === t.getFullYear(); };
    const evoUniv = ["Fixe", "Mobile", "Internet"].map(u => {
      const m0 = ds.filter(d => (d.univers === u) && inMoisRef(d, 0)).reduce((a, d) => a + d.ttc, 0);
      const m1 = ds.filter(d => (d.univers === u) && inMoisRef(d, 1)).reduce((a, d) => a + d.ttc, 0);
      return { univers: u, mM: m0, mM1: m1, pct: m1 ? Math.round((m0 - m1) / m1 * 100) : null };
    });
    const factTot = fact.interne.m + fact.externe.m || 1;
    const parFacteur = [
      { label: "Interne / structurel", ...fact.interne, pct: Math.round(fact.interne.m / factTot * 100) },
      { label: "Externe / conjoncturel", ...fact.externe, pct: Math.round(fact.externe.m / factTot * 100) },
    ];
    const topDir = Object.entries(dir).map(([k, m]) => ({ label: k, m })).sort((a, b) => b.m - a.m).slice(0, 6);
    const dirTot = Object.values(dir).reduce((a, b) => a + b, 0) || 1;
    topDir.forEach(d2 => d2.pct = Math.round(d2.m / dirTot * 100));
    const topServ = Object.entries(serv).map(([k, m]) => ({ label: k, m })).sort((a, b) => b.m - a.m).slice(0, 6);
    // reçus vs traités (traités = validés)
    const recusV = ds.length, recusM = ds.reduce((a, d) => a + d.ttc, 0);
    const traitesArr = ds.filter(d => d.statut === "valide");
    const traitesV = traitesArr.length, traitesM = traitesArr.reduce((a, d) => a + d.ttc, 0);
    // M vs M-1 (par date de soumission)
    const now2 = new Date(); const mois = now2.getMonth(), an = now2.getFullYear();
    const inMois = (d, dm) => { const x = new Date(d.dateSoumission || d.dateCreation); const t = new Date(an, mois - dm, 1); return x.getMonth() === t.getMonth() && x.getFullYear() === t.getFullYear(); };
    const mM = ds.filter(d => inMois(d, 0)).reduce((a, d) => a + d.ttc, 0);
    const mM1 = ds.filter(d => inMois(d, 1)).reduce((a, d) => a + d.ttc, 0);
    const evoPct = mM1 ? Math.round((mM - mM1) / mM1 * 100) : null;

    return { total, valide, rejete, enCours, tauxAppro, delaiMoy, montantValide, retard, parCircuit, chargeArr, parMotif, initStats, valStats,
      parUnivers, parFacteur, topDir, topServ, recusV, recusM, traitesV, traitesM, mM, mM1, evoPct,
      topMotifParUnivers, parUniversTraites, evoUniv, saisiSI, saisiSIm };
  }, [dossiers, circuitF, periode, user]);

  const isInit = user.roles.some(r => D3.roleByCode[r]?.type === "I");
  const periodeLbl = { "1": "aujourd'hui", "7": "7 derniers jours", "30": "30 derniers jours", "90": "trimestre", "365": "année", "all": "toutes périodes" }[periode] || "";
  const isValid = user.roles.some(r => ["V", "A"].includes(D3.roleByCode[r]?.type));
  const isPilote = user.roles.includes("SUPERVISEUR") || user.roles.includes("ADMIN") || user.roles.includes("DF") || user.roles.includes("DGA_DG");
  const [vue, setVue] = uS3(isPilote ? "pilotage" : isValid ? "validateur" : "initiateur");
  const vues = [
    isInit && { k: "initiateur", l: "Initiateur" },
    isValid && { k: "validateur", l: "Validateur" },
    isPilote && { k: "pilotage", l: "Pilotage global" },
  ].filter(Boolean);

  return (
    <div className="fade-in">
      <div className="page-head">
        <div>{embedded ? <h2 style={{ fontSize: 17 }}>Tableau de bord</h2> : <h2>Tableau de bord</h2>}
          {!embedded && <p>Indicateurs adaptés à votre rôle — délais, volumes, taux et respect des SLA.</p>}</div>
        <div className="spacer" />
        {vues.length > 1 && <div className="seg" style={{ marginRight: 8 }}>
          {vues.map(v => <button key={v.k} className={vue === v.k ? "active" : ""} onClick={() => setVue(v.k)}>{v.l}</button>)}
        </div>}
        <div className="row gap-8" style={{ alignItems: "center", flexWrap: "wrap" }}>
          <div className="seg">
            {[["1", "Jour"], ["7", "Semaine"], ["30", "Mois"], ["90", "Trimestre"], ["365", "Année"], ["all", "Tout"]].map(([k, l]) =>
              <button key={k} className={periode === k ? "active" : ""} onClick={() => setPeriode(k)}>{l}</button>)}
          </div>
          <div className="seg">
            {[["tous", "Tous circuits"], ["DXC", "DXC"], ["DOBB", "DOBB"], ["DF", "DF"]].map(([k, l]) =>
              <button key={k} className={circuitF === k ? "active" : ""} onClick={() => setCircuitF(k)}>{l}</button>)}
          </div>
        </div>
      </div>

      {/* ===== Vue INITIATEUR ===== */}
      {vue === "initiateur" && <>
        <div className="grid grid-4 mb-16">
          <Kpi label="Demandes initiées" value={data.initStats.initiees} sub={periodeLbl} color="var(--blue)" ic="doc" />
          <Kpi label="En cours" value={data.initStats.enCours} sub="dans le circuit" color="var(--orange)" ic="refresh" />
          <Kpi label="Validées" value={data.initStats.validees} sub="" color="var(--green)" ic="check" />
          <Kpi label="Rejetées" value={data.initStats.rejetees} sub="" color="var(--red)" ic="x" />
        </div>
        <div className="grid grid-4 mb-16">
          <Kpi label="Respect des SLA" value={data.initStats.slaOk + " %"} sub="tâches de mes dossiers" color="var(--purple)" ic="clock" warn={data.initStats.slaOk < 80} />
        </div>
      </>}

      {/* ===== Vue VALIDATEUR ===== */}
      {vue === "validateur" && <>
        <div className="grid grid-4 mb-16">
          <Kpi label="En attente de validation" value={data.valStats.attente} sub="dans mes corbeilles" color="var(--orange)" ic="inbox" />
          <Kpi label="En cours de traitement" value={data.valStats.enCours} sub="récupérées par moi" color="var(--blue)" ic="refresh" />
          <Kpi label="Validées par moi" value={data.valStats.validees} sub="" color="var(--green)" ic="check" />
          <Kpi label="Rejetées par moi" value={data.valStats.rejetees} sub="" color="var(--red)" ic="x" />
        </div>
        <div className="grid grid-4 mb-16">
          <Kpi label="Respect des SLA" value={data.valStats.slaOk + " %"} sub="mes tâches en cours" color="var(--purple)" ic="clock" warn={data.valStats.slaOk < 80} />
        </div>
      </>}

      {/* ===== Vue PILOTAGE (existante) ===== */}
      {vue === "pilotage" && <>
      <div className="grid grid-4 mb-16">
        <Kpi label="Délai moyen de traitement" value={E3.fmtDuree(data.delaiMoy)} sub="soumission → validation" color="var(--orange)" ic="clock" />
        <Kpi label="Taux d'approbation" value={data.tauxAppro + " %"} sub={`${data.valide} validés · ${data.rejete} rejetés`} color="var(--green)" ic="check" />
        <Kpi label="Dossiers en circuit" value={data.enCours} sub={data.retard ? `${data.retard} tâche(s) en retard SLA` : "aucun retard SLA"} color="var(--blue)" ic="refresh" warn={data.retard > 0} />
        <Kpi label="Montant validé cumulé" value={E3.fmtMoneyShort(data.montantValide)} sub="FCFA TTC" color="var(--purple)" ic="scale" />
      </div>

      {canEscalate && (
        <div className="card card-pad mb-16" style={{ background: "var(--g50)" }}>
          <div className="row gap-16 wrap">
            <div className="row gap-8"><Icon name="clock" size={18} color="var(--orange-600)" />
              <div><b style={{ fontSize: 13.5 }}>Simulation du temps</b><div className="tiny muted">Avance l'horloge pour déclencher l'expiration des verrous et l'escalade automatique sur SLA.</div></div></div>
            <div className="spacer" />
            <div className="row gap-8">
              {[["+4 h", 4], ["+24 h", 24], ["+72 h", 72]].map(([l, h]) =>
                <button key={h} className="btn btn-ghost btn-sm" onClick={() => {
                  const evts = store.advanceTime(h);
                  const esc = evts.filter(e => e.type === "escalade").length, ver = evts.filter(e => e.type === "verrou").length;
                  toast({ type: evts.length ? "warn" : "info", title: `Temps avancé de ${l}`, msg: evts.length ? `${esc} escalade(s) auto · ${ver} verrou(x) expiré(s)` : "Aucun dépassement de SLA" });
                }}><Icon name="refresh" size={13} /> {l}</button>)}
            </div>
          </div>
        </div>
      )}

      <div className="grid" style={{ gridTemplateColumns: "1.4fr 1fr", alignItems: "start", marginBottom: 16 }}>
        <div className="card">
          <div className="card-head"><Icon name="chart" size={17} /><h3>Volume par circuit</h3><span className="muted" style={{ marginLeft: "auto" }}>{data.total} dossiers</span></div>
          <div className="card-pad"><BarChart data={data.parCircuit} /></div>
        </div>
        <div className="card">
          <div className="card-head"><Icon name="layers" size={17} /><h3>Répartition des statuts</h3></div>
          <div className="card-pad donut-wrap">
            <Donut segments={statutSegments(dossiers, circuitF)} />
            <div className="legend">{statutSegments(dossiers, circuitF).map((s, i) =>
              <div className="legend-item" key={i}><span className="sw" style={{ background: s.color }} />{s.label} <b style={{ marginLeft: 4 }}>{s.value}</b></div>)}</div>
          </div>
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: "1fr 1.4fr", alignItems: "start" }}>
        <div className="card">
          <div className="card-head"><Icon name="inbox" size={17} /><h3>Charge par corbeille</h3></div>
          <div className="card-pad col gap-12">
            {data.chargeArr.length === 0 ? <div className="muted tiny center" style={{ padding: 16 }}>Aucune tâche en attente.</div> :
              data.chargeArr.map(({ role, n }) => {
                const max = data.chargeArr[0].n;
                return <div key={role}>
                  <div className="row" style={{ justifyContent: "space-between", marginBottom: 4, gap: 8 }}>
                    <span className="tiny" style={{ fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{E3.roleLabel(role)}</span><span className="tiny mono" style={{ flexShrink: 0 }}>{n}</span></div>
                  <div className="progress"><i style={{ width: (n / max * 100) + "%" }} /></div>
                </div>;
              })}
          </div>
        </div>
        <div className="card">
          <div className="card-head"><Icon name="alert" size={17} /><h3>Dossiers nécessitant attention</h3><button className="btn-link" style={{ marginLeft: "auto" }} onClick={() => go("corbeilles")}>Corbeilles</button></div>
          <div style={{ overflow: "hidden" }}>
            <table className="table compact">
              <thead><tr><th>Réf.</th><th>Circuit</th><th className="num">TTC</th><th>Étape</th><th>Ancienneté</th><th></th></tr></thead>
              <tbody>
                {attentionList(dossiers, circuitF).slice(0, 6).map(({ d, t, age }) => (
                  <tr key={t.id}>
                    <td className="mono tiny" style={{ fontWeight: 600, cursor: "pointer" }} onClick={() => { store.back = "dashboard"; go("detail", d.id); }}>{d.ref}</td>
                    <td><CircuitPill code={d.circuit} /></td>
                    <td className="num tiny"><b>{E3.fmtMoneyShort(d.ttc)}</b></td>
                    <td className="tiny">{E3.roleLabel(t.role)}</td>
                    <td>{E3.isEnRetard(t) ? <Badge cls="b-red" dot>{E3.fmtDuree(age)}</Badge> : <span className="tiny muted">{E3.fmtDuree(age)}</span>}</td>
                    <td>{canEscalate && E3.isEnRetard(t)
                      ? <button className="btn btn-ghost btn-sm" title="Escalader vers N+1" onClick={() => setEsc({ d, t })}><Icon name="arrowRight" size={13} /> Escalader</button>
                      : null}</td>
                  </tr>
                ))}
                {attentionList(dossiers, circuitF).length === 0 && <tr className="norow"><td colSpan="6" className="center muted tiny" style={{ padding: 20 }}>Tout est à jour.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      </>}

      {/* ===== Statistiques par motif (toutes vues) ===== */}
      <div className="card mt-16">
        <div className="card-head"><Icon name="flag" size={17} /><h3>Statistiques par motif</h3><span className="muted" style={{ marginLeft: "auto" }}>{circuitF === "tous" ? "tous circuits" : circuitF}</span></div>
        <div className="card-pad col gap-10">
          {data.parMotif.length === 0 ? <div className="muted tiny center" style={{ padding: 16 }}>Aucune donnée.</div> :
            data.parMotif.map(({ label, value, montant, pct }) => {
              const max = data.parMotif[0].montant || 1;
              return <div key={label}>
                <div className="row" style={{ justifyContent: "space-between", marginBottom: 4, gap: 8 }}>
                  <span className="tiny" style={{ fontWeight: 600 }}>{label} <span className="muted">· {value} dossier(s)</span></span>
                  <span className="tiny mono">{E3.fmtMoneyShort(montant)} · {pct}%</span></div>
                <div className="progress"><i style={{ width: (montant / max * 100) + "%" }} /></div>
              </div>;
            })}
        </div>
      </div>

      {/* ===== KPIs avancés (réf. feuille KPI du workflow) ===== */}
      {vue === "pilotage" && <>
        <div className="grid grid-4 mt-16 mb-16">
          <Kpi label="Dossiers reçus" value={data.recusV} sub={E3.fmtMoneyShort(data.recusM) + " FCFA TTC"} color="var(--blue)" ic="inbox" />
          <Kpi label="Dossiers traités" value={data.traitesV} sub={E3.fmtMoneyShort(data.traitesM) + " FCFA TTC"} color="var(--green)" ic="check" />
          <Kpi label="Montant ce mois (M)" value={E3.fmtMoneyShort(data.mM)} sub="FCFA TTC" color="var(--orange)" ic="scale" />
          <Kpi label="Évolution M‑1 → M" value={data.evoPct == null ? "—" : (data.evoPct > 0 ? "+" : "") + data.evoPct + " %"} sub={"M‑1 : " + E3.fmtMoneyShort(data.mM1)} color="var(--purple)" ic="chart" warn={data.evoPct > 0} />
        </div>

        <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", alignItems: "start", marginBottom: 16 }}>
          <div className="card">
            <div className="card-head"><Icon name="layers" size={17} /><h3>Montant par univers FMI</h3></div>
            <div className="card-pad col gap-10">
              {data.parUnivers.map(u => { const max = data.parUnivers[0].ttc || 1;
                return <div key={u.label}>
                  <div className="row" style={{ justifyContent: "space-between", marginBottom: 4 }}>
                    <span className="tiny" style={{ fontWeight: 600 }}>{u.label} <span className="muted">· {u.v} dossier(s)</span></span>
                    <span className="tiny mono">HT {E3.fmtMoneyShort(u.ht)} · TTC {E3.fmtMoneyShort(u.ttc)}</span></div>
                  <div className="progress"><i style={{ width: (u.ttc / max * 100) + "%" }} /></div>
                </div>; })}
            </div>
          </div>
          <div className="card">
            <div className="card-head"><Icon name="flag" size={17} /><h3>Facteurs de dégrèvement</h3></div>
            <div className="card-pad donut-wrap">
              <Donut segments={data.parFacteur.map((f, i) => ({ label: f.label, value: f.m, color: i === 0 ? "#4BB4E6" : "#FF7900" }))} />
              <div className="legend">{data.parFacteur.map((f, i) => <div className="legend-item" key={i}>
                <span className="sw" style={{ background: i === 0 ? "#4BB4E6" : "#FF7900" }} />{f.label} <b style={{ marginLeft: 4 }}>{f.pct}%</b>
                <span className="muted tiny" style={{ marginLeft: 4 }}>({E3.fmtMoneyShort(f.m)})</span></div>)}</div>
            </div>
          </div>
        </div>

        <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", alignItems: "start", marginBottom: 16 }}>
          <div className="card">
            <div className="card-head"><Icon name="building" size={17} /><h3>Top responsabilité par direction</h3></div>
            <div className="card-pad col gap-10">
              {data.topDir.length === 0 ? <div className="muted tiny center" style={{ padding: 12 }}>Aucune donnée (circuit DOBB).</div> :
                data.topDir.map(d2 => { const max = data.topDir[0].m || 1;
                  return <div key={d2.label}><div className="row" style={{ justifyContent: "space-between", marginBottom: 4 }}>
                    <span className="tiny" style={{ fontWeight: 600 }}>{d2.label}</span><span className="tiny mono">{E3.fmtMoneyShort(d2.m)} · {d2.pct}%</span></div>
                    <div className="progress"><i style={{ width: (d2.m / max * 100) + "%" }} /></div></div>; })}
            </div>
          </div>
          <div className="card">
            <div className="card-head"><Icon name="users" size={17} /><h3>Top responsabilité par service</h3></div>
            <div className="card-pad col gap-10">
              {data.topServ.length === 0 ? <div className="muted tiny center" style={{ padding: 12 }}>Aucune donnée (circuit DOBB).</div> :
                data.topServ.map(s2 => { const max = data.topServ[0].m || 1;
                  return <div key={s2.label}><div className="row" style={{ justifyContent: "space-between", marginBottom: 4 }}>
                    <span className="tiny" style={{ fontWeight: 600 }}>{s2.label}</span><span className="tiny mono">{E3.fmtMoneyShort(s2.m)}</span></div>
                    <div className="progress"><i style={{ width: (s2.m / max * 100) + "%" }} /></div></div>; })}
            </div>
          </div>
        </div>

        {/* Saisi dans le SI + traités par univers + top motif par univers + évolution par univers */}
        <div className="grid grid-4 mb-16">
          <Kpi label="Dégrèvements saisis dans le SI" value={data.saisiSI} sub={E3.fmtMoneyShort(data.saisiSIm) + " FCFA TTC"} color="var(--green)" ic="check" />
        </div>
        <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", alignItems: "start", marginBottom: 16 }}>
          <div className="card">
            <div className="card-head"><Icon name="layers" size={17} /><h3>Dossiers traités par univers</h3></div>
            <div className="card-pad col gap-10">
              {data.parUniversTraites.length === 0 ? <div className="muted tiny center" style={{ padding: 12 }}>Aucun dossier traité.</div> :
                data.parUniversTraites.map(u => { const max = data.parUniversTraites[0].ttc || 1;
                  return <div key={u.label}><div className="row" style={{ justifyContent: "space-between", marginBottom: 4 }}>
                    <span className="tiny" style={{ fontWeight: 600 }}>{u.label} <span className="muted">· {u.v}</span></span><span className="tiny mono">{E3.fmtMoneyShort(u.ttc)}</span></div>
                    <div className="progress"><i style={{ width: (u.ttc / max * 100) + "%" }} /></div></div>; })}
            </div>
          </div>
          <div className="card">
            <div className="card-head"><Icon name="chart" size={17} /><h3>Évolution M‑1 → M par univers</h3></div>
            <div className="card-pad col gap-10">
              {data.evoUniv.map(e => (
                <div className="row" key={e.univers} style={{ justifyContent: "space-between", padding: "5px 0", borderBottom: "1px solid var(--g100)" }}>
                  <span className="tiny" style={{ fontWeight: 600 }}>{e.univers}</span>
                  <span className="tiny mono">{E3.fmtMoneyShort(e.mM1)} → {E3.fmtMoneyShort(e.mM)}
                    {e.pct != null && <span style={{ marginLeft: 6, color: e.pct > 0 ? "var(--red-700)" : "var(--green-700)", fontWeight: 700 }}>{e.pct > 0 ? "+" : ""}{e.pct}%</span>}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="card mb-16">
          <div className="card-head"><Icon name="flag" size={17} /><h3>Top motif par univers FMI</h3></div>
          <div className="card-pad grid grid-3">
            {data.topMotifParUnivers.map(x => (
              <div key={x.univers} className="card card-pad" style={{ background: "var(--g50)" }}>
                <div className="tiny muted" style={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em" }}>{x.univers}</div>
                {x.top ? <><div style={{ fontWeight: 700, fontSize: 13.5, marginTop: 4 }}>{x.top.motif}</div>
                  <div className="mono tiny muted">{E3.fmtMoneyShort(x.top.m)} FCFA</div></> : <div className="tiny muted" style={{ marginTop: 4 }}>—</div>}
              </div>
            ))}
          </div>
        </div>
      </>}

      {esc && <EscaladeModal d={esc.d} t={esc.t} onClose={() => setEsc(null)}
        onConfirm={(motif) => { const r = store.escalader(esc.d.id, esc.t.id, motif); if (r.ok) toast({ type: "warn", title: "Tâche escaladée", msg: "Transmise au niveau N+1 · superviseur notifié." }); else toast({ type: "error", title: "Escalade impossible", msg: r.msg }); setEsc(null); }} />}
    </div>
  );
}
function EscaladeModal({ d, t, onClose, onConfirm }) {
  const [motif, setMotif] = uS3("Corbeille inactive au-delà du SLA");
  return <Modal title="Escalader la tâche" icon="arrowRight" onClose={onClose}
    footer={<><button className="btn btn-ghost" onClick={onClose}>Annuler</button><button className="btn btn-dark" onClick={() => onConfirm(motif)}><Icon name="arrowRight" size={15} /> Escalader vers N+1</button></>}>
    <div className="alert alert-orange mb-16"><Icon name="alert" size={15} /><div><b>{d.ref}</b> · {E3.roleLabel(t.role)}<div className="tiny">SLA dépassé ({E3.fmtDuree(E3.ageHeures(t))}). L'escalade transmet la tâche au niveau hiérarchique supérieur et notifie le superviseur. Action journalisée.</div></div></div>
    <Field label="Motif de l'escalade"><textarea className="textarea" value={motif} onChange={e => setMotif(e.target.value)} /></Field>
  </Modal>;
}
function Kpi({ label, value, sub, color, ic, warn }) {
  return <div className="kpi"><div className="accent" style={{ background: color }} />
    <div className="row" style={{ justifyContent: "space-between" }}><span className="label">{label}</span><Icon name={ic} size={16} color={color} /></div>
    <div className="value">{value}</div>
    <div className="delta" style={{ color: warn ? "var(--red-700)" : "var(--g600)" }}>{sub}</div>
  </div>;
}
function statutSegments(dossiers, circuitF) {
  let ds = circuitF === "tous" ? dossiers : dossiers.filter(d => d.circuit === circuitF);
  const m = { valide: 0, en_cours: 0, soumis: 0, rejete: 0, abandonne: 0 };
  ds.forEach(d => m[d.statut] = (m[d.statut] || 0) + 1);
  return [
    { label: "Validés", value: m.valide, color: "#32C832" },
    { label: "En cours", value: m.en_cours + m.soumis, color: "#FF7900" },
    { label: "Rejetés", value: m.rejete, color: "#CD3C14" },
    { label: "Abandonnés", value: m.abandonne, color: "#cccccc" },
  ].filter(s => s.value > 0);
}
function attentionList(dossiers, circuitF) {
  const arr = [];
  (circuitF === "tous" ? dossiers : dossiers.filter(d => d.circuit === circuitF)).forEach(d =>
    (d.taches || []).forEach(t => {
      if (t.etat === "EN_CORBEILLE" || t.etat === "RECLAMEE") arr.push({ d, t, age: E3.ageHeures(t) });
    }));
  return arr.sort((a, b) => (E3.isEnRetard(b.t) - E3.isEnRetard(a.t)) || b.age - a.age);
}

/* ======================== CONTRÔLE A POSTERIORI ======================== */
function ControleScreen() {
  const store = window.useStore();
  const toast = window.useToast();
  const { user, dossiers, go } = store;
  const [modal, setModal] = uS3(null);

  const aControler = [];
  dossiers.forEach(d => (d.controles || []).forEach(c => {
    if ((c.etat === "A_CONTROLER") && user.roles.includes(c.role)) aControler.push({ d, c });
  }));
  const faits = [];
  dossiers.forEach(d => (d.controles || []).forEach(c => { if (c.etat === "FAIT") faits.push({ d, c }); }));

  return (
    <div className="fade-in">
      <div className="page-head"><div><h2>Contrôle a posteriori</h2>
        <p>Contrôles à froid (N1 temps réel, N2 mensuel) — asynchrones, hors du chemin bloquant.</p></div></div>

      <div className="grid grid-3 mb-24">
        <Kpi label="À contrôler" value={aControler.length} sub="dossiers validés en attente" color="var(--orange)" ic="shield" />
        <Kpi label="Contrôlés conformes" value={faits.filter(x => x.c.conforme).length} sub="" color="var(--green)" ic="check" />
        <Kpi label="Anomalies relevées" value={faits.filter(x => !x.c.conforme).length} sub="signalées au superviseur" color="var(--red)" ic="alert" />
      </div>

      <h3 style={{ fontSize: 14, marginBottom: 10 }}>File de contrôle</h3>
      {aControler.length === 0 ? <div className="card"><Empty icon="shield" title="Aucun contrôle en attente">Les dossiers validés apparaîtront ici.</Empty></div> :
        <div className="col gap-12">{aControler.map(({ d, c }) => (
          <div className="card card-pad" key={c.id}>
            <div className="row gap-16 wrap">
              <div style={{ flex: 1, minWidth: 220 }}>
                <div className="row gap-8 wrap"><span className="mono" style={{ fontWeight: 700 }}>{d.ref}</span><CircuitPill code={d.circuit} />
                  <Badge cls="b-purple">{E3.roleLabel(c.role)}</Badge><StatusBadge statut="valide" sm /></div>
                <div style={{ marginTop: 6, fontWeight: 600 }}>{d.client.nom} — {d.libelle}</div>
                <div className="tiny muted">{d.motif} · validé {E3.fmtAgo(d.dateValidation)} · {E3.fmtMoney(d.ttc)}</div>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => { store.back = "controle"; go("detail", d.id); }}><Icon name="eye" size={14} /> Dossier</button>
              <button className="btn btn-dark" onClick={() => setModal({ d, c })}><Icon name="shield" size={15} /> Contrôler</button>
            </div>
          </div>
        ))}</div>}

      {faits.length > 0 && <>
        <h3 style={{ fontSize: 14, margin: "24px 0 10px" }} className="muted">Contrôles réalisés ({faits.length})</h3>
        <div className="card" style={{ overflow: "hidden" }}>
          <table className="table compact"><thead><tr><th>Réf.</th><th>Niveau</th><th>Résultat</th><th>Contrôleur</th><th>Constat</th></tr></thead>
            <tbody>{faits.map(({ d, c }) => <tr key={c.id} className="norow">
              <td className="mono tiny" style={{ fontWeight: 600 }}>{d.ref}</td><td className="tiny">{E3.roleLabel(c.role)}</td>
              <td>{c.conforme ? <Badge cls="b-green" dot>Conforme</Badge> : <Badge cls="b-red" dot>Anomalie</Badge>}</td>
              <td className="tiny">{c.acteurNom}</td><td className="tiny muted">{c.commentaire || "—"}</td></tr>)}</tbody></table>
        </div>
      </>}

      {modal && <ControleModal d={modal.d} c={modal.c} onClose={() => setModal(null)}
        onConfirm={(constat, conforme) => { store.controler(modal.d.id, modal.c.id, constat, conforme);
          toast({ type: conforme ? "success" : "warn", title: conforme ? "Contrôle conforme" : "Anomalie enregistrée" }); setModal(null); }} />}
    </div>
  );
}
function ControleModal({ d, c, onClose, onConfirm }) {
  const [conforme, setConforme] = uS3(true); const [constat, setConstat] = uS3("");
  return <Modal title="Contrôle a posteriori" icon="shield" onClose={onClose}
    footer={<><button className="btn btn-ghost" onClick={onClose}>Annuler</button>
      <button className="btn btn-dark" onClick={() => onConfirm(constat, conforme)}>Enregistrer le constat</button></>}>
    <div className="alert alert-grey mb-16"><Icon name="info" size={15} /><div><b>{d.ref}</b> · {E3.roleLabel(c.role)}<div className="tiny">Le constat est journalisé sans modifier le dossier (hors chemin bloquant).</div></div></div>
    <Field label="Résultat du contrôle"><div className="seg">
      <button className={conforme ? "active" : ""} onClick={() => setConforme(true)}>Conforme</button>
      <button className={!conforme ? "active" : ""} onClick={() => setConforme(false)}>Anomalie</button></div></Field>
    <Field label="Constat / observations"><textarea className="textarea" value={constat} onChange={e => setConstat(e.target.value)} placeholder="Observations du contrôle…" /></Field>
  </Modal>;
}

/* ======================== ADMINISTRATION ======================== */
function AdminScreen() {
  const [tab, setTab] = uS3("matrice");
  return (
    <div className="fade-in">
      <div className="page-head"><div><h2>Administration</h2>
        <p>Plateforme entièrement configurable : processus, rôles & corbeilles, utilisateurs, motifs et paramètres de calcul.</p></div></div>
      <div className="tabbar">
        {[["matrice", "Processus"], ["moniteur", "Moniteur"], ["roles", "Rôles & corbeilles"], ["users", "Utilisateurs"], ["motifs", "Motifs & circuits"], ["calc", "Paramètres de calcul"]].map(([k, l]) =>
          <button key={k} className={"tab" + (tab === k ? " active" : "")} onClick={() => setTab(k)}>{l}</button>)}
      </div>
      {tab === "matrice" && <MatriceView />}
      {tab === "moniteur" && <MoniteurView />}
      {tab === "roles" && <RolesView />}
      {tab === "users" && <UsersView />}
      {tab === "motifs" && <MotifsView />}
      {tab === "calc" && <CalcConfigView />}
    </div>
  );
}
const CC_BG = { DXC: "var(--blue-bg)", DOBB: "var(--orange-50)", DF: "var(--purple-bg)" };
const CC_FG = { DXC: "var(--blue-700)", DOBB: "var(--orange-600)", DF: "#6b3fa0" };
const ccBgOf = (code) => CC_BG[code] || "var(--g100)";
const ccFgOf = (code) => CC_FG[code] || "var(--g700)";
const fmtBorne = (n) => n == null ? "∞" : (n >= 1e6 ? (n / 1e6).toLocaleString("fr-FR") + " M" : E3.fmtNum(n));

function MatriceView() {
  const toast = window.useToast();
  const [, force] = uS3(0);
  const reForce = () => force(x => x + 1);
  const [circ, setCirc] = uS3("DXC");
  const [edit, setEdit] = uS3(false);
  const [draft, setDraft] = uS3(null);
  const [sim, setSim] = uS3("");                 // montant test du simulateur
  const [newModal, setNewModal] = uS3(false);
  const [drag, setDrag] = uS3(null);             // { ti, si }
  const c = D3.CIRCUITS[circ];
  const _matrixRoles = D3.rolesInMatrix();
  const rolesDispo = D3.ROLES.filter(r => ["V", "A", "C"].includes(r.type) && (r.circuit === circ || r.circuit === "*") && _matrixRoles.has(r.code));

  function startEdit() { setDraft(JSON.parse(JSON.stringify(c.tranches))); setEdit(true); }
  function cancel() { setEdit(false); setDraft(null); }
  function apply() {
    if (bornesIssues.length) { toast({ type: "error", title: "Bornes incohérentes", msg: "Corrigez les chevauchements / trous avant de publier." }); return; }
    D3.CIRCUITS[circ].tranches = draft.map(t => ({ ...t, min: Number(t.min) || 0, max: t.max === "" || t.max == null ? null : Number(t.max),
      etapes: t.etapes.map((e, i) => ({ ...e, ordre: i, sla: Number(e.sla) || 24, bloquant: e.type === "A" })) }));
    setEdit(false); setDraft(null);
    toast({ type: "success", title: "Processus publié", msg: "Révision prise en compte sans redéploiement — les nouvelles demandes suivront ce paramétrage." });
  }
  function setT(i, k, v) { setDraft(d => d.map((t, j) => j === i ? { ...t, [k]: v } : t)); }
  function setStep(ti, si, k, v) { setDraft(d => d.map((t, j) => j === ti ? { ...t, etapes: t.etapes.map((e, m) => m === si ? { ...e, [k]: v } : e) } : t)); }
  function addStep(ti) { setDraft(d => d.map((t, j) => j === ti ? { ...t, etapes: [...t.etapes, { role: rolesDispo[0].code, type: "A", sla: 48 }] } : t)); }
  function insertStep(ti, pos) { setDraft(d => d.map((t, j) => { if (j !== ti) return t; const es = [...t.etapes]; es.splice(pos, 0, { role: rolesDispo[0].code, type: "A", sla: 48 }); return { ...t, etapes: es }; })); }
  function delStep(ti, si) { setDraft(d => d.map((t, j) => j === ti ? { ...t, etapes: t.etapes.filter((_, m) => m !== si) } : t)); }
  function moveStep(ti, si, dir) { setDraft(d => d.map((t, j) => { if (j !== ti) return t; const es = [...t.etapes]; const ni = si + dir; if (ni < 0 || ni >= es.length) return t; [es[si], es[ni]] = [es[ni], es[si]]; return { ...t, etapes: es }; })); }
  function reorderStep(ti, from, to) { setDraft(d => d.map((t, j) => { if (j !== ti) return t; const es = [...t.etapes]; const [m] = es.splice(from, 1); es.splice(to, 0, m); return { ...t, etapes: es }; })); }
  function addTranche() { const last = draft[draft.length - 1]; const base = last ? (Number(last.max) || Number(last.min) || 0) + 1 : 0; setDraft(d => [...d, { min: base, max: null, label: "Nouvelle tranche", etapes: [{ role: rolesDispo[0].code, type: "A", sla: 48 }] }]); }
  function dupTranche(i) { setDraft(d => { const copy = JSON.parse(JSON.stringify(d[i])); copy.label = copy.label + " (copie)"; const nd = [...d]; nd.splice(i + 1, 0, copy); return nd; }); }
  function delTranche(i) { setDraft(d => d.filter((_, j) => j !== i)); }

  // drag-drop des étapes (au sein d'une tranche)
  function onDrop(ti, to) { if (drag && drag.ti === ti && drag.si !== to) reorderStep(ti, drag.si, to); setDrag(null); }

  const data = edit ? draft : c.tranches;

  // ---- validation des bornes (chevauchement / trou) ----
  const bornesIssues = (() => {
    if (!edit) return [];
    const issues = [];
    const ts = draft.map(t => ({ min: Number(t.min) || 0, max: t.max === "" || t.max == null ? Infinity : Number(t.max), label: t.label }));
    const sorted = [...ts].sort((a, b) => a.min - b.min);
    for (let i = 0; i < sorted.length; i++) {
      if (sorted[i].max < sorted[i].min) issues.push(`« ${sorted[i].label} » : borne max < min.`);
      if (i > 0) {
        const prev = sorted[i - 1], cur = sorted[i];
        if (cur.min <= prev.max) issues.push(`Chevauchement entre « ${prev.label} » et « ${cur.label} ».`);
        else if (cur.min > prev.max + 1) issues.push(`Trou entre « ${prev.label} » et « ${cur.label} » (montants non couverts).`);
      }
    }
    return issues;
  })();

  // ---- simulateur : tranche déclenchée par le montant test ----
  const simVal = Number(sim) || 0;
  const matchIdx = sim !== "" ? data.findIndex(t => { const mn = Number(t.min) || 0, mx = (t.max === "" || t.max == null) ? Infinity : Number(t.max); return simVal >= mn && simVal <= mx; }) : -1;

  // synthèse
  const totEtapes = data.reduce((a, t) => a + t.etapes.length, 0);
  const totBloq = data.reduce((a, t) => a + t.etapes.filter(e => e.type === "A").length, 0);
  const maxSla = data.reduce((mx, t) => Math.max(mx, t.etapes.reduce((s, e) => s + (Number(e.sla) || 0), 0)), 0);
  const typeCls = (ty) => ty === "V" ? "v" : ty === "C" ? "c" : "a";
  const membersOf = (rc) => E3.membersOfRole(rc);

  return <div className="pd-shell">
    {/* Volet gauche : liste des processus */}
    <div className="pd-rail">
      <div className="pd-rail-h">Processus ({Object.keys(D3.CIRCUITS).length})</div>
      {Object.values(D3.CIRCUITS).map(cc => (
        <button key={cc.code} className={"pd-proc" + (circ === cc.code ? " active" : "")} onClick={() => { if (edit) cancel(); setCirc(cc.code); setSim(""); }}>
          <span className="pdp-ic" style={{ background: ccBgOf(cc.code), color: ccFgOf(cc.code) }}>{cc.code}</span>
          <span className="pdp-meta"><b>{cc.nom}</b><span>{cc.segment} · {cc.tranches.length} tranche(s)</span></span>
        </button>
      ))}
      <button className="pd-new" onClick={() => setNewModal(true)}><Icon name="plus" size={16} /> Nouveau processus</button>
    </div>

    {/* Volet droit : canvas */}
    <div className="pd-canvas">
      <div className="pd-head">
        <div className="pd-title">
          <span className="pill-circuit" style={{ background: ccBgOf(circ), color: ccFgOf(circ), fontSize: 13, padding: "4px 10px" }}>{circ}</span>
          <div><b style={{ fontSize: 16 }}>{c.nom}</b><div className="tiny muted">{c.segment} · TVA {c.tva * 100}%</div></div>
          {edit && <Badge cls="b-orange" dot>Édition</Badge>}
        </div>
        <div className="spacer" />
        {!edit
          ? <button className="btn btn-dark btn-sm" onClick={startEdit}><Icon name="edit" size={14} /> Personnaliser</button>
          : <><button className="btn btn-ghost btn-sm" onClick={cancel}>Annuler</button><button className="btn btn-primary btn-sm" onClick={apply}><Icon name="check" size={14} /> Publier</button></>}
      </div>

      {/* Synthèse + simulateur */}
      <div className="row gap-12 wrap" style={{ alignItems: "stretch" }}>
        <div className="pd-summary">
          <div className="pd-stat"><div className="v">{data.length}</div><div className="l">Tranche(s)</div></div>
          <div className="pd-stat"><div className="v">{totEtapes}</div><div className="l">Étape(s)</div></div>
          <div className="pd-stat"><div className="v">{totBloq}</div><div className="l">Bloquante(s)</div></div>
          <div className="pd-stat"><div className="v">{E3.fmtDuree(maxSla)}</div><div className="l">SLA cumulé max</div></div>
        </div>
        <div className="spacer" />
        <div className="sim-box" style={{ alignSelf: "center" }}>
          <Icon name="calc" size={15} color="var(--g600)" />
          <span className="tiny muted nowrap">Tester un montant</span>
          <div className="input-addon" style={{ width: 150 }}>
            <input className="input mono" style={{ padding: "6px 40px 6px 10px", fontSize: 12.5 }} type="number" placeholder="ex. 8 000 000" value={sim} onChange={e => setSim(e.target.value)} />
            <span className="suffix" style={{ fontSize: 11 }}>FCFA</span>
          </div>
          {sim !== "" && (matchIdx >= 0 ? <Badge cls="b-green" dot>{data[matchIdx].label}</Badge> : <Badge cls="b-red" dot>aucune tranche</Badge>)}
        </div>
      </div>

      {/* Alerte bornes */}
      {edit && bornesIssues.length > 0 && (
        <div className="alert alert-red"><Icon name="alert" size={16} />
          <div><b>Bornes à corriger</b><ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>{bornesIssues.map((m, i) => <li key={i} className="tiny">{m}</li>)}</ul></div></div>
      )}
      {edit && bornesIssues.length === 0 && (
        <div className="alert alert-green"><Icon name="check" size={15} />Bornes cohérentes — couverture continue des montants, sans chevauchement.</div>
      )}

      {data.length === 0 && (
        <div className="card"><Empty icon="flow" title="Aucune tranche">{edit ? "Ajoutez une première tranche ci-dessous." : "Cliquez sur « Personnaliser » pour composer ce processus."}</Empty></div>
      )}

      {data.map((t, i) => (
        <div className={"tr-card" + (i === matchIdx ? " sim-match" : "")} key={i}>
          <div className="tr-head">
            {edit
              ? <input className="input" style={{ width: 160, fontWeight: 700 }} value={t.label} onChange={e => setT(i, "label", e.target.value)} placeholder="Libellé" />
              : <span className="tr-amount">{t.label}</span>}
            <span className="tr-range">
              {edit ? (
                <span className="row gap-6">
                  <input className="input mono" style={{ width: 108 }} type="number" value={t.min} onChange={e => setT(i, "min", e.target.value)} />
                  <Icon name="arrowRight" size={13} color="var(--g400)" />
                  <input className="input mono" style={{ width: 108 }} type="number" placeholder="∞" value={t.max == null ? "" : t.max} onChange={e => setT(i, "max", e.target.value)} />
                  <span className="muted tiny">FCFA TTC</span>
                </span>
              ) : <>FCFA TTC&nbsp; <span className="mono">{fmtBorne(t.min)}</span> → <span className="mono">{fmtBorne(t.max)}</span></>}
            </span>
            {i === matchIdx && <Badge cls="b-green" dot>déclenchée</Badge>}
            <div className="spacer" />
            {!edit && <span className="muted tiny">{t.etapes.length} étape(s)</span>}
            {edit && <div className="row gap-6"><button className="iconbtn" title="Dupliquer" onClick={() => dupTranche(i)}><Icon name="layers" size={15} /></button><button className="iconbtn" title="Supprimer" onClick={() => delTranche(i)}><Icon name="trash" size={15} /></button></div>}
          </div>

          {/* Timeline verticale */}
          <div className="vflow">
            {/* Soumission */}
            <div className="vstage">
              <div className="vstage-rail"><div className="vstage-dot start"><Icon name="send" size={15} /></div><div className="vstage-line" /></div>
              <div className="vstage-body"><div className="vstage-terminal">Soumission de la demande</div></div>
            </div>

            {edit && <div className="vinsert"><button title="Insérer une étape" onClick={() => insertStep(i, 0)}><Icon name="plus" size={13} /></button></div>}

            {t.etapes.map((e, j) => {
              const cls = typeCls(e.type); const members = membersOf(e.role);
              return <React.Fragment key={j}>
                <div className="vstage">
                  <div className="vstage-rail"><div className={"vstage-dot " + cls}>{e.type === "C" ? "C" : (j + 1)}</div><div className="vstage-line" /></div>
                  <div className="vstage-body">
                    <div className={"vstage-card " + cls + (edit ? " draggable" : "") + (drag && drag.ti === i && drag.si === j ? " dragging" : "")}
                      draggable={edit}
                      onDragStart={edit ? (() => setDrag({ ti: i, si: j })) : undefined}
                      onDragOver={edit ? (ev => ev.preventDefault()) : undefined}
                      onDrop={edit ? (() => onDrop(i, j)) : undefined}
                      onDragEnd={() => setDrag(null)}>
                      {edit && <span className="drag-grip" title="Glisser pour réordonner"><Icon name="dots" size={14} /></span>}
                      {edit ? (
                        <div className="vstage-edit" style={{ flex: 1 }}>
                          <div className="type-seg">
                            <button className={e.type === "V" ? "on-v" : ""} onClick={() => setStep(i, j, "type", "V")}>V</button>
                            <button className={e.type === "A" ? "on-a" : ""} onClick={() => setStep(i, j, "type", "A")}>A</button>
                          </div>
                          <select className="select" style={{ minWidth: 180, flex: 1, fontSize: 12.5, padding: "6px 8px" }} value={e.role} onChange={ev => setStep(i, j, "role", ev.target.value)}>
                            {rolesDispo.map(r => <option key={r.code} value={r.code}>{r.libelle}</option>)}</select>
                          <div className="input-addon" style={{ width: 86 }}><input className="input mono" style={{ padding: "6px 26px 6px 8px", fontSize: 12 }} type="number" value={e.sla} onChange={ev => setStep(i, j, "sla", ev.target.value)} /><span className="suffix" style={{ fontSize: 11 }}>h</span></div>
                          <button className="iconbtn" title="Supprimer l'étape" onClick={() => delStep(i, j)}><Icon name="trash" size={13} /></button>
                        </div>
                      ) : (
                        <>
                          <div className="vs-main">
                            <div className="vs-role">{E3.roleLabel(e.role)}</div>
                            <div className="vs-sub">
                              <TypeActeurBadge type={e.type} />
                              <span className="row gap-4"><Icon name="clock" size={12} /> SLA {E3.fmtDuree(e.sla)}</span>
                              {members.length > 0 && <span className="muted">· {members.length} membre(s)</span>}
                            </div>
                          </div>
                          <div className="vs-members">{members.slice(0, 4).map(u => <span className="av" key={u.id}><Avatar user={u} size={26} /></span>)}</div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                {edit && <div className="vinsert"><button title="Insérer une étape" onClick={() => insertStep(i, j + 1)}><Icon name="plus" size={13} /></button></div>}
              </React.Fragment>;
            })}

            {/* Contrôle a posteriori */}
            {(c.controle || []).map((e, j) => (
              <div className="vstage" key={"c" + j}>
                <div className="vstage-rail"><div className="vstage-dot c">C</div><div className="vstage-line" /></div>
                <div className="vstage-body">
                  <div className="vstage-card c">
                    <div className="vs-main"><div className="vs-role">{E3.roleLabel(e.role)}</div>
                      <div className="vs-sub"><Badge cls="b-purple">Contrôle</Badge><span><Icon name="shield" size={12} /> a posteriori (hors chemin bloquant)</span></div></div>
                  </div>
                </div>
              </div>
            ))}

            {/* Validé */}
            <div className="vstage">
              <div className="vstage-rail"><div className="vstage-dot end"><Icon name="check" size={15} stroke={3} /></div></div>
              <div className="vstage-body"><div className="vstage-terminal ok">Demande validée — transmise au SI de facturation</div></div>
            </div>
          </div>
        </div>
      ))}

      {edit && <button className="tranche-add" onClick={addTranche}><Icon name="plus" size={15} /> Ajouter une tranche de montant</button>}
    </div>

    {newModal && <NewProcessModal onClose={() => setNewModal(false)} toast={toast}
      onCreate={(code) => { setNewModal(false); reForce(); setCirc(code); setSim(""); startEditFor(code); }} />}
  </div>;

  function startEditFor(code) {
    const cc = D3.CIRCUITS[code];
    setDraft(JSON.parse(JSON.stringify(cc.tranches))); setEdit(true);
  }
}

/* Modale : création d'un nouveau processus (circuit) */
function NewProcessModal({ onClose, onCreate, toast }) {
  const [code, setCode] = uS3("");
  const [nom, setNom] = uS3("");
  const [segment, setSegment] = uS3("");
  const [tva, setTva] = uS3(18);
  const [sousFlux, setSousFlux] = uS3(["Réclamation"]);
  const [motifs, setMotifs] = uS3(["Réclamation", "Geste commercial"]);
  const [clients, setClients] = uS3([{ nom: "", compte: "", formule: "" }]);
  const [err, setErr] = uS3("");

  const setList = (setter, list, i, v) => setter(list.map((x, j) => j === i ? v : x));
  const setClient = (i, k, v) => setClients(cs => cs.map((c, j) => j === i ? { ...c, [k]: v } : c));

  function create() {
    const cd = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!cd) { setErr("Code requis (ex. MKT)."); return; }
    if (D3.CIRCUITS[cd]) { setErr("Ce code de processus existe déjà."); return; }
    if (!nom.trim()) { setErr("Nom requis."); return; }
    const cleanMotifs = motifs.map(m => m.trim()).filter(Boolean);
    const cleanFlux = sousFlux.map(s => s.trim()).filter(Boolean);
    const cleanClients = clients.filter(c => c.nom.trim()).map(c => ({ nom: c.nom.trim(), compte: c.compte.trim() || "CPT-" + Math.floor(Math.random() * 9e5 + 1e5), formule: c.formule.trim() || "Offre standard" }));
    if (cleanMotifs.length === 0) { setErr("Ajoutez au moins un motif."); return; }
    const pivot = D3.ROLES.filter(r => r.circuit === "*" && (r.type === "A" || r.type === "V"))[0] || D3.ROLES.find(r => r.type === "A");
    D3.CIRCUITS[cd] = {
      code: cd, label: cd, segment: segment.trim() || "Autre", couleur: "pc-dxc",
      nom: nom.trim(), tva: (Number(tva) || 0) / 100,
      sousFlux: cleanFlux.length ? cleanFlux : ["Réclamation"],
      clients: cleanClients.length ? cleanClients : [{ nom: "Client exemple", compte: "CPT-000001", formule: "Offre standard" }],
      tranches: [{ min: 0, max: null, label: "Toutes demandes", etapes: [{ role: pivot.code, type: "A", sla: 48, bloquant: true, ordre: 0 }] }],
      controle: [],
    };
    D3.MOTIFS[cd] = cleanMotifs;
    toast({ type: "success", title: "Processus créé", msg: `« ${nom.trim()} » (${cd}) — ${cleanMotifs.length} motif(s), ${cleanClients.length} client(s). Composez ses tranches puis publiez.` });
    onCreate(cd);
  }

  return <Modal title="Nouveau processus" icon="flow" onClose={onClose} lg
    footer={<><button className="btn btn-ghost" onClick={onClose}>Annuler</button><button className="btn btn-primary" onClick={create}><Icon name="plus" size={15} /> Créer le processus</button></>}>
    <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>Définissez l'identité du circuit, ses motifs et ses clients. Une première tranche (0 → ∞) est créée ; vous composerez ensuite sa chaîne de validation.</p>
    {err && <div className="alert alert-red mb-16"><Icon name="alert" size={15} />{err}</div>}

    <div className="tiny muted" style={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em", margin: "4px 0 8px" }}>Identité</div>
    <div className="grid grid-2">
      <Field label="Code (court)" req><input className="input mono" value={code} onChange={e => setCode(e.target.value)} placeholder="ex. MKT" maxLength={6} /></Field>
      <Field label="Segment"><input className="input" value={segment} onChange={e => setSegment(e.target.value)} placeholder="ex. Marketing" /></Field>
      <Field label="Nom du processus" req><input className="input" value={nom} onChange={e => setNom(e.target.value)} placeholder="ex. Direction Marketing" /></Field>
      <Field label="TVA applicable (%)"><input className="input mono" type="number" value={tva} onChange={e => setTva(e.target.value)} /></Field>
    </div>

    <div className="divider"></div>
    <div className="row" style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
      <span className="tiny muted" style={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em" }}>Motifs</span>
      <button className="btn-link tiny" onClick={() => setMotifs(m => [...m, ""])}><Icon name="plus" size={12} /> Motif</button>
    </div>
    <div className="col gap-6">
      {motifs.map((m, i) => <div className="row gap-8" key={i}>
        <input className="input" value={m} onChange={e => setList(setMotifs, motifs, i, e.target.value)} placeholder="Libellé du motif" />
        <button className="iconbtn" onClick={() => setMotifs(motifs.filter((_, j) => j !== i))}><Icon name="trash" size={14} /></button>
      </div>)}
    </div>

    <div className="divider"></div>
    <div className="row" style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
      <span className="tiny muted" style={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em" }}>Sous-flux</span>
      <button className="btn-link tiny" onClick={() => setSousFlux(s => [...s, ""])}><Icon name="plus" size={12} /> Sous-flux</button>
    </div>
    <div className="row gap-6 wrap">
      {sousFlux.map((s, i) => <div className="row gap-6" key={i} style={{ alignItems: "center" }}>
        <input className="input" style={{ width: 180 }} value={s} onChange={e => setList(setSousFlux, sousFlux, i, e.target.value)} placeholder="Sous-flux" />
        {sousFlux.length > 1 && <button className="iconbtn" onClick={() => setSousFlux(sousFlux.filter((_, j) => j !== i))}><Icon name="x" size={13} /></button>}
      </div>)}
    </div>

    <div className="divider"></div>
    <div className="row" style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
      <span className="tiny muted" style={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em" }}>Clients / comptes (exemples)</span>
      <button className="btn-link tiny" onClick={() => setClients(cs => [...cs, { nom: "", compte: "", formule: "" }])}><Icon name="plus" size={12} /> Client</button>
    </div>
    <div className="col gap-6">
      {clients.map((cl, i) => <div className="row gap-6" key={i}>
        <input className="input" value={cl.nom} onChange={e => setClient(i, "nom", e.target.value)} placeholder="Nom du client" />
        <input className="input mono" style={{ width: 130 }} value={cl.compte} onChange={e => setClient(i, "compte", e.target.value)} placeholder="Compte" />
        <input className="input" style={{ width: 150 }} value={cl.formule} onChange={e => setClient(i, "formule", e.target.value)} placeholder="Offre / formule" />
        {clients.length > 1 && <button className="iconbtn" onClick={() => setClients(clients.filter((_, j) => j !== i))}><Icon name="trash" size={14} /></button>}
      </div>)}
    </div>
  </Modal>;
}
function RolesView() {
  const toast = window.useToast();
  const [, force] = uS3(0);
  const [modal, setModal] = uS3(null); // {role|null}
  const types = { I: ["Initiateur", "b-grey"], V: ["Vérificateur", "b-blue"], A: ["Approbateur", "b-orange"], C: ["Contrôleur", "b-purple"], S: ["Superviseur", "b-green"], X: ["Admin", "b-black"] };
  function save(form, original) {
    const code = form.code.trim().toUpperCase().replace(/[^A-Z0-9_]/g, "");
    if (!code || !form.libelle.trim()) { toast({ type: "error", title: "Champs requis", msg: "Code et libellé obligatoires." }); return; }
    if (!original && D3.roleByCode[code]) { toast({ type: "error", title: "Code existant", msg: "Ce code de rôle existe déjà." }); return; }
    const rec = { code, libelle: form.libelle.trim(), type: form.type, niveau: Number(form.niveau) || 1, circuit: form.circuit, ad: form.ad.trim() || ("GG-DGR-" + code) };
    if (original) { const i = D3.ROLES.findIndex(r => r.code === original.code); D3.ROLES[i] = rec; if (original.code !== code) delete D3.roleByCode[original.code]; }
    else D3.ROLES.push(rec);
    D3.roleByCode[code] = rec;
    setModal(null); force(x => x + 1);
    toast({ type: "success", title: original ? "Corbeille modifiée" : "Corbeille créée", msg: `${rec.libelle} (${code})` });
  }
  function del(r) {
    const used = Object.values(D3.CIRCUITS).some(c => (c.tranches || []).some(t => t.etapes.some(e => e.role === r.code)) || (c.controle || []).some(e => e.role === r.code));
    if (used) { toast({ type: "error", title: "Suppression bloquée", msg: "Ce rôle est utilisé dans un processus. Retirez-le d'abord." }); return; }
    const i = D3.ROLES.findIndex(x => x.code === r.code); if (i >= 0) D3.ROLES.splice(i, 1); delete D3.roleByCode[r.code];
    force(x => x + 1); toast({ type: "info", title: "Corbeille supprimée", msg: r.libelle });
  }
  return <>
    <div className="alert alert-blue mb-16"><Icon name="info" size={15} />Une <b>corbeille</b> = un <b>rôle</b> = un groupe AD. Créez, éditez ou supprimez les corbeilles ; les membres sont gérés dans l'onglet Utilisateurs.</div>
    <div className="alert alert-blue mb-16"><Icon name="info" size={15} />Une <b>corbeille</b> = un <b>rôle</b> = un groupe AD. Seuls les rôles/profils <b>définis dans la matrice de décision</b> sont actifs sur la plateforme ; les autres apparaissent grisés (« hors matrice »).</div>
    <div className="row mb-16" style={{ justifyContent: "flex-end" }}>
      <button className="btn btn-dark btn-sm" onClick={() => setModal({ role: null })}><Icon name="plus" size={14} /> Nouvelle corbeille / rôle</button>
    </div>
    <div className="card" style={{ overflow: "hidden" }}>
      {(() => { const mr = D3.rolesInMatrix(); const sorted = [...D3.ROLES].sort((a, b) => (mr.has(b.code) - mr.has(a.code)));
      return <>
      <div className="card-head"><Icon name="users" size={17} /><h3>Rôles & corbeilles</h3><span className="muted" style={{ marginLeft: "auto" }}>{[...mr].length} dans la matrice · {D3.ROLES.length} au total</span></div>
      <table className="table compact"><thead><tr><th>Code</th><th>Libellé</th><th>Type</th><th>Niveau</th><th>Circuit</th><th>Statut</th><th>Membres</th><th></th></tr></thead>
        <tbody>{sorted.map(r => { const [tl, tc] = types[r.type] || ["—", "b-grey"]; const members = E3.membersOfRole(r.code); const inM = mr.has(r.code);
          return <tr key={r.code} className="norow" style={{ opacity: inM ? 1 : 0.5 }}>
            <td className="mono tiny" style={{ fontWeight: 600 }}>{r.code}</td><td style={{ fontWeight: 600 }}>{r.libelle}</td>
            <td><Badge cls={tc}>{tl}</Badge></td><td className="tiny">{r.niveau}</td>
            <td>{r.circuit === "*" ? <Badge cls="b-orange">pivot</Badge> : <CircuitPill code={r.circuit} />}</td>
            <td>{inM ? <Badge cls="b-green" dot>Dans la matrice</Badge> : <Badge cls="b-grey">Hors matrice</Badge>}</td>
            <td><div className="row gap-6">{members.slice(0, 4).map(u => <Avatar key={u.id} user={u} size={22} />)}{members.length === 0 && <span className="tiny muted">—</span>}</div></td>
            <td><div className="row gap-6"><button className="iconbtn" title="Éditer" onClick={() => setModal({ role: r })}><Icon name="edit" size={13} /></button><button className="iconbtn" title="Supprimer" onClick={() => del(r)}><Icon name="trash" size={13} /></button></div></td>
          </tr>; })}</tbody></table>
      </>; })()}
    </div>
    {modal && <RoleModal role={modal.role} onClose={() => setModal(null)} onSave={save} />}
  </>;
}
function RoleModal({ role, onClose, onSave }) {
  const [f, setF] = uS3(role ? { ...role } : { code: "", libelle: "", type: "A", niveau: 3, circuit: "*", ad: "" });
  const set = (k, v) => setF(s => ({ ...s, [k]: v }));
  const circuitOpts = ["*", ...Object.keys(D3.CIRCUITS)];
  return <Modal title={role ? "Modifier la corbeille / rôle" : "Nouvelle corbeille / rôle"} icon="users" onClose={onClose}
    footer={<><button className="btn btn-ghost" onClick={onClose}>Annuler</button><button className="btn btn-primary" onClick={() => onSave(f, role)}><Icon name="check" size={15} /> Enregistrer</button></>}>
    <div className="grid grid-2">
      <Field label="Code" req><input className="input mono" value={f.code} onChange={e => set("code", e.target.value)} placeholder="ex. VER_MKT" disabled={!!role} /></Field>
      <Field label="Type"><select className="select" value={f.type} onChange={e => set("type", e.target.value)}>
        <option value="I">Initiateur</option><option value="V">Vérificateur</option><option value="A">Approbateur</option><option value="C">Contrôleur</option><option value="S">Superviseur</option><option value="X">Admin</option></select></Field>
      <Field label="Libellé" req><input className="input" value={f.libelle} onChange={e => set("libelle", e.target.value)} placeholder="ex. Vérificateur Marketing" /></Field>
      <Field label="Niveau hiérarchique"><input className="input mono" type="number" value={f.niveau} onChange={e => set("niveau", e.target.value)} /></Field>
      <Field label="Circuit"><select className="select" value={f.circuit} onChange={e => set("circuit", e.target.value)}>{circuitOpts.map(c => <option key={c} value={c}>{c === "*" ? "Pivot (multi-circuits)" : c}</option>)}</select></Field>
      <Field label="Groupe Active Directory"><input className="input mono" value={f.ad} onChange={e => set("ad", e.target.value)} placeholder="GG-DGR-…" /></Field>
    </div>
  </Modal>;
}

/* ======================== UTILISATEURS ======================== */
function UsersView() {
  const toast = window.useToast();
  const [, force] = uS3(0);
  const [modal, setModal] = uS3(null);
  const colors = ["#FF7900", "#4BB4E6", "#A885D8", "#32C832", "#CD3C14", "#1a6f99", "#6b3fa0", "#242424"];
  function save(form, original) {
    if (!form.nom.trim()) { toast({ type: "error", title: "Nom requis" }); return; }
    const initiales = form.nom.trim().split(/\s+/).map(w => w[0]).slice(0, 2).join("").toUpperCase();
    const login = form.login.trim() || form.nom.trim().toLowerCase().replace(/\s+/g, ".").normalize("NFD").replace(/[^a-z.]/g, "");
    const rec = { id: original ? original.id : "u_" + Math.random().toString(36).slice(2, 8), nom: form.nom.trim(), initiales, couleur: form.couleur, roles: form.roles, titre: form.titre.trim(), login, serviceDobb: form.serviceDobb || null, direction: form.direction || null, service: form.service || null };
    if (original) { const i = D3.USERS.findIndex(u => u.id === original.id); D3.USERS[i] = rec; }
    else D3.USERS.push(rec);
    D3.userById[rec.id] = rec;
    setModal(null); force(x => x + 1);
    toast({ type: "success", title: original ? "Utilisateur modifié" : "Utilisateur créé", msg: rec.nom });
  }
  function del(u) {
    const i = D3.USERS.findIndex(x => x.id === u.id); if (i >= 0) D3.USERS.splice(i, 1); delete D3.userById[u.id];
    force(x => x + 1); toast({ type: "info", title: "Utilisateur supprimé", msg: u.nom });
  }
  return <>
    <div className="alert alert-blue mb-16"><Icon name="info" size={15} />Gérez les comptes et leurs rôles. Affecter un rôle à un utilisateur le place automatiquement dans la corbeille correspondante.</div>
    <div className="row mb-16" style={{ justifyContent: "flex-end" }}>
      <button className="btn btn-dark btn-sm" onClick={() => setModal({ user: null })}><Icon name="plus" size={14} /> Nouvel utilisateur</button>
    </div>
    <div className="card" style={{ overflow: "hidden" }}>
      <div className="card-head"><Icon name="user" size={17} /><h3>Utilisateurs</h3><span className="muted" style={{ marginLeft: "auto" }}>{D3.USERS.length} comptes</span></div>
      <table className="table compact"><thead><tr><th>Utilisateur</th><th>Identifiant</th><th>Titre</th><th>Rôles / corbeilles</th><th>2FA</th><th></th></tr></thead>
        <tbody>{D3.USERS.map(u => <tr key={u.id} className="norow">
          <td><div className="row gap-8"><Avatar user={u} size={28} /><b>{u.nom}</b></div></td>
          <td className="mono tiny muted">{u.login}</td>
          <td className="tiny">{u.titre}</td>
          <td><div className="row gap-4 wrap">{u.roles.map(rc => <span key={rc} className="badge b-grey" style={{ fontSize: 10 }}>{D3.roleByCode[rc]?.libelle || rc}</span>)}</div></td>
          <td>{D3.requiresMfa(u) ? <Badge cls="b-orange">2FA</Badge> : <span className="tiny muted">simple</span>}</td>
          <td><div className="row gap-6"><button className="iconbtn" title="Éditer" onClick={() => setModal({ user: u })}><Icon name="edit" size={13} /></button><button className="iconbtn" title="Supprimer" onClick={() => del(u)}><Icon name="trash" size={13} /></button></div></td>
        </tr>)}</tbody></table>
    </div>
    {modal && <UserModal user={modal.user} colors={colors} onClose={() => setModal(null)} onSave={save} />}
  </>;
}
function UserModal({ user, colors, onClose, onSave }) {
  const [f, setF] = uS3(user ? { ...user, roles: [...user.roles] } : { nom: "", login: "", titre: "", couleur: colors[0], roles: [] });
  const set = (k, v) => setF(s => ({ ...s, [k]: v }));
  const toggleRole = (rc) => setF(s => ({ ...s, roles: s.roles.includes(rc) ? s.roles.filter(x => x !== rc) : [...s.roles, rc] }));
  return <Modal title={user ? "Modifier l'utilisateur" : "Nouvel utilisateur"} icon="user" onClose={onClose} lg
    footer={<><button className="btn btn-ghost" onClick={onClose}>Annuler</button><button className="btn btn-primary" onClick={() => onSave(f, user)}><Icon name="check" size={15} /> Enregistrer</button></>}>
    <div className="grid grid-2">
      <Field label="Nom complet" req><input className="input" value={f.nom} onChange={e => set("nom", e.target.value)} placeholder="Prénom Nom" /></Field>
      <Field label="Identifiant AD"><input className="input mono" value={f.login} onChange={e => set("login", e.target.value)} placeholder="prenom.nom (auto si vide)" /></Field>
      <Field label="Titre / fonction"><input className="input" value={f.titre} onChange={e => set("titre", e.target.value)} placeholder="ex. Gestionnaire clientèle" /></Field>
      <Field label="Direction de rattachement" hint="Personnalise l'espace de travail de l'agent."><select className="select" value={f.direction || ""} onChange={e => set("direction", e.target.value)}><option value="">— Choisir —</option>{Object.entries(D3.DIRECTIONS).map(([code, lib]) => <option key={code} value={code}>{code} — {lib}</option>)}</select></Field>
      <Field label="Service de rattachement"><input className="input" value={f.service || ""} onChange={e => set("service", e.target.value)} placeholder="ex. Réclamation, Recouvrement…" /></Field>
      <Field label="Service DOBB de rattachement" hint="Détermine le sous-circuit de signature des demandes B2B initiées par l'agent."><select className="select" value={f.serviceDobb || ""} onChange={e => set("serviceDobb", e.target.value)}><option value="">— Aucun —</option>{D3.CIRCUITS.DOBB.sousFlux.map(s => <option key={s}>{s}</option>)}</select></Field>
      <Field label="Couleur d'avatar"><div className="row gap-6 wrap">{colors.map(c => <button key={c} onClick={() => set("couleur", c)} style={{ width: 26, height: 26, borderRadius: "50%", background: c, border: f.couleur === c ? "3px solid var(--ink)" : "2px solid var(--g200)", cursor: "pointer" }} />)}</div></Field>
    </div>
    <div className="divider"></div>
    <div className="tiny muted mb-8" style={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em" }}>Rôles / corbeilles ({f.roles.length})</div>
    <div className="grid grid-2" style={{ gap: 6, maxHeight: 220, overflowY: "auto" }}>
      {D3.ROLES.map(r => <label key={r.code} className="row gap-8" style={{ padding: "6px 8px", border: "1px solid var(--g200)", borderRadius: 6, cursor: "pointer", background: f.roles.includes(r.code) ? "var(--orange-50)" : "#fff" }}>
        <input type="checkbox" checked={f.roles.includes(r.code)} onChange={() => toggleRole(r.code)} />
        <span style={{ flex: 1 }}><span style={{ fontWeight: 600, fontSize: 12.5 }}>{r.libelle}</span><span className="tiny muted" style={{ display: "block" }}>{r.code} · {r.circuit === "*" ? "pivot" : r.circuit}</span></span>
      </label>)}
    </div>
  </Modal>;
}

/* ======================== PARAMÈTRES DE CALCUL ======================== */
function RejetsSlaPanel({ cfg, force }) {
  const r = cfg.rejets || (cfg.rejets = { slaActif: true, mode: "chaine", delaiFixeH: 48, heuresOuvrees: true, seuilAlerteH: 8 });
  const set = (k, v) => { r[k] = v; force(x => x + 1); };
  return (
    <div className="card">
      <div className="card-head"><Icon name="x" size={17} /><h3>SLA des demandes rejetées</h3>
        <div className="spacer" /><button className={"switch" + (r.slaActif ? " on" : "")} onClick={() => set("slaActif", !r.slaActif)} /></div>
      <div className="card-pad col gap-12">
        <div className="tiny muted">{r.slaActif ? "Un délai de correction s'applique aux dossiers rejetés ; le compteur démarre à la date de rejet." : "Aucun délai n'est appliqué : les rejets sont à corriger sans contrainte SLA."}</div>
        {r.slaActif && <>
          <Field label="Mode de calcul du délai">
            <div className="seg">
              <button className={r.mode === "chaine" ? "active" : ""} onClick={() => set("mode", "chaine")}>Somme du circuit</button>
              <button className={r.mode === "fixe" ? "active" : ""} onClick={() => set("mode", "fixe")}>Délai fixe</button>
            </div>
          </Field>
          {r.mode === "chaine"
            ? <div className="tiny muted">Le délai = somme des SLA des étapes de validation du circuit du dossier.</div>
            : <Field label="Délai fixe de correction" hint="Appliqué à tous les rejets, quel que soit le circuit.">
                <div className="input-addon" style={{ maxWidth: 150 }}><input className="input mono" type="number" min="1" value={r.delaiFixeH} onChange={e => set("delaiFixeH", Number(e.target.value) || 0)} style={{ paddingRight: 28 }} /><span className="suffix">h</span></div>
              </Field>}
          <Field label="Seuil d'alerte (passage en orange)" hint="Marge restante en dessous de laquelle le dossier bascule en alerte.">
            <div className="input-addon" style={{ maxWidth: 150 }}><input className="input mono" type="number" min="0" value={r.seuilAlerteH} onChange={e => set("seuilAlerteH", Number(e.target.value) || 0)} style={{ paddingRight: 28 }} /><span className="suffix">h</span></div>
          </Field>
          <div className="switch-row"><button className={"switch" + (r.heuresOuvrees !== false ? " on" : "")} onClick={() => set("heuresOuvrees", !(r.heuresOuvrees !== false))} /><span style={{ fontWeight: 600, fontSize: 13 }}>Décompte en heures ouvrées</span></div>
        </>}
      </div>
    </div>
  );
}

function CalcConfigView() {
  const toast = window.useToast();
  const [, force] = uS3(0);
  const cfg = D3.CONFIG;
  const setTax = (key, prop, val) => { cfg.taxes[key][prop] = val; force(x => x + 1); };
  const ex = 1000000;
  const m = E3.calcMontants(ex, null);
  return <>
    <div className="alert alert-blue mb-16"><Icon name="info" size={15} />Activez/désactivez et paramétrez chaque composante de calcul. Les changements s'appliquent immédiatement aux nouvelles demandes et aux aperçus.</div>
    <div className="grid grid-2">
      <div className="col gap-16">
        {["tsc", "tva"].map(key => { const t = cfg.taxes[key];
          return <div className="card" key={key}>
            <div className="card-head"><Icon name="calc" size={17} /><h3>{t.label}</h3>
              <div className="spacer" /><button className={"switch" + (t.actif ? " on" : "")} onClick={() => setTax(key, "actif", !t.actif)} /></div>
            <div className="card-pad">
              <Field label={`Taux ${t.label} (%)`} hint={t.actif ? "Appliqué au montant HT." : "Composante désactivée — non calculée ni affichée."}>
                <div className="input-addon" style={{ maxWidth: 160 }}>
                  <input className="input mono" type="number" step="0.01" disabled={!t.actif} value={+(t.taux * 100).toFixed(2)} onChange={e => setTax(key, "taux", (Number(e.target.value) || 0) / 100)} style={{ paddingRight: 30 }} />
                  <span className="suffix">%</span>
                </div>
              </Field>
            </div>
          </div>; })}
        <div className="card">
          <div className="card-head"><Icon name="layers" size={17} /><h3>Affichage</h3></div>
          <div className="card-pad">
            <div className="switch-row"><button className={"switch" + (cfg.afficherHtPlusTsc ? " on" : "")} onClick={() => { cfg.afficherHtPlusTsc = !cfg.afficherHtPlusTsc; force(x => x + 1); }} /><span style={{ fontWeight: 600, fontSize: 13 }}>Afficher la ligne « HT + TSC »</span></div>
          </div>
        </div>
        <RejetsSlaPanel cfg={cfg} force={force} />
      </div>
      <div className="card" style={{ position: "sticky", top: 86 }}>
        <div className="card-head"><Icon name="eye" size={17} /><h3>Aperçu — exemple 1 000 000 FCFA HT</h3></div>
        <div className="card-pad">
          <div className="row" style={{ justifyContent: "space-between", padding: "5px 0" }}><span className="muted tiny">Montant HT</span><span className="mono">{E3.fmtMoney(ex)}</span></div>
          {cfg.taxes.tsc.actif && <div className="row" style={{ justifyContent: "space-between", padding: "5px 0" }}><span className="muted tiny">{cfg.taxes.tsc.label} ({+(cfg.taxes.tsc.taux * 100).toFixed(2)} %)</span><span className="mono">{E3.fmtMoney(m.tsc)}</span></div>}
          {cfg.afficherHtPlusTsc && <div className="row" style={{ justifyContent: "space-between", padding: "5px 0", borderTop: "1px dashed var(--g200)" }}><span className="muted tiny" style={{ fontStyle: "italic" }}>HT + TSC</span><span className="mono">{E3.fmtMoney(ex + m.tsc)}</span></div>}
          {cfg.taxes.tva.actif && <div className="row" style={{ justifyContent: "space-between", padding: "5px 0" }}><span className="muted tiny">{cfg.taxes.tva.label} ({+(cfg.taxes.tva.taux * 100).toFixed(2)} %)</span><span className="mono">{E3.fmtMoney(m.tva)}</span></div>}
          <div className="divider" style={{ margin: "8px 0" }} />
          <div className="row" style={{ justifyContent: "space-between" }}><b>Total TTC</b><b className="mono" style={{ fontSize: 17, color: "var(--orange-600)" }}>{E3.fmtMoney(m.ttc)}</b></div>
        </div>
      </div>
    </div>

    {/* Calendrier métier des SLA (modèle type GLPI) */}
    <CalendrierSlaPanel cfg={cfg} force={force} />
  </>;
}

function CalendrierSlaPanel({ cfg, force }) {
  const [simH, setSimH] = uS3(24);
  const [newFerie, setNewFerie] = uS3("");
  const cal = cfg.calendrier;
  const hParJour = Math.max(0, cal.heureFin - cal.heureDebut);
  const nbJours = cal.joursOuvres.length;
  const echeance = E3.echeanceSla(Date.now(), simH);
  const fmtFerie = (s) => { const d = new Date(s); return isNaN(d) ? s : d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" }); };
  const days = [["Lundi", 1], ["Mardi", 2], ["Mercredi", 3], ["Jeudi", 4], ["Vendredi", 5], ["Samedi", 6], ["Dimanche", 0]];

  function toggleDay(n) {
    cal.joursOuvres = cal.joursOuvres.includes(n) ? cal.joursOuvres.filter(x => x !== n) : [...cal.joursOuvres, n].sort();
    force(x => x + 1);
  }
  function addFerie() {
    const v = newFerie.trim(); if (!v) return;
    if (!cal.feries.includes(v)) cal.feries = [...cal.feries, v].sort();
    setNewFerie(""); force(x => x + 1);
  }
  function delFerie(f) { cal.feries = cal.feries.filter(x => x !== f); force(x => x + 1); }

  return (
    <div className="card mt-16">
      <div className="card-head"><Icon name="clock" size={17} /><h3>Calendrier métier des SLA</h3>
        <span className="badge b-blue" style={{ marginLeft: 8 }}>modèle type GLPI</span>
        <span className="muted tiny" style={{ marginLeft: "auto" }}>{nbJours} j ouvrés · {hParJour} h/jour · {cal.feries.length} férié(s)</span></div>
      <div className="card-pad">
        <div className="alert alert-grey mb-16"><Icon name="info" size={15} />
          <div>Les délais SLA sont décomptés en <b>heures ouvrées</b> : seuls les jours ouvrés et la plage horaire de travail comptent ; les jours fériés sont exclus.</div></div>

        <div className="cal-wrap">
          {/* Colonne config */}
          <div className="col gap-16">
            {/* Jours ouvrés — grille hebdo */}
            <div>
              <div className="tiny muted mb-8" style={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em" }}>Jours ouvrés</div>
              <div className="cal-days">
                {days.map(([l, n]) => { const on = cal.joursOuvres.includes(n);
                  return <div key={n} className={"cal-day " + (on ? "on" : "off")} onClick={() => toggleDay(n)}>
                    <div className="cd-check">{on && <Icon name="check" size={12} stroke={3} />}</div>
                    <div className="cd-name">{l.slice(0, 3)}</div>
                    <div className="cd-state">{on ? "Ouvré" : "Fermé"}</div>
                  </div>; })}
              </div>
            </div>

            {/* Plage horaire — règle visuelle + sliders */}
            <div>
              <div className="row mb-8" style={{ justifyContent: "space-between" }}>
                <span className="tiny muted" style={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em" }}>Plage horaire de travail</span>
                <span className="tiny mono" style={{ fontWeight: 700 }}>{String(cal.heureDebut).padStart(2, "0")}:00 → {String(cal.heureFin).padStart(2, "0")}:00 · {hParJour} h</span>
              </div>
              <div className="cal-ruler">
                <div className="band" style={{ left: (cal.heureDebut / 24 * 100) + "%", width: (hParJour / 24 * 100) + "%" }}>
                  <div className="band-lbl">Travail</div>
                </div>
                {[0, 6, 12, 18, 24].map(h => <span key={h} className="lbl" style={{ left: (h / 24 * 100) + "%" }}>{h}h</span>)}
              </div>
              <div className="grid grid-2" style={{ marginTop: 10 }}>
                <Field label={`Début · ${cal.heureDebut}h`}><input type="range" min="0" max="23" value={cal.heureDebut} onChange={e => { const v = Number(e.target.value); cal.heureDebut = Math.min(v, cal.heureFin - 1); force(x => x + 1); }} style={{ width: "100%" }} /></Field>
                <Field label={`Fin · ${cal.heureFin}h`}><input type="range" min="1" max="24" value={cal.heureFin} onChange={e => { const v = Number(e.target.value); cal.heureFin = Math.max(v, cal.heureDebut + 1); force(x => x + 1); }} style={{ width: "100%" }} /></Field>
              </div>
            </div>

            {/* Jours fériés — chips */}
            <div>
              <div className="tiny muted mb-8" style={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em" }}>Jours fériés (exclus)</div>
              <div className="row gap-6 wrap mb-8">
                {cal.feries.length === 0 && <span className="tiny muted">Aucun jour férié.</span>}
                {cal.feries.map(f => <span className="holi-chip" key={f}><Icon name="flag" size={12} color="var(--g600)" /> {fmtFerie(f)} <button onClick={() => delFerie(f)}><Icon name="x" size={12} /></button></span>)}
              </div>
              <div className="row gap-8">
                <input className="input" type="date" value={newFerie} onChange={e => setNewFerie(e.target.value)} style={{ maxWidth: 180 }} />
                <button className="btn btn-ghost btn-sm" onClick={addFerie}><Icon name="plus" size={14} /> Ajouter</button>
              </div>
            </div>
          </div>

          {/* Colonne simulateur */}
          <div className="sim-panel">
            <div className="row gap-8" style={{ alignItems: "center" }}><Icon name="calc" size={16} color="var(--orange-600)" /><b style={{ fontSize: 13.5 }}>Simulateur d'échéance</b></div>
            <p className="tiny muted" style={{ margin: "4px 0 12px" }}>Calcule la date d'échéance d'un SLA en partant de maintenant, selon ce calendrier.</p>
            <Field label={`Délai SLA : ${simH} h ouvrées`}>
              <input type="range" min="1" max="240" value={simH} onChange={e => setSimH(Number(e.target.value))} style={{ width: "100%" }} />
            </Field>
            <div className="row gap-6 wrap" style={{ marginTop: 4 }}>
              {[8, 24, 48, 72, 240].map(h => <button key={h} className={"chip clickable" + (simH === h ? " active" : "")} onClick={() => setSimH(h)}>{h === 240 ? "10 j" : h + " h"}</button>)}
            </div>
            <div className="sim-result">
              <div className="tiny muted">Échéance calculée</div>
              <div style={{ fontWeight: 800, fontSize: 17, color: "var(--orange-600)" }}>{E3.fmtDateTime(echeance)}</div>
              <div className="tiny muted" style={{ marginTop: 4 }}>soit ≈ {Math.round((echeance - Date.now()) / 3600000)} h calendaires ({Math.round((echeance - Date.now()) / 86400000 * 10) / 10} j)</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
function MoniteurView() {
  const store = window.useStore();
  const toast = window.useToast();
  const { dossiers, go } = store;
  const [circ, setCirc] = uS3("tous");
  const actifs = dossiers.filter(d => (d.statut === "soumis" || d.statut === "en_cours") && (circ === "tous" || d.circuit === circ));
  // regroupe par étape courante (rôle)
  const parEtape = {};
  actifs.forEach(d => { const ct = E3.currentTask(d); const k = ct ? ct.role : "—"; (parEtape[k] = parEtape[k] || []).push({ d, ct }); });
  const groupes = Object.entries(parEtape).sort((a, b) => b[1].length - a[1].length);

  return <>
    <div className="alert alert-blue mb-16"><Icon name="info" size={15} />
      <div>Moniteur d'exécution : visualisez les instances en cours par étape et intervenez (escalade, relance, ouverture du dossier). Reflète l'état temps réel du moteur.</div></div>
    <div className="proc-toolbar">
      <div className="row gap-6 wrap">
        {[["tous", "Tous"], ...Object.keys(D3.CIRCUITS).map(k => [k, k])].map(([k, l]) =>
          <button key={k} className={"chip clickable" + (circ === k ? " active" : "")} onClick={() => setCirc(k)}>{l}</button>)}
      </div>
      <div className="spacer" />
      <span className="tiny muted">{actifs.length} instance(s) active(s)</span>
    </div>
    {groupes.length === 0 ? <div className="card"><Empty icon="flow" title="Aucune instance active">Aucune demande en cours pour ce filtre.</Empty></div> :
      <div className="col gap-16">
        {groupes.map(([role, items]) => (
          <div className="card" key={role} style={{ overflow: "hidden" }}>
            <div className="card-head"><Icon name="inbox" size={16} /><h3>{E3.roleLabel(role)}</h3>
              <span className="badge b-orange" style={{ marginLeft: 6 }}>{items.length}</span>
              <span className="muted tiny" style={{ marginLeft: "auto" }}>étape courante</span></div>
            <table className="table compact">
              <thead><tr><th>Référence</th><th>Circuit</th><th className="num">TTC</th><th>Ancienneté</th><th>État</th><th></th></tr></thead>
              <tbody>{items.map(({ d, ct }) => (
                <tr key={d.id}>
                  <td className="mono tiny" style={{ fontWeight: 600, cursor: "pointer" }} onClick={() => { store.back = "admin"; go("detail", d.id); }}>{d.ref}</td>
                  <td><CircuitPill code={d.circuit} /></td>
                  <td className="num tiny"><b>{E3.fmtMoneyShort(d.ttc)}</b></td>
                  <td>{ct && E3.isEnRetard(ct) ? <Badge cls="b-red" dot>{E3.fmtDuree(E3.ageHeures(ct))}</Badge> : <span className="tiny muted">{ct ? E3.fmtDuree(E3.ageHeures(ct)) : "—"}</span>}</td>
                  <td>{ct && ct.etat === "RECLAMEE" ? <Badge cls="b-blue">En traitement</Badge> : <Badge cls="b-grey">En attente</Badge>}</td>
                  <td><div className="row gap-6" style={{ justifyContent: "flex-end" }}>
                    <button className="btn btn-ghost btn-sm" title="Relancer la corbeille" onClick={() => { store.relancer(d.id); toast({ type: "info", title: "Corbeille relancée" }); }}><Icon name="bell" size={13} /></button>
                    {ct && E3.isEnRetard(ct) && <button className="btn btn-ghost btn-sm" title="Escalader" onClick={() => { const r = store.escalader(d.id, ct.id, "Escalade depuis le moniteur"); if (r.ok) toast({ type: "warn", title: "Tâche escaladée" }); }}><Icon name="arrowRight" size={13} /></button>}
                    <button className="btn btn-ghost btn-sm" onClick={() => { store.back = "admin"; go("detail", d.id); }}><Icon name="eye" size={13} /> Ouvrir</button>
                  </div></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        ))}
      </div>}
  </>;
}

function MotifsView() {
  return <div className="grid grid-3">{Object.values(D3.CIRCUITS).map(c => <div className="card" key={c.code}>
    <div className="card-head"><CircuitPill code={c.code} /><h3 style={{ marginLeft: 4 }}>{c.segment}</h3></div>
    <div className="card-pad">
      <div className="tiny muted mb-8" style={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em" }}>Sous-flux</div>
      <div className="row gap-6 wrap mb-16">{c.sousFlux.map(s => <span key={s} className="chip">{s}</span>)}</div>
      <div className="tiny muted mb-8" style={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em" }}>Motifs</div>
      <div className="col gap-6">{D3.MOTIFS[c.code].map(m => <div key={m} className="row gap-8"><Icon name="flag" size={13} color="var(--g500)" /><span style={{ fontSize: 13 }}>{m}</span></div>)}</div>
    </div>
  </div>)}</div>;
}

/* ======================== JOURNAL D'AUDIT GLOBAL ======================== */
function AuditScreen() {
  const store = window.useStore();
  const { dossiers, go } = store;
  const [q, setQ] = uS3("");
  const [tab, setTab] = uS3("transitions");
  const all = uM3(() => {
    const acts = [];
    dossiers.forEach(d => (d.audit || []).forEach(a => acts.push({ ...a, ref: d.ref, circuit: d.circuit, did: d.id })));
    return acts.sort((x, y) => y.ts - x.ts);
  }, [dossiers]);
  const filtered = q ? all.filter(a => (a.ref + a.acteur + a.action + a.commentaire).toLowerCase().includes(q.toLowerCase())) : all;
  const seclog = window.PGD_SECLOG || [];

  return (
    <div className="fade-in">
      <div className="page-head"><div><h2>Journal d'audit</h2><p>Toutes les transitions, horodatées et nominatives — non répudiable, conservation 10 ans (SOX).</p></div>
        <div className="spacer" /><button className="btn btn-ghost" onClick={() => store.exportAudit(filtered)}><Icon name="download" size={15} /> CSV</button><button className="btn btn-ghost" onClick={() => store.exportAuditXLS(filtered)}><Icon name="download" size={15} /> Excel</button></div>
      <div className="tabbar">
        <button className={"tab" + (tab === "transitions" ? " active" : "")} onClick={() => setTab("transitions")}>Transitions des dossiers ({all.length})</button>
        <button className={"tab" + (tab === "securite" ? " active" : "")} onClick={() => setTab("securite")}>Sécurité — authentification ({seclog.length})</button>
      </div>

      {tab === "transitions" ? <>
        <div className="card card-pad mb-16" style={{ padding: 12 }}>
          <div className="input-addon"><input className="input" placeholder="Rechercher (référence, acteur, action…)" value={q} onChange={e => setQ(e.target.value)} style={{ paddingLeft: 38 }} />
            <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }}><Icon name="search" size={16} color="var(--g500)" /></span></div>
        </div>
        <div className="card" style={{ overflow: "hidden" }}>
          <table className="table compact"><thead><tr><th>Horodatage</th><th>Référence</th><th>Acteur</th><th>Action</th><th>Détail</th></tr></thead>
            <tbody>{filtered.slice(0, 60).map((a, i) => <tr key={i} onClick={() => go("detail", a.did)}>
              <td className="mono tiny nowrap muted">{E3.fmtDateTime(a.ts)}</td>
              <td className="mono tiny" style={{ fontWeight: 600 }}>{a.ref}</td>
              <td className="tiny" style={{ fontWeight: 600 }}>{a.acteur}</td>
              <td className="tiny"><Badge cls={actionColor(a.action)}>{a.action}</Badge></td>
              <td className="tiny muted">{a.commentaire || "—"}</td></tr>)}</tbody></table>
        </div>
        <div className="tiny muted center mt-8">{filtered.length} événement(s){filtered.length > 60 && " · 60 affichés"}</div>
      </> : (
        <div className="card" style={{ overflow: "hidden" }}>
          <div className="card-head"><Icon name="shield" size={17} /><h3>Journal de sécurité</h3><span className="muted" style={{ marginLeft: "auto" }}>AD/LDAP + 2FA · échecs enregistrés</span></div>
          {seclog.length === 0 ? <Empty icon="lock" title="Aucun événement">Les connexions de la session apparaîtront ici.</Empty> :
            <table className="table compact"><thead><tr><th>Horodatage</th><th>Compte</th><th>Type</th><th>Résultat</th><th>Détail</th></tr></thead>
              <tbody>{seclog.slice(0, 50).map((s, i) => <tr key={i} className="norow">
                <td className="mono tiny nowrap muted">{E3.fmtDateTime(s.ts)}</td>
                <td className="tiny"><span className="mono">{s.login}</span>{s.nom && <div className="muted">{s.nom}</div>}</td>
                <td><Badge cls={s.type === "2FA" ? "b-orange" : s.type === "AD" ? "b-blue" : s.type === "Déconnexion" ? "b-grey" : "b-purple"}>{s.type}</Badge></td>
                <td>{s.ok ? <Badge cls="b-green" dot>Succès</Badge> : <Badge cls="b-red" dot>Échec</Badge>}</td>
                <td className="tiny muted">{s.motif || "—"}</td></tr>)}</tbody></table>}
        </div>
      )}
    </div>
  );
}
function actionColor(action) {
  if (/Rejet/.test(action)) return "b-red";
  if (/Approb|Validation|Vérif/.test(action)) return "b-green";
  if (/Soumission/.test(action)) return "b-blue";
  if (/claim|Réclam/.test(action)) return "b-orange";
  if (/Escalade|Re-routage|Modification/.test(action)) return "b-orange";
  if (/Délég/.test(action)) return "b-purple";
  return "b-grey";
}

Object.assign(window, { DashboardScreen, ControleScreen, AdminScreen, AuditScreen });
