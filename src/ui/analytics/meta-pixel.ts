/**
 * PIXEL META — la mesure d'une campagne de génération de prospects.
 *
 * Deux événements, et deux seulement : `PageView`, posé par le fragment officiel puis
 * rejoué à chaque navigation, et `Lead`, émis quand une agence a réellement ouvert son
 * espace. Rien d'autre ne part chez Meta.
 *
 * ── L'identifiant vit dans l'ENVIRONNEMENT, jamais dans le code ──────────────────────
 *
 * Ce n'est pas de la pudeur — un identifiant de pixel est public, il voyage dans le HTML
 * de chaque page. C'est une question de PROPRETÉ DES DONNÉES : codé en dur, il tire aussi
 * pendant `pnpm dev`. Chaque rechargement à chaud compterait une visite, chaque essai du
 * formulaire d'inscription compterait un prospect, et l'algorithme d'enchères apprendrait
 * sur des conversions qui n'existent pas. Meta optimise sur ce qu'on lui déclare : lui
 * mentir coûte de l'argent réel.
 *
 * D'où la double condition ci-dessous — variable renseignée ET build de production. Pour
 * vérifier le pixel sur son poste : `pnpm build && pnpm start`.
 *
 * ── Ce qui ne part PAS ───────────────────────────────────────────────────────────────
 *
 * Aucune donnée personnelle n'accompagne les événements : ni adresse, ni téléphone, ni
 * nom d'agence, même hachés. Le « suivi avancé » de Meta accepte ces champs ; il n'est
 * pas activé ici. Un prospect se compte, il ne s'identifie pas — et le formulaire
 * d'inscription porte les coordonnées d'un client, pas les nôtres.
 */

const RAW_ID = import.meta.env['VITE_META_PIXEL_ID'] as string | undefined

/** L'identifiant, normalisé une fois. Chaîne vide = pixel absent. */
export const META_PIXEL_ID = (RAW_ID ?? '').trim()

/**
 * La décision, isolée pour être testable sans build de production.
 *
 * Fonction pure : elle ne lit ni `import.meta.env`, ni `window`. C'est le seul moyen de
 * prouver par un test que le développement n'envoie rien — un test qui tourne, par
 * définition, hors production.
 */
export function shouldTrack(pixelId: string, isProduction: boolean): boolean {
  return isProduction && pixelId.length > 0
}

export const META_PIXEL_ENABLED = shouldTrack(META_PIXEL_ID, import.meta.env.PROD)

/**
 * Le fragment officiel de Meta, RECOPIÉ TEL QUEL, avec le seul identifiant injecté.
 *
 * Il n'est pas réécrit « proprement » exprès. C'est le code que Meta publie, que son
 * outil de diagnostic reconnaît, et qu'elle remplacera un jour par un autre : le garder
 * mot pour mot rend la mise à jour mécanique. Le réécrire ferait de chaque évolution du
 * fournisseur une relecture de notre code.
 *
 * `JSON.stringify` sur l'identifiant, et non une interpolation nue : c'est ce qui empêche
 * une valeur mal saisie dans `.env` de fermer la chaîne et d'injecter du script dans la
 * page.
 */
export const META_PIXEL_SCRIPT = `!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window, document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init', ${JSON.stringify(META_PIXEL_ID)});
fbq('track', 'PageView');`

/** L'image de repli, pour le visiteur dont le navigateur n'exécute aucun script. */
export const META_PIXEL_NOSCRIPT_SRC = `https://www.facebook.com/tr?id=${encodeURIComponent(
  META_PIXEL_ID,
)}&ev=PageView&noscript=1`

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void
  }
}

/**
 * Vue de page d'une navigation INTERNE.
 *
 * Le fragment ci-dessus ne compte qu'une seule vue : celle du chargement du document.
 * Le produit est une application à navigation côté client — passer de la page tarifaire
 * au formulaire d'inscription ne recharge rien. Sans cet appel, une campagne qui mène
 * sur `/fr` ne verrait jamais que la page d'entrée.
 */
export function trackPageView(): void {
  send('track', 'PageView')
}

/**
 * PROSPECT — une agence vient d'ouvrir son espace.
 *
 * Émis au succès du serveur, pas à la soumission du formulaire : un refus (adresse déjà
 * prise, offre inconnue) ne doit pas compter. C'est cet événement que la campagne
 * optimise, donc c'est lui qui doit être le plus honnête du produit.
 */
export function trackLead(): void {
  send('track', 'Lead')
}

/**
 * Le seul point de sortie vers Meta.
 *
 * Trois gardes, dans cet ordre : le pixel est-il actif, sommes-nous dans un navigateur
 * (le rendu serveur exécute ce module lui aussi), et `fbq` est-il là — un bloqueur de
 * publicité, une extension ou un réseau coupé le font disparaître. Aucune de ces trois
 * situations n'est une erreur : la mesure est un bonus, elle ne casse jamais l'écran.
 */
function send(...args: unknown[]): void {
  if (!META_PIXEL_ENABLED) return
  if (typeof window === 'undefined') return
  window.fbq?.(...args)
}
