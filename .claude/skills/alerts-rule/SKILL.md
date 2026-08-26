---
name: alerts-rule
description: Utiliser quand tu ajoutes, modifies ou déboguesune règle d'alerte — expiration de document, échéance de vidange, retard de contrat, fin d'essai. Explique comment ne pas casser l'idempotence et comment écrire le test à dates figées.
---

# Ajouter une règle d'alerte

Le moteur vit dans `core/alerts/`. Il est **pur** : ni React, ni Drizzle, ni `Date.now()`.
Il reçoit un instantané de données et une date de référence, il renvoie des alertes voulues.
C'est ce qui le rend testable à dates figées et rejouable.

## 1. La clé d'identité — le point où tout se joue

Une alerte est identifiée par :

```
(org_id, entity_type, entity_id, alert_type, threshold_key, period_key)
```

- `threshold_key` : le seuil franchi (`d-30`, `d-7`, `d-0`, `overdue`, `km-500`).
- `period_key` : **la période concernée** — la date d'échéance visée (`2027-03-14`) ou l'année
  (`2027`). C'est l'écart É5 du cahier des charges, et c'est un correctif : sans elle, une alerte
  « assurance J-30 » résolue ne pourrait plus jamais être réémise, y compris après renouvellement de
  la police. La démo tournerait, la deuxième année de production serait muette.

L'unicité est portée par un **index unique partiel** (`where deleted_at is null`), pas par le code :
relancer le job dix fois échoue dix fois sur le conflit et ne crée rien. C'est la seule garantie qui
survive à une exécution concurrente.

## 2. Écrire la règle

```ts
export const insuranceExpiry: AlertRule = {
  type: 'insurance.expiry',
  thresholds: ['d-30', 'd-14', 'd-7', 'd-1', 'd-0', 'overdue'],
  severity: 'critical',
  evaluate({ today, policies }) { /* renvoie des AlertDraft, ne touche à rien */ },
}
```

Règles de forme :

- La fonction ne lit **jamais** l'heure courante : elle reçoit `today` (date civile) en paramètre.
- Elle ne fait aucune écriture : elle renvoie des intentions, la persistance est ailleurs.
- Les seuils par défaut sont surchargeables par organisation via `alert_settings.thresholds_json`.

## 3. Les cas limites qu'on n'a pas le droit d'oublier

- **Vidange** : la règle se déclenche au **premier seuil atteint**, kilomètres OU temps. Le
  kilométrage projeté utilise la moyenne quotidienne réelle du véhicule sur 90 jours.
  - moins de 90 jours d'historique → moyenne de la flotte, et le libellé dit « estimation » ;
  - véhicule immobilisé (moyenne nulle) → **jamais de division par zéro**, jamais « dans 9999 jours » :
    on n'affiche que l'échéance en kilomètres ;
  - relevé kilométrique en recul → la saisie est refusée, pas corrigée en silence ;
  - intervalle modifié par le gérant → `next_due_*` recalculé, alertes existantes réévaluées et non
    dupliquées.
- **Vignette** : ce n'est pas une expiration glissante mais une **campagne annuelle** (É3).
  `period_key` = l'année. Après la fenêtre de paiement, l'état est « en infraction », de façon
  permanente jusqu'au paiement.
- **Carte grise** : aucune alerte. Elle n'expire pas au Maroc (É1).
- **Heures locales** : « fin de contrat à 8h » et le digest quotidien se calculent en
  `Africa/Casablanca` via `businessParts()`. Le Maroc repasse à **UTC+0 pendant le Ramadan** :
  un offset fixe ferait partir les alertes à 7h pendant six semaines par an.

## 4. Le test — à dates figées, obligatoire

```ts
const today = '2026-08-21'   // jamais new Date()
```

Il doit couvrir :

1. le franchissement de **chaque** seuil déclaré ;
2. l'**idempotence** : deux évaluations consécutives sur les mêmes données ne produisent qu'une
   alerte (et l'insertion en base rejoue sans créer de doublon) ;
3. la **récurrence** : après renouvellement du document, la même alerte peut réapparaître avec un
   nouveau `period_key` ;
4. au moins **une date en Ramadan**, pour la règle horaire.

## 5. Restitution

Une règle n'est pas finie tant qu'elle n'a pas : sa clé i18n dans les trois langues, sa sévérité,
son entrée dans le centre de notifications, et son comportement en mode démo
(`notifications.state = 'skipped_demo'` — enregistrée, jamais envoyée).
