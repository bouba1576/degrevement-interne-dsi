import { ConflictException, Inject, Injectable, NotFoundException, UnprocessableEntityException } from "@nestjs/common";
import { Prisma } from "@pgd/database";
import type {
  AnnuaireResultat,
  ModifierUtilisateurAdminRequete,
  PreEnregistrerUtilisateurRequete,
  UtilisateurAdminVue
} from "@pgd/contracts";
import { PrismaService } from "../../../infra/prisma/prisma.service";
import { LDAP_PORT, type LdapPort } from "../../auth/ports/ldap.port";

type UtilisateurAvecRelations = Prisma.UtilisateurGetPayload<{
  include: { membresRole: { include: { role: true } }; direction: true; service: true; sousFlux: true };
}>;

const INCLUSION_COMPLETE = {
  membresRole: { include: { role: true } },
  direction: true,
  service: true,
  sousFlux: true
} as const;

// Pré-enregistrement des utilisateurs AD (analyse + conception du
// 12/08/2026, CLAUDE.md « Pré-enregistrement des utilisateurs AD ») —
// Temps 1 (additif, faible risque) : ce service ne touche jamais le flux de
// connexion (AuthController.login/RbacResolutionService), il construit
// seulement la donnée que ce flux lira une fois le Temps 2 câblé.
@Injectable()
export class AdminUtilisateursService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(LDAP_PORT) private readonly ldap: LdapPort
  ) {}

  // Longueur minimale pour éviter un joker LDAP quasi-vide (`cn=*a*`) qui
  // matcherait une part significative de l'annuaire — LdapProvider borne
  // déjà le nombre de résultats (sizeLimit), ceci évite l'aller-retour inutile.
  async rechercherAnnuaire(motCle: string): Promise<AnnuaireResultat[]> {
    const nettoye = motCle.trim();
    if (nettoye.length < 2) {
      throw new UnprocessableEntityException({
        code: "RECHERCHE_TROP_COURTE",
        message: "Saisissez au moins 2 caractères."
      });
    }
    const resultats = await this.ldap.rechercher(nettoye);
    return resultats.map((r) => ({ identifiantAd: r.identifiantAd, nom: r.nom, groupesAd: r.groupes }));
  }

  // Pré-enregistrés seulement (≥1 MembreRole) — même condition que celle qui
  // gouvernera le refus à la connexion (Temps 2), pas une coïncidence : cette
  // liste doit refléter exactement « qui peut se connecter » une fois le
  // Temps 2 en place.
  async lister(): Promise<UtilisateurAdminVue[]> {
    const utilisateurs = await this.prisma.utilisateur.findMany({
      where: { membresRole: { some: {} } },
      include: INCLUSION_COMPLETE,
      orderBy: { nom: "asc" }
    });
    return utilisateurs.map((u) => this.versVue(u));
  }

  async trouver(id: string): Promise<UtilisateurAdminVue> {
    const utilisateur = await this.prisma.utilisateur.findUnique({
      where: { id },
      include: INCLUSION_COMPLETE
    });
    if (!utilisateur) {
      throw new NotFoundException({ code: "UTILISATEUR_INTROUVABLE", message: "Utilisateur introuvable." });
    }
    return this.versVue(utilisateur);
  }

  async creer(dto: PreEnregistrerUtilisateurRequete): Promise<UtilisateurAdminVue> {
    await this.validerRoles(dto.roles);

    const existant = await this.prisma.utilisateur.findUnique({ where: { identifiantAd: dto.identifiantAd } });
    if (existant) {
      throw new ConflictException({
        code: "UTILISATEUR_DEJA_PRESENT",
        message: "Un compte existe déjà pour cet identifiant — utilisez la modification."
      });
    }

    const cree = await this.prisma.$transaction(async (tx) => {
      const utilisateur = await tx.utilisateur.create({
        data: {
          identifiantAd: dto.identifiantAd,
          nom: dto.nom,
          directionId: dto.directionId,
          serviceId: dto.serviceId,
          sousFluxId: dto.sousFluxId,
          mfaMethode: dto.mfaMethode
        }
      });
      await tx.membreRole.createMany({
        data: dto.roles.map((roleCode) => ({ utilisateurId: utilisateur.id, roleCode }))
      });
      return tx.utilisateur.findUniqueOrThrow({
        where: { id: utilisateur.id },
        include: INCLUSION_COMPLETE
      });
    });
    return this.versVue(cree);
  }

  // `roles`, si fourni, remplace l'ensemble complet — même convention que
  // les pièces d'un motif ou les étapes d'un palier (AdminMotifsService/
  // AdminPaliersService), pas une fusion partielle.
  async modifier(id: string, dto: ModifierUtilisateurAdminRequete): Promise<UtilisateurAdminVue> {
    await this.trouver(id);
    if (dto.roles) await this.validerRoles(dto.roles);

    const modifie = await this.prisma.$transaction(async (tx) => {
      await tx.utilisateur.update({
        where: { id },
        data: {
          nom: dto.nom,
          directionId: dto.directionId,
          serviceId: dto.serviceId,
          sousFluxId: dto.sousFluxId,
          mfaMethode: dto.mfaMethode,
          actif: dto.actif
        }
      });
      if (dto.roles) {
        await tx.membreRole.deleteMany({ where: { utilisateurId: id } });
        await tx.membreRole.createMany({ data: dto.roles.map((roleCode) => ({ utilisateurId: id, roleCode })) });
      }
      return tx.utilisateur.findUniqueOrThrow({
        where: { id },
        include: INCLUSION_COMPLETE
      });
    });
    return this.versVue(modifie);
  }

  private async validerRoles(codes: string[]): Promise<void> {
    const trouves = await this.prisma.role.findMany({ where: { code: { in: codes } }, select: { code: true } });
    const inconnus = codes.filter((c) => !trouves.some((t) => t.code === c));
    if (inconnus.length > 0) {
      throw new UnprocessableEntityException({
        code: "ROLE_INCONNU",
        message: `Rôle(s) inconnu(s) : ${inconnus.join(", ")}.`
      });
    }
  }

  private versVue(u: UtilisateurAvecRelations): UtilisateurAdminVue {
    return {
      id: u.id,
      identifiantAd: u.identifiantAd,
      nom: u.nom,
      matricule: u.matricule,
      actif: u.actif,
      mfaMethode: u.mfaMethode,
      directionId: u.directionId,
      directionLibelle: u.direction?.libelle ?? null,
      serviceId: u.serviceId,
      serviceLibelle: u.service?.libelle ?? null,
      sousFluxId: u.sousFluxId,
      sousFluxLibelle: u.sousFlux?.libelle ?? null,
      roles: u.membresRole.map((m) => ({ code: m.role.code, libelle: m.role.libelle }))
    };
  }
}
