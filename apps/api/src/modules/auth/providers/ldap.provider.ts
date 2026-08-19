import { Injectable, Logger } from "@nestjs/common";
import ldap, { type Client, type SearchEntry } from "ldapjs";
import { loadEnv } from "@pgd/config";
import type { LdapPort, ResultatAuthentificationAd, UtilisateurAd } from "../ports/ldap.port";

// Implémentation réelle (SF-PGD-001) — bind LDAP/LDAPS effectif, pas de
// simulation. Double bind : (1) le compte de service cherche le DN de
// l'utilisateur, (2) un bind sur CE DN avec le mot de passe fourni est la
// vérification réelle des identifiants (LDAP ne fournit pas d'API de
// "vérification de mot de passe" séparée — le bind EST la vérification).
@Injectable()
export class LdapProvider implements LdapPort {
  private readonly logger = new Logger(LdapProvider.name);

  async authentifier(identifiantAd: string, motDePasse: string): Promise<ResultatAuthentificationAd> {
    const env = loadEnv();
    const serviceClient = this.creerClient(env.LDAP_URL);

    try {
      await this.bind(serviceClient, env.LDAP_BIND_DN, env.LDAP_BIND_PASSWORD);

      const entree = await this.rechercherUtilisateur(serviceClient, env.LDAP_BASE_DN, identifiantAd);
      // Jamais de codeEchec/messageEchec ici — un bind LDAP échoué n'a pas de
      // détail structuré comparable à celui de l'API AD réelle (cf. ldap.port.ts).
      if (!entree) return { statut: "ECHEC" };

      const userClient = this.creerClient(env.LDAP_URL);
      try {
        await this.bind(userClient, entree.dn.toString(), motDePasse);
      } catch {
        return { statut: "ECHEC" };
      } finally {
        userClient.unbind();
      }

      const groupes = await this.rechercherGroupes(serviceClient, env.LDAP_BASE_DN, entree.dn.toString());
      const nom = this.attribut(entree, "cn") ?? identifiantAd;

      return { statut: "AUTHENTIFIE", utilisateur: { identifiantAd, nom, groupes } };
    } catch (erreur) {
      this.logger.warn(`Échec LDAP pour ${identifiantAd} : ${(erreur as Error).message}`);
      return { statut: "ECHEC" };
    } finally {
      serviceClient.unbind();
    }
  }

  // Pré-enregistrement (analyse du 12/08/2026) — recherche par filtre partiel
  // sur cn/mail, les seuls attributs réellement présents dans l'annuaire
  // (uid/cn/sn/givenName/mail — vérifié contre docker/openldap/seed.ldif,
  // aucun displayName). `sizeLimit` borne un joker large (`cn=*a*`) qui
  // matcherait autrement tout l'annuaire. Groupes résolus pour affichage
  // informatif — jamais utilisés pour dériver un rôle (décision actée,
  // CLAUDE.md « Pré-enregistrement des utilisateurs AD »).
  async rechercher(motCle: string): Promise<UtilisateurAd[]> {
    const env = loadEnv();
    const client = this.creerClient(env.LDAP_URL);
    try {
      await this.bind(client, env.LDAP_BIND_DN, env.LDAP_BIND_PASSWORD);
      const entrees = await this.rechercherEntrees(client, env.LDAP_BASE_DN, motCle);
      const resultats: UtilisateurAd[] = [];
      for (const entree of entrees) {
        const mail = this.attribut(entree, "mail");
        if (!mail) continue;
        const groupes = await this.rechercherGroupes(client, env.LDAP_BASE_DN, entree.dn.toString());
        resultats.push({ identifiantAd: mail, nom: this.attribut(entree, "cn") ?? mail, groupes });
      }
      return resultats;
    } catch (erreur) {
      this.logger.warn(`Échec de la recherche annuaire pour « ${motCle} » : ${(erreur as Error).message}`);
      return [];
    } finally {
      client.unbind();
    }
  }

  async estDisponible(): Promise<boolean> {
    const env = loadEnv();
    const client = this.creerClient(env.LDAP_URL);
    try {
      await this.bind(client, env.LDAP_BIND_DN, env.LDAP_BIND_PASSWORD);
      return true;
    } catch {
      return false;
    } finally {
      client.unbind();
    }
  }

  private creerClient(url: string): Client {
    return ldap.createClient({ url, timeout: 5000, connectTimeout: 5000 });
  }

  private bind(client: Client, dn: string, mdp: string): Promise<void> {
    return new Promise((resolve, reject) => {
      client.bind(dn, mdp, (erreur) => (erreur ? reject(erreur) : resolve()));
    });
  }

  private rechercherUtilisateur(
    client: Client,
    baseDn: string,
    identifiantAd: string
  ): Promise<SearchEntry | null> {
    return new Promise((resolve, reject) => {
      let trouve: SearchEntry | null = null;
      client.search(
        `ou=users,${baseDn}`,
        { scope: "sub", filter: `(mail=${this.echapper(identifiantAd)})` },
        (erreur, res) => {
          if (erreur) return reject(erreur);
          res.on("searchEntry", (entree) => {
            trouve = entree;
          });
          res.on("error", (err) => reject(err));
          res.on("end", () => resolve(trouve));
        }
      );
    });
  }

  // Distinct de rechercherUtilisateur() : plusieurs résultats possibles
  // (joker), jamais un seul DN attendu pour un bind ultérieur.
  private rechercherEntrees(client: Client, baseDn: string, motCle: string): Promise<SearchEntry[]> {
    return new Promise((resolve, reject) => {
      const trouvees: SearchEntry[] = [];
      const motCleEchappe = this.echapper(motCle);
      client.search(
        `ou=users,${baseDn}`,
        { scope: "sub", filter: `(|(cn=*${motCleEchappe}*)(mail=*${motCleEchappe}*))`, sizeLimit: 20 },
        (erreur, res) => {
          if (erreur) return reject(erreur);
          res.on("searchEntry", (entree) => {
            trouvees.push(entree);
          });
          res.on("error", (err) => reject(err));
          res.on("end", () => resolve(trouvees));
        }
      );
    });
  }

  private rechercherGroupes(client: Client, baseDn: string, userDn: string): Promise<string[]> {
    return new Promise((resolve, reject) => {
      const groupes: string[] = [];
      client.search(
        `ou=groups,${baseDn}`,
        { scope: "sub", filter: `(member=${this.echapper(userDn)})` },
        (erreur, res) => {
          if (erreur) return reject(erreur);
          res.on("searchEntry", (entree) => {
            const cn = this.attribut(entree, "cn");
            if (cn) groupes.push(cn);
          });
          res.on("error", (err) => reject(err));
          res.on("end", () => resolve(groupes));
        }
      );
    });
  }

  private attribut(entree: SearchEntry, nom: string): string | undefined {
    const attr = entree.attributes.find((a) => a.type === nom);
    const valeur = attr?.values?.[0];
    return typeof valeur === "string" ? valeur : undefined;
  }

  // Neutralise les métacaractères de filtre LDAP (RFC 4515) — l'identifiant
  // vient de l'utilisateur, jamais interpolé tel quel dans un filtre.
  private echapper(valeur: string): string {
    return valeur.replace(/[\\*()\0]/g, (car) => `\\${car.charCodeAt(0).toString(16).padStart(2, "0")}`);
  }
}
