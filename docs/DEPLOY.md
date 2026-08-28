# Déploiement — Supabase + AWS Lightsail

État au 28/08/2026. La bascule Postgres est faite ; ce document décrit la mise en ligne.

**La topologie.** Postgres et le stockage de fichiers chez **Supabase**. L'application
Node sur **un Lightsail Ubuntu de 1 Go**, derrière nginx. Rien d'autre.

Le Lightsail ne porte AUCUNE donnée : ni base, ni fichier téléversé. C'est ce qui rend
l'instance jetable — on peut la détruire et la refaire en vingt minutes sans perdre une
ligne. C'est aussi pour ça qu'il n'y a pas un mot sur les sauvegardes de l'instance : il
n'y a rien à sauvegarder dessus. Les sauvegardes sont celles de Supabase.

---

## 1. Le projet Supabase

À faire dans l'interface — je ne peux pas créer de compte à ta place.

1. **Créer le projet.** Région : `eu-central-1` (Francfort) ou `eu-west-3` (Paris).
   Depuis le Maroc, c'est 30 à 50 ms d'aller-retour ; `us-east-1` en coûterait 120.
   Chaque rendu SSR enchaîne plusieurs requêtes — la région se paie sur chaque page.
2. **Noter le mot de passe de la base** au moment de la création. Il n'est plus affiché
   ensuite, et il faut le réinitialiser pour le retrouver.
3. **Project Settings → Database → Connection string.** Relever DEUX chaînes :
   - **Transaction pooler**, port `6543` → ce sera `DATABASE_URL` ;
   - **Session pooler** ou **Direct connection**, port `5432` → ce sera `DIRECT_URL`.

   Les deux ne sont pas interchangeables, et c'est le piège le plus coûteux de cette
   page. Le pooler en mode transaction rend la connexion à quelqu'un d'autre entre deux
   ordres : parfait pour un serveur web qui joue des requêtes courtes, catastrophique
   pour une migration, qui enchaîne des ordres liés dans une seule session et se
   retrouverait appliquée à moitié.

4. **Vérifier que `?sslmode=require` termine les deux chaînes.** `postgres-js` lit le
   TLS dans l'URL ; sans ce paramètre, la connexion part en clair.

### Les migrations — depuis ton poste, pas depuis le serveur

```bash
pnpm db:migrate
```

Avec `DATABASE_URL` et `DIRECT_URL` renseignés dans ton `.env` local. Supabase est
joignable depuis n'importe où : le Lightsail n'a donc besoin ni du code source, ni de
`tsx`, ni des dépendances de développement. C'est un serveur de moins à tenir à jour.

La commande pose aussi la matrice commerciale (`plans`, `plan_features`) : c'est de la
donnée, pas du schéma, et elle n'écrase jamais ce qui existe.

### Le compte de plateforme

```bash
pnpm admin:create --email toi@exemple.ma --name "Ton nom"
```

C'est le seul compte créé hors interface. Ensuite tout passe par `/fr/admin` :
l'inscription libre-service est fermée (`SELF_SERVE_SIGNUP=false`).

### Le stockage de fichiers

**Rien à faire pour l'instant, et il faut le savoir.** Les variables `STORAGE_PROVIDER`,
`SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` existent dans `.env.example` mais **aucun
code ne les lit** : le téléversement de documents et de photos d'état des lieux n'est pas
écrit. Créer un bucket aujourd'hui ne servirait à rien. Quand ce sera écrit, la clé
`service_role` est une clé d'ADMINISTRATION — elle contourne le RLS et voit toutes les
organisations. Elle ne sort jamais du serveur.

---

## 2. L'instance Lightsail

### Préparer la machine (une seule fois)

```bash
sudo apt update && sudo apt upgrade -y
```

```bash
sudo apt install -y nginx rsync
```

**Node 22.** Les dépôts d'Ubuntu livrent une version bien plus ancienne, et
`--env-file-if-exists` — utilisé par `pnpm start` — n'existe qu'à partir de 22.9.

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt install -y nodejs && node --version
```

**pnpm**, par corepack, pour tenir la version déclarée dans `package.json` :

```bash
sudo corepack enable && corepack prepare pnpm@11.22.0 --activate
```

**2 Go de swap.** Non facultatif sur 1 Go de RAM : `pnpm install` seul dépasse le
gigaoctet par moments, et sans swap l'OOM killer tue nginx ou le service en cours.

```bash
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
```

```bash
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

La RAM est rare : on préfère qu'elle serve de cache disque plutôt que de garder des pages
inactives de Node.

```bash
echo 'vm.swappiness=10' | sudo tee /etc/sysctl.d/99-swap.conf && sudo sysctl -p /etc/sysctl.d/99-swap.conf
```

**Le compte de service.** L'application ne tourne pas en `ubuntu`, et surtout pas en
`root` : un défaut dans le rendu SSR ne doit pas donner accès aux clés SSH du compte
d'administration.

```bash
sudo useradd --system --home /opt/flotta --shell /usr/sbin/nologin flotta
```

```bash
sudo mkdir -p /opt/flotta/data /etc/flotta && sudo chown -R flotta:flotta /opt/flotta
```

### Les secrets

`AUTH_SECRET` se fabrique sur TON poste :

```bash
node -e "console.log(crypto.randomUUID()+crypto.randomUUID())"
```

Puis, sur la machine, écrire `/etc/flotta/flotta.env` (avec `sudo nano
/etc/flotta/flotta.env`) :

```
DATABASE_URL=postgresql://postgres.<ref>:<motdepasse>@aws-0-<region>.pooler.supabase.com:6543/postgres?sslmode=require
DATABASE_POOL_MAX=10
APP_URL=http://<IP-du-Lightsail>
DEFAULT_LOCALE=fr
AUTH_SECRET=<la valeur générée ci-dessus>
SELF_SERVE_SIGNUP=false
ENABLE_CRON=true
PAYMENT_PROVIDER=manual
VAT_RATE_BP=2000
NOTIFIER=console
STORAGE_PROVIDER=local
STORAGE_LOCAL_DIR=/opt/flotta/data/uploads
GPS_PROVIDER=mock
MAP_STYLE_URL=
DEMO_RESET_HOUR_LOCAL=3
```

```bash
sudo chown root:flotta /etc/flotta/flotta.env && sudo chmod 640 /etc/flotta/flotta.env
```

Trois valeurs méritent un mot :

- **`DIRECT_URL` n'y figure pas.** Le serveur ne migre rien : il n'a aucune raison de
  détenir une connexion directe à la base.
- **`ENABLE_CRON=true` sur UN SEUL processus.** C'est lui qui balaye les échéances,
  ingère les positions et ouvre les périodes de facturation. Deux processus portant ce
  drapeau enverraient chaque notification en double.
- **`APP_URL` doit être l'origine PUBLIQUE**, telle que le navigateur la voit. C'est elle
  qui fabrique les liens d'invitation ; une valeur fausse les envoie sur localhost.

### Le service et le proxy

Depuis ton poste :

```bash
scp deploy/flotta.service deploy/nginx-flotta.conf ubuntu@<IP>:/tmp/
```

Sur la machine :

```bash
sudo mv /tmp/flotta.service /etc/systemd/system/flotta.service && sudo mv /tmp/nginx-flotta.conf /etc/nginx/sites-available/flotta
```

```bash
sudo ln -sf /etc/nginx/sites-available/flotta /etc/nginx/sites-enabled/flotta && sudo rm -f /etc/nginx/sites-enabled/default
```

Ce `rm` n'est pas du ménage : sans lui, nginx sert sa page d'accueil par défaut sur `/`
et l'application n'est jamais atteinte.

```bash
sudo nginx -t && sudo systemctl reload nginx
```

```bash
sudo systemctl daemon-reload && sudo systemctl enable flotta
```

### Le pare-feu

Dans la console Lightsail, onglet **Networking** de l'instance : ouvrir **80** (HTTP) et
**443** (HTTPS), garder **22** (SSH). Rien d'autre — et surtout pas 3000 : le processus
Node n'écoute que sur `127.0.0.1`, nginx est le seul à lui parler.

---

## 3. Déployer

```bash
deploy/deploy.sh ubuntu@<IP>
```

Le script vérifie (typecheck, lint, cloisonnement, 553 tests), construit, envoie `dist/`
+ `server.mjs` + les manifestes, installe les dépendances de production sur la machine et
redémarre le service. Il finit par interroger l'application sur la boucle locale : un
`http 200` prouve que le service RÉPOND, pas seulement qu'il est « actif ».

`--skip-tests` existe pour un correctif urgent. Ce n'est pas le mode normal.

**Quand une migration accompagne le déploiement**, l'ordre est : `pnpm db:migrate`
d'abord — depuis ton poste, sur Supabase —, `deploy/deploy.sh` ensuite. Une migration
n'ajoute que des colonnes et des tables : l'ancienne version du code continue de tourner
pendant l'opération.

### Ce qu'on regarde après

```bash
ssh ubuntu@<IP> 'journalctl -u flotta -n 50 --no-pager'
```

---

## 4. Le jour où le domaine arrive

Tant qu'il n'y a pas de domaine, l'application est servie **en clair** sur l'IP. C'est
bon pour valider un déploiement ; ça ne l'est pas pour de vrais clients — le mot de passe
et le cookie de session passent en clair sur le réseau.

1. Attacher une **IP statique** à l'instance dans la console Lightsail. Sans ça,
   l'adresse change au redémarrage et le DNS pointe dans le vide.
2. Faire pointer un enregistrement `A` du domaine vers cette IP.
3. Attendre la propagation : `dig +short ton-domaine.ma` doit renvoyer l'IP.
4. Sur la machine :

```bash
sudo sed -i 's/server_name _;/server_name ton-domaine.ma;/' /etc/nginx/sites-available/flotta && sudo nginx -t && sudo systemctl reload nginx
```

```bash
sudo apt install -y certbot python3-certbot-nginx && sudo certbot --nginx -d ton-domaine.ma
```

Certbot réécrit lui-même la configuration nginx : redirection 80 → 443, certificat,
renouvellement automatique par minuterie systemd.

5. **Puis, et c'est l'étape qu'on oublie** : passer `APP_URL` en `https://ton-domaine.ma`
   dans `/etc/flotta/flotta.env`, et redémarrer.

```bash
sudo systemctl restart flotta
```

Sans ça, les liens d'invitation continuent de pointer vers l'ancienne adresse, et les
personnes invitées atterrissent sur une page qui n'existe pas.

---

## 5. Ce qui reste ouvert

Trois choses, nommées ici pour qu'elles ne se découvrent pas en production.

- **Le RLS n'est pas écrit.** Le cloisonnement repose entièrement sur la couche
  `src/db/repositories/`, prouvée par `tests/unit/tenant-isolation.test.ts` (214 cas).
  C'est solide, mais c'est une seule barrière. À noter : le `service_role` de Supabase
  contourne le RLS par conception — l'écrire ne dispenserait donc jamais de la couche
  repository.
- **Le téléversement de fichiers n'existe pas.** Voir §1.
- **Les envois de courriels sont en mode `console`.** Les invitations s'écrivent dans le
  journal (`journalctl -u flotta`) au lieu de partir. Pour de vrais envois : un domaine
  vérifié chez ZeptoMail (SPF + DKIM), puis `NOTIFIER=zoho` et les trois variables
  associées. Un domaine non vérifié fait refuser le message par l'API.
