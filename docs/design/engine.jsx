/* ====================================================================
   PGD — Moteur de calcul, de règles et de workflow
   Fonctions pures/mutatrices opérant sur des objets "dossier".
   Le moteur ne contient AUCUN seuil ni chaîne en dur : tout vient
   de PGD_DATA.CIRCUITS (la matrice de décision consolidée).
   ==================================================================== */
(function () {
  const D = window.PGD_DATA;

  // ----------------------- Formatage -----------------------
  const fmtMoney = (n) => (n == null || isNaN(n)) ? "—" :
    new Intl.NumberFormat("fr-FR").format(Math.round(n)) + " FCFA";
  const fmtMoneyShort = (n) => {
    if (n == null || isNaN(n)) return "—";
    if (n >= 1e6) return (n / 1e6).toFixed(n % 1e6 === 0 ? 0 : 1).replace(".", ",") + " M";
    if (n >= 1e3) return Math.round(n / 1e3) + " k";
    return String(Math.round(n));
  };
  const fmtNum = (n) => new Intl.NumberFormat("fr-FR").format(Math.round(n));
  const pad = (n) => String(n).padStart(2, "0");
  const fmtDate = (ts) => {
    if (!ts) return "—";
    const d = new Date(ts);
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
  };
  const fmtDateTime = (ts) => {
    if (!ts) return "—";
    const d = new Date(ts);
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  const fmtAgo = (ts) => {
    if (!ts) return "—";
    const s = Math.floor((Date.now() - ts) / 1000);
    if (s < 60) return "à l'instant";
    const m = Math.floor(s / 60); if (m < 60) return `il y a ${m} min`;
    const h = Math.floor(m / 60); if (h < 24) return `il y a ${h} h`;
    const j = Math.floor(h / 24); return `il y a ${j} j`;
  };
  const fmtDuree = (hrs) => {
    if (hrs == null) return "—";
    if (hrs < 1) return Math.round(hrs * 60) + " min";
    if (hrs < 48) return Math.round(hrs) + " h";
    return (hrs / 24).toFixed(1).replace(".", ",") + " j";
  };

  // ----------------------- Calcul des montants -----------------------
  function calcMontants(ht, tauxTva, opts) {
    ht = Number(ht) || 0;
    const cfg = (D.CONFIG && D.CONFIG.taxes) || {};
    const tscCfg = cfg.tsc || { actif: true, taux: 0.03 };
    const tvaCfg = cfg.tva || { actif: true, taux: 0.18 };
    // overrides par demande : opts.tsc / opts.tva (booléens). Par défaut, suit la config globale.
    const applyTsc = opts && opts.tsc != null ? !!opts.tsc : tscCfg.actif;
    const applyTva = opts && opts.tva != null ? !!opts.tva : tvaCfg.actif;
    const tsc = applyTsc ? ht * (tscCfg.taux ?? 0.03) : 0;
    const tauxTvaEff = applyTva ? (tauxTva != null ? tauxTva : (tvaCfg.taux ?? 0.18)) : 0;
    // Règle d'assiette de la TVA :
    //  - "ht"    → nouvelle méthode : TVA calculée sur le HT seul (défaut)
    //  - "htTsc" → ancienne méthode : TVA calculée sur (HT + TSC)
    const tvaBase = (opts && opts.tvaBase === "htTsc") ? "htTsc" : "ht";
    const assietteTva = tvaBase === "htTsc" ? (ht + tsc) : ht;
    const tva = assietteTva * tauxTvaEff;
    const ttc = ht + tsc + tva;
    return { tsc, tva, ttc, tvaBase, assietteTva };
  }

  // ----------------------- Sélection de tranche -----------------------
  function selectTranche(circuitCode, ttc) {
    const c = D.CIRCUITS[circuitCode];
    if (!c) return null;
    return c.tranches.find(t => ttc >= t.min && (t.max == null || ttc <= t.max)) || null;
  }
  function trancheIndex(circuitCode, ttc) {
    const c = D.CIRCUITS[circuitCode];
    return c ? c.tranches.findIndex(t => ttc >= t.min && (t.max == null || ttc <= t.max)) : -1;
  }

  // Sélectionne les étapes applicables d'une tranche selon le service (sous-flux) — DOBB.
  function etapesDe(tranche, service) {
    if (tranche && tranche.parService && service && tranche.parService[service]) return tranche.parService[service];
    return (tranche && tranche.etapes) || [];
  }

  // ----------------------- Construction de la chaîne -----------------------
  // Renvoie la liste des étapes (avec libellés de rôle) pour aperçu.
  function buildChainPreview(circuitCode, ttc, service) {
    const c = D.CIRCUITS[circuitCode];
    const tr = selectTranche(circuitCode, ttc);
    if (!c || !tr) return [];
    const steps = etapesDe(tr, service).map((e, i) => ({
      ...e, ordre: i, role: e.role,
      libelle: D.roleByCode[e.role]?.libelle || e.role,
    }));
    const ctrl = (c.controle || []).map((e, i) => ({
      ...e, ordre: steps.length + i, role: e.role,
      libelle: D.roleByCode[e.role]?.libelle || e.role, controle: true,
    }));
    return [...steps, ...ctrl];
  }

  // ----------------------- Membres d'une corbeille -----------------------
  function membersOfRole(code) {
    return D.USERS.filter(u => u.roles.includes(code));
  }

  // ----------------------- Calendrier métier (modèle type GLPI) -----------------------
  // SLA décomptés en heures OUVRÉES : jours ouvrés + plages horaires de travail,
  // jours fériés exclus. Paramétrable via D.CONFIG.calendrier.
  function cal() {
    const c = (D.CONFIG && D.CONFIG.calendrier) || {};
    return {
      jours: c.joursOuvres || [1, 2, 3, 4, 5],
      hDeb: c.heureDebut != null ? c.heureDebut : 8,
      hFin: c.heureFin != null ? c.heureFin : 18,
      feries: new Set(c.feries || []),
    };
  }
  function ymd(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
  function isJourOuvre(d) {
    const k = cal();
    return k.jours.includes(d.getDay()) && !k.feries.has(ymd(d));
  }
  // Heures ouvrées écoulées entre deux instants (plages horaires + jours ouvrés).
  function heuresOuvrees(fromTs, toTs) {
    if (!fromTs || !toTs || toTs <= fromTs) return 0;
    const k = cal(), spanJour = Math.max(0, k.hFin - k.hDeb);
    let h = 0;
    const step = 1800000; // pas de 30 min pour la précision
    for (let t = fromTs; t < toTs; t += step) {
      const d = new Date(t);
      if (!isJourOuvre(d)) continue;
      const heure = d.getHours() + d.getMinutes() / 60;
      if (heure >= k.hDeb && heure < k.hFin) h += Math.min(step, toTs - t) / 3600000;
    }
    return h;
  }
  // Échéance SLA : ajoute `slaH` heures ouvrées à `fromTs`, en respectant le calendrier.
  function echeanceSla(fromTs, slaH) {
    const k = cal();
    let t = fromTs, reste = slaH;
    const step = 1800000;
    let guard = 0;
    while (reste > 0 && guard < 2000000) {
      guard++;
      t += step;
      const d = new Date(t);
      if (!isJourOuvre(d)) continue;
      const heure = d.getHours() + d.getMinutes() / 60;
      if (heure >= k.hDeb && heure < k.hFin) reste -= step / 3600000;
    }
    return t;
  }

  // ----------------------- Référence / Nomenclature -----------------------
  // Format : <DIRECTION><AAMMJJ>.<HHMM>.<6 chiffres>  ex. DOBB260602.2129.470026
  let _seq = 1000;
  function genRef(circuitCode) {
    _seq += 1;
    const d = new Date();
    const yy = pad(d.getFullYear() % 100), mm = pad(d.getMonth() + 1), dd = pad(d.getDate());
    const hh = pad(d.getHours()), mi = pad(d.getMinutes());
    const rnd = String(Math.floor(Math.random() * 900000) + 100000);
    return `${circuitCode}${yy}${mm}${dd}.${hh}${mi}.${rnd}`;
  }
  function genRefLegacy(circuitCode) {
    _seq += 1;
    const yr = new Date().getFullYear();
    return `DG-${circuitCode}-${yr}-${_seq}`;
  }

  // ----------------------- Création d'un dossier -----------------------
  function newId() { return "d_" + Math.random().toString(36).slice(2, 9); }
  function tId() { return "t_" + Math.random().toString(36).slice(2, 9); }

  function createDossier(input) {
    const c = D.CIRCUITS[input.circuit];
    const applyTsc = input.applyTsc != null ? !!input.applyTsc : (D.CONFIG?.taxes?.tsc?.actif ?? true);
    const applyTva = input.applyTva != null ? !!input.applyTva : (D.CONFIG?.taxes?.tva?.actif ?? true);
    const tvaBase = input.tvaBase === "htTsc" ? "htTsc" : "ht";
    const m = calcMontants(input.ht, c.tva, { tsc: applyTsc, tva: applyTva, tvaBase });
    // TSC en saisie manuelle : substitue la TSC (et recompose la TVA si elle est assise sur HT+TSC).
    if (applyTsc && input.tscManuelle != null) {
      m.tsc = Number(input.tscManuelle) || 0;
      if (applyTva && tvaBase === "htTsc") m.tva = ((Number(input.ht) || 0) + m.tsc) * c.tva;
      m.ttc = (Number(input.ht) || 0) + m.tsc + m.tva;
      m.tscManuelle = true;
    }
    // TVA en saisie manuelle : substitue la TVA et recompose le TTC.
    if (applyTva && input.tvaManuelle != null) {
      m.tva = Number(input.tvaManuelle) || 0;
      m.ttc = (Number(input.ht) || 0) + m.tsc + m.tva;
      m.tvaManuelle = true;
    }
    const now = input.dateCreation || Date.now();
    return {
      id: newId(),
      applyTsc, applyTva, tvaBase,
      ref: input.ref || genRef(input.circuit),
      circuit: input.circuit,
      segment: c.segment,
      sousFlux: input.sousFlux || c.sousFlux[0],
      motif: input.motif,
      libelle: input.libelle || "",
      commentaire: input.commentaire || "",
      client: input.client || { nom: "", compte: "", formule: "" },
      contactClient: input.contactClient || "",
      refClient: input.refClient || "",
      univers: input.univers || ["Fixe", "Mobile", "Internet"][Math.floor(Math.random() * 3)],
      facteur: input.facteur || (Math.random() < 0.6 ? "interne" : "externe"),
      agent: input.agent || "",
      agentSaisie: input.agentSaisie || "",
      matricule: input.matricule || "",
      matriculeSaisie: input.matriculeSaisie || "",
      dateDemande: input.dateDemande || null,
      dateSaisie: input.dateSaisie || null,
      numeroCase: input.numeroCase || null,
      // DOBB spécifiques (PO2_B-17)
      numeroAppel: input.numeroAppel || null,
      descriptifContestation: input.descriptifContestation || null,
      pointContact: input.pointContact || null,
      agentReclamation: input.agentReclamation || null,
      agentResponsable: input.agentResponsable || null,
      responsabiliteDirection: input.responsabiliteDirection || (input.responsabilite ? input.responsabilite.split("/")[0].trim() : null),
      responsabiliteService: input.responsabiliteService || (input.responsabilite && input.responsabilite.includes("/") ? input.responsabilite.split("/").slice(1).join("/").trim() : null),
      dateReceptionBO: input.dateReceptionBO || null,
      dateReceptionOCI: input.dateReceptionOCI || null,
      pieceAfferente: input.pieceAfferente || null,
      localisation: input.localisation || null,
      canal: input.canal || null,
      periode: input.periode || null,
      recurrent: input.recurrent || false,
      responsabilite: input.responsabilite || null,
      // DF / FRA spécifiques (MÉMO)
      memoDe: input.memoDe || input.createdByName || null,
      memoA: input.memoA || (input.circuit === "DF" ? "Service Fraude & Revenue Assurance" : null),
      memoObjet: input.memoObjet || (input.circuit === "DF" ? input.libelle : null),
      memoObjectif: input.memoObjectif || (input.circuit === "DF" ? "Soumettre l'ajustement au contrôle FRA" : null),
      memoContexte: input.memoContexte || input.memo || null,
      memoObservation: input.memoObservation || null,
      montantEuro: input.montantEuro || null,
      memo: input.memo || "",
      ht: Number(input.ht) || 0,
      tsc: m.tsc, tva: m.tva, ttc: m.ttc, tauxTva: c.tva, tscManuelle: !!m.tscManuelle, tvaManuelle: !!m.tvaManuelle,
      montantsHistory: [{
        ts: now, acteur: input.createdByName || "Initiateur", evt: "Saisie initiale",
        ht: Number(input.ht) || 0, tsc: m.tsc, tva: m.tva, htTsc: (Number(input.ht) || 0) + m.tsc, ttc: m.ttc,
        applyTsc, applyTva, tvaBase,
      }],
      pieces: input.pieces || [],
      statut: "brouillon",
      etapeCourante: -1,
      taches: [],
      audit: [],
      dateCreation: now,
      dateSoumission: null,
      createdBy: input.createdBy,
      createdByName: input.createdByName,
    };
  }

  // ----------------------- Audit -----------------------
  function logAudit(dossier, acteur, action, commentaire, ts) {
    dossier.audit.push({
      ts: ts || Date.now(),
      acteur, action, commentaire: commentaire || "",
    });
  }

  // ----------------------- Soumission : instancie les tâches -----------------------
  function submit(dossier, acteur, ts) {
    ts = ts || Date.now();
    const tr = selectTranche(dossier.circuit, dossier.ttc);
    const c = D.CIRCUITS[dossier.circuit];
    if (!tr) throw new Error("Aucune règle ne couvre ce montant");
    dossier.tranche = tr.label;
    const etps = etapesDe(tr, dossier.sousFlux);
    dossier.taches = etps.map((e, i) => ({
      id: tId(), ordre: i, role: e.role, type: e.type, bloquant: e.bloquant,
      sla: e.sla, etat: i === 0 ? "EN_CORBEILLE" : "EN_ATTENTE",
      agentClaim: null, dateClaim: null, verrouExpireH: 4,
      decision: null, commentaire: "", acteur: null, dateAction: null,
      dateEnCorbeille: i === 0 ? ts : null,
    }));
    // tâches de contrôle a posteriori (hors chemin bloquant)
    dossier.controles = (c.controle || []).map((e, i) => ({
      id: tId(), ordre: 100 + i, role: e.role, type: "C", bloquant: false,
      sla: e.sla, etat: "POST_CLOTURE", decision: null, commentaire: "",
      acteur: null, dateAction: null,
    }));
    dossier.statut = "soumis";
    dossier.etapeCourante = 0;
    dossier.dateSoumission = ts;
    logAudit(dossier, acteur, "Soumission", `Dossier routé sur la tranche « ${tr.label} » — ${dossier.taches.length} étape(s)`, ts);
    return dossier;
  }

  function currentTask(dossier) {
    return dossier.taches.find(t => t.etat === "EN_CORBEILLE" || t.etat === "RECLAMEE");
  }

  // ----------------------- Claim / Unclaim -----------------------
  function claim(dossier, taskId, user, ts) {
    ts = ts || Date.now();
    const t = dossier.taches.find(x => x.id === taskId);
    if (!t || t.etat !== "EN_CORBEILLE") return { ok: false, msg: "Tâche non disponible." };
    t.etat = "RECLAMEE"; t.agentClaim = user.id; t.dateClaim = ts;
    logAudit(dossier, user.nom, "Récupération", `${roleLabel(t.role)} — verrou posé (expire ${t.verrouExpireH} h)`, ts);
    return { ok: true };
  }
  function unclaim(dossier, taskId, user, ts) {
    ts = ts || Date.now();
    const t = dossier.taches.find(x => x.id === taskId);
    if (!t || t.etat !== "RECLAMEE") return { ok: false };
    t.etat = "EN_CORBEILLE"; t.agentClaim = null; t.dateClaim = null;
    logAudit(dossier, user.nom, "Libération", roleLabel(t.role), ts);
    return { ok: true };
  }

  // ----------------------- Escalade manuelle (superviseur) -----------------------
  function escalader(dossier, taskId, user, motif, ts) {
    ts = ts || Date.now();
    const t = dossier.taches.find(x => x.id === taskId);
    if (!t || (t.etat !== "EN_CORBEILLE" && t.etat !== "RECLAMEE")) return { ok: false, msg: "Tâche non escaladable." };
    const c = D.CIRCUITS[dossier.circuit];
    // cible : prochaine étape bloquante (N+1) ou DG si terminal
    const next = dossier.taches.find(x => x.ordre === t.ordre + 1);
    t.etat = "ESCALADEE"; t.escaladeMotif = motif || "Dépassement SLA"; t.dateAction = ts;
    if (next) {
      next.etat = "EN_CORBEILLE"; next.dateEnCorbeille = ts; next.escaladeDepuis = roleLabel(t.role);
      dossier.etapeCourante = next.ordre; dossier.statut = "en_cours";
      logAudit(dossier, user.nom, "Escalade", `${roleLabel(t.role)} → ${roleLabel(next.role)} (N+1) — ${motif || "corbeille inactive au-delà du SLA"}`, ts);
    } else {
      logAudit(dossier, user.nom, "Escalade", `${roleLabel(t.role)} — alerte superviseur (étape terminale)`, ts);
      t.etat = "EN_CORBEILLE"; // reste, mais alerté
    }
    return { ok: true };
  }

  // ----------------------- SoD : séparation des tâches -----------------------
  function sodViolation(dossier, taskOrdre, userId) {
    // un agent ayant agi à l'étape N-1 ne peut agir à l'étape N
    const prev = dossier.taches.find(t => t.ordre === taskOrdre - 1);
    return prev && prev.acteur === userId;
  }

  // ----------------------- Approbation -----------------------
  function approve(dossier, taskId, user, commentaire, revue, ts) {
    ts = ts || Date.now();
    const t = dossier.taches.find(x => x.id === taskId);
    if (!t) return { ok: false, msg: "Tâche introuvable." };
    if (sodViolation(dossier, t.ordre, user.id))
      return { ok: false, sod: true, msg: "Séparation des tâches : vous avez déjà agi à l'étape précédente de ce dossier." };
    t.etat = t.type === "V" ? "VERIFIEE" : "APPROUVEE";
    t.decision = t.type === "V" ? "verifie" : "approuve";
    t.acteur = user.id; t.acteurNom = user.nom; t.dateAction = ts; t.commentaire = commentaire || "";
    if (revue) t.revue = revue;
    const nbOk = revue ? revue.filter(r => r.verdict === "ok").length : null;
    logAudit(dossier, user.nom, t.type === "V" ? "Vérification" : "Approbation",
      `${roleLabel(t.role)}${nbOk != null ? ` — ${nbOk}/${revue.length} champs validés` : ""}${commentaire ? " — " + commentaire : ""}`, ts);
    // étape suivante
    const next = dossier.taches.find(x => x.ordre === t.ordre + 1);
    if (next) {
      next.etat = "EN_CORBEILLE"; next.dateEnCorbeille = ts;
      dossier.etapeCourante = next.ordre; dossier.statut = "en_cours";
    } else {
      dossier.statut = "valide"; dossier.etapeCourante = dossier.taches.length;
      dossier.dateValidation = ts; dossier.saisiSI = true;
      logAudit(dossier, "Système", "Validation finale", "Dossier validé — dégrèvement saisi dans le SI de facturation", ts + 1000);
      // active le contrôle a posteriori
      (dossier.controles || []).forEach(cc => { cc.etat = "A_CONTROLER"; });
    }
    return { ok: true, final: dossier.statut === "valide" };
  }

  // ----------------------- Rejet -----------------------
  function reject(dossier, taskId, user, motif, revue, ts) {
    ts = ts || Date.now();
    if (!motif || !motif.trim()) return { ok: false, msg: "Le motif de rejet est obligatoire." };
    const t = dossier.taches.find(x => x.id === taskId);
    if (!t) return { ok: false };
    if (sodViolation(dossier, t.ordre, user.id))
      return { ok: false, sod: true, msg: "Séparation des tâches : action bloquée." };
    t.etat = "REJETEE"; t.decision = "rejete"; t.acteur = user.id; t.acteurNom = user.nom;
    t.dateAction = ts; t.commentaire = motif;
    if (revue) t.revue = revue;
    const nbKo = revue ? revue.filter(r => r.verdict === "ko").length : null;
    dossier.statut = "rejete"; dossier.motifRejet = motif; dossier.rejetePar = user.nom;
    dossier.dateRejet = ts;
    dossier.revueRejet = revue || null;
    logAudit(dossier, user.nom, "Rejet", `${nbKo != null ? `${nbKo} champ(s) invalide(s) — ` : ""}${motif}`, ts);
    return { ok: true };
  }

  // ----------------------- Délégation -----------------------
  function delegate(dossier, taskId, fromUser, toUserId, note, ts) {
    ts = ts || Date.now();
    const t = dossier.taches.find(x => x.id === taskId);
    const to = D.userById[toUserId];
    if (!t || !to) return { ok: false };
    t.delegueA = toUserId; t.noteInterim = note || "";
    if (t.etat === "RECLAMEE" && t.agentClaim === fromUser.id) { t.agentClaim = null; t.dateClaim = null; t.etat = "EN_CORBEILLE"; }
    logAudit(dossier, fromUser.nom, "Délégation", `Vers ${to.nom}${note ? " — " + note : ""} (note d'intérim conservée)`, ts);
    return { ok: true };
  }

  // ----------------------- Abandon -----------------------
  // Étape critique = une approbation (type A) a déjà eu lieu.
  function etapeCritiqueAtteinte(dossier) {
    return (dossier.taches || []).some(t => t.type === "A" && t.etat === "APPROUVEE");
  }
  function canAbandon(dossier) {
    return (dossier.statut === "soumis" || dossier.statut === "en_cours") && !etapeCritiqueAtteinte(dossier);
  }
  function abandon(dossier, user, motif, ts) {
    ts = ts || Date.now();
    if (!canAbandon(dossier)) return { ok: false, msg: "Abandon impossible : une étape critique (approbation) a déjà été franchie." };
    dossier.statut = "abandonne";
    logAudit(dossier, user.nom, "Abandon", motif || "Demande retirée par l'initiateur", ts);
    return { ok: true };
  }

  // ----------------------- Modification après rejet + re-routage (PGD-05b) -----------------------
  function modifyResubmit(dossier, user, changes, ts) {
    ts = ts || Date.now();
    const c = D.CIRCUITS[dossier.circuit];
    const ancienTtc = dossier.ttc, ancienneTranche = dossier.tranche;
    if (changes.ht != null) dossier.ht = Number(changes.ht) || 0;
    if (changes.libelle != null) dossier.libelle = changes.libelle;
    if (changes.commentaire != null) dossier.commentaire = changes.commentaire;
    if (changes.applyTsc != null) dossier.applyTsc = !!changes.applyTsc;
    if (changes.applyTva != null) dossier.applyTva = !!changes.applyTva;
    if (changes.tvaBase != null) dossier.tvaBase = changes.tvaBase === "htTsc" ? "htTsc" : "ht";
    const m = calcMontants(dossier.ht, c.tva, { tsc: dossier.applyTsc, tva: dossier.applyTva, tvaBase: dossier.tvaBase });
    dossier.tsc = m.tsc; dossier.tva = m.tva; dossier.ttc = m.ttc;
    // historise la modification
    const detTtc = Math.round(ancienTtc) !== Math.round(m.ttc)
      ? ` — TTC ${fmtMoney(ancienTtc)} → ${fmtMoney(m.ttc)}` : "";
    logAudit(dossier, user.nom, "Modification", `Correction après rejet${detTtc}`, ts);
    // trace des montants
    (dossier.montantsHistory = dossier.montantsHistory || []).push({
      ts, acteur: user.nom, evt: "Correction après rejet",
      ht: dossier.ht, tsc: m.tsc, tva: m.tva, htTsc: dossier.ht + m.tsc, ttc: m.ttc,
      applyTsc: dossier.applyTsc !== false, applyTva: dossier.applyTva !== false, tvaBase: dossier.tvaBase || "ht",
    });
    // remet à zéro l'état de validation et re-route
    dossier.motifRejet = null; dossier.rejetePar = null;
    dossier.dateRejet = null;
    submit(dossier, user.nom, ts + 1000);
    const nouvelleTranche = selectTranche(dossier.circuit, m.ttc);
    if (nouvelleTranche && nouvelleTranche.label !== ancienneTranche)
      logAudit(dossier, "Système", "Re-routage", `Changement de tranche : « ${ancienneTranche} » → « ${nouvelleTranche.label} »`, ts + 1500);
    return { ok: true, trancheChange: nouvelleTranche && nouvelleTranche.label !== ancienneTranche };
  }

  // ----------------------- Contrôle a posteriori -----------------------
  function controler(dossier, ctrlId, user, constat, conforme, ts) {
    ts = ts || Date.now();
    const cc = (dossier.controles || []).find(x => x.id === ctrlId);
    if (!cc) return { ok: false };
    cc.etat = "FAIT"; cc.acteur = user.id; cc.acteurNom = user.nom; cc.dateAction = ts;
    cc.conforme = conforme; cc.commentaire = constat || "";
    logAudit(dossier, user.nom, "Contrôle a posteriori", `${roleLabel(cc.role)} : ${conforme ? "conforme" : "anomalie"}${constat ? " — " + constat : ""}`, ts);
    return { ok: true };
  }

  // ----------------------- Escalade SLA -----------------------
  function ageHeures(task) {
    const ref = task.dateClaim || task.dateEnCorbeille;
    if (!ref) return 0;
    // décompte en heures ouvrées (calendrier métier)
    return heuresOuvrees(ref, Date.now());
  }
  function isEnRetard(task) {
    return (task.etat === "EN_CORBEILLE" || task.etat === "RECLAMEE") && ageHeures(task) > task.sla;
  }

  function roleLabel(code) { return D.roleByCode[code]?.libelle || code; }

  // ----------------------- SLA de correction d'un rejet (processus du dossier initié) -----------------------
  function rejetSla(d) {
    const cfg = (D.CONFIG && D.CONFIG.rejets) || {};
    const rt = (d.taches || []).find(t => t.etat === "REJETEE");
    const rejTs = d.dateRejet || (rt && rt.dateAction) || d.dateSoumission || d.dateCreation || Date.now();

    // SLA désactivé par configuration → aucun délai n'est appliqué aux rejets
    if (cfg.slaActif === false) {
      return { actif: false, rejTs, slaH: 0, echeance: null, ageH: 0, retard: false, restant: 0, depasse: 0, alerte: false, mode: cfg.mode || "chaine" };
    }

    // Délai applicable : somme des SLA du circuit ("chaine") ou délai fixe ("fixe")
    const mode = cfg.mode || "chaine";
    let slaH;
    if (mode === "fixe") {
      slaH = Number(cfg.delaiFixeH) || 48;
    } else {
      slaH = (d.taches && d.taches.length)
        ? d.taches.reduce((a, t) => a + (Number(t.sla) || 0), 0)
        : (Number(cfg.delaiFixeH) || 24);
    }

    // Décompte en heures ouvrées (défaut) ou calendaires selon la configuration
    const ouvrees = cfg.heuresOuvrees !== false;
    const ageH = ouvrees ? heuresOuvrees(rejTs, Date.now()) : (Date.now() - rejTs) / 3600000;
    const echeance = ouvrees ? echeanceSla(rejTs, slaH) : (rejTs + slaH * 3600000);
    const restant = Math.max(0, slaH - ageH);
    const retard = ageH > slaH;
    const seuil = Number(cfg.seuilAlerteH) || 0;
    const alerte = !retard && restant <= seuil;
    return { actif: true, rejTs, slaH, echeance, ageH, retard, alerte, mode, ouvrees, restant, depasse: Math.max(0, ageH - slaH) };
  }

  // ----------------------- Moteur temps : expiration verrou & escalade auto -----------------------
  function runAutoEngine(dossiers, ts) {
    ts = ts || Date.now();
    const events = [];
    dossiers.forEach(d => {
      if (d.statut !== "soumis" && d.statut !== "en_cours") return;
      (d.taches || []).forEach(t => {
        if (t.etat === "RECLAMEE" && t.dateClaim && (ts - t.dateClaim) / 3600000 > t.verrouExpireH) {
          const who = D.userById[t.agentClaim]?.nom || "agent";
          t.etat = "EN_CORBEILLE"; t.agentClaim = null; t.dateClaim = null;
          t.dateEnCorbeille = t.dateEnCorbeille || ts;
          logAudit(d, "Système", "Expiration de verrou", `${roleLabel(t.role)} — verrou de ${who} expiré (${t.verrouExpireH} h), tâche libérée`, ts);
          events.push({ type: "verrou", d });
        }
        if (t.etat === "EN_CORBEILLE" && t.dateEnCorbeille && (ts - t.dateEnCorbeille) / 3600000 > t.sla && !t.escaladeAuto) {
          const next = d.taches.find(x => x.ordre === t.ordre + 1);
          t.escaladeAuto = true;
          if (next) {
            t.etat = "ESCALADEE"; t.dateAction = ts;
            next.etat = "EN_CORBEILLE"; next.dateEnCorbeille = ts; next.escaladeDepuis = roleLabel(t.role);
            d.etapeCourante = next.ordre; d.statut = "en_cours";
            logAudit(d, "Système", "Escalade automatique", `${roleLabel(t.role)} → ${roleLabel(next.role)} (N+1) — corbeille inactive au-delà du SLA (${fmtDuree(t.sla)}) · superviseur notifié`, ts);
            events.push({ type: "escalade", d, from: t.role, to: next.role });
          } else {
            logAudit(d, "Système", "Alerte SLA", `${roleLabel(t.role)} — étape terminale en retard · superviseur notifié`, ts);
            events.push({ type: "alerte", d });
          }
        }
      });
    });
    return events;
  }
  function advanceTime(dossiers, hours, ts) {
    ts = ts || Date.now();
    const ms = hours * 3600000;
    dossiers.forEach(d => (d.taches || []).forEach(t => {
      if (t.etat === "EN_CORBEILLE" && t.dateEnCorbeille) t.dateEnCorbeille -= ms;
      if (t.etat === "RECLAMEE" && t.dateClaim) t.dateClaim -= ms;
    }));
    return runAutoEngine(dossiers, ts);
  }

  // ----------------------- Gestion des exceptions (superviseur) PGD-24 -----------------------
  function relancer(dossier, user, ts) {
    ts = ts || Date.now();
    const t = currentTask(dossier);
    if (!t) return { ok: false, msg: "Aucune tâche active." };
    logAudit(dossier, user.nom, "Relance", `${roleLabel(t.role)} — notification renvoyée aux membres de la corbeille`, ts);
    return { ok: true };
  }
  function reaffecter(dossier, newRole, user, note, ts) {
    ts = ts || Date.now();
    const t = currentTask(dossier);
    if (!t) return { ok: false, msg: "Aucune tâche active." };
    const ancien = roleLabel(t.role);
    t.role = newRole; t.etat = "EN_CORBEILLE"; t.agentClaim = null; t.dateClaim = null; t.dateEnCorbeille = ts; t.escaladeAuto = false;
    logAudit(dossier, user.nom, "Réaffectation", `${ancien} → ${roleLabel(newRole)}${note ? " — " + note : ""}`, ts);
    return { ok: true };
  }
  function debloquer(dossier, user, ts) {
    ts = ts || Date.now();
    const t = currentTask(dossier);
    if (!t) return { ok: false, msg: "Aucune tâche active." };
    if (t.etat === "RECLAMEE") { const who = D.userById[t.agentClaim]?.nom; t.etat = "EN_CORBEILLE"; t.agentClaim = null; t.dateClaim = null; t.dateEnCorbeille = ts; t.escaladeAuto = false;
      logAudit(dossier, user.nom, "Déblocage", `${roleLabel(t.role)} — verrou de ${who} forcé`, ts); return { ok: true }; }
    return { ok: false, msg: "La tâche n'est pas verrouillée." };
  }

  // ----------------------- Ajustement en masse (PGD-27) -----------------------
  function createDossierMasse(input) {
    const c = D.CIRCUITS[input.circuit];
    const lignes = (input.lignes || []).map(l => {
      const mm = calcMontants(l.ht, c.tva);
      return { ...l, tsc: mm.tsc, tva: mm.tva, ttc: mm.ttc };
    });
    const htTotal = lignes.reduce((a, l) => a + (Number(l.ht) || 0), 0);
    const d = createDossier({ ...input, ht: htTotal, client: { nom: `Lot de ${lignes.length} clients`, compte: input.lot || "LOT", formule: "Ajustement en masse" } });
    d.masse = true; d.lignes = lignes; d.libelle = input.libelle || `Ajustement en masse — ${lignes.length} lignes`;
    return d;
  }

  // ----------------------- Actes complémentaires (réf. feuille SLA) -----------------------
  function rappeler(dossier, user, ts) {
    ts = ts || Date.now();
    if (etapeCritiqueAtteinte(dossier)) return { ok: false, msg: "Rappel impossible : une approbation est déjà intervenue." };
    const t = currentTask(dossier);
    if (t) { t.etat = "EN_ATTENTE"; t.agentClaim = null; t.dateClaim = null; }
    dossier.statut = "brouillon"; dossier.etapeCourante = -1;
    logAudit(dossier, user.nom, "Rappel", "Dossier rappelé par l'initiateur pour correction", ts);
    return { ok: true };
  }
  function publipostage(dossier, user, ts) {
    ts = ts || Date.now();
    dossier.courrierGenere = true;
    logAudit(dossier, user.nom, "Publipostage", "Courrier de réponse au client généré", ts);
    return { ok: true };
  }
  function archiver(dossier, user, ts) {
    ts = ts || Date.now();
    dossier.archive = true;
    logAudit(dossier, user.nom, "Archivage", "Dossier archivé", ts);
    return { ok: true };
  }

  // ----------------------- Statut → présentation -----------------------
  const STATUTS = {
    brouillon:  { label: "Brouillon",   cls: "b-grey" },
    soumis:     { label: "Soumis",      cls: "b-blue" },
    en_cours:   { label: "En cours",    cls: "b-orange" },
    valide:     { label: "Validé",      cls: "b-green" },
    rejete:     { label: "Rejeté",      cls: "b-red" },
    abandonne:  { label: "Abandonné",   cls: "b-grey" },
  };

  window.PGD_ENGINE = {
    fmtMoney, fmtMoneyShort, fmtNum, fmtDate, fmtDateTime, fmtAgo, fmtDuree,
    calcMontants, selectTranche, trancheIndex, buildChainPreview, membersOfRole,
    genRef, createDossier, submit, claim, unclaim, approve, reject, delegate,
    abandon, canAbandon, etapeCritiqueAtteinte, modifyResubmit, controler,
    escalader, runAutoEngine, advanceTime, relancer, reaffecter, debloquer, createDossierMasse,
    rappeler, publipostage, archiver,
    heuresOuvrees, echeanceSla, isJourOuvre,
    currentTask, sodViolation, ageHeures, isEnRetard,
    roleLabel, logAudit, STATUTS,
    rejetSla,
  };

  // ====================================================================
  //  Génération du jeu de démonstration
  // ====================================================================
  const HOUR = 3600000, DAY = 86400000;
  function seedDossiers() {
    const list = [];
    const now = Date.now();
    const U = D.userById;

    // Helper : créer + soumettre + avancer de n approbations
    function make(opts) {
      const d = createDossier(opts);
      const subTs = opts.subAgo != null ? now - opts.subAgo : now - 2 * DAY;
      submit(d, opts.createdByName, subTs);
      let ts = subTs;
      const advance = opts.advance || 0;
      for (let i = 0; i < advance; i++) {
        const t = dossier_currentBlockingOrAny(d);
        if (!t) break;
        ts += (4 + Math.random() * 20) * HOUR;
        const members = membersOfRole(t.role);
        let actor = members[0] || U.u_marie;
        // éviter SoD : choisir un acteur différent du précédent
        const prev = d.taches.find(x => x.ordre === t.ordre - 1);
        if (prev && prev.acteur === actor.id) actor = members[1] || U.u_kone;
        if (t.etat === "EN_CORBEILLE") claim(d, t.id, actor, ts - HOUR);
        approve(d, t.id, actor, "", null, ts);
      }
      if (opts.reject) {
        const t = currentTask(d);
        if (t) {
          ts += 6 * HOUR;
          const actor = membersOfRole(t.role)[0] || U.u_marie;
          reject(d, t.id, actor, opts.reject, null, ts);
        }
      }
      // claim courant (sans agir) pour montrer un verrou
      if (opts.claimNow) {
        const t = currentTask(d);
        if (t && t.etat === "EN_CORBEILLE") claim(d, t.id, opts.claimNow, now - 1.5 * HOUR);
      }
      if (opts.statutForce) d.statut = opts.statutForce;
      return d;
    }
    function dossier_currentBlockingOrAny(d) {
      return d.taches.find(t => t.etat === "EN_CORBEILLE" || t.etat === "RECLAMEE");
    }

    // — DXC —
    list.push(make({ circuit: "DXC", sousFlux: "Réclamation", motif: "Erreur de facturation",
      client: D.CLIENTS_DXC[0], agent: "Aya Koffi", matricule: "M-2041",
      ht: 145000, libelle: "Surfacturation forfait data juin", commentaire: "Client facturé deux fois le hors-forfait.",
      createdBy: "u_aya", createdByName: "Aya Koffi", subAgo: 5 * DAY, advance: 2,
      pieces: [{ nom: "Facture_juin.pdf", type: "Facture" }, { nom: "Detail_conso.xlsx", type: "Justificatif" }] }));

    list.push(make({ circuit: "DXC", sousFlux: "Geste commercial", motif: "Geste commercial",
      client: D.CLIENTS_DXC[1], agent: "Aya Koffi", matricule: "M-2041",
      ht: 12500000, libelle: "Geste fidélité incident réseau", commentaire: "Compensation suite coupure prolongée.",
      createdBy: "u_aya", createdByName: "Aya Koffi", subAgo: 2 * DAY, advance: 1, claimNow: U.u_marie,
      pieces: [{ nom: "Ticket_incident.pdf", type: "Mémo" }] }));

    list.push(make({ circuit: "DXC", sousFlux: "Réclamation", motif: "Double facturation",
      client: D.CLIENTS_DXC[2], agent: "Aya Koffi", matricule: "M-2041",
      ht: 38000, libelle: "Double prélèvement abonnement", commentaire: "",
      createdBy: "u_aya", createdByName: "Aya Koffi", subAgo: 6 * DAY, advance: 99 }));

    // — DOBB —
    list.push(make({ circuit: "DOBB", sousFlux: "Réclamation", motif: "Contestation de facture",
      client: D.CLIENTS_DOBB[0], agent: "Aya Koffi", matricule: "M-2041",
      ht: 3200000, libelle: "Contestation conso flotte mobile", commentaire: "Lignes inactives facturées.",
      localisation: "National", canal: "CRM", recurrent: false,
      periode: { debut: "01/04/2026", fin: "30/04/2026", jours: 30 },
      responsabilite: "DOBB / Service ADV",
      createdBy: "u_aya", createdByName: "Aya Koffi", subAgo: 3 * DAY, advance: 1,
      pieces: [{ nom: "Releve_flotte.pdf", type: "Facture" }] }));

    list.push(make({ circuit: "DOBB", sousFlux: "Facturation", motif: "Anomalie de facturation",
      client: D.CLIENTS_DOBB[1], agent: "Konan Yao", matricule: "M-3122",
      ht: 28000000, libelle: "Anomalie MPLS — débit non conforme", commentaire: "Bande passante facturée > souscrite.",
      localisation: "International", canal: "E-mail", recurrent: true,
      periode: { debut: "01/02/2026", fin: "30/04/2026", jours: 89 },
      responsabilite: "DOBB / Service Technique",
      createdBy: "u_aya", createdByName: "Aya Koffi", subAgo: 4 * DAY, advance: 3,
      pieces: [{ nom: "Contrat_MPLS.pdf", type: "Contrat" }, { nom: "Mesures_QoS.xlsx", type: "Justificatif" }] }));

    list.push(make({ circuit: "DOBB", sousFlux: "Recouvrement", motif: "Geste commercial",
      client: D.CLIENTS_DOBB[2], agent: "Konan Yao", matricule: "M-3122",
      ht: 62000000, libelle: "Geste commercial migration offre", commentaire: "Négociation grand compte.",
      localisation: "National", canal: "Agence", recurrent: false,
      responsabilite: "DOBB / Commercial",
      createdBy: "u_aya", createdByName: "Aya Koffi", subAgo: 6 * DAY, advance: 4,
      pieces: [{ nom: "Accord_commercial.pdf", type: "Mémo" }] }));

    list.push(make({ circuit: "DOBB", sousFlux: "Réclamation", motif: "Surconsommation contestée",
      client: D.CLIENTS_DOBB[0], agent: "Aya Koffi", matricule: "M-2041",
      ht: 890000, libelle: "Surconso roaming contestée", commentaire: "",
      localisation: "International", canal: "Centre d'appel", recurrent: false,
      responsabilite: "DOBB / Service ADV",
      createdBy: "u_aya", createdByName: "Aya Koffi", subAgo: 1 * DAY, advance: 1,
      reject: "Pièces justificatives incomplètes : fournir le détail des appels roaming." }));

    // — DF —
    list.push(make({ circuit: "DF", sousFlux: "Réclamation opérateur", motif: "Double facturation",
      client: D.CLIENTS_DF[0], agent: "Back Office WS", matricule: "M-5001",
      ht: 4200000, memo: "L'opérateur conteste une double émission sur le trafic voix international de mars.",
      libelle: "Double facturation trafic voix mars",
      createdBy: "u_aya", createdByName: "Back Office WS", subAgo: 3 * DAY, advance: 1, claimNow: U.u_marie,
      pieces: [{ nom: "Fiche_calcul.xlsx", type: "Fiche de calcul" }] }));

    list.push(make({ circuit: "DF", sousFlux: "Réclamation opérateur", motif: "Non-respect SLA",
      client: D.CLIENTS_DF[1], agent: "Back Office WS", matricule: "M-5001",
      ht: 18000000, memo: "Pénalités SLA suite indisponibilité capacité transit 10G > seuil contractuel.",
      libelle: "Pénalités SLA transit IP",
      createdBy: "u_aya", createdByName: "Back Office WS", subAgo: 7 * DAY, advance: 99,
      pieces: [{ nom: "Rapport_dispo.pdf", type: "Justificatif" }, { nom: "Fiche_calcul.xlsx", type: "Fiche de calcul" }] }));

    list.push(make({ circuit: "DF", sousFlux: "Réclamation opérateur", motif: "Tarif erroné",
      client: D.CLIENTS_DF[0], agent: "Back Office WS", matricule: "M-5001",
      ht: 54000000, memo: "Application d'un tarif d'interconnexion obsolète sur Q1.",
      libelle: "Tarif interconnexion erroné Q1",
      createdBy: "u_aya", createdByName: "Back Office WS", subAgo: 8 * DAY, advance: 2,
      pieces: [{ nom: "Grille_tarifaire.pdf", type: "Contrat" }, { nom: "Fiche_calcul.xlsx", type: "Fiche de calcul" }] }));

    // quelques dossiers validés anciens pour le dashboard
    for (let i = 0; i < 6; i++) {
      const circ = ["DXC", "DOBB", "DF"][i % 3];
      const cl = circ === "DXC" ? D.CLIENTS_DXC[i % 3] : circ === "DOBB" ? D.CLIENTS_DOBB[i % 3] : D.CLIENTS_DF[i % 2];
      list.push(make({ circuit: circ, sousFlux: D.CIRCUITS[circ].sousFlux[0], motif: D.MOTIFS[circ][i % D.MOTIFS[circ].length],
        client: cl, agent: "Aya Koffi", matricule: "M-2041",
        ht: [85000, 220000, 1500000, 9000000, 450000, 2100000][i],
        libelle: "Dossier clôturé #" + (i + 1), commentaire: "",
        createdBy: "u_aya", createdByName: "Aya Koffi", subAgo: (9 + i * 2) * DAY, advance: 99,
        pieces: [{ nom: "piece.pdf", type: "Justificatif" }] }));
    }

    return list;
  }
  window.PGD_SEED = seedDossiers;
})();
