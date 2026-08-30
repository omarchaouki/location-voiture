-- MIGRATION DE DONNÉES — la grille tarifaire du 29/08/2026.
--
-- Écrite à la main, et non produite par drizzle-kit : elle ne change aucune colonne,
-- elle change des PRIX. C'est la seule forme acceptable pour ce genre de bascule —
-- `ensurePlans()` pose le catalogue avec `ON CONFLICT DO NOTHING`, précisément pour
-- qu'un déploiement n'écrase jamais un tarif décidé en base par le commercial. Sans
-- cette migration, les installations existantes garderaient l'ancienne grille pour
-- toujours, et la nouvelle n'apparaîtrait que sur une base vierge.
--
-- Elle s'applique UNE FOIS, comme toute migration. Un prix modifié ensuite depuis
-- l'administration ne sera pas repris par le prochain déploiement.
--
-- Ce que la grille vaut, et pourquoi : relevé du concurrent direct le 28/08/2026 sur
-- locaflotte.com — 99 MAD pour 8 véhicules et 2 utilisateurs, 199 pour 25 et 5, 299
-- pour 50 et 10, l'illimité sur devis, 30 jours d'essai. Chaque palier ci-dessous est
-- moins cher ET plus généreux que le sien, l'essai dure deux mois au lieu d'un, et le
-- haut du catalogue affiche un prix là où lui demande d'appeler.
--
-- `yearly_cents = monthly_cents × 10` : douze mois pour dix, soit deux mois offerts sur
-- l'engagement annuel. Le produit ne l'écrit jamais en toutes lettres — il le CALCULE
-- (`monthsFreeOnYearly`), pour que la page ne puisse pas contredire la facture.

INSERT INTO plans (
  id, created_at, updated_at,
  code, name_key,
  monthly_cents, yearly_cents, currency,
  max_vehicles, max_users, max_branches,
  trial_days, is_public, sort_order
)
VALUES
  -- `trial` cesse d'être PUBLIC : depuis que les quatre offres payantes portent leurs
  -- soixante jours d'essai, une carte « Essai » sur la page tarifaire ne se compare à
  -- rien. Elle reste en base comme plan de repli — une organisation dont l'offre a été
  -- effacée ne doit pas hériter de l'illimité par accident.
  (gen_random_uuid()::text, now()::text, now()::text, 'trial',    'plan.trial',        0,      0, 'MAD',    5,    2,    1, 60, false, 0),
  (gen_random_uuid()::text, now()::text, now()::text, 'starter',  'plan.starter',   8900,  89000, 'MAD',   10,    3,    1, 60, true,  1),
  (gen_random_uuid()::text, now()::text, now()::text, 'pro',      'plan.pro',      17900, 179000, 'MAD',   30,    8,    5, 60, true,  2),
  (gen_random_uuid()::text, now()::text, now()::text, 'business', 'plan.business', 27900, 279000, 'MAD',   60,   15,   10, 60, true,  3),
  -- L'illimité, avec un PRIX affiché. Le concurrent le met sur devis ; un devis est un
  -- appel téléphonique de plus entre le visiteur et la décision.
  (gen_random_uuid()::text, now()::text, now()::text, 'premium',  'plan.premium',  44900, 449000, 'MAD', NULL, NULL, NULL, 60, true,  4)
ON CONFLICT (code) DO UPDATE SET
  monthly_cents = EXCLUDED.monthly_cents,
  yearly_cents  = EXCLUDED.yearly_cents,
  max_vehicles  = EXCLUDED.max_vehicles,
  max_users     = EXCLUDED.max_users,
  max_branches  = EXCLUDED.max_branches,
  trial_days    = EXCLUDED.trial_days,
  is_public     = EXCLUDED.is_public,
  sort_order    = EXCLUDED.sort_order,
  updated_at    = now()::text;
--> statement-breakpoint
-- LA MARQUE « CONSEILLÉE » et les capacités de la nouvelle offre.
--
-- `plan_features` est posée par `ensurePlanFeatures()` au déploiement, en n'insérant
-- que ce qui manque — donc `premium` et `contract.template` y entreront tout seuls. Ces
-- lignes sont là pour que la migration se suffise à elle-même : appliquée sur une base
-- où le déploiement n'a pas encore tourné, elle laisse un catalogue cohérent.
INSERT INTO plan_features (id, created_at, updated_at, plan_code, feature_key, enabled)
VALUES
  (gen_random_uuid()::text, now()::text, now()::text, 'premium', 'gps.track', true),
  (gen_random_uuid()::text, now()::text, now()::text, 'premium', 'gps.geofence', true),
  (gen_random_uuid()::text, now()::text, now()::text, 'premium', 'contract.template', true),
  (gen_random_uuid()::text, now()::text, now()::text, 'trial', 'contract.template', true),
  (gen_random_uuid()::text, now()::text, now()::text, 'starter', 'contract.template', false),
  (gen_random_uuid()::text, now()::text, now()::text, 'pro', 'contract.template', true),
  (gen_random_uuid()::text, now()::text, now()::text, 'business', 'contract.template', true)
ON CONFLICT (plan_code, feature_key) DO NOTHING;
