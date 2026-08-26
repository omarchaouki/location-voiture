# DOMAIN.md — Modèle de domaine

Version **0.1 — Phase 0**, rédigée avant toute ligne de code, comme demandé.
Date : **2026-08-21**. Toute modification ultérieure passe par une entrée dans `DECISIONS.md`.

Les noms de tables et de colonnes sont en anglais (`snake_case`), les types sont donnés dans la
notation portable définie en §1, et non dans un dialecte SQL. Le vocabulaire métier est expliqué
au §9 pour que les décisions restent lisibles dans six mois.

---

## 1. Règles transverses

Elles s'appliquent à **toutes** les tables, sans exception. Elles ne sont pas des conventions :
elles sont implémentées dans les constructeurs de colonnes de `src/db/schema/_columns.ts`, seul
endroit du projet qui connaît le dialecte.

### 1.1 Colonnes obligatoires

| Colonne | Type portable | Règle |
|---|---|---|
| `id` | `text` | UUID v4 **généré par l'application**, jamais d'auto-incrément, jamais exposé autrement qu'en UUID dans les URL |
| `org_id` | `text` | référence `organizations.id`. **La colonne la plus importante du projet.** Voir §1.6 |
| `created_at` | `text` | ISO-8601 UTC, `YYYY-MM-DDTHH:mm:ss.sssZ`, longueur fixe |
| `updated_at` | `text` | idem, mis à jour par la couche repository, jamais par un trigger |
| `deleted_at` | `text \| null` | soft delete. `null` = vivant. **Aucune requête de lecture ne l'oublie** |

Trois tables échappent à `org_id` parce qu'elles sont **au-dessus** des organisations :
`organizations`, `users`, `plans`. `plan_features` porte `plan_id`, pas `org_id`.
`audit_log` porte `org_id` **nullable** : une action de `platform_owner` peut ne viser aucune
organisation.

### 1.2 Argent

`*_minor` en **entier**, en unité mineure (centimes), plus `currency` en `text` (`MAD` par défaut).
Jamais de flottant, jamais de `REAL`, jamais de division avant l'affichage. Le formatage est
centralisé dans `formatMoney(minor, currency, locale)`. Une ligne qui porte un montant porte sa
devise : une agence qui facture un client européen en euros doit rester possible sans migration.

### 1.3 Dates : trois types distincts, à ne jamais confondre

| Suffixe | Sens | Exemple |
|---|---|---|
| `*_at` | **instant** précis, ISO-8601 UTC | `created_at`, `checked_out_at` |
| `*_on` | **date civile**, `YYYY-MM-DD`, sans heure ni fuseau | `insurance.expires_on`, `licence_expires_on` |
| `*_date_key` | clé de regroupement journalier, `YYYY-MM-DD` en heure locale de l'organisation | agrégats de kilométrage |

Une assurance n'expire pas à un instant, elle expire **un jour**. Stocker `expires_on` en instant
UTC provoquerait un décalage d'un jour selon le fuseau du lecteur — sur un produit dont le cœur est
l'échéance, c'est une faute.

**Piège de fuseau propre au Maroc, à traiter et non à ignorer.** Le Maroc est à UTC+1 toute
l'année, **mais revient à UTC+0 pendant le mois de Ramadan**, dont les dates suivent le calendrier
lunaire et changent donc chaque année. Conséquence : **aucun décalage fixe `+01:00` ne doit être
écrit dans le code**. Toute conversion passe par la base IANA (`Africa/Casablanca`) via
`Intl.DateTimeFormat`. Cela concerne directement le digest quotidien de 8 h et les alertes de fin
de contrat « à 8 h ». *À revérifier au moment de l'implémentation du planificateur, en Phase 4.*

Chaque organisation porte `timezone` (défaut `Africa/Casablanca`), utilisé pour toute conversion
d'affichage et pour le déclenchement des jobs.

### 1.4 Booléens, énumérations, JSON

`integer` 0/1 exposé en `boolean` par la couche de mapping ; `text` plus schéma Zod pour les
énumérations ; `text` sérialisé plus parsing Zod au bord pour le JSON. Aucun consommateur en aval
ne voit jamais la représentation brute.

### 1.5 Recherche et normalisation

SQLite ne sait ni trier ni comparer correctement le français accentué et l'arabe. Toute colonne
recherchable a sa jumelle `*_normalized` (minuscule, sans diacritiques latins, sans tatweel ni
diacritiques arabes, espaces réduits), calculée en écriture. Les repositories comparent sur cette
colonne par égalité ou préfixe. **Aucun `LIKE '%…%'` dans le code métier.**

### 1.6 Cloisonnement

- Toute fonction de repository a pour premier paramètre un `OrgScopedDb`, type opaque fabriqué
  uniquement par `scopeToOrg(db, ctx)`. **Sans `orgId`, le code ne compile pas.**
- Toute lecture applique `where(eq(t.org_id, scoped.orgId), isNull(t.deleted_at))`.
- Une ressource d'une autre organisation renvoie **404**, jamais 403, et l'événement est écrit dans
  `audit_log` avec `action = 'cross_tenant_denied'` — un 404 silencieux masque aussi les attaques.
- Les policies Postgres correspondantes sont écrites dans `src/db/policies/` **en même temps que la
  table**, et activées en Phase 12.

---

## 2. Domaine plateforme

### `organizations`
`id`, `name`, `name_normalized`, `slug` (unique), `legal_name`, `ice`, `if_number`, `rc_number`,
`cnss_number`, `vat_number`, `city`, `address`, `phone`, `email`, `logo_path`,
`timezone` (défaut `Africa/Casablanca`), `locale` (`fr` | `ar` | `en`, défaut `fr`),
`currency` (défaut `MAD`), `plan_id`, `status` (`trial` | `active` | `past_due` | `suspended` |
`read_only` | `cancelled`), `trial_ends_at`, `is_demo` (bool), `internal_note`, `activated_at`,
`cancelled_at`, `purge_after_on`.

`ice`, `if_number`, `rc_number` sont les identifiants fiscaux marocains, indispensables sur les
factures (voir D-06). `purge_after_on` matérialise la règle « données conservées 90 jours après
résiliation ».

### `users`
`id`, `email` (unique, normalisé), `email_verified_at`, `password_hash`, `name`, `phone`,
`locale`, `avatar_path`, `platform_role` (`null` | `platform_owner`), `status` (`active` |
`disabled` | `locked`), `last_login_at`, `failed_login_count`, `locked_until_at`.

Un utilisateur est **global** : la même personne peut appartenir à plusieurs organisations
(comptable externe, gérant de deux sociétés). Le lien vers l'organisation passe par `memberships`.

### `memberships`
`id`, `org_id`, `user_id`, `role` (`owner` | `manager` | `agent` | `mechanic` | `viewer`),
`branch_id` (nullable — un agent peut être rattaché à une seule agence), `status` (`active` |
`suspended`), `invited_by_user_id`, `joined_at`.
**Unicité : (`org_id`, `user_id`) parmi les lignes vivantes.**

Matrice des rôles, résumée : `owner` tout, y compris facturation et suppression ; `manager` tout le
métier sans la facturation ; `agent` contrats, clients, états des lieux, pas les prix d'achat ni la
rentabilité ; `mechanic` entretiens, incidents, kilométrages, rien de commercial ; `viewer` lecture
seule. `platform_owner` n'est **pas** dans cette liste : c'est un rôle de plateforme, porté par
`users.platform_role`, qui n'accorde par lui-même **aucun** accès aux données d'une organisation
sans une session d'impersonation tracée.

### `invitations`
`id`, `org_id`, `email`, `role`, `branch_id`, `token_hash` (**haché**, jamais en clair),
`token_last4` (pour l'affichage dans `/admin`), `expires_at` (**7 jours**), `accepted_at`,
`accepted_by_user_id`, `revoked_at`, `sent_count`, `last_sent_at`, `created_by_user_id`.
Jeton **à usage unique** : `accepted_at` non nul invalide définitivement.

### `plans`
`id`, `code` (`trial` | `starter` | `pro` | `business`), `name_i18n` (JSON par langue),
`price_monthly_minor`, `price_yearly_minor`, `currency`, `is_public` (bool),
`stripe_price_id_monthly`, `stripe_price_id_yearly`, `sort_order`, `archived_at`.

Les prix sont **en base**, modifiables depuis `/admin`, jamais en dur dans le front (§4 du cahier
des charges). Un plan archivé reste attaché aux abonnements existants.

### `plan_features`
`id`, `plan_id`, `feature_key`, `value_kind` (`bool` | `limit`), `bool_value`,
`limit_value` (`null` = illimité).

Clés initiales : `vehicles.max`, `users.max`, `branches.max`, `gps.track`, `api.access`,
`export.bulk`, `alerts.email`, `alerts.push`. Le helper `can(org, key)` et `quota(org, key)` lisent
**uniquement** ici. Aucun `if (plan === 'pro')` nulle part.

| Plan | `vehicles.max` | `users.max` | `branches.max` | `gps.track` | `api.access` |
|---|---|---|---|---|---|
| Essai (14 j, sans carte) | 10 | 2 | 1 | oui | non |
| Starter | 15 | 3 | 1 | non | non |
| Pro | 60 | 10 | 3 | oui | non |
| Business | illimité | illimité | illimité | oui | oui |

### `usage_counters`
`id`, `org_id`, `counter_key`, `current_value`, `computed_at`.
Compteur **projeté**, recalculé à chaque mutation et revérifié par un job de réconciliation
nocturne. Le contrôle de quota lit le compteur pour l'affichage mais **recompte en base dans la
transaction de création** : un compteur désynchronisé ne doit jamais autoriser un dépassement.

### `subscriptions`
`id`, `org_id`, `plan_id`, `provider` (`manual` | `stripe` | `local_gateway`),
`provider_subscription_id`, `provider_customer_id`, `status` (`trialing` | `active` | `past_due` |
`grace` | `canceled` | `incomplete`), `billing_cycle` (`monthly` | `yearly`),
`current_period_start_at`, `current_period_end_at`, `cancel_at_period_end` (bool), `canceled_at`,
`trial_ends_at`, `grace_ends_at`, `last_event_at`.

**La base est la source de vérité de l'accès.** Aucun écran n'interroge Stripe pour décider si un
utilisateur peut agir.

### `invoices`
`id`, `org_id`, `subscription_id`, `number` (**séquence continue par organisation et exercice,
garantie en base**), `fiscal_year`, `issued_on`, `due_on`, `status` (`draft` | `open` | `paid` |
`void` | `uncollectible`), `subtotal_minor`, `vat_rate_bp` (points de base, 2000 = 20 %),
`vat_amount_minor`, `total_minor`, `currency`, `paid_at`, `payment_method`, `pdf_path`,
`provider_invoice_id`, `legal_status`, `clearance_id`, `clearance_at`, `clearance_payload`.

Les quatre derniers champs sont réservés à la facturation électronique DGI (D-06) et restent nuls
tant que `NoopEInvoiceProvider` est actif.

### `invoice_lines`
`id`, `org_id`, `invoice_id`, `label_i18n`, `quantity`, `unit_price_minor`, `vat_rate_bp`,
`vat_code`, `amount_minor`, `sort_order`. Le taux de TVA est **par ligne** (É-09).

### `payment_events`
`id`, `org_id` (nullable au moment de la réception), `provider`,
`provider_event_id` (**unique — c'est la garantie d'idempotence**), `type`, `payload`,
`received_at`, `processed_at`, `process_status` (`pending` | `processed` | `ignored` | `failed`),
`error`, `attempts`.

Un webhook rejoué retrouve sa ligne par `provider_event_id` et **ne rejoue pas l'effet**. Les
événements arrivant dans le désordre sont réconciliés par comparaison de `last_event_at` : un
événement plus ancien que l'état courant est marqué `ignored`, pas appliqué. Un test rejoue une
séquence mélangée et vérifie l'état final.

### `leads`
`id`, `name`, `company`, `phone`, `email`, `city`, `fleet_size`, `message`, `locale`,
`source` (`landing` | `pricing` | `demo` | `contact`), `status` (`new` | `contacted` |
`converted` | `rejected`), `converted_org_id`, `contacted_at`, `internal_note`, `ip_hash`,
`user_agent`. Pas d'`org_id` : un prospect n'appartient encore à personne.

### `audit_log`
`id`, `org_id` (nullable), `actor_user_id`, `actor_kind` (`user` | `platform_owner` | `system` |
`impersonation`), `impersonation_session_id`, `action`, `entity_type`, `entity_id`, `before`,
`after`, `ip_hash`, `user_agent`, `created_at`. **Jamais de soft delete, jamais de mise à jour :
table en écriture seule.**

Actions journalisées obligatoirement : contrats (création, retour, annulation), cautions
(encaissement, restitution), prix, suppressions, changements de plan, impersonation (début et fin),
refus inter-organisations, connexions échouées répétées.

### `impersonation_sessions`
`id`, `org_id`, `admin_user_id`, `target_user_id`, `reason`, `write_enabled` (bool, **défaut 0**),
`write_enabled_at`, `started_at`, `expires_at` (**+30 min**), `ended_at`, `ip_hash`.
Verrous additionnels proposés en É-08 : ressaisie du mot de passe avant démarrage, accès interdit
aux écrans de facturation du client et à tout export pendant la session.

### `feature_flags`
`id`, `key`, `scope` (`global` | `org`), `org_id` (nullable), `enabled` (bool), `payload`,
`updated_by_user_id`. Porte notamment `SELF_SERVE_SIGNUP` (É-02).

### `notifications` et `notification_preferences`
`notifications` : `id`, `org_id`, `alert_id`, `user_id`, `channel` (`email` | `push` | `inapp` |
`sms` | `whatsapp`), `locale`, `subject`, `body`, `status` (`queued` | `sent` | `failed` |
`suppressed`), `sent_at`, `failed_reason`, `attempts`, `dedupe_key` (**unique**).
`notification_preferences` : `id`, `org_id`, `user_id`, `channel`, `severity_min`, `digest_hour`
(défaut 8), `enabled`, `quiet_hours`.

`status = 'suppressed'` est l'état des notifications bloquées par le mode démo : on garde la trace
que l'envoi aurait eu lieu, sans envoyer.

---

## 3. Domaine métier

### `branches` — agences
`id`, `org_id`, `name`, `code`, `city`, `address`, `phone`, `lat`, `lng`, `is_default` (bool),
`opening_hours`.

### `vehicles`
`id`, `org_id`, `branch_id`,
`plate_canonical` (**unique par organisation**, forme normalisée), `plate_display`,
`plate_format` (`legacy` | `unified_2026` | `ww` | `special`), `plate_series_ar`,
`plate_series_latin`, `plate_prefecture_code`,
`vin`, `make`, `model`, `trim`, `year`, `color`, `category` (`economy` | `compact` | `sedan` |
`suv` | `van` | `utility` | `luxury`), `fuel` (`diesel` | `petrol` | `hybrid` | `electric` |
`lpg`), `transmission` (`manual` | `automatic`), `seats`, `doors`,
`odometer_km`, `odometer_read_at`,
`status` (`available` | `rented` | `maintenance` | `out_of_service` | `sold`),
`acquired_on`, `acquisition_price_minor`, `financing` (`cash` | `credit` | `leasing` | `lld`),
`financing_monthly_minor`, `financing_ends_on`,
`daily_rate_minor`, `weekly_rate_minor`, `monthly_rate_minor`, `deposit_minor`,
`sold_on`, `sale_price_minor`, `notes`.

**Sur la plaque (É-06).** `plate_canonical` sert à l'unicité et à la recherche ; `plate_display`
sert à l'affichage et est rendu dans un composant isolé en bidi (`bdi`), parce qu'une plaque
marocaine mêle chiffres latins et lettre arabe et s'inverse sinon en RTL. Formats acceptés : le
format historique `NNNNN-X-CC`, le format unifié publié au BO n° 7531 du 3 août 2026 (lettre latine
en regard de la lettre arabe, marque « MA »), les séries **WW**, et les séries spéciales.
**Le validateur ne rejette jamais une plaque valide** : en cas de forme inconnue, il enregistre en
`plate_format = 'special'` avec un avertissement, il ne bloque pas la saisie.

### `vehicle_photos`
`id`, `org_id`, `vehicle_id`, `path`, `kind` (`front` | `rear` | `side_left` | `side_right` |
`interior` | `damage` | `document`), `sort_order`, `taken_at`.

### `customers`
`id`, `org_id`, `kind` (`individual` | `company`), `first_name`, `last_name`, `company_name`,
`full_name_normalized`, `id_kind` (`cin` | `passport` | `residence_card`), `id_number`,
`id_expires_on`, `nationality`,
`licence_number`, `licence_issued_on`, **`licence_expires_on`**, `licence_country`,
`birth_on`, `phone`, `phone_alt`, `email`, `address`, `city`,
`blacklisted_at`, `blacklist_reason`, `notes`.
Scans rattachés via `documents`. **Unicité souple** : `(org_id, id_kind, id_number)` parmi les
vivants, avec possibilité de fusion — un client saisi deux fois est la norme, pas l'exception.

`licence_expires_on` est **bloquant à la signature d'un contrat** (§10 du cahier des charges) : un
permis expiré interdit la création du contrat, sans contournement silencieux. Le blocage est levé
seulement par un `owner` ou `manager`, et l'action est journalisée.

### `contracts`
`id`, `org_id`, `number` (séquence continue par organisation),
`vehicle_id`, `customer_id`, `additional_driver_customer_id`,
`pickup_branch_id`, `return_branch_id`,
`planned_start_at`, `planned_end_at`, `actual_start_at`, `actual_end_at`,
`start_odometer_km`, `end_odometer_km`, `start_fuel_eighths`, `end_fuel_eighths`,
`rate_kind` (`daily` | `weekly` | `monthly` | `custom`), `unit_price_minor`, `units`,
`discount_minor`, `extras_minor`, `subtotal_minor`, `vat_rate_bp`, `total_minor`, `currency`,
`deposit_minor`, `deposit_taken_at`, `deposit_method`, `deposit_returned_minor`,
`deposit_returned_at`, `deposit_withheld_reason`,
`payment_status` (`unpaid` | `partial` | `paid` | `refunded`),
`status` (`reservation` | `active` | `returned` | `late` | `cancelled`),
`signature_path`, `signed_at`, `pdf_path_fr`, `pdf_path_ar`, `cancel_reason`, `notes`.

Le niveau de carburant est stocké en **huitièmes** (`0` à `8`), parce que c'est ce que montre la
jauge et ce que les agents notent réellement sur le papier. Un pourcentage inventerait une
précision qui n'existe pas.

### `contract_inspections` — état des lieux
`id`, `org_id`, `contract_id`, `phase` (`checkout` | `checkin`), `performed_at`,
`performed_by_user_id`, `odometer_km`, `fuel_eighths`, `cleanliness` (`clean` | `normal` |
`dirty`), `checklist` (JSON : roue de secours, cric, triangle, gilet, extincteur, papiers, tapis),
`signature_path`, `notes`.

### `inspection_damages`
`id`, `org_id`, `inspection_id`, `body_part` (référentiel fermé du schéma de carrosserie),
`damage_kind` (`scratch` | `dent` | `crack` | `missing` | `stain` | `mechanical`),
`severity` (`minor` | `moderate` | `major`), `x_ratio`, `y_ratio` (coordonnées relatives sur le
schéma, indépendantes de la taille de rendu), `photo_paths`, `pre_existing` (bool),
`charged_minor`, `note`.

`pre_existing` est ce qui évite les litiges : un dommage constaté au départ ne se refacture pas au
retour.

### Documents à échéance — cinq tables, un contrat commun

`insurance_policies`, `technical_inspections`, `road_taxes` (vignette),
`registration_docs` (carte grise), `permits` (autorisation, agrément).

Chacune porte : `id`, `org_id`, `vehicle_id`, `provider_name` (compagnie ou centre), `number`,
`issued_on`, **`expires_on`**, `cost_minor`, `document_path`, `notes`, plus ses champs propres —
`coverage_kind` et `franchise_minor` pour l'assurance, `center_name` et `result` (`pass` | `fail` |
`pass_with_reserve`) pour la visite technique, `fiscal_power` et `fiscal_year` pour la vignette,
`owner_name` pour la carte grise, `permit_kind` pour les autorisations.

**Décision de modélisation.** Cinq tables plutôt qu'une table polymorphe : les champs propres sont
réels, les écrans diffèrent, et une table `documents` fourre-tout finit toujours en colonnes
nullables. Le moteur d'alertes ne les lit pas directement : il lit une **vue applicative
`expirables`** qui projette `(entity_type, entity_id, vehicle_id, expires_on, severity_base)`
depuis les cinq tables plus `customers.licence_expires_on`. Une seule règle d'échéance à écrire,
une seule à tester.

### `maintenance_schedules`
`id`, `org_id`, `vehicle_id`, `kind` (`oil_change` | `brakes` | `tires` | `timing_belt` |
`filters` | `battery` | `general_service`), `interval_km`, `interval_months`,
`last_done_on`, `last_done_km`, `next_due_on`, `next_due_km`, `is_active`.

`next_due_*` sont **dérivés et stockés** pour que le moteur d'alertes n'ait pas à recalculer sur
toute la flotte à chaque passage. Ils sont recalculés à chaque `maintenance_record` et à chaque
relevé de kilométrage.

### `maintenance_records`
`id`, `org_id`, `vehicle_id`, `schedule_id`, `kind`, `performed_on`, `odometer_km`,
`garage_name`, `invoice_number`, `parts_cost_minor`, `labor_cost_minor`, `total_minor`,
`document_path`, `next_due_on`, `next_due_km`, `notes`.

### `incidents`
`id`, `org_id`, `vehicle_id`, `contract_id`, `kind` (`breakdown` | `accident` | `theft` |
`vandalism`), `occurred_at`, `location`, `lat`, `lng`, `description`,
`third_party_involved` (bool), `police_report_number`, `insurance_claim_number`,
`claim_status` (`none` | `filed` | `accepted` | `rejected` | `settled`),
`repair_cost_minor`, `covered_minor`, `photo_paths`,
`status` (`open` | `in_repair` | `closed`), `immobilized_from_on`, `immobilized_to_on`.

### `fines` — contraventions
`id`, `org_id`, `vehicle_id`, `notice_number`, **`offense_at`** (instant précis, pas une date),
`location`, `offense_kind`, `amount_minor`, `reduced_amount_minor`, `due_on`,
`contract_id`, `customer_id`, `resolved_at`, `resolution_method` (`auto_contract` | `manual` |
`unassigned`), `assignment_status` (`assigned` | `unassigned` | `disputed`),
`payment_status` (`unpaid` | `paid` | `contested`), `paid_at`, `paid_by` (`company` | `customer`),
`rebilled_at`, `rebilled_amount_minor`, `document_path`.

**Règle de rattachement (É-03).** À la création, on cherche le contrat dont
`actual_start_at <= offense_at < coalesce(actual_end_at, now)` pour ce véhicule. Le résultat est
**figé** dans `contract_id` / `customer_id` / `resolved_at` / `resolution_method`, jamais recalculé
à l'affichage. Sans contrat correspondant — véhicule au parking, convoyage, usage interne — le
statut est `unassigned`, une alerte part au gérant, et le rattachement se fait à la main.
`offense_at` est un **instant** parce que deux locations peuvent se succéder le même jour.

### `expenses` et `revenues`
`expenses` : `id`, `org_id`, `vehicle_id` (nullable pour les frais généraux), `branch_id`,
`category` (`fuel` | `maintenance` | `insurance` | `tax` | `fine` | `repair` | `washing` |
`tyres` | `financing` | `admin` | `other`), `label`, `amount_minor`, `vat_amount_minor`,
`spent_on`, `supplier`, `document_path`, `source_kind` / `source_id` (traçabilité vers l'entretien,
l'amende ou la police d'assurance d'origine), `notes`.

`revenues` : `id`, `org_id`, `vehicle_id`, `contract_id`, `category` (`rental` | `deposit_kept` |
`fine_rebill` | `damage_rebill` | `sale` | `other`), `amount_minor`, `received_on`, `method`
(`cash` | `card` | `transfer` | `cheque`), `notes`.

Les deux tables alimentent le **coût au kilomètre** et la **rentabilité par véhicule** de la
Phase 8. Le lien `source_kind` / `source_id` évite le double comptage : une amende payée par la
société crée **une** dépense, référencée, pas deux lignes indépendantes.

### GPS
`gps_devices` : `id`, `org_id`, `vehicle_id`, `provider` (`traccar` | `mock`), `external_id`,
`imei`, `label`, `status` (`active` | `inactive` | `lost_signal`), `last_seen_at`, `battery_pct`.

`gps_positions` : `id`, `org_id`, `device_id`, `vehicle_id`, `recorded_at`, `lat`, `lng`,
`speed_kmh`, `heading`, `altitude`, `accuracy_m`, `ignition` (bool), `odometer_km`, `raw`.
**Table à forte croissance** : pas de `updated_at`, pas de soft delete, partitionnement par mois
prévu en Phase 12, rétention configurable par plan.

`vehicle_daily_mileage` : `id`, `org_id`, `vehicle_id`, `date_key`, `km`, `source` (`gps` |
`manual` | `contract`), `computed_at`. **C'est cette table qui alimente la moyenne 90 jours du
moteur d'alertes**, pas la table de positions brutes.

`geofences` : `id`, `org_id`, `name`, `kind` (`circle` | `polygon`), `center_lat`, `center_lng`,
`radius_m`, `polygon` (JSON GeoJSON), `rule` (`alert_on_exit` | `alert_on_enter`), `is_active`,
`applies_to` (`all` | `vehicle_list`), `vehicle_ids`.

`geofence_events` : `id`, `org_id`, `geofence_id`, `vehicle_id`, `kind` (`enter` | `exit`),
`occurred_at`, `lat`, `lng`, `alert_id`.

### `alerts`
`id`, `org_id`, `entity_type`, `entity_id`, `vehicle_id`, `alert_type`,
**`threshold_key`** (`d-30`, `d-7`, `d0`, `overdue-3`, `km-500`…), `due_on`, `due_at`,
`severity` (`low` | `medium` | `high` | `critical` | `blocking`),
`status` (`open` | `snoozed` | `acknowledged` | `resolved`), `snoozed_until_at`,
`acknowledged_by_user_id`, `acknowledged_at`, `resolved_at`, `resolution` (`fixed` | `obsolete` |
`dismissed`), `payload`, `first_seen_at`, `last_evaluated_at`.

**Unicité stricte sur (`org_id`, `entity_type`, `entity_id`, `alert_type`, `threshold_key`)**,
appliquée par un index unique en base et non par le code. C'est cette contrainte qui rend le moteur
idempotent : relancer le calcul dix fois produit dix `INSERT … ON CONFLICT DO UPDATE`, pas dix
alertes.

### `alert_settings`
`id`, `org_id`, `alert_type`, `thresholds` (JSON, ex. `[30, 14, 7, 1, 0]`),
`km_thresholds` (`[1000, 500, 200]`), `severity_override`, `channels`, `is_enabled`.
Les seuils du §10 du cahier des charges sont les **valeurs par défaut**, pas des constantes.

### `alert_runs` — santé technique
`id`, `started_at`, `finished_at`, `trigger` (`cron` | `mutation` | `manual`), `org_id` (nullable),
`evaluated_count`, `created_count`, `updated_count`, `resolved_count`, `error`, `duration_ms`.
C'est la source du panneau « santé technique » de `/admin` (§5), qui doit afficher un fait vérifié
et non une supposition.

### `documents`
`id`, `org_id`, `entity_type`, `entity_id`, `kind`, `path`, `mime`, `size_bytes`, `checksum`,
`uploaded_by_user_id`, `original_name`. Sert aux scans de CIN, permis, cartes grises, constats.
Le stockage passe par `StorageProvider` : disque en dev, Supabase Storage en prod.

---

## 4. Machines à états

### Véhicule
```
available ──(contrat activé)──> rented ──(retour)──> available
available ──(entretien planifié)──> maintenance ──> available
tout état ──(panne, accident)──> out_of_service ──(réparé)──> available
tout état ──(vendu)──> sold   [état terminal, le véhicule sort des quotas]
```
Invariant : un véhicule `rented` a exactement un contrat `active`. Un véhicule `maintenance`,
`out_of_service` ou `sold` ne peut pas être réservé.

### Contrat
```
reservation ──(départ, état des lieux checkout)──> active
active ──(retour dans les délais)──> returned
active ──(planned_end_at dépassé)──> late ──(retour)──> returned
reservation | active ──(annulation)──> cancelled
```
`late` est calculé, pas saisi : le moteur d'alertes le pose. Un retour depuis `late` reste
`returned`, avec la trace du retard dans `actual_end_at`.

### Organisation
```
trial ──(paiement ou activation manuelle)──> active
trial ──(fin d'essai sans paiement)──> read_only
active ──(échec de paiement)──> past_due ──(7 jours de grâce)──> read_only
read_only ──(régularisation)──> active
tout état ──(décision plateforme)──> suspended
tout état ──(résiliation)──> cancelled  [purge_after_on = +90 jours]
```
`read_only` et `suspended` **ne suppriment jamais de données** (§4 du cahier des charges).

### Alerte
```
open ──(reporter X jours)──> snoozed ──(échéance du report)──> open
open | snoozed ──(marquer traité)──> acknowledged
open | snoozed | acknowledged ──(cause disparue : document renouvelé)──> resolved
```
Une alerte `resolved` dont la cause réapparaît crée une **nouvelle** alerte, avec un
`threshold_key` différent. On ne ressuscite jamais une ligne close.

---

## 5. Invariants à tester

1. Aucune ligne lisible sans `org_id` correspondant au contexte. Test générique sur le registre des
   entités.
2. `(org_id, plate_canonical)` unique parmi les véhicules vivants.
3. Un véhicule ne peut avoir deux contrats aux périodes qui se chevauchent, hors `cancelled`.
4. `contract.planned_end_at > planned_start_at`, `end_odometer_km >= start_odometer_km`.
5. Un contrat ne se crée pas avec un `customers.licence_expires_on` dépassé, sauf levée explicite
   par `owner` ou `manager`, journalisée.
6. `deposit_returned_minor <= deposit_minor`.
7. Index unique sur `(org_id, entity_type, entity_id, alert_type, threshold_key)`.
8. Index unique sur `payment_events.provider_event_id`.
9. `invoices.number` continu et sans trou par `(org_id, fiscal_year)`.
10. Création refusée quand le quota du plan est atteint, **compté dans la transaction**.
11. `odometer_km` monotone croissant, sauf correction explicite journalisée (un compteur qui recule
    signale une erreur de saisie ou une fraude, pas un cas normal).
12. Aucune notification réelle émise depuis une organisation `is_demo`.

## 6. Index prévus dès la première migration

`(org_id, deleted_at)` sur toutes les tables métier ; `(org_id, status)` sur `vehicles` et
`contracts` ; `(org_id, vehicle_id, planned_start_at)` sur `contracts` ;
`(org_id, expires_on)` sur les cinq tables à échéance ; `(org_id, status, severity, due_on)` sur
`alerts` ; `(org_id, vehicle_id, date_key)` sur `vehicle_daily_mileage` ;
`(device_id, recorded_at)` sur `gps_positions`. Le critère n° 11 de l'auto-évaluation
(requêtes N+1, index présents) se vérifie contre cette liste.

## 7. Volumétrie de référence

Pour une organisation de 200 véhicules sur trois ans : environ 200 véhicules, 5 000 clients,
12 000 contrats, 3 000 entretiens, 2 000 amendes, 60 000 lignes de dépenses et recettes,
**et 30 à 100 millions de positions GPS**. Une seule table domine : `gps_positions`. C'est la seule
qui justifie une stratégie de rétention et de partitionnement, dès sa création.

## 8. Notes pour la Phase 12 (RLS)

Chaque table métier reçoit une policy de la forme
`USING (org_id = (auth.jwt() -> 'app_metadata' ->> 'org_id'))`. La documentation Supabase et les
retours de terrain convergent : le `org_id` doit vivre dans **`app_metadata`** du JWT et jamais
dans `user_metadata`, que l'utilisateur peut modifier lui-même. Cas particuliers à traiter
explicitement : utilisateur membre de plusieurs organisations (organisation active dans le jeton,
changée par une fonction serveur qui revérifie l'appartenance), `platform_owner` (policy dédiée,
lecture seule, sauf impersonation), et jobs `pg_cron` (rôle `service_role` documenté et restreint).

## 9. Glossaire métier

| Terme | Sens |
|---|---|
| **Vignette** | taxe spéciale annuelle sur les véhicules automobiles (TSAVA), payée chaque année, date d'échéance dépendant de la puissance fiscale |
| **Carte grise** | certificat d'immatriculation |
| **Visite technique** | contrôle technique périodique obligatoire |
| **CIN** | Carte d'identité nationale marocaine |
| **ICE** | Identifiant Commun de l'Entreprise, obligatoire sur les factures |
| **IF** | Identifiant Fiscal |
| **RC** | Registre du Commerce |
| **WW** | série provisoire des véhicules importés, validité 45 jours |
| **Caution** | dépôt de garantie encaissé au départ, restitué au retour, partiellement retenu en cas de dommage |
| **État des lieux** | constat contradictoire de l'état du véhicule au départ et au retour |
| **LLD** | location longue durée, mode de financement de la flotte |
