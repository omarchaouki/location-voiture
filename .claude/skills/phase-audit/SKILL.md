---
name: phase-audit
description: Utiliser à la fin de chaque phase du projet, avant de vider le contexte, ou quand on demande un rapport de phase ou une auto-évaluation. Donne le protocole exact des 12 critères, la boucle de correction et la forme du rapport.
---

# Protocole d'auto-évaluation de fin de phase

À exécuter **spontanément**, sans qu'on le demande. Résultat écrit dans `docs/AUDIT.md`, avant de
vider le contexte, pour que la session suivante reprenne le fil sans l'utilisateur.

## Préalable — la phase est-elle réellement finie ?

```
pnpm typecheck && pnpm lint && pnpm test && pnpm check:hardcoded && pnpm check:tokens && pnpm build
```

Si l'une échoue, la phase n'est pas finie : on corrige, on ne note pas.

## Les 12 critères

Une note sur 5 par critère, **chaque note justifiée en une phrase et appuyée par une preuve**
(chemin de fichier, sortie de commande, capture). Un critère sans objet se marque `s.o.` avec la
raison — le noter quand même serait de l'autosatisfaction.

1. Exactitude métier — est-ce le travail réel d'un loueur marocain ?
2. Exactitude technique — APIs réellement existantes, vérifiées dans les types installés.
3. **Cloisonnement multi-tenant** — prouvé par test, pas supposé.
4. Portabilité vers Postgres — les 8 règles respectées à 100 %.
5. Fiabilité du moteur d'alertes — cas limites, aucun doublon, idempotence prouvée.
6. **Facturation** — quotas côté serveur, webhooks idempotents, état cohérent après rejeu.
7. Qualité de l'arabe et du RTL — parcours complet sans casse, aucune chaîne en dur.
8. Singularité du design — cette interface pourrait-elle être celle de n'importe quel produit ?
9. États de chargement — pas de clignotement, pas de décalage, pas de squelette abusif.
10. Accessibilité et mobile — clavier, contraste mesuré, usage à une main à 360 px.
11. Performance — première interaction, taille du bundle, requêtes N+1, index présents.
12. Honnêteté — tout stub déclaré comme tel, tout contenu marketing réel.

## La boucle

Toute note sous 4 déclenche une correction immédiate puis une nouvelle notation.
**Trois itérations maximum.** Si un critère reste sous 4 après trois tours : on arrête de tourner en
rond, on l'écrit, et on propose **deux options tranchées** avec une recommandation.

## La forme du rapport

Le rapport se termine par trois sections courtes, dans cet ordre :

- **Ce qui marche vraiment (vérifié)** — uniquement ce qui a été exécuté ou regardé.
- **Ce qui est fragile** — les vraies faiblesses, nommées.
- **Ce que je ferais différemment** — y compris les erreurs de méthode.

Pas d'autosatisfaction, pas de liste d'emojis, pas de « ✅ terminé ». Un défaut trouvé et écrit vaut
mieux qu'un rapport propre.

## Rappels utiles

- Une preuve est une commande dont la sortie est collée, ou un chemin `fichier:ligne`.
- « Regardé » veut dire ouvert dans le navigateur, en clair et en sombre, en `fr` et en `ar`, à
  360 px et à 1440 px. Sans cela, l'interface n'a pas été vérifiée, elle a été supposée.
- Les stubs restants se listent dans le rapport, pas seulement en `TODO` dans le code.
