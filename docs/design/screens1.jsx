/* ====================================================================
   PGD — Écrans : Accueil + Nouvelle demande
   ==================================================================== */
const { useState: uS1, useEffect: uE1, useMemo: uM1, useRef: uR1 } = React;
const EE = window.PGD_ENGINE, DD = window.PGD_DATA;

/* Résout la liste de clients d'un circuit (par défaut ou défini sur le circuit) */
function clientsOf(circ) {
  const cc = DD.CIRCUITS[circ];
  if (cc && cc.clients && cc.clients.length) return cc.clients;
  if (circ === "DXC") return DD.CLIENTS_DXC;
  if (circ === "DOBB") return DD.CLIENTS_DOBB;
  if (circ === "DF") return DD.CLIENTS_DF;
  return [{ nom: "Client exemple", compte: "CPT-000001", formule: "Offre standard" }];
}
window.clientsOf = clientsOf;

/* ============================ ACCUEIL ============================ */
function HomeScreen() {
  const store = window.useStore();
  const { user, dossiers, go } = store;
  const roles = user.roles;
  const isInit = roles.some(r => DD.roleByCode[r]?.type === "I");
  const isValid = roles.some(r => ["V", "A"].includes(DD.roleByCode[r]?.type));
  const isSup = roles.includes("SUPERVISEUR");
  const isCtrl = roles.some(r => DD.roleByCode[r]?.type === "C");

  // tâches dans mes corbeilles
  const myTasks = store.tasksForUser(user);
  const mesDemandes = dossiers.filter(d => d.createdBy === user.id || (isInit && d.createdByName === user.nom));
  const enAttente = dossiers.filter(d => d.statut === "soumis" || d.statut === "en_cours").length;

  const tiles = [];
  if (isInit) tiles.push({ k: "ndossiers", label: "Nouvelle demande", desc: "Saisir une fiche d'ajustement", ic: "plus", action: () => go("nouvelle"), primary: true });
  if (isValid) tiles.push({ k: "corb", label: "Mes corbeilles", desc: `${myTasks.length} tâche(s) à traiter`, ic: "inbox", action: () => go("corbeilles"), count: myTasks.length });
  if (isInit) tiles.push({ k: "mes", label: "Mes demandes", desc: `${mesDemandes.length} dossier(s)`, ic: "doc", action: () => go("mes") });
  if (isCtrl) tiles.push({ k: "ctrl", label: "Contrôle a posteriori", desc: "Contrôles à froid", ic: "shield", action: () => go("controle") });

  return (
    <div className="fade-in">
      <div className="page-head">
        <div>
          <h2>Bonjour {user.nom.split(" ")[0]}</h2>
          <p>{user.titre} · {user.roles.map(r => DD.roleByCode[r]?.libelle).join(" · ")}</p>
        </div>
      </div>

      <div className="grid grid-3 mb-24">
        {tiles.map(t => (
          <button key={t.k} className="card card-pad" onClick={t.action}
            style={{ textAlign: "left", cursor: "pointer", border: t.primary ? "1px solid var(--orange)" : null, position: "relative" }}>
            <div className="row gap-12" style={{ marginBottom: 12 }}>
              <div style={{ width: 42, height: 42, borderRadius: 8, display: "grid", placeItems: "center",
                background: t.primary ? "var(--orange)" : "var(--g100)", color: t.primary ? "#000" : "var(--g700)" }}>
                <Icon name={t.ic} size={22} />
              </div>
              {t.count > 0 && <span className="badge b-orange" style={{ marginLeft: "auto" }}>{t.count}</span>}
            </div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>{t.label}</div>
            <div className="muted tiny" style={{ marginTop: 2 }}>{t.desc}</div>
          </button>
        ))}
      </div>

      {/* Tableau de bord intégré à l'accueil */}
      <DashboardScreen embedded />

      {/* Activité récente */}
      <div className="card mt-24">
        <div className="card-head"><Icon name="clock" size={18} /><h3>Activité récente</h3>
          <div className="spacer" /><button className="btn-link" onClick={() => go("audit")}>Journal complet</button></div>
        <div style={{ padding: "6px 20px 14px" }}>
          {recentActivity(dossiers).slice(0, 6).map((a, i) => (
            <div className="timeline-item" key={i}>
              <div className="timeline-ic" style={{ background: a.color + "22", color: a.color }}><Icon name={a.ic} size={15} /></div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13 }}><b>{a.acteur}</b> · {a.action} <span className="mono muted">{a.ref}</span></div>
                <div className="tiny muted">{a.commentaire}</div>
              </div>
              <div className="tiny muted nowrap">{EE.fmtAgo(a.ts)}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
function KpiMini({ label, value, ic, color }) {
  return <div className="kpi"><div className="accent" style={{ background: color }} />
    <div className="row" style={{ justifyContent: "space-between" }}>
      <span className="label">{label}</span><Icon name={ic} size={16} color={color} />
    </div>
    <div className="value">{value}</div>
  </div>;
}
function recentActivity(dossiers) {
  const acts = [];
  dossiers.forEach(d => (d.audit || []).forEach(a => acts.push({ ...a, ref: d.ref })));
  acts.sort((x, y) => y.ts - x.ts);
  const map = {
    "Soumission": { ic: "send", color: "#4BB4E6" }, "Approbation": { ic: "check", color: "#32C832" },
    "Vérification": { ic: "eye", color: "#4BB4E6" }, "Rejet": { ic: "x", color: "#CD3C14" },
    "Validation finale": { ic: "flag", color: "#32C832" }, "Réclamation (claim)": { ic: "lock", color: "#FF7900" },
    "Relâche (unclaim)": { ic: "unlock", color: "#999" }, "Délégation": { ic: "delegate", color: "#A885D8" },
    "Abandon": { ic: "trash", color: "#999" }, "Contrôle a posteriori": { ic: "shield", color: "#1a6f99" },
    "Escalade": { ic: "arrowRight", color: "#FF7900" }, "Re-routage": { ic: "refresh", color: "#FF7900" },
    "Modification": { ic: "edit", color: "#A885D8" },
  };
  return acts.map(a => ({ ...a, ...(map[a.action] || { ic: "doc", color: "#999" }) }));
}

/* ====================== NOUVELLE DEMANDE ====================== */
function NouvelleDemandeScreen() {
  const store = window.useStore();
  const toast = window.useToast();
  const { user, go } = store;
  const myCircuit = DD.initiatorCircuit(user) || "DXC";
  const [circuit, setCircuit] = uS1(myCircuit);
  const c = DD.CIRCUITS[circuit];
  const clients = clientsOf(circuit);

  const [f, setF] = uS1(initForm(myCircuit));
  const [errors, setErrors] = uS1({});
  const [pieces, setPieces] = uS1([]);

  function initForm(circ) {
    const cc = DD.CIRCUITS[circ];
    const today = new Date().toISOString().slice(0, 10);
    // Le service DOBB n'est plus saisi : il provient du profil de l'agent initiateur (défini par l'Admin).
    const svcDobb = (circ === "DOBB" && user.serviceDobb && cc.sousFlux.includes(user.serviceDobb)) ? user.serviceDobb : cc.sousFlux[0];
    return {
      sousFlux: svcDobb, motif: "", motifAutre: "", clientNom: "", clientCompte: "", clientAccount: "", formule: "",
      agent: user.nom, agentSaisie: user.nom, matricule: user.login || "", matriculeSaisie: user.login || "", dateDemande: today, dateSaisie: today, numeroCase: "",
      ht: "", libelle: "", libelleAutre: "", commentaire: "", contactClient: "", refClient: "",
      caseLookup: "", lookupMsg: null, acctMsg: null, clientIdx: 0,
      univers: "Fixe", facteur: "interne",
      applyTsc: DD.CONFIG?.taxes?.tsc?.actif ?? true,
      applyTva: DD.CONFIG?.taxes?.tva?.actif ?? true,
      tvaBase: "ht",  // "ht" = nouvelle règle (TVA sur HT) · "htTsc" = ancienne règle (TVA sur HT+TSC)
      tscManuelle: false, tscManuelleVal: "",
      tvaManuelle: false, tvaManuelleVal: "",
      // DOBB
      numeroAppel: "", descriptifContestation: "", pointContact: "", agentReclamation: "", agentResponsable: "",
      responsabiliteDirection: "DOBB", responsabiliteService: "FACTURATION",
      dateReceptionBO: today, dateReceptionOCI: today, pieceAfferente: "",
      localisation: "National", canal: "CRM", recurrent: false, recurrentMensuel: "",
      pDebut: "", pFin: "", pJours: "",
      // DF / FRA mémo
      memoDe: user.nom, memoA: "Service Fraude & Revenue Assurance", memoObjet: "", memoObjectif: "Soumettre l'ajustement au contrôle FRA",
      memoContexte: "", memoObservation: "", montantEuro: "",
    };
  }
  uE1(() => { setF(initForm(circuit)); setErrors({}); setPieces([]); }, [circuit]);

  const ht = Number(f.ht) || 0;
  const mAuto = EE.calcMontants(ht, c.tva, { tsc: f.applyTsc, tva: f.applyTva, tvaBase: f.tvaBase });
  // TSC en saisie manuelle (comme la TVA dans le panneau de calcul auto) : on substitue la TSC.
  const tscManu = f.applyTsc && f.tscManuelle;
  const tscVal = tscManu ? (Number(f.tscManuelleVal) || 0) : mAuto.tsc;
  // Si l'ancienne règle est active (TVA sur HT+TSC), la TVA auto se recompose sur la TSC retenue.
  const tvaAuto = (f.applyTva && f.tvaBase === "htTsc") ? (ht + tscVal) * c.tva : mAuto.tva;
  // TVA en saisie manuelle : on substitue la TVA et on recompose le TTC.
  const tvaManu = f.applyTva && f.tvaManuelle;
  const tvaVal = tvaManu ? (Number(f.tvaManuelleVal) || 0) : tvaAuto;
  const m = { ...mAuto, tsc: tscVal, tva: tvaVal, ttc: ht + tscVal + tvaVal };
  const tranche = ht > 0 ? EE.selectTranche(circuit, m.ttc) : null;
  const chain = ht > 0 ? EE.buildChainPreview(circuit, m.ttc, f.sousFlux) : [];

  function set(k, v) { setF(s => ({ ...s, [k]: v })); }

  // Libellé résolu (liste déroulante + saisie manuelle si « Autre »)
  const libelleFinal = f.libelle === "__autre" ? (f.libelleAutre || "").trim() : f.libelle;

  // Les infos client sont retrouvées par le N° de Case JADE.
  function doLookup() {
    const key = (f.caseLookup || "").trim().toUpperCase();
    if (!key) { set("lookupMsg", { ok: false, txt: "Saisissez un N° de Case JADE." }); return; }
    const found = DD.findClientByCase(key)
      || (() => { const hit = (store.dossiers || []).find(d => (d.numeroCase || "").trim().toUpperCase() === key); return hit && hit.client ? hit.client : null; })();
    if (!found) {
      setF(s => ({ ...s, numeroCase: f.caseLookup.trim(), lookupMsg: { ok: false, txt: "N° de Case inconnu — saisie manuelle du client possible ci-dessous." } }));
      return;
    }
    setF(s => ({ ...s, numeroCase: f.caseLookup.trim(), clientNom: found.nom || "", clientCompte: found.compte || "", formule: found.formule || s.formule, lookupMsg: { ok: true, txt: `Client retrouvé via ${key} : ${found.nom}` } }));
  }

  // B2C — le nom du client remonte après saisie du N° client (compte)
  function doLookupAccount() {
    const compte = (f.clientCompte || "").trim();
    if (!compte) { set("acctMsg", { ok: false, txt: "Saisissez le N° client." }); return; }
    const found = DD.findClient(compte);
    if (!found) {
      set("acctMsg", { ok: false, txt: "N° client inconnu — saisie manuelle du nom possible ci-dessous." });
      return;
    }
    setF(s => ({ ...s, clientNom: found.nom || "", clientAccount: found.compte || s.clientAccount, formule: found.formule || s.formule, acctMsg: { ok: true, txt: `Nom remonté : ${found.nom}` } }));
  }

  function validate() {
    const e = {};
    if (!f.ht || ht <= 0) e.ht = "Montant HT requis et positif.";
    if (circuit === "DF") {
      if (!f.memoObjet.trim()) e.memoObjet = "Objet du mémo requis.";
      if (!f.memoContexte.trim()) e.memoContexte = "Contexte de la réclamation requis.";
    } else {
      if (!f.dateDemande) e.dateDemande = "Date de demande obligatoire.";
      if (!f.clientNom.trim()) e.clientNom = "Nom du client requis.";
      if (!f.motif) e.motif = "Sélectionnez un motif.";
      if (f.motif === "__autre" && !f.motifAutre.trim()) e.motif = "Précisez le motif.";
      if (!libelleFinal.trim()) e.libelle = "Libellé requis.";
    }
    setErrors(e); return Object.keys(e).length === 0;
  }

  function submit() {
    if (!validate()) { toast({ type: "error", title: "Champs manquants", msg: "Corrigez les erreurs du formulaire." }); return; }
    const client = { nom: f.clientNom.trim() || (circuit === "DF" ? "Opérateur" : ""), compte: f.clientAccount.trim() || f.clientCompte.trim(), formule: f.formule };
    DD.registerClient(client);
    const motifFinal = f.motif === "__autre" ? f.motifAutre.trim() : f.motif;
    const input = {
      circuit, sousFlux: f.sousFlux, motif: circuit === "DF" ? (f.motif || "Réclamation opérateur") : motifFinal,
      client, agent: f.agent, agentSaisie: f.agentSaisie, matricule: f.matricule, matriculeSaisie: f.matriculeSaisie,
      dateDemande: new Date(f.dateDemande).getTime(), dateSaisie: f.dateSaisie ? new Date(f.dateSaisie).getTime() : null, numeroCase: f.numeroCase,
      ht, commentaire: f.commentaire, pieces, contactClient: f.contactClient, refClient: f.refClient,
      tscManuelle: tscManu ? tscVal : null,
      tvaManuelle: tvaManu ? tvaVal : null,
      univers: f.univers, facteur: f.facteur,
      applyTsc: f.applyTsc, applyTva: f.applyTva, tvaBase: f.tvaBase,
      libelle: circuit === "DF" ? f.memoObjet : libelleFinal,
      responsabilite: `${f.responsabiliteDirection} / ${f.responsabiliteService}`,
      responsabiliteDirection: f.responsabiliteDirection, responsabiliteService: f.responsabiliteService,
      createdBy: user.id, createdByName: user.nom,
    };
    if (circuit === "DOBB") {
      input.numeroAppel = f.numeroAppel; input.descriptifContestation = f.descriptifContestation;
      input.pointContact = f.pointContact; input.agentResponsable = f.agentResponsable;
      input.responsabiliteDirection = f.responsabiliteDirection; input.responsabiliteService = f.responsabiliteService;
      input.responsabilite = `${f.responsabiliteDirection} / ${f.responsabiliteService}`;
      input.dateReceptionBO = f.dateReceptionBO; input.dateReceptionOCI = f.dateReceptionOCI;
      input.localisation = f.localisation; input.canal = f.canal;
      input.recurrentMensuel = f.recurrentMensuel ? Number(f.recurrentMensuel) : null;
      input.recurrent = f.recurrent || input.recurrentMensuel > 0;
      input.periode = (f.pDebut || f.pFin) ? { debut: f.pDebut, fin: f.pFin, jours: f.pJours } : null;
    }
    if (circuit === "DXC") { input.recurrentMensuel = f.recurrentMensuel ? Number(f.recurrentMensuel) : null; input.recurrent = f.recurrent || input.recurrentMensuel > 0; }
    if (circuit === "DF") {
      input.memoDe = f.memoDe; input.memoA = f.memoA; input.memoObjet = f.memoObjet;
      input.memoObjectif = f.memoObjectif; input.memoContexte = f.memoContexte; input.memoObservation = f.memoObservation;
      input.montantEuro = f.montantEuro ? Number(f.montantEuro) : null;
      input.memo = f.memoContexte;
    }
    const d = store.createAndSubmit(input);
    toast({ type: "success", title: "Demande soumise", msg: `${d.ref} routée sur « ${tranche.label} »` });
    go("detail", d.id);
  }

  // Options de motif — liste exhaustive ITEMS (groupées par libellé/catégorie)
  const motifOptions = (
    <>
      <option value="">— Choisir —</option>
      {DD.ITEMS_AJUSTEMENT.map(g => (
        <optgroup key={g.libelle} label={g.libelle}>
          {g.motifs.map(m => <option key={m.nom} value={m.nom}>{m.nom}</option>)}
        </optgroup>
      ))}
      <option value="__autre">Autre (à préciser)…</option>
    </>
  );

  // Bloc commun de récupération client par N° client (placé en tête de chaque fiche).
  // Le nom du client remonte après saisie du N° client. Le N° de Case JADE est facultatif, à titre indicatif.
  const caseBlock = (
    <div style={{ gridColumn: "1 / -1" }} className="col gap-8">
      <Field label="Récupération client par N° client" req hint="Saisir le N° client : le nom du client remonte automatiquement.">
        <div className="row gap-8">
          <input className="input mono" value={f.clientCompte} onChange={e => set("clientCompte", e.target.value)} placeholder="ex. B2C-4471902" onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); doLookupAccount(); } }} />
          <button type="button" className="btn btn-dark btn-sm" onClick={doLookupAccount}><Icon name="search" size={14} /> Rechercher</button>
        </div>
      </Field>
      {f.acctMsg && <div className={"alert tiny " + (f.acctMsg.ok ? "alert-green" : "alert-orange")} style={{ marginTop: -2 }}><Icon name={f.acctMsg.ok ? "check" : "info"} size={14} />{f.acctMsg.txt}</div>}
      <Field label="Numéro Case (JADE)" hint="Facultatif — à titre indicatif."><input className="input mono" value={f.numeroCase} onChange={e => set("numeroCase", e.target.value)} placeholder="ex. CASE-100231" /></Field>
    </div>
  );

  return (
    <div className="fade-in">
      <div className="page-head">
        <div>
          <button className="btn-link" onClick={() => go("home")}><Icon name="arrowLeft" size={13} /> Tableau de bord</button>
          <h2 style={{ marginTop: 6 }}>Nouvelle fiche d'ajustement</h2>
          <p>Formulaire cadré sur votre périmètre — montants calculés automatiquement.</p>
        </div>
        <div className="spacer" />
        <div className="row gap-8" style={{ alignItems: "center" }}>
          <span className={"badge " + (circuit === "DOBB" ? "b-orange" : circuit === "DXC" ? "b-blue" : "b-purple")} style={{ fontWeight: 700 }}>{circuit} · {c.segment}</span>
          {user.service && <span className="badge b-grey">{user.service}</span>}
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: "1fr 360px", alignItems: "start" }}>
        {/* Colonne formulaire */}
        <div className="col gap-16">
          {/* Circuit — déterminé par le profil de l'agent (pas de sélection manuelle) */}

          {/* Identification — commune */}
          <div className="card">
            <div className="card-head"><Icon name="building" size={17} /><h3>Identification</h3>
              <span className="badge b-grey" style={{ marginLeft: "auto" }}>{circuit === "DOBB" ? "PO2_B-17" : circuit === "DXC" ? "PO5-G-07" : "MÉMO FRA"}</span></div>
            <div className="card-pad grid grid-2">
              <Field label={circuit === "DF" ? "Date du mémo" : "Date de demande"} req error={errors.dateDemande}>
                <input className={"input" + (errors.dateDemande ? " err" : "")} type="date" value={f.dateDemande} onChange={e => set("dateDemande", e.target.value)} />
              </Field>
              <Field label="Date de saisie" hint="Date de saisie de la demande dans la plateforme.">
                <input className="input" type="date" value={f.dateSaisie} onChange={e => set("dateSaisie", e.target.value)} />
              </Field>
              <Field label="Agent initiateur"><input className="input" value={f.agent} onChange={e => set("agent", e.target.value)} /></Field>
              <Field label="Matricule / réf. agent initiateur" hint="Matricule ou référence de l'agent initiateur."><input className="input mono" value={f.matricule} onChange={e => set("matricule", e.target.value)} placeholder="ex. M-2041" /></Field>
              <Field label="Agent de saisie" hint="Agent ayant effectué la saisie de la demande."><input className="input" value={f.agentSaisie} onChange={e => set("agentSaisie", e.target.value)} placeholder="Nom de l'agent de saisie" /></Field>
              <Field label="Matricule / réf. agent de saisie" hint="Matricule ou référence de l'agent de saisie."><input className="input mono" value={f.matriculeSaisie} onChange={e => set("matriculeSaisie", e.target.value)} placeholder="ex. M-2041" /></Field>
            </div>
          </div>

          {/* ---------- DXC (B2C) ---------- */}
          {circuit === "DXC" && (
            <div className="card">
              <div className="card-head"><Icon name="user" size={17} /><h3>Fiche d'ajustement B2C</h3><span className="badge b-blue" style={{ marginLeft: 6 }}>Pôle B2C</span></div>
              <div className="card-pad grid grid-2">
                {caseBlock}
                <Field label="Nom du client" req error={errors.clientNom} hint="Remonté depuis le N° client (modifiable si non trouvé).">
                  <input className={"input" + (errors.clientNom ? " err" : "")} value={f.clientNom} onChange={e => set("clientNom", e.target.value)} placeholder="— remonte après recherche du N° client —" />
                </Field>
                <Field label="Compte client" hint="Remonté depuis le N° client (modifiable si non trouvé).">
                  <input className="input mono" value={f.clientAccount} onChange={e => set("clientAccount", e.target.value)} placeholder="ex. B2C-4471902" />
                </Field>
                <Field label="Formule Internet"><input className="input" value={f.formule} onChange={e => set("formule", e.target.value)} /></Field>
                <Field label="Motif" req error={errors.motif}>
                  <select className={"select" + (errors.motif ? " err" : "")} value={f.motif} onChange={e => set("motif", e.target.value)}>
                    {motifOptions}</select>
                </Field>
                {f.motif === "__autre" && <Field label="Motif (saisie manuelle)" req><input className="input" value={f.motifAutre} onChange={e => set("motifAutre", e.target.value)} /></Field>}
                <div style={{ gridColumn: "1 / -1" }}>
                  <Field label="Libellé" req error={errors.libelle}><select className={"select" + (errors.libelle ? " err" : "")} value={f.libelle} onChange={e => set("libelle", e.target.value)}><option value="">— Choisir —</option>{DD.LIBELLES_DOBB.map(s => <option key={s}>{s}</option>)}<option value="__autre">Autre (à préciser)…</option></select></Field>
                  {f.libelle === "__autre" && <Field label="Libellé (saisie manuelle)" req><input className="input" value={f.libelleAutre} onChange={e => set("libelleAutre", e.target.value)} placeholder="ex. Surfacturation data juin" /></Field>}
                </div>
                <Field label="Montant récurrent mensuel (HT)" hint="Saisissez le montant reconduit chaque mois (laisser à 0 si non récurrent)."><div className="input-addon"><input className="input mono" type="number" min="0" value={f.recurrentMensuel} onChange={e => set("recurrentMensuel", e.target.value)} style={{ paddingRight: 44 }} placeholder="0" /><span className="suffix">FCFA</span></div></Field>
              </div>
              <div className="card-pad grid grid-2" style={{ borderTop: "1px solid var(--g100)" }}>
                <Field label="Responsabilité par direction"><select className="select" value={f.responsabiliteDirection} onChange={e => set("responsabiliteDirection", e.target.value)}>{DD.RESP_DIRECTION.map(x => <option key={x}>{x}</option>)}</select></Field>
                <Field label="Responsabilité par service"><select className="select" value={f.responsabiliteService} onChange={e => set("responsabiliteService", e.target.value)}>{DD.RESP_SERVICE.map(x => <option key={x}>{x}</option>)}</select></Field>
              </div>
            </div>
          )}

          {/* ---------- DOBB (B2B) ---------- */}
          {circuit === "DOBB" && (
            <div className="card">
              <div className="card-head"><Icon name="building" size={17} /><h3>Fiche d'ajustement B2B</h3><span className="badge b-orange" style={{ marginLeft: 6 }}>DOBB-DAOB</span></div>
              <div className="card-pad grid grid-2">
                {caseBlock}
                <Field label="Nom du client" req error={errors.clientNom} hint="Remonté depuis le N° client (modifiable si non trouvé).">
                  <input className={"input" + (errors.clientNom ? " err" : "")} value={f.clientNom} onChange={e => set("clientNom", e.target.value)} placeholder="Nom / raison sociale" />
                </Field>
                <Field label="Compte client" hint="Remonté depuis le N° client (modifiable si non trouvé).">
                  <input className="input mono" value={f.clientAccount} onChange={e => set("clientAccount", e.target.value)} placeholder="ex. B2B-880142" />
                </Field>
                <Field label="Formule d'abonnement"><input className="input" value={f.formule} onChange={e => set("formule", e.target.value)} /></Field>
                <Field label="Numéro d'appel"><input className="input" value={f.numeroAppel} onChange={e => set("numeroAppel", e.target.value)} placeholder="ex. 27 22 00 00 00" /></Field>
                <Field label="Motif" req error={errors.motif}>
                  <select className={"select" + (errors.motif ? " err" : "")} value={f.motif} onChange={e => set("motif", e.target.value)}>
                    {motifOptions}</select>
                </Field>
                {f.motif === "__autre" && <Field label="Motif (saisie manuelle)" req><input className="input" value={f.motifAutre} onChange={e => set("motifAutre", e.target.value)} /></Field>}
                <div style={{ gridColumn: "1 / -1" }}>
                  <Field label="Libellé" req error={errors.libelle}><select className={"select" + (errors.libelle ? " err" : "")} value={f.libelle} onChange={e => set("libelle", e.target.value)}><option value="">— Choisir —</option>{DD.LIBELLES_DOBB.map(s => <option key={s}>{s}</option>)}<option value="__autre">Autre (à préciser)…</option></select></Field>
                  {f.libelle === "__autre" && <Field label="Libellé (saisie manuelle)" req><input className="input" value={f.libelleAutre} onChange={e => set("libelleAutre", e.target.value)} /></Field>}
                </div>
                <div style={{ gridColumn: "1 / -1" }}>
                  <Field label="Descriptif de la contestation"><textarea className="textarea" style={{ minHeight: 60 }} value={f.descriptifContestation} onChange={e => set("descriptifContestation", e.target.value)} placeholder="Détail du cas contesté…" /></Field>
                </div>
              </div>
              <div className="card-pad grid grid-2" style={{ borderTop: "1px solid var(--g100)" }}>
                <Field label="Localisation"><div className="seg">{["National", "International"].map(l => <button key={l} className={f.localisation === l ? "active" : ""} onClick={() => set("localisation", l)}>{l}</button>)}</div></Field>
                <Field label="Début période contestée"><input className="input" type="date" value={f.pDebut} onChange={e => set("pDebut", e.target.value)} /></Field>
                <Field label="Fin période contestée"><input className="input" type="date" value={f.pFin} onChange={e => set("pFin", e.target.value)} /></Field>
                <Field label="Période contestée (jours)"><input className="input" type="number" value={f.pJours} onChange={e => set("pJours", e.target.value)} /></Field>
                <Field label="Point de contact"><select className="select" value={f.pointContact} onChange={e => set("pointContact", e.target.value)}><option value="">— Choisir —</option>{DD.POINTS_CONTACT.map(s => <option key={s}>{s}</option>)}</select></Field>
                <Field label="Montant récurrent mensuel (HT)" hint="Saisissez le montant reconduit chaque mois (laisser à 0 si non récurrent)."><div className="input-addon"><input className="input mono" type="number" min="0" value={f.recurrentMensuel} onChange={e => set("recurrentMensuel", e.target.value)} style={{ paddingRight: 44 }} placeholder="0" /><span className="suffix">FCFA</span></div></Field>
              </div>
              <div className="card-pad grid grid-2" style={{ borderTop: "1px solid var(--g100)" }}>
                <Field label="Responsabilité par direction"><select className="select" value={f.responsabiliteDirection} onChange={e => set("responsabiliteDirection", e.target.value)}>{DD.RESP_DIRECTION.map(x => <option key={x}>{x}</option>)}</select></Field>
                <Field label="Responsabilité par service"><select className="select" value={f.responsabiliteService} onChange={e => set("responsabiliteService", e.target.value)}>{DD.RESP_SERVICE.map(x => <option key={x}>{x}</option>)}</select></Field>
                <Field label="Agent responsable"><input className="input" value={f.agentResponsable} onChange={e => set("agentResponsable", e.target.value)} /></Field>
                <Field label="Date réception BO"><input className="input" type="date" value={f.dateReceptionBO} onChange={e => set("dateReceptionBO", e.target.value)} /></Field>
                <Field label="Date réception OCI"><input className="input" type="date" value={f.dateReceptionOCI} onChange={e => set("dateReceptionOCI", e.target.value)} /></Field>
              </div>
            </div>
          )}

          {/* ---------- DF / FRA (MÉMO) ---------- */}
          {circuit === "DF" && (
            <div className="card">
              <div className="card-head"><Icon name="doc" size={17} /><h3>Mémo d'ajustement Wholesale</h3><span className="badge b-purple" style={{ marginLeft: 6 }}>Soumis au contrôle FRA</span></div>
              <div className="card-pad grid grid-2">
                <Field label="De (émetteur)"><input className="input" value={f.memoDe} onChange={e => set("memoDe", e.target.value)} /></Field>
                <Field label="À (destinataire)"><input className="input" value={f.memoA} onChange={e => set("memoA", e.target.value)} /></Field>
                <Field label="Opérateur" req error={errors.clientNom} hint="Nom de l'opérateur concerné.">
                  <input className={"input" + (errors.clientNom ? " err" : "")} value={f.clientNom} onChange={e => set("clientNom", e.target.value)} placeholder="Nom de l'opérateur" />
                </Field>
                <Field label="Compte / référence" hint="Numéro ou code de rattachement.">
                  <input className="input mono" value={f.clientCompte} onChange={e => set("clientCompte", e.target.value)} placeholder="ex. WS-1142" />
                </Field>
                <Field label="Numéro Case (JADE)" hint="Facultatif — à titre indicatif.">
                  <input className="input mono" value={f.numeroCase} onChange={e => set("numeroCase", e.target.value)} placeholder="ex. CASE-100231" />
                </Field>
                <div style={{ gridColumn: "1 / -1" }}><Field label="Objet" req error={errors.memoObjet}><input className={"input" + (errors.memoObjet ? " err" : "")} value={f.memoObjet} onChange={e => set("memoObjet", e.target.value)} placeholder="ex. Ajustement facture DATA janvier 2026" /></Field></div>
                <div style={{ gridColumn: "1 / -1" }}><Field label="Objectif"><input className="input" value={f.memoObjectif} onChange={e => set("memoObjectif", e.target.value)} /></Field></div>
                <div style={{ gridColumn: "1 / -1" }}><Field label="Contexte de la réclamation" req error={errors.memoContexte}><textarea className={"textarea" + (errors.memoContexte ? " err" : "")} value={f.memoContexte} onChange={e => set("memoContexte", e.target.value)} placeholder="Décrire le contexte (liens, circuits, périodes…)" /></Field></div>
                <div style={{ gridColumn: "1 / -1" }}><Field label="Observation"><textarea className="textarea" style={{ minHeight: 60 }} value={f.memoObservation} onChange={e => set("memoObservation", e.target.value)} placeholder="ex. Note de crédit à éditer en faveur du client" /></Field></div>
                <Field label="Montant en € (optionnel)" hint="Référence devise opérateur."><div className="input-addon"><input className="input" type="number" value={f.montantEuro} onChange={e => set("montantEuro", e.target.value)} style={{ paddingRight: 32 }} /><span className="suffix">€</span></div></Field>
                <Field label="Responsabilité par direction"><select className="select" value={f.responsabiliteDirection} onChange={e => set("responsabiliteDirection", e.target.value)}>{DD.RESP_DIRECTION.map(x => <option key={x}>{x}</option>)}</select></Field>
                <Field label="Responsabilité par service"><select className="select" value={f.responsabiliteService} onChange={e => set("responsabiliteService", e.target.value)}>{DD.RESP_SERVICE.map(x => <option key={x}>{x}</option>)}</select></Field>
              </div>
            </div>
          )}

          {/* ---------- Circuit personnalisé (générique) ---------- */}
          {!["DXC", "DOBB", "DF"].includes(circuit) && (
            <div className="card">
              <div className="card-head"><Icon name="flow" size={17} /><h3>Fiche d'ajustement — {c.nom}</h3><span className="badge b-grey" style={{ marginLeft: 6 }}>Processus personnalisé</span></div>
              <div className="card-pad grid grid-2">
                <Field label="Client / compte" req>
                  <select className="select" value={f.clientIdx} onChange={e => { const i = Number(e.target.value); setF(s => ({ ...s, clientIdx: i, formule: clients[i].formule })); }}>
                    {clients.map((cl, i) => <option key={i} value={i}>{cl.nom}</option>)}</select>
                </Field>
                <Field label="Compte / référence" hint="✓ Cohérence vérifiée">
                  <div className="input-addon"><input className="input" value={clients[f.clientIdx].compte} readOnly style={{ paddingRight: 32 }} /><span className="suffix" style={{ color: "var(--green-700)" }}><Icon name="check" size={16} stroke={3} /></span></div>
                </Field>
                <Field label="Offre / formule"><input className="input" value={f.formule} onChange={e => set("formule", e.target.value)} /></Field>
                <Field label="Motif" req error={errors.motif}>
                  <select className={"select" + (errors.motif ? " err" : "")} value={f.motif} onChange={e => set("motif", e.target.value)}>
                    <option value="">— Choisir —</option>{(DD.MOTIFS[circuit] || []).map(s => <option key={s}>{s}</option>)}<option value="__autre">Autre (à préciser)…</option></select>
                </Field>
                {f.motif === "__autre" && <Field label="Motif (saisie manuelle)" req><input className="input" value={f.motifAutre} onChange={e => set("motifAutre", e.target.value)} /></Field>}
                <div style={{ gridColumn: "1 / -1" }}>
                  <Field label="Libellé" req error={errors.libelle}><select className={"select" + (errors.libelle ? " err" : "")} value={f.libelle} onChange={e => set("libelle", e.target.value)}><option value="">— Choisir —</option>{DD.LIBELLES.map(s => <option key={s}>{s}</option>)}<option value="__autre">Autre (à préciser)…</option></select></Field>
                  {f.libelle === "__autre" && <Field label="Libellé (saisie manuelle)" req><input className="input" value={f.libelleAutre} onChange={e => set("libelleAutre", e.target.value)} placeholder="Libellé de l'ajustement" /></Field>}
                </div>
              </div>
            </div>
          )}

          {/* Montant + commentaire */}
          <div className="card">
            <div className="card-head"><Icon name="calc" size={17} /><h3>Montant {circuit === "DF" ? "à ajuster (FCFA)" : "& commentaire"}</h3></div>
            <div className="card-pad grid grid-2">
              <Field label="Montant à ajuster HT (FCFA)" req error={errors.ht}>
                <div className="input-addon">
                  <input className={"input" + (errors.ht ? " err" : "")} type="number" min="0" value={f.ht}
                    onChange={e => set("ht", e.target.value)} placeholder="0" style={{ paddingRight: 52 }} />
                  <span className="suffix">FCFA</span>
                </div>
              </Field>
              <Field label="Univers FMI" req hint="Fixe / Mobile / Internet — utilisé par les KPIs.">
                <div className="seg">{DD.UNIVERS.map(u => <button key={u} className={f.univers === u ? "active" : ""} onClick={() => set("univers", u)}>{u}</button>)}</div>
              </Field>
              <Field label="Facteur de dégrèvement" hint="Interne/structurel ou externe/conjoncturel.">
                <select className="select" value={f.facteur} onChange={e => set("facteur", e.target.value)}>
                  {DD.FACTEURS.map(x => <option key={x.key} value={x.key}>{x.label}</option>)}</select>
              </Field>
              <div style={{ gridColumn: "1 / -1" }}>
                <Field label="Commentaire (optionnel)">
                  <textarea className="textarea" value={f.commentaire} onChange={e => set("commentaire", e.target.value)} style={{ minHeight: 56 }} />
                </Field>
              </div>
            </div>
          </div>

          {/* Pièces jointes */}
          <PiecesJointes pieces={pieces} setPieces={setPieces} />
        </div>

        {/* Colonne récap / calcul / routage */}
        <div className="col gap-16" style={{ position: "sticky", top: 86 }}>
          <div className="card">
            <div className="card-head"><Icon name="calc" size={17} /><h3>Calcul automatique</h3></div>
            <div className="card-pad">
              {(DD.CONFIG.taxes.tsc.actif || DD.CONFIG.taxes.tva.actif) && (
                <div className="col gap-6" style={{ padding: "2px 0 10px", marginBottom: 8, borderBottom: "1px solid var(--g100)" }}>
                  <div className="tiny muted" style={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em" }}>Taxes appliquées</div>
                  {DD.CONFIG.taxes.tsc.actif && (
                    <div className="switch-row"><button type="button" className={"switch" + (f.applyTsc ? " on" : "")} onClick={() => set("applyTsc", !f.applyTsc)} />
                      <span style={{ fontSize: 13, fontWeight: 600 }}>Appliquer la TSC ({+(DD.CONFIG.taxes.tsc.taux * 100).toFixed(2)} %)</span></div>
                  )}
                  {DD.CONFIG.taxes.tva.actif && (
                    <div className="switch-row"><button type="button" className={"switch" + (f.applyTva ? " on" : "")} onClick={() => set("applyTva", !f.applyTva)} />
                      <span style={{ fontSize: 13, fontWeight: 600 }}>Appliquer la TVA ({+(c.tva * 100).toFixed(2)} %)</span></div>
                  )}
                  {DD.CONFIG.taxes.tva.actif && f.applyTva && DD.CONFIG.taxes.tsc.actif && f.applyTsc && (
                    <div className="col gap-6" style={{ marginTop: 4, padding: "8px 10px", background: "var(--g50)", borderRadius: 8 }}>
                      <div className="tiny muted" style={{ fontWeight: 700 }}>Assiette de la TVA</div>
                      <label className="row gap-8" style={{ alignItems: "flex-start", cursor: "pointer" }}>
                        <input type="radio" name="tvaBase" checked={f.tvaBase === "ht"} onChange={() => set("tvaBase", "ht")} style={{ marginTop: 3 }} />
                        <span style={{ fontSize: 12.5, lineHeight: 1.35 }}><b>Nouvelle règle</b> — TVA sur le <b>montant HT</b></span>
                      </label>
                      <label className="row gap-8" style={{ alignItems: "flex-start", cursor: "pointer" }}>
                        <input type="radio" name="tvaBase" checked={f.tvaBase === "htTsc"} onChange={() => set("tvaBase", "htTsc")} style={{ marginTop: 3 }} />
                        <span style={{ fontSize: 12.5, lineHeight: 1.35 }}><b>Ancienne règle</b> — TVA sur <b>HT + TSC</b></span>
                      </label>
                    </div>
                  )}
                </div>
              )}
              {DD.CONFIG.taxes.tsc.actif && f.applyTsc && (
                <div className="col gap-6" style={{ padding: "2px 0 10px", marginBottom: 8, borderBottom: "1px solid var(--g100)" }}>
                  <div className="switch-row"><button type="button" className={"switch" + (f.tscManuelle ? " on" : "")} onClick={() => set("tscManuelle", !f.tscManuelle)} />
                    <span style={{ fontSize: 13, fontWeight: 600 }}>Saisir la TSC manuellement</span></div>
                  {f.tscManuelle && <Field label="Montant TSC (saisie manuelle)" hint="Remplace le calcul automatique pour ce dossier."><div className="input-addon"><input className="input mono" type="number" min="0" value={f.tscManuelleVal} onChange={e => set("tscManuelleVal", e.target.value)} style={{ paddingRight: 44 }} placeholder="0" /><span className="suffix">FCFA</span></div></Field>}
                </div>
              )}
              {DD.CONFIG.taxes.tva.actif && f.applyTva && (
                <div className="col gap-6" style={{ padding: "2px 0 10px", marginBottom: 8, borderBottom: "1px solid var(--g100)" }}>
                  <div className="switch-row"><button type="button" className={"switch" + (f.tvaManuelle ? " on" : "")} onClick={() => set("tvaManuelle", !f.tvaManuelle)} />
                    <span style={{ fontSize: 13, fontWeight: 600 }}>Saisir la TVA manuellement</span></div>
                  {f.tvaManuelle && <Field label="Montant TVA (saisie manuelle)" hint="Remplace le calcul automatique pour ce dossier."><div className="input-addon"><input className="input mono" type="number" min="0" value={f.tvaManuelleVal} onChange={e => set("tvaManuelleVal", e.target.value)} style={{ paddingRight: 44 }} placeholder="0" /><span className="suffix">FCFA</span></div></Field>}
                </div>
              )}
              <CalcLine label="Montant HT" v={ht} />
              {DD.CONFIG.taxes.tsc.actif && f.applyTsc && <CalcLine label={`TSC (${+(DD.CONFIG.taxes.tsc.taux * 100).toFixed(2)} %)`} v={m.tsc} />}
              {f.applyTsc && f.applyTva && f.tvaBase === "htTsc" && <CalcLine label="HT + TSC" v={ht + m.tsc} sub />}
              {DD.CONFIG.taxes.tva.actif && f.applyTva && <CalcLine label={`TVA (${+(c.tva * 100).toFixed(2)} %) · ${tvaManu ? "saisie manuelle" : f.tvaBase === "htTsc" ? "sur HT+TSC" : "sur HT"}`} v={m.tva} />}
              <div className="divider" style={{ margin: "10px 0" }} />
              <div className="row" style={{ justifyContent: "space-between" }}>
                <b style={{ fontSize: 15 }}>Total TTC</b>
                <b className="mono" style={{ fontSize: 18, color: "var(--orange-600)" }}>{EE.fmtMoney(m.ttc)}</b>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-head"><Icon name="flow" size={17} /><h3>Routage prévu</h3></div>
            <div className="card-pad">
              {tranche ? <>
                <div className="row gap-8 mb-16" style={{ flexWrap: "wrap" }}>
                  <CircuitPill code={circuit} />
                  <span className="chip active">Tranche {tranche.label}</span>
                </div>
                <div className="stepper">
                  {chain.map((s, i) => (
                    <div className="step" key={i}>
                      <div className="step-rail">
                        <div className="step-dot wait" style={{ width: 24, height: 24, fontSize: 11 }}>
                          {s.type === "C" ? <Icon name="shield" size={12} /> : i + 1}</div>
                        {i < chain.length - 1 && <div className="step-line" style={{ minHeight: 12 }} />}
                      </div>
                      <div className="step-body" style={{ paddingBottom: 12 }}>
                        <div className="t" style={{ fontSize: 12.5 }}>{s.libelle}</div>
                        <div className="s" style={{ fontSize: 11 }}>
                          <TypeActeurBadge type={s.type} /> · SLA {EE.fmtDuree(s.sla)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                {m.ttc > 50000000 && <div className="alert alert-orange tiny mt-8"><Icon name="alert" size={14} />Montant &gt; 50 M : validation terminale DG/DGA requise.</div>}
              </> : <div className="muted tiny center" style={{ padding: "20px 0" }}>Saisissez un montant HT pour visualiser le circuit.</div>}
            </div>
          </div>

          <button className="btn btn-primary btn-lg btn-block" onClick={submit} disabled={!tranche}>
            <Icon name="send" size={17} /> Soumettre la demande
          </button>
          <div className="tiny muted center">Un identifiant unique sera généré et l'action journalisée.</div>
        </div>
      </div>
    </div>
  );
}

function CalcLine({ label, v, sub }) {
  return <div className="row" style={{ justifyContent: "space-between", padding: "5px 0", borderTop: sub ? "1px dashed var(--g200)" : "none" }}>
    <span className="muted" style={{ fontSize: 13, fontStyle: sub ? "italic" : "normal" }}>{label}</span>
    <span className="mono" style={{ fontWeight: 600, color: sub ? "var(--g700)" : "inherit" }}>{EE.fmtMoney(v)}</span>
  </div>;
}

function PiecesJointes({ pieces, setPieces }) {
  const inputRef = uR1(null);
  const fmtSize = (n) => n == null ? "" : n < 1024 ? n + " o" : n < 1048576 ? (n / 1024).toFixed(0) + " Ko" : (n / 1048576).toFixed(1) + " Mo";
  const typeFromName = (nm) => {
    const ext = (nm.split(".").pop() || "").toUpperCase();
    return ({ PDF: "Document PDF", XLSX: "Tableur", XLS: "Tableur", CSV: "Tableur", EML: "Correspondance", MSG: "Correspondance", PNG: "Image", JPG: "Image", JPEG: "Image", DOC: "Document", DOCX: "Document" })[ext] || (ext ? ext + " " : "") + "Fichier";
  };
  function onFiles(fileList) {
    const added = Array.from(fileList || []).map(file => ({ nom: file.name, type: typeFromName(file.name), taille: file.size, url: URL.createObjectURL(file) }));
    if (added.length) setPieces([...pieces, ...added]);
  }
  return (
    <div className="card">
      <div className="card-head"><Icon name="paperclip" size={17} /><h3>Pièces justificatives</h3>
        <span className="muted" style={{ marginLeft: "auto" }}>{pieces.length} fichier(s)</span></div>
      <div className="card-pad col gap-8">
        {pieces.map((p, i) => (
          <div className="fileitem" key={i}>
            <Icon name="doc" size={18} color="var(--g600)" />
            <div style={{ flex: 1 }}><div style={{ fontWeight: 600, fontSize: 13 }}>{p.nom}</div><div className="tiny muted">{p.type}{p.taille != null ? " · " + fmtSize(p.taille) : ""}</div></div>
            {p.url && <a className="iconbtn" href={p.url} download={p.nom} title="Télécharger"><Icon name="download" size={15} /></a>}
            <button className="iconbtn" onClick={() => setPieces(pieces.filter((_, j) => j !== i))}><Icon name="trash" size={15} /></button>
          </div>
        ))}
        <input ref={inputRef} type="file" multiple style={{ display: "none" }}
          onChange={e => { onFiles(e.target.files); e.target.value = ""; }} />
        <button className="dropzone" onClick={() => inputRef.current && inputRef.current.click()}
          onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add("drag"); }}
          onDragLeave={e => e.currentTarget.classList.remove("drag")}
          onDrop={e => { e.preventDefault(); e.currentTarget.classList.remove("drag"); onFiles(e.dataTransfer.files); }}>
          <Icon name="paperclip" size={20} /><div style={{ marginTop: 6, fontWeight: 600 }}>Parcourir mes dossiers…</div>
          <div className="tiny">Cliquez pour choisir un fichier, ou glissez-déposez ici (Facture, mémo, correspondances…)</div>
        </button>
      </div>
    </div>
  );
}

Object.assign(window, { HomeScreen, NouvelleDemandeScreen });
