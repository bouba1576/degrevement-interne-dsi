/* ====================================================================
   PGD — Données de configuration & jeu de démonstration
   Tout est externalisé ici : aucune règle métier n'est codée en dur
   dans le moteur (engine.jsx) ni les écrans.
   ==================================================================== */
(function () {
  // ---------- Catalogue de rôles unifié (extrait représentatif) ----------
  // type: I=Initiateur, V=Vérificateur, A=Approbateur, C=Contrôleur, S=Superviseur, X=Admin
  const ROLES = [
    // Initiateurs
    { code: "INIT_DOBB", libelle: "Chargé de réclamation B2B", niveau: 1, type: "I", ad: "GG-DGR-DOBB-INIT", circuit: "DOBB" },
    { code: "INIT_DXC",  libelle: "Gestionnaire B2C",          niveau: 1, type: "I", ad: "GG-DGR-DXC-INIT",  circuit: "DXC" },
    { code: "INIT_DF",   libelle: "Back office opérateur",      niveau: 1, type: "I", ad: "GG-DGR-DF-INIT",   circuit: "DF" },
    // Vérificateurs
    { code: "VER_DOBB",  libelle: "Vérificateur DOBB",          niveau: 2, type: "V", ad: "GG-DGR-DOBB-VER",  circuit: "DOBB" },
    { code: "VER_DXC",   libelle: "Chargé de réclamation B2C",   niveau: 2, type: "V", ad: "GG-DGR-DXC-VER",   circuit: "DXC" },
    { code: "VER_DF",    libelle: "Vérificateur Wholesale",     niveau: 2, type: "V", ad: "GG-DGR-DF-VER",    circuit: "DF" },
    // Approbateurs propres aux circuits
    { code: "RESP_DOBB", libelle: "Responsable DOBB",           niveau: 3, type: "A", ad: "GG-DGR-DOBB-RESP", circuit: "DOBB" },
    { code: "MGR_DOBB",  libelle: "Manager DOBB",               niveau: 4, type: "A", ad: "GG-DGR-DOBB-MGR",  circuit: "DOBB" },
    { code: "DIR_DOBB",  libelle: "Directeur DOBB",             niveau: 5, type: "A", ad: "GG-DGR-DOBB-DIR",  circuit: "DOBB" },
    { code: "RESP_DXC",  libelle: "Responsable réclamation B2C", niveau: 3, type: "V", ad: "GG-DGR-DXC-RESP", circuit: "DXC" },
    { code: "MRF_DXC",   libelle: "Manager réclamation & facturation B2C",        niveau: 4, type: "V", ad: "GG-DGR-DXC-MRF",  circuit: "DXC" },
    { code: "MSRF_DXC",  libelle: "Manager Sénior réclamation & facturation B2C", niveau: 5, type: "V", ad: "GG-DGR-DXC-MSRF", circuit: "DXC" },
    { code: "DIR_DXC",   libelle: "Directeur Expérience Client", niveau: 5, type: "A", ad: "GG-DGR-DXC-DIR",  circuit: "DXC" },
    { code: "SM_DF",     libelle: "Senior Manager Wholesale",   niveau: 4, type: "A", ad: "GG-DGR-DF-SM",     circuit: "DF" },
    // — Rôles détaillés DOBB (chaînes réelles, slide « Circuit de validation DOBB ») —
    { code: "RRB2B",  libelle: "Responsable Réclamation B2B",          niveau: 3, type: "A", ad: "GG-DGR-DOBB-RRB2B", circuit: "DOBB" },
    { code: "MRB2B",  libelle: "Manager Réclamation B2B",              niveau: 4, type: "A", ad: "GG-DGR-DOBB-MRB2B", circuit: "DOBB" },
    { code: "RREC",   libelle: "Responsable Recouvrement",            niveau: 3, type: "A", ad: "GG-DGR-DOBB-RREC",  circuit: "DOBB" },
    { code: "MREC",   libelle: "Manager Recouvrement",                niveau: 4, type: "A", ad: "GG-DGR-DOBB-MREC",  circuit: "DOBB" },
    { code: "RADV",   libelle: "Responsable Administration des Ventes", niveau: 3, type: "A", ad: "GG-DGR-DOBB-RADV", circuit: "DOBB" },
    { code: "MSOC",   libelle: "Manager Service Opérations Client",   niveau: 4, type: "A", ad: "GG-DGR-DOBB-MSOC",  circuit: "DOBB" },
    { code: "MSRC",   libelle: "Manager Sénior Relation Client B2B",  niveau: 5, type: "A", ad: "GG-DGR-DOBB-MSRC",  circuit: "DOBB" },
    { code: "DAOB",   libelle: "Directeur Adjoint des Opérations Business (DAOB)", niveau: 5, type: "A", ad: "GG-DGR-DOBB-DAOB", circuit: "DOBB" },
    { code: "FRADEL", libelle: "Chargé / Responsable Delivery (FRA)",  niveau: 5, type: "A", ad: "GG-DGR-FRA-DEL",    circuit: "*" },
    { code: "SMMOA",  libelle: "SM MOA Finance & Fraude Assurance",   niveau: 6, type: "A", ad: "GG-DGR-SMMOA",      circuit: "*" },
    { code: "DFA",    libelle: "Directeur Financier Adjoint (DFA)",   niveau: 6, type: "A", ad: "GG-DGR-DFA",        circuit: "*" },
    // — Rôles détaillés DF (slide « Circuit de validation DF ») —
    { code: "SM_BO_CM", libelle: "SM Back Office Opérateurs & Credit Management", niveau: 3, type: "A", ad: "GG-DGR-DF-BOCM", circuit: "DF" },
    { code: "SM_VWR",   libelle: "SM Vente Wholesale & Roaming",      niveau: 4, type: "A", ad: "GG-DGR-DF-VWR",  circuit: "DF" },
    { code: "DIRMKT",   libelle: "Directeur Marketing",              niveau: 5, type: "A", ad: "GG-DGR-DIR-MKT", circuit: "*" },
    // Rôles pivots multi-circuits (mutualisés)
    { code: "DF",        libelle: "Directeur Financier (DF)",   niveau: 6, type: "A", ad: "GG-DGR-DF-DIR",    circuit: "*" },
    { code: "DGA_DG",    libelle: "DGA / Directeur Général",    niveau: 7, type: "A", ad: "GG-DGR-DG",        circuit: "*" },
    // Contrôle
    { code: "CTRL_N1",   libelle: "Contrôle à froid N1 (sécurisation des opérations)", niveau: 8, type: "C", ad: "GG-DGR-CTRL-N1",   circuit: "*" },
    { code: "CTRL_N2",   libelle: "Contrôle mensuel N2 (FRA)",   niveau: 9, type: "C", ad: "GG-DGR-CTRL-N2",   circuit: "*" },
    // Système
    { code: "SUPERVISEUR", libelle: "Superviseur PGD",          niveau: 10, type: "S", ad: "GG-DGR-SUP",      circuit: "*" },
    { code: "ADMIN",       libelle: "Administrateur PGD",       niveau: 11, type: "X", ad: "GG-DGR-ADMIN",    circuit: "*" },
  ];
  const roleByCode = Object.fromEntries(ROLES.map(r => [r.code, r]));

  // ---------- Construction des chaînes DOBB (fidèle à la slide « Circuit de validation DOBB ») ----------
  // 4 sous-circuits par service × 6 seuils. Les chaînes sont cumulatives par seuil.
  const _dobbSla = { RRB2B: 8, MRB2B: 24, RREC: 8, MREC: 24, RADV: 8, MSOC: 24, MSRC: 24, DAOB: 48, DIR_DOBB: 48, FRADEL: 24, SMMOA: 48, DFA: 72, DF: 72, DGA_DG: 96, SM_BO_CM: 8, SM_VWR: 24, DIRMKT: 48 };
  const _dobbHead = {
    "Réclamation":  ["RRB2B", "MRB2B"],
    "Recouvrement": ["RREC", "MREC"],
    "ADV":          ["RADV", "MSOC"],
    "Facturation":  ["MSOC"],
  };
  // Maillons ajoutés à chaque seuil (en plus de la tête de service)
  const _dobbTail = [
    [],                                                                    // ≤ 1 M
    ["MSRC"],                                                              // 1 M – 4,99 M
    ["MSRC", "DAOB"],                                                     // = 5 M
    ["MSRC", "DAOB", "FRADEL", "SMMOA"],                                 // 5 M – 30 M
    ["MSRC", "DAOB", "FRADEL", "SMMOA", "DFA", "DF"],                    // 30 M – 50 M
    ["MSRC", "DAOB", "DIR_DOBB", "FRADEL", "SMMOA", "DFA", "DF", "DGA_DG"], // > 50 M
  ];
  const _dobbBrackets = [
    { min: 0, max: 1000000, label: "≤ 1 M" },
    { min: 1000001, max: 4999999, label: "1 M – 4,99 M" },
    { min: 5000000, max: 5000000, label: "= 5 M" },
    { min: 5000001, max: 30000000, label: "5 M – 30 M" },
    { min: 30000001, max: 50000000, label: "30 M – 50 M" },
    { min: 50000001, max: null, label: "> 50 M" },
  ];
  const _dobbEtapes = (service, bi) => _dobbHead[service].concat(_dobbTail[bi])
    .map((role, i) => ({ role, type: i === 0 ? "V" : "A", bloquant: i !== 0, sla: _dobbSla[role] || 48 }));
  const DOBB_TRANCHES = _dobbBrackets.map((b, bi) => ({
    min: b.min, max: b.max, label: b.label,
    parService: Object.fromEntries(Object.keys(_dobbHead).map(s => [s, _dobbEtapes(s, bi)])),
    etapes: _dobbEtapes("Réclamation", bi),   // chaîne par défaut (aperçu sans service)
  }));

  // ---------- Construction des chaînes DF (fidèle à la slide « Circuit de validation DF ») ----------
  const _dfEt = (roles) => roles.map((role, i) => ({ role, type: i === 0 ? "V" : "A", bloquant: i !== 0, sla: _dobbSla[role] || 48 }));
  // Chaîne mixte : plusieurs vérificateurs (V) puis validateurs (A) — utilisée pour le seuil > 50 M.
  const _dfMix = (verif, valid) => [
    ...verif.map(r => ({ role: r, type: "V", bloquant: false, sla: _dobbSla[r] || 48 })),
    ...valid.map(r => ({ role: r, type: "A", bloquant: true,  sla: _dobbSla[r] || 48 })),
  ];
  const DF_TRANCHES = [
    { min: 0, max: 5000000, label: "≤ 5 M", etapes: _dfEt(["SM_BO_CM", "SM_VWR"]) },
    { min: 5000001, max: 50000000, label: "5 M – 50 M", etapes: _dfEt(["SM_BO_CM", "SM_VWR", "SMMOA", "DIRMKT", "DFA", "DF"]) },
    { min: 50000001, max: null, label: "> 50 M", etapes: _dfMix(["SM_BO_CM", "SM_VWR"], ["SMMOA", "DIRMKT", "DFA", "DF", "DGA_DG"]) },
  ];

  // ---------- Construction des chaînes DXC (fidèle à la slide « Circuit de validation DXC » — matrice B2C / FTTH) ----------
  // Acteurs vérificateurs (type V) puis acteurs validateurs (type A) ; chaînes cumulatives par seuil (FCFA TTC).
  const _dxcSla = { VER_DXC: 8, RESP_DXC: 8, MRF_DXC: 8, MSRF_DXC: 8, FRADEL: 48, SMMOA: 24, DIR_DXC: 24, DFA: 24, DF: 24, DGA_DG: 24 };
  const _dxcEt = (verif, valid) => [
    ...verif.map(r => ({ role: r, type: "V", bloquant: false, sla: _dxcSla[r] || 24 })),
    ...valid.map(r => ({ role: r, type: "A", bloquant: true,  sla: _dxcSla[r] || 24 })),
  ];
  const DXC_TRANCHES = [
    { min: 0,        max: 500000,   label: "≤ 500 k",    etapes: _dxcEt(["VER_DXC", "RESP_DXC"], ["DIR_DXC"]) },
    { min: 500001,   max: 5000000,  label: "500 k – 5 M", etapes: _dxcEt(["VER_DXC", "RESP_DXC", "MRF_DXC", "MSRF_DXC"], ["DIR_DXC"]) },
    { min: 5000001,  max: 30000000, label: "5 M – 30 M",  etapes: _dxcEt(["VER_DXC", "RESP_DXC", "MRF_DXC", "MSRF_DXC", "FRADEL"], ["SMMOA", "DIR_DXC", "DFA"]) },
    { min: 30000001, max: 50000000, label: "30 M – 50 M", etapes: _dxcEt(["VER_DXC", "RESP_DXC", "MRF_DXC", "MSRF_DXC", "FRADEL"], ["SMMOA", "DIR_DXC", "DFA", "DF"]) },
    { min: 50000001, max: null,     label: "> 50 M",      etapes: _dxcEt(["VER_DXC", "RESP_DXC", "MRF_DXC", "MSRF_DXC", "FRADEL"], ["SMMOA", "DIR_DXC", "DFA", "DF", "DGA_DG"]) },
  ];

  // ---------- Matrice de décision consolidée (format pivot) ----------
  // borne_max = null => infini. Étape: {role, type, bloquant, sla} ; SLA en heures.
  // Le moteur lit cette table ; rien n'est en dur.
  const M = 1; // lisibilité
  const CIRCUITS = {
    DOBB: {
      code: "DOBB", label: "DOBB", segment: "B2B", couleur: "pc-dobb",
      nom: "Direction Opérations B2B", tva: 0.18,
      sousFlux: ["Réclamation", "Recouvrement", "ADV", "Facturation"],
      tranches: DOBB_TRANCHES,
      controle: [{ role: "CTRL_N1", type: "C", bloquant: false, sla: 720 }],
    },
    DXC: {
      code: "DXC", label: "DXC", segment: "B2C", couleur: "pc-dxc",
      nom: "Direction Expérience Client", tva: 0.18,
      sousFlux: ["Réclamation", "Geste commercial"],
      tranches: DXC_TRANCHES,
      controle: [
        { role: "CTRL_N1", type: "C", bloquant: false, sla: 168 },
        { role: "CTRL_N2", type: "C", bloquant: false, sla: 720 },
      ],
    },
    DF: {
      code: "DF", label: "DF", segment: "Wholesale", couleur: "pc-df",
      nom: "Direction Wholesale & Opérateurs", tva: 0.18,
      sousFlux: ["Réclamation opérateur"],
      tranches: DF_TRANCHES,
      controle: [{ role: "CTRL_N1", type: "C", bloquant: false, sla: 720 }],
    },
  };

  // ---------- Motifs par circuit (issus des formulaires réels) ----------
  const MOTIFS = {
    // DOBB — liste réelle PO2_B-17
    DOBB: [
      "CONTESTATION FACTURE", "ABATTEMENT", "ABATTEMENT (DATA TRACKING)", "ABATTEMENT (FRAUDE BR MIX)",
      "ANOMALIE FACTURATION", "ANOMALIE SI", "CESSION NON EFFECTIVE", "DATA ROAMING", "ERREUR DE SAISIE",
      "FACTURATION MANUELLE DE FRAIS", "GESTE COMMERCIAL", "MIGRATION NON EFFECTIVE", "MODIFICATION NON EFFECTIVE",
      "RESILIATION NON EFFECTIVE", "SERVICE NON LIVRE FACTURE", "SURCONSOMMATION", "SUSPENSION NON EFFECTIVE",
      "TECHNIQUE", "TRANSFERT NON EFFECTIF", "PROBLEME TECHNIQUE/ DERANGEMENT", "ANNULATION D'AVOIR",
      "ANNULATION DE PAIEMENT", "FORCEMENT", "PAIEMENT", "TRANSFERT DE PAIEMENT", "REMBOURSEMENT", "WINBACK CLIENT FIBRE OPTIQUE", "AUTRES",
    ],
    DXC: ["Réclamation client", "Geste commercial", "Erreur de facturation", "Double facturation", "Résiliation contestée", "Abattement", "Surconsommation"],
    DF: ["Tarif erroné", "Écart de volume", "Double facturation", "Non-respect SLA", "Lien résilié facturé", "Geste commercial opérateur"],
  };
  const CANAUX = [
    "CRM", "DIMELO", "E-mail", "Courrier", "Agence", "Centre d'appel", "Outlook",
    "Recouvrement B2B", "ASCOM", "FACTURATION", "ADV FIXE INTERNET", "AGENCE", "RECOUVREMENT B2C",
    "ROBOT FORMULAIRE GUIDE", "TELE OPERATEUR MOBILE", "TELE OPERATEUR FI", "ORANGE BUSINESS MAIL",
    "SAV B2B TECHNIQUE", "COMMERCIAUX", "ASSISTANTE DE DIRECTION",
  ];

  // ---------- ITEMS d'ajustement / dégrèvement (liste exhaustive — réf. fichier ITEMS) ----------
  // Le Libellé est la catégorie, le Motif l'item précis, le commentaire la définition.
  const ITEMS_AJUSTEMENT = [
    { libelle: "Contestation facture", motifs: [
      { nom: "Erreur de saisie", desc: "Erreur dans la saisie de service ou de formule, rajout d'option ou numéro non demandé par le client, erreur d'imputation, erreur dans le traitement, intra facturé (GFU non affecté ou erroné)" },
      { nom: "Problème technique", desc: "Dysfonctionnement du service ou réseau, dérangement individuel ou collectif, indisponibilité, coupure de câble, restitution de jours de non connexion…" },
      { nom: "Anomalie SI (BSCS, GAIA, ZTE…)", desc: "Mauvaise facturation du SI ou incident SI, intra facturé (GFU non mis à jour ou non pris en compte par le SI, bug)" },
      { nom: "Suspension non effective", desc: "Demande de suspension non effectuée dans le délai, restitution de jours de non connexion" },
      { nom: "Transfert non effectif", desc: "Demande de transfert non effectué dans le délai, restitution de jours de non connexion" },
      { nom: "Résiliation non effective", desc: "Demande de résiliation non effectuée dans le délai" },
      { nom: "Migration non effective", desc: "Demande de migration non effectuée dans le délai" },
      { nom: "Modification non effective", desc: "Demande de modification non effectuée dans le délai" },
      { nom: "Fraude Sim swap", desc: "Contestation de consommation suite remplacement frauduleux de carte" },
      { nom: "Data roaming", desc: "Contestation de facture data roaming" },
      { nom: "Surconsommation fixe", desc: "Contestation des appels frauduleux" },
      { nom: "Intra facturé", desc: "Facturation indue des appels intra flotte" },
      { nom: "Service non livré facturé", desc: "Produit ou service souscrit non livré au client" },
      { nom: "Abattement", desc: "Action ponctuelle d'annulation totale ou partielle de facture suite incident, dans le cadre de protocole d'accord OCIT/Partenaires, dans le cadre d'offre test" },
      { nom: "Geste commercial", desc: "Annulation totale ou partielle de facture à la demande du client, prorogation de délai de connexion suite à un préjudice subi par le client, en vue de le retenir" },
    ] },
    { libelle: "Régularisation de compte", motifs: [
      { nom: "Migration de formule", desc: "Migration de prépayé vers postpayé ou vice-versa à la demande du client, nécessitant un reversement sur les montants payés d'avance" },
      { nom: "Annulation d'ajustement", desc: "Annulation d'un ajustement erroné effectué par un agent (dégrèvement, forcement)" },
      { nom: "Facturation manuelle de frais", desc: "Affectation manuelle de frais dans le cadre de forfait ou frais dû mais non appliqué au client, de frais sur demande ponctuelle (détail d'appels, crédit ponctuel…) → forcement" },
      { nom: "Surconsommation", desc: "Contestation des appels frauduleux" },
      { nom: "Paiement", desc: "Paiement non pris en compte ou transfert d'encaissement à partir d'un autre compte" },
      { nom: "Annulation de paiement", desc: "Annulation de paiement pour transfert vers un autre compte" },
      { nom: "Test sur ajustement", desc: "Dégrèvement, forcement dans le cadre de tests" },
    ] },
  ];

  // ---------- Libellés normalisés d'ajustement (liste déroulante) ----------
  const LIBELLES = [
    "Surfacturation", "Erreur de facturation", "Double facturation", "Geste commercial",
    "Abattement facturation", "Dérangement / non connexion", "Résiliation non effective",
    "Migration non effective", "Service non livré facturé", "Surconsommation contestée",
    "Annulation d'avoir", "Remboursement client", "Régularisation tarifaire",
  ];
  // Libellés spécifiques au circuit DOBB (B2B) — retour pôle DOBB
  const LIBELLES_DOBB = ["Contestation facture", "Régularisation de compte"];

  // ---------- Points de contact (liste déroulante) ----------
  const POINTS_CONTACT = [
    "Service client B2B", "Service client B2C", "Gestionnaire de compte", "Back-office facturation",
    "Centre d'appel", "Agence commerciale", "Responsable recouvrement", "Service technique / dérangement",
    "Chargé de clientèle grands comptes",
    "Recouvrement B2B", "ASCOM", "FACTURATION", "ADV FIXE INTERNET", "AGENCE", "RECOUVREMENT B2C",
    "ROBOT FORMULAIRE GUIDE", "TELE OPERATEUR MOBILE", "TELE OPERATEUR FI", "ORANGE BUSINESS MAIL",
    "SAV B2B TECHNIQUE", "COMMERCIAUX", "ASSISTANTE DE DIRECTION",
    "Autre",
  ];

  // ---------- Responsabilité DOBB (formulaire réel) ----------
  const RESP_DIRECTION = ["DOBB", "DXC", "MARKETING", "DRSI", "DIE", "DT", "DMS", "DSI", "DAL", "DF", "DG", "DRDI", "DJR", "LE CLIENT", "CLIENT", "INDETERMINEE", "AUTRE"];
  const RESP_SERVICE = ["FACTURATION", "ADV FIXE INTERNET", "ADV MOBILE MENTLEY", "ORANGE BUSINESS MAIL", "COMMERCIAL", "RECOUVREMENT", "DERANGEMENT", "CONFIGURATION DES OFFRES", "POLE PROVISIONNING", "ANOMALIE DIMELO", "PROJET VIRAGE", "EQUIPE TASKFORCE", "INDETERMINE", "AUTRES"];

  // ---------- Utilisateurs (un par persona, + membres de corbeilles) ----------
  // ---------- Directions (libellés longs ; le code court sert à l'en-tête) ----------
  const DIRECTIONS = {
    DOBB: "Direction des Opérations Business B2B",
    DXC:  "Direction Expérience Client B2C",
    DF:   "Direction Financière — Wholesale",
    DSI:  "Direction des Systèmes d'Information",
    DG:   "Direction Générale",
    AUDIT: "Audit & Contrôle Interne",
    PILOTAGE: "Pilotage & Performance",
  };

  const USERS = [
    { id: "u_aya",   nom: "Aya Koffi",      initiales: "AK", couleur: "#FF7900", roles: ["INIT_DOBB"], titre: "Chargée de réclamation B2B", login: "aya.koffi", direction: "DOBB", service: "Réclamation", serviceDobb: "Réclamation" },
    { id: "u_dxc",   nom: "Brou Konan",     initiales: "BK", couleur: "#4BB4E6", roles: ["INIT_DXC"], titre: "Gestionnaire clientèle B2C", login: "brou.konan", direction: "DXC", service: "Réclamation B2C" },
    { id: "u_dfinit", nom: "Inza Coulibaly", initiales: "IC", couleur: "#A885D8", roles: ["INIT_DF"], titre: "Back office opérateur", login: "inza.coulibaly", direction: "DF", service: "Back Office Opérateurs" },
    { id: "u_jean",  nom: "Jean Brou",       initiales: "JB", couleur: "#4BB4E6", roles: ["VER_DXC", "VER_DOBB", "VER_DF", "RRB2B", "RREC", "RADV", "MSOC", "SM_BO_CM"], titre: "Vérificateur", login: "jean.brou", direction: "DOBB", service: "Vérification" },
    { id: "u_marie", nom: "Marie Tanoh",     initiales: "MT", couleur: "#A885D8", roles: ["RESP_DXC", "MRF_DXC", "MSRF_DXC", "RESP_DOBB", "SM_DF", "MRB2B", "MREC", "MSRC", "SM_VWR", "FRADEL"], titre: "Responsable de pôle", login: "marie.tanoh", direction: "DOBB", service: "Management de pôle" },
    { id: "u_kone",  nom: "Salif Koné",      initiales: "SK", couleur: "#32C832", roles: ["DIR_DXC", "DIR_DOBB", "DAOB", "DIRMKT"], titre: "Directeur de direction", login: "salif.kone", direction: "DOBB", service: "Direction" },
    { id: "u_df",    nom: "Awa Diomandé",    initiales: "AD", couleur: "#CD3C14", roles: ["DF", "DFA", "SMMOA"], titre: "Directrice Financière", login: "awa.diomande", direction: "DF", service: "Direction Financière" },
    { id: "u_dg",    nom: "Yao N'Guessan",   initiales: "YN", couleur: "#000000", roles: ["DGA_DG"], titre: "Directeur Général Adjoint", login: "yao.nguessan", direction: "DG", service: "Direction Générale" },
    { id: "u_ctrl",  nom: "Fatou Bamba",     initiales: "FB", couleur: "#1a6f99", roles: ["CTRL_N1", "CTRL_N2"], titre: "Contrôleuse interne", login: "fatou.bamba", direction: "AUDIT", service: "Contrôle interne" },
    { id: "u_sup",   nom: "Hervé Aka",       initiales: "HA", couleur: "#6b3fa0", roles: ["SUPERVISEUR"], titre: "Superviseur PGD", login: "herve.aka", direction: "PILOTAGE", service: "Pilotage PGD" },
    { id: "u_admin", nom: "Aroun Koné",      initiales: "AK", couleur: "#242424", roles: ["ADMIN"], titre: "Administrateur SI", login: "aroun.kone", direction: "DSI", service: "Administration" },
  ];

  // ---------- Rôles imposant le 2FA (financiers / terminaux / sensibles) ----------
  // Conforme PRD §8 / Archi §8 : SM MOA Finance & FRA, DFA, DF, DGA/DG + Admin.
  const MFA_ROLES = ["SM_DF", "DF", "DGA_DG", "ADMIN"];
  const requiresMfa = (user) => user.roles.some(r => MFA_ROLES.includes(r));

  // ---------- Helpers profil / personnalisation ----------
  // Circuit d'initiation rattaché au compte (un seul par compte en PROD).
  function initiatorCircuit(user) {
    if (!user) return null;
    const r = user.roles.find(rc => roleByCode[rc]?.type === "I");
    return r ? roleByCode[r].circuit : null;
  }
  // Espace par défaut selon le profil (atterrissage après authentification).
  function defaultRouteFor(user) {
    if (!user) return "home";
    const has = (t) => user.roles.some(rc => roleByCode[rc]?.type === t);
    if (user.roles.includes("ADMIN")) return "admin";
    if (user.roles.includes("SUPERVISEUR") || user.roles.includes("DF") || user.roles.includes("DGA_DG")) return "dashboard";
    if (has("C")) return "controle";
    if (has("V") || has("A")) return "corbeilles";
    return "home";   // initiateur
  }
  const directionLabel = (code) => DIRECTIONS[code] || code || "";

  // Personas pour la bascule de rôle (vue principale)
  const PERSONAS = [
    { id: "u_aya",   label: "Initiateur DOBB", desc: "Saisie B2B · Réclamation" },
    { id: "u_dxc",   label: "Initiateur DXC",  desc: "Saisie B2C" },
    { id: "u_dfinit", label: "Initiateur DF",  desc: "Saisie Wholesale" },
    { id: "u_jean",  label: "Vérificateur", desc: "Contrôle complétude" },
    { id: "u_marie", label: "Valideur",     desc: "Approbation / rejet" },
    { id: "u_df",    label: "Directeur Fin.", desc: "Validation montants élevés" },
    { id: "u_ctrl",  label: "Contrôleur",   desc: "Contrôle a posteriori" },
    { id: "u_sup",   label: "Superviseur",  desc: "Pilotage & KPI" },
    { id: "u_admin", label: "Administrateur", desc: "Configuration" },
  ];

  // ---------- Clients de démo ----------
  const CLIENTS_DXC = [
    { nom: "Kouassi Adjoua", compte: "B2C-4471902", formule: "Livebox Fibre 100M", numeroCase: "CASE-100231" },
    { nom: "Diallo Mamadou", compte: "B2C-3390215", formule: "Mobile Postpayé 50Go", numeroCase: "CASE-100244" },
    { nom: "Touré Aminata", compte: "B2C-5582100", formule: "Livebox ADSL Confort", numeroCase: "CASE-100258" },
  ];
  const CLIENTS_DOBB = [
    { nom: "SISdev Côte d'Ivoire", compte: "B2B-880142", formule: "Flotte mobile 120 lignes", numeroCase: "CASE-200417" },
    { nom: "Groupe AMARIS", compte: "B2B-771230", formule: "MPLS + Internet dédié 200M", numeroCase: "CASE-200431" },
    { nom: "Clinique Les Grâces", compte: "B2B-665401", formule: "Standard IP + Mobile", numeroCase: "CASE-200458" },
  ];
  const CLIENTS_DF = [
    { nom: "TELCO PARTNER SARL", compte: "WS-1142", formule: "Interconnexion voix internationale", numeroCase: "CASE-300112" },
    { nom: "NetLink Operator", compte: "WS-2208", formule: "Capacité transit IP 10G", numeroCase: "CASE-300128" },
  ];

  // ---------- Paramètres de calcul (configurables par l'Admin) ----------
  // Chaque taxe est activable et son taux paramétrable ; la ligne HT+TSC est affichable ou non.
  const CONFIG = {
    taxes: {
      tsc: { actif: true, taux: 0.03, label: "TSC", base: "ht" },          // base: ht
      tva: { actif: true, taux: 0.18, label: "TVA", base: "ht" },          // base: ht
    },
    afficherHtPlusTsc: true,   // ligne "HT + TSC" dans les récapitulatifs
    devise: "FCFA",
    // ---------- Calendrier métier des SLA (modèle de référence type GLPI) ----------
    // Les délais SLA sont décomptés en heures ouvrées : seuls les jours ouvrés et,
    // au sein de ceux-ci, les plages horaires de travail comptent. Les jours fériés
    // sont exclus. Entièrement paramétrable par l'Admin.
    calendrier: {
      joursOuvres: [1, 2, 3, 4, 5],          // 0=dim … 6=sam (lun→ven)
      heureDebut: 8,                          // début de journée ouvrée (8h00)
      heureFin: 18,                           // fin de journée ouvrée (18h00)
      feries: ["2026-01-01", "2026-04-06", "2026-05-01", "2026-08-07", "2026-08-15", "2026-11-01", "2026-12-25"],
    },
    // ---------- SLA de correction des demandes rejetées (paramétrable Admin) ----------
    // Pilote l'application d'un délai sur les dossiers rejetés à corriger/resoumettre.
    rejets: {
      slaActif: true,            // false → aucun SLA n'est appliqué aux rejets
      mode: "chaine",            // "chaine" = somme des SLA des étapes du circuit · "fixe" = délai unique
      delaiFixeH: 48,            // délai (heures ouvrées) utilisé quand mode = "fixe"
      heuresOuvrees: true,       // true → décompte en heures ouvrées · false → heures calendaires
      seuilAlerteH: 8,           // marge basse → bascule en alerte (orange) avant échéance
    },
  };

  // ---------- Univers FMI & facteurs de dégrèvement (réf. feuille KPI) ----------
  const UNIVERS = ["Fixe", "Mobile", "Internet"];
  const FACTEURS = [
    { key: "interne", label: "Interne / structurel" },
    { key: "externe", label: "Externe / conjoncturel" },
  ];

  // ---------- SLA de référence par profil (feuille « SLA » du workflow) ----------
  // En heures ouvrées. Appliqué à la matrice via les types de rôle.
  const SLA_REF = {
    VER_DOBB: 8, VER_DXC: 8, VER_DF: 8,                 // vérificateurs / responsables niveau 1
    RESP_DOBB: 8, RESP_DXC: 8, MRF_DXC: 8, MSRF_DXC: 8, // responsables / managers B2C : 8 h
    MGR_DOBB: 8, SM_DF: 8,                              // managers / managers seniors : 8 h
    DIR_DOBB: 24, DIR_DXC: 24,                          // directeurs : 24 h
    DF: 24, DGA_DG: 24,                                 // DF, DGA/DG : 24 h
    CTRL_N1: 240, CTRL_N2: 240,                         // fiabilisation / contrôle : 10 jours
  };
  const SLA_FRA = 48;                                   // profil FRA : 48 h
  // applique les SLA de référence à toutes les chaînes de la matrice
  Object.values(CIRCUITS).forEach(c => {
    (c.tranches || []).forEach(t => {
      (t.etapes || []).forEach(e => { if (SLA_REF[e.role] != null) e.sla = SLA_REF[e.role]; });
      if (t.parService) Object.values(t.parService).forEach(arr => arr.forEach(e => { if (SLA_REF[e.role] != null) e.sla = SLA_REF[e.role]; }));
    });
    (c.controle || []).forEach(e => { if (SLA_REF[e.role] != null) e.sla = SLA_REF[e.role]; });
  });

  // ---------- Registre clients (pré-remplissage par n° de compte) ----------
  // Indexé par n° de compte. Alimenté par les clients de démo + chaque nouvelle saisie.
  const CLIENT_REGISTRY = {};
  function registerClient(cl) {
    if (!cl || !cl.compte) return;
    CLIENT_REGISTRY[cl.compte.trim().toUpperCase()] = { nom: cl.nom, compte: cl.compte, formule: cl.formule || "" };
  }
  [...CLIENTS_DXC, ...CLIENTS_DOBB, ...CLIENTS_DF].forEach(registerClient);
  function findClient(compte) {
    if (!compte) return null;
    return CLIENT_REGISTRY[compte.trim().toUpperCase()] || null;
  }

  // ---------- Registre par N° de Case JADE ----------
  // Les infos client sont retrouvées par le N° de Case JADE (réf. de la réclamation).
  const CASE_REGISTRY = {};
  function registerCase(cl) {
    if (!cl || !cl.numeroCase) return;
    CASE_REGISTRY[cl.numeroCase.trim().toUpperCase()] = { nom: cl.nom, compte: cl.compte, formule: cl.formule || "" };
  }
  [...CLIENTS_DXC, ...CLIENTS_DOBB, ...CLIENTS_DF].forEach(registerCase);
  function findClientByCase(numeroCase) {
    if (!numeroCase) return null;
    return CASE_REGISTRY[numeroCase.trim().toUpperCase()] || null;
  }

  // ---------- Rôles effectivement définis dans la matrice de décision ----------
  // Seuls ces rôles (chaînes de validation + contrôle) sont proposés pour la composition
  // des processus et l'affectation des validateurs.
  function rolesInMatrix() {
    const set = new Set();
    Object.values(CIRCUITS).forEach(c => {
      (c.tranches || []).forEach(t => {
        (t.etapes || []).forEach(e => set.add(e.role));
        if (t.parService) Object.values(t.parService).forEach(arr => arr.forEach(e => set.add(e.role)));
      });
      (c.controle || []).forEach(e => set.add(e.role));
    });
    return set;
  }

  // ---------- Élagage : ne conserver que les rôles de la matrice (+ Initiateur + Admin) ----------
  // Toute la plateforme n'expose que les profils définis dans la matrice de décision ;
  // les rôles orphelins (hors chaîne de validation/contrôle) sont retirés. Le rôle ADMIN
  // et les profils Initiateur (point d'entrée du workflow) sont conservés.
  (function pruneRoles() {
    const inM = rolesInMatrix();
    const keep = (r) => inM.has(r.code) || r.type === "I" || r.code === "ADMIN";
    for (let i = ROLES.length - 1; i >= 0; i--) {
      if (!keep(ROLES[i])) { delete roleByCode[ROLES[i].code]; ROLES.splice(i, 1); }
    }
    // nettoie les rôles supprimés des utilisateurs et des personas
    USERS.forEach(u => { u.roles = u.roles.filter(rc => roleByCode[rc]); });
    for (let i = PERSONAS.length - 1; i >= 0; i--) {
      const u = USERS.find(x => x.id === PERSONAS[i].id);
      if (!u || u.roles.length === 0) PERSONAS.splice(i, 1);
    }
  })();

  window.PGD_DATA = {
    ROLES, roleByCode, CIRCUITS, MOTIFS, CANAUX, RESP_DIRECTION, RESP_SERVICE, USERS, PERSONAS, CONFIG,
    CLIENTS_DXC, CLIENTS_DOBB, CLIENTS_DF, MFA_ROLES, requiresMfa, rolesInMatrix,
    UNIVERS, FACTEURS, SLA_REF, SLA_FRA, LIBELLES, LIBELLES_DOBB, ITEMS_AJUSTEMENT, POINTS_CONTACT,
    DIRECTIONS, directionLabel, initiatorCircuit, defaultRouteFor,
    CLIENT_REGISTRY, registerClient, findClient, CASE_REGISTRY, registerCase, findClientByCase,
    userById: Object.fromEntries(USERS.map(u => [u.id, u])),
  };
})();
