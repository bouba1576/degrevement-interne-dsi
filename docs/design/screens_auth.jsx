/* ====================================================================
   PGD — Authentification AD/LDAP + double authentification (2FA/MFA)
   PGD-21b · scénario de recette T15. AD et 2FA simulés (bouchon) ;
   le parcours en deux étapes est démontré, les échecs sont journalisés.
   ==================================================================== */
const { useState: uSL, useEffect: uEL, useRef: uRL } = React;
const EL = window.PGD_ENGINE, DL = window.PGD_DATA;

/* Journal de sécurité (échecs / succès d'authentification) — en mémoire */
window.PGD_SECLOG = window.PGD_SECLOG || [];
function secLog(evt) { window.PGD_SECLOG.unshift({ ts: Date.now(), ...evt }); }

/* Code 2FA de démonstration — régénéré par session */
function genOtp() { return String(Math.floor(100000 + Math.random() * 900000)); }

/* ============================ ÉCRAN DE CONNEXION ============================ */
function PlatformIllustration() {
  return (
    <div style={{ width: "100%", maxWidth: 470, marginBottom: 28 }}>
      <svg viewBox="0 0 470 250" width="100%" style={{ display: "block" }} role="img" aria-label="Illustration de la plateforme de gestion des dégrèvements">
        <defs>
          <linearGradient id="pgGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#FF7900" /><stop offset="1" stopColor="#E8590C" />
          </linearGradient>
          <filter id="pgShadow" x="-20%" y="-20%" width="140%" height="160%">
            <feDropShadow dx="0" dy="10" stdDeviation="14" floodColor="#000" floodOpacity="0.28" />
          </filter>
        </defs>

        {/* blobs d'ambiance */}
        <ellipse cx="120" cy="120" rx="115" ry="100" fill="#4BB4E6" opacity="0.16" />
        <ellipse cx="350" cy="150" rx="110" ry="95" fill="#FF7900" opacity="0.14" />

        {/* circuit de validation (en arrière-plan) */}
        <g opacity="0.9">
          <path d="M250 70 H300 a14 14 0 0 1 14 14 V150 a14 14 0 0 0 14 14 H392" fill="none" stroke="#5a6573" strokeWidth="3" strokeDasharray="2 9" strokeLinecap="round" />
          {[[250,70],[314,108],[406,164]].map(([cx,cy],i)=>(
            <g key={i}>
              <circle cx={cx} cy={cy} r="15" fill={i===2?"url(#pgGrad)":"#1f2733"} stroke={i===2?"#FF7900":"#3a4654"} strokeWidth="2" />
              {i===2
                ? <path d={`M${cx-6} ${cy} l4 4 l8 -9`} fill="none" stroke="#000" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
                : <circle cx={cx} cy={cy} r="4.5" fill="#4BB4E6" />}
            </g>
          ))}
        </g>

        {/* fiche de dégrèvement (document principal) */}
        <g filter="url(#pgShadow)" transform="rotate(-5 150 130)">
          <rect x="70" y="56" width="190" height="150" rx="12" fill="#ffffff" />
          <rect x="70" y="56" width="190" height="34" rx="12" fill="url(#pgGrad)" />
          <rect x="70" y="78" width="190" height="12" fill="url(#pgGrad)" />
          <circle cx="90" cy="73" r="7" fill="#fff" opacity="0.9" />
          <path d="M86.5 73 l2.5 2.5 l4.5 -5" fill="none" stroke="#E8590C" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          <text x="104" y="78" fontSize="13" fontWeight="700" fill="#fff" fontFamily="Helvetica, Arial, sans-serif">Dégrèvement</text>
          {/* lignes de contenu */}
          <rect x="88" y="106" width="92" height="8" rx="4" fill="#cfd6de" />
          <rect x="88" y="122" width="140" height="8" rx="4" fill="#e3e8ed" />
          <rect x="88" y="138" width="120" height="8" rx="4" fill="#e3e8ed" />
          {/* montant */}
          <rect x="88" y="160" width="154" height="32" rx="8" fill="#FFF3E8" stroke="#FFD2A6" strokeWidth="1" />
          <text x="98" y="180" fontSize="10" fill="#9a4a00" fontFamily="Helvetica, Arial, sans-serif">TTC</text>
          <text x="234" y="181" fontSize="12.5" fontWeight="800" fill="#E8590C" textAnchor="end" fontFamily="Helvetica, Arial, sans-serif">3 872 000 F</text>
        </g>

        {/* badge "validé" estampillé */}
        <g transform="translate(330 60)" filter="url(#pgShadow)">
          <circle cx="0" cy="0" r="34" fill="#1f8a5b" />
          <circle cx="0" cy="0" r="34" fill="none" stroke="#fff" strokeWidth="2" opacity="0.5" />
          <path d="M-14 0 l9 9 l18 -20" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      </svg>
    </div>
  );
}

function LoginScreen({ onAuthenticated }) {
  const [step, setStep] = uSL(1);          // 1 = AD, 2 = 2FA
  const [login, setLogin] = uSL("aya.koffi");
  const [pwd, setPwd] = uSL("");
  const [err, setErr] = uSL("");
  const [pendingUser, setPendingUser] = uSL(null);
  const [otp, setOtp] = uSL("");
  const [otpErr, setOtpErr] = uSL("");
  const [demoCode, setDemoCode] = uSL(genOtp());
  const [tries, setTries] = uSL(0);

  function step1(e) {
    e && e.preventDefault();
    const u = DL.USERS.find(x => x.login === login.trim().toLowerCase());
    if (!u) { setErr("Identifiant AD inconnu. Utilisez un compte de démonstration ci-dessous."); secLog({ login, type: "AD", ok: false, motif: "Identifiant inconnu" }); return; }
    if (!pwd.trim()) { setErr("Mot de passe d'entreprise requis."); return; }
    setErr(""); secLog({ login: u.login, nom: u.nom, type: "AD", ok: true });
    // résolution des rôles via groupes AD GG-DGR-*
    if (DL.requiresMfa(u)) {
      setPendingUser(u); setDemoCode(genOtp()); setOtp(""); setOtpErr(""); setStep(2);
    } else {
      // 2FA non imposé pour ce niveau de rôle → session ouverte
      secLog({ login: u.login, nom: u.nom, type: "Session", ok: true, motif: "2FA non requis (niveau de rôle)" });
      onAuthenticated(u.id);
    }
  }
  function step2(e) {
    e && e.preventDefault();
    if (otp.trim() !== demoCode) {
      setTries(t => t + 1); setOtpErr("Code incorrect. Réessayez avec le code de démonstration affiché.");
      secLog({ login: pendingUser.login, nom: pendingUser.nom, type: "2FA", ok: false, motif: "Code erroné" });
      return;
    }
    secLog({ login: pendingUser.login, nom: pendingUser.nom, type: "2FA", ok: true });
    secLog({ login: pendingUser.login, nom: pendingUser.nom, type: "Session", ok: true });
    onAuthenticated(pendingUser.id);
  }

  return (
    <div style={{ minHeight: "100vh", display: "grid", gridTemplateColumns: "1fr 1fr", background: "#fff" }}>
      {/* Panneau marque */}
      <div style={{ background: "#000", color: "#fff", padding: "48px 52px", display: "flex", flexDirection: "column", justifyContent: "space-between", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", right: -80, bottom: -80, width: 380, height: 380, background: "var(--orange)", opacity: .1, borderRadius: 8, transform: "rotate(18deg)" }} />
        <div className="row gap-12" style={{ position: "relative" }}>
          <BrandMark size={46} />
          <div><b style={{ fontSize: 16, display: "block" }}>Orange Côte d'Ivoire</b><span style={{ fontSize: 11.5, color: "var(--g400)", textTransform: "uppercase", letterSpacing: ".1em" }}>DSI · AIP</span></div>
        </div>
        <div style={{ position: "relative" }}>
          <PlatformIllustration />
          <h1 style={{ fontSize: 34, lineHeight: 1.1, letterSpacing: "-.02em", maxWidth: 440 }}>Plateforme de Gestion des Dégrèvements</h1>
          <p style={{ color: "var(--g300)", fontSize: 14.5, marginTop: 14, maxWidth: 400, lineHeight: 1.5 }}>
            Saisie multi-circuit, routage automatique, corbeilles partagées et traçabilité complète des décisions de dégrèvement.</p>
          <div className="col gap-16" style={{ marginTop: 24, maxWidth: 410 }}>
            {[
              { ic: "edit", t: "Saisie & routage automatisés", s: "Fiches DOBB, DXC et Wholesale calculées et orientées par les règles." },
              { ic: "inbox", t: "Corbeilles partagées", s: "Affectation par rôle, claim/unclaim, aucun blocage en cas d'absence." },
              { ic: "shield", t: "Traçabilité & contrôle", s: "Journal d'audit horodaté, contrôle a posteriori, conformité SOX." },
            ].map(b => (
              <div className="row gap-12" key={b.ic} style={{ alignItems: "flex-start" }}>
                <div style={{ width: 38, height: 38, borderRadius: 9, flexShrink: 0, display: "grid", placeItems: "center", background: "rgba(255,121,0,.16)", color: "var(--orange)", border: "1px solid rgba(255,121,0,.3)" }}>
                  <Icon name={b.ic} size={19} />
                </div>
                <div><div style={{ fontWeight: 700, fontSize: 13.5 }}>{b.t}</div><div style={{ color: "var(--g400)", fontSize: 12, lineHeight: 1.4 }}>{b.s}</div></div>
              </div>
            ))}
          </div>
          <div className="row gap-8" style={{ marginTop: 22, flexWrap: "wrap" }}>
            {["DOBB · B2B", "DXC · B2C", "DF · Wholesale"].map(t =>
              <span key={t} style={{ border: "1px solid rgba(255,255,255,.2)", borderRadius: 999, padding: "5px 12px", fontSize: 12, fontWeight: 600, whiteSpace: "nowrap" }}>{t}</span>)}
          </div>
        </div>
        <div className="row gap-8" style={{ position: "relative", color: "var(--g500)", fontSize: 11.5, alignItems: "center" }}>
          <Icon name="lock" size={13} /> MVP — authentification AD/LDAP & 2FA simulées · accès RBAC effectif
        </div>
      </div>

      {/* Panneau formulaire */}
      <div style={{ display: "grid", placeItems: "center", padding: 40 }}>
        <div style={{ width: "100%", maxWidth: 380 }}>
          {/* fil d'étapes */}
          <div className="row gap-8 mb-24">
            <StepPip n={1} active={step === 1} done={step > 1} label="Compte AD" />
            <div style={{ flex: 1, height: 2, background: step > 1 ? "var(--green)" : "var(--g200)", alignSelf: "center" }} />
            <StepPip n={2} active={step === 2} done={false} label="2FA" />
          </div>

          {step === 1 ? (
            <form onSubmit={step1}>
              <div style={{ width: 48, height: 48, borderRadius: 12, background: "var(--orange-50)", color: "var(--orange-600)", display: "grid", placeItems: "center", marginBottom: 16 }}><Icon name="user" size={24} /></div>
              <h2 style={{ fontSize: 22, marginBottom: 4 }}>Connexion</h2>
              <p className="muted" style={{ fontSize: 13, marginBottom: 22 }}>Identifiez-vous avec votre compte Active Directory d'entreprise.</p>
              {err && <div className="alert alert-red mb-16"><Icon name="alert" size={15} />{err}</div>}
              <Field label="Identifiant AD">
                <div className="input-addon">
                  <span style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}><Icon name="user" size={16} color="var(--g500)" /></span>
                  <input className="input" value={login} onChange={e => setLogin(e.target.value)} placeholder="prenom.nom" style={{ paddingLeft: 36, paddingRight: 92 }} autoFocus />
                  <span className="suffix">@orange.ci</span>
                </div>
              </Field>
              <Field label="Mot de passe d'entreprise" hint="Simulé — toute valeur non vide est acceptée pour la démo.">
                <div className="input-addon">
                  <span style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}><Icon name="lock" size={16} color="var(--g500)" /></span>
                  <input className="input" type="password" value={pwd} onChange={e => setPwd(e.target.value)} placeholder="••••••••" style={{ paddingLeft: 36 }} />
                </div>
              </Field>
              <button className="btn btn-primary btn-lg btn-block mt-8" type="submit"><Icon name="arrowRight" size={16} /> Continuer</button>
              <DemoAccounts onPick={(u) => { setLogin(u.login); setPwd("orange"); setErr(""); }} />
            </form>
          ) : (
            <form onSubmit={step2}>
              <button type="button" className="btn-link mb-16" onClick={() => { setStep(1); setOtpErr(""); }}><Icon name="arrowLeft" size={13} /> Retour</button>
              <div style={{ width: 48, height: 48, borderRadius: 12, background: "var(--orange-50)", color: "var(--orange-600)", display: "grid", placeItems: "center", marginBottom: 16 }}><Icon name="shield" size={24} /></div>
              <h2 style={{ fontSize: 22, marginBottom: 4 }}>Double authentification</h2>
              <p className="muted" style={{ fontSize: 13, marginBottom: 18 }}>
                Rôle à pouvoir financier/terminal — second facteur requis pour <b>{pendingUser.nom}</b>.</p>
              <div className="alert alert-orange mb-16"><Icon name="shield" size={16} />
                <div><b>Code de démonstration : <span className="mono" style={{ fontSize: 15 }}>{demoCode}</span></b>
                  <div className="tiny">En production : code à usage unique via application d'authentification, e-mail ou SMS.</div></div></div>
              {otpErr && <div className="alert alert-red mb-16"><Icon name="alert" size={15} />{otpErr}{tries >= 2 && <span> Échecs journalisés ({tries}).</span>}</div>}
              <Field label="Code à usage unique (6 chiffres)" error={null}>
                <div className="input-addon">
                  <span style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}><Icon name="lock" size={16} color="var(--g500)" /></span>
                  <input className={"input mono" + (otpErr ? " err" : "")} value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="------" maxLength={6} style={{ fontSize: 22, letterSpacing: ".4em", textAlign: "center", paddingLeft: 36 }} autoFocus />
                </div>
              </Field>
              <button className="btn btn-primary btn-lg btn-block mt-8" type="submit"><Icon name="check" size={16} /> Vérifier & ouvrir la session</button>
              <div className="tiny muted center mt-16 row gap-6" style={{ justifyContent: "center" }}><Icon name="shield" size={13} /> Chaque tentative (succès ou échec) est inscrite au journal de sécurité.</div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
function StepPip({ n, active, done, label }) {
  return <div className="row gap-8">
    <div className="step-dot" style={{ width: 28, height: 28, background: done ? "var(--green)" : active ? "var(--orange)" : "#fff",
      borderColor: done ? "var(--green)" : active ? "var(--orange)" : "var(--g300)", color: done || active ? (active && !done ? "#000" : "#fff") : "var(--g500)" }}>
      {done ? <Icon name="check" size={14} stroke={3} /> : n}</div>
    <span style={{ fontSize: 12.5, fontWeight: 700, color: active || done ? "var(--ink)" : "var(--g500)" }}>{label}</span>
  </div>;
}
function DemoAccounts({ onPick }) {
  const [open, setOpen] = uSL(false);
  return <div style={{ marginTop: 22, borderTop: "1px solid var(--g100)", paddingTop: 16 }}>
    <button type="button" className="row gap-8" onClick={() => setOpen(o => !o)} style={{ border: "none", background: "none", cursor: "pointer", width: "100%", color: "var(--g700)", fontWeight: 600, fontSize: 12.5 }}>
      <Icon name="users" size={15} /> Comptes de démonstration <Icon name={open ? "chevronD" : "chevronR"} size={14} style={{ marginLeft: "auto" }} />
    </button>
    {open && <div className="col gap-6" style={{ marginTop: 10 }}>
      {DL.PERSONAS.map(p => { const u = DL.userById[p.id]; const mfa = DL.requiresMfa(u);
        return <button key={p.id} type="button" className="fileitem" style={{ cursor: "pointer", textAlign: "left" }} onClick={() => onPick(u)}>
          <Avatar user={u} size={28} />
          <div style={{ flex: 1 }}><div style={{ fontWeight: 600, fontSize: 12.5 }}>{p.label} · {u.nom}</div><div className="tiny muted mono">{u.login}</div></div>
          {mfa ? <span className="badge b-orange" style={{ fontSize: 10 }}>2FA</span> : <span className="badge b-grey" style={{ fontSize: 10 }}>simple</span>}
        </button>; })}
    </div>}
  </div>;
}

/* ============================ CHALLENGE MFA (bascule de rôle) ============================ */
function MfaChallenge({ user, onOk, onClose }) {
  const [code] = uSL(genOtp());
  const [val, setVal] = uSL(""); const [err, setErr] = uSL("");
  function check(e) {
    e && e.preventDefault();
    if (val.trim() !== code) { setErr("Code incorrect."); secLog({ login: user.login, nom: user.nom, type: "2FA", ok: false, motif: "Re-challenge bascule" }); return; }
    secLog({ login: user.login, nom: user.nom, type: "2FA", ok: true, motif: "Bascule de rôle" }); onOk();
  }
  return <Modal title="Double authentification requise" icon="shield" onClose={onClose}
    footer={<><button className="btn btn-ghost" onClick={onClose}>Annuler</button><button className="btn btn-primary" onClick={check}><Icon name="check" size={15} /> Valider</button></>}>
    <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>Le rôle <b>{user.nom}</b> a un pouvoir financier/terminal : un second facteur est exigé avant la bascule.</p>
    <div className="alert alert-orange mb-16"><Icon name="shield" size={16} /><div><b>Code de démonstration : <span className="mono">{code}</span></b></div></div>
    <form onSubmit={check}><Field label="Code à usage unique" error={err || null}>
      <input className={"input mono" + (err ? " err" : "")} value={val} onChange={e => { setVal(e.target.value.replace(/\D/g, "").slice(0, 6)); setErr(""); }}
        maxLength={6} placeholder="------" style={{ fontSize: 20, letterSpacing: ".4em", textAlign: "center" }} autoFocus /></Field></form>
  </Modal>;
}

Object.assign(window, { LoginScreen, MfaChallenge, secLog });
