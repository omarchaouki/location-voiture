---
name: tenant-safety
description: Utiliser quand tu touches à la base, à un repository, à une server function ou à quoi que ce soit qui lit ou écrit des données de client. Checklist de cloisonnement à passer avant tout commit.
---

# Cloisonnement — checklist avant commit

## Pourquoi c'est la règle qui prime

Tant que le projet est sur SQLite, **aucun RLS ne protège les données**. La seule barrière entre
l'organisation A et l'organisation B est la couche repository. Une requête qui oublie le `orgId`
n'échoue pas : elle renvoie les données du voisin, silencieusement.
(Contexte complet : `docs/DECISIONS.md` §4 et §6.)

## La checklist

1. **Le `orgId` vient-il de la session ?** Il se lit sur `session.activeOrganizationId`, jamais d'un
   paramètre d'URL, d'un champ de formulaire ou d'un en-tête. Un `orgId` dans une charge utile doit
   être **ignoré**, pas validé — `forOrg().insert()` l'écrase déjà.
2. **Y a-t-il une signature sans `TenantContext` ?** Si oui, elle est fausse. Aucune fonction de
   repository n'accepte de requête sans contexte, et aucune ne doit rendre le contexte optionnel.
3. **Un `db.select(` apparaît-il hors de `src/db/repositories/` ?** Si oui, déplace-le.
4. **Une requête écrite à la main applique-t-elle `eq(orgId)` ET `isNull(deletedAt)` ?** Préfère
   `base.list(where)`, qui les applique pour toi. Deux clients peuvent avoir la même plaque, le même
   numéro de contrat, le même nom de client.
5. **La ressource introuvable renvoie-t-elle 404 et non 403 ?** `throw notFound()`. Un 403 révèle
   l'existence de la ressource, donc du client.
6. **Les identifiants d'URL sont-ils des UUID ?** Jamais d'entier séquentiel.
7. **L'écriture est-elle refusée quand elle doit l'être ?** `assertCanWrite(ctx)` couvre :
   impersonation non élevée, abonnement en lecture seule, rôle `viewer`, organisation suspendue.
8. **La nouvelle table est-elle vue par le registre ?** `tests/unit/tenant-isolation.test.ts` déduit
   la liste du schéma : toute table portant `id` + `org_id` + `deleted_at` y entre automatiquement.
   Si elle n'y entre pas, c'est que la table n'est pas cloisonnée — corrige la table, pas le test.
9. **L'action est-elle tracée ?** Contrats, cautions, prix, suppressions, changements de plan et
   impersonation vont dans `audit_log`.

## Vérification

```
pnpm test tenant-isolation
```

Les six familles de test tournent sur **chaque** table cloisonnée : lecture croisée, modification
croisée, suppression croisée, `orgId` injecté dans la charge utile, soft delete + restauration,
refus d'écriture en lecture seule.

## Ce que ça ne couvre pas encore

- **La concurrence.** SQLite n'a qu'un écrivain : les doubles insertions et les doubles décomptes de
  quota ne se reproduisent pas en développement. Ils apparaîtront après la bascule Postgres.
- **Le RLS.** Prévu à la fin de la Phase 2 : rôle Postgres sans `BYPASSRLS`, transaction ouverte par
  `set_config('app.org_id', …, true)`, policies `using (org_id = current_setting('app.org_id', true))`.
  `withTenant()` existe déjà et est appelé partout pour que ce jour-là il n'y ait rien à réécrire.
