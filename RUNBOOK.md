# Runbook

Ce document regroupe les commandes utiles pour builder, tester, lancer et deployer `LibreChatGOPA`.

Toutes les commandes ci-dessous sont a executer depuis la racine du projet.

## Prerequis

- Creer un fichier `.env` a partir de `.env.example`.
- Creer un fichier `librechat.yaml` a partir de `librechat.example.yaml`.
  Ce fichier est ignore par Git et `deploy-compose.yml` le monte dans le conteneur API.
- Verifier les cles externes necessaires selon les modules actives:
  - `DEEPL_API_KEY` pour la page DeepL
  - `SEARXNG_SECRET` si tu utilises l'overlay SearXNG
  - `SEARXNG_INSTANCE_URL` et `SEARXNG_API_KEY` si ton `librechat.yaml` pointe vers SearXNG

## Fichiers Compose

- `deploy-compose.yml`
  Stack de base de deploiement avec API, Nginx, MongoDB, Meilisearch, pgvector et RAG API.
- `deploy-compose.local-build.yml`
  Force Docker a builder l'image API locale a partir de ce repo.
- `deploy-compose.local-auth.yml`
  Override local qui coupe OpenID et reactive le login LibreChat classique sur `localhost`.
- `deploy-compose.local-hybrid-auth.yml`
  Override local qui garde le login email/password tout en laissant OpenID actif sur `localhost`.
- `deploy-compose.searxng.yml`
  Ajoute SearXNG et Redis, avec une URL interne par defaut `http://searxng:8080`.
- `deploy-compose.prod-ssl.yml`
  Monte `/etc/letsencrypt` dans le conteneur Nginx.

## Build Et Validation

### Build minimum

```powershell
npm run build:data-provider
npm run build
```

### Validation recommandee avant deployer

```powershell
cd packages/data-schemas; npx jest src/methods/fileRetention.spec.ts src/methods/fileUploadStat.spec.ts src/methods/deeplJob.spec.ts --runInBand
cd ../..
cd packages/api; npx jest src/app/AppService.interface.spec.ts src/files/sdg.spec.ts src/files/deepl.spec.ts --runInBand
cd ../..
cd api; npx jest server/services/FileRetentionService.spec.js server/services/Files/process.spec.js server/routes/admin/index.spec.js server/routes/deepl.spec.js --runInBand
cd ..
cd client; npx jest src/components/Auth/__tests__/Login.spec.tsx src/components/Nav/__tests__/AccountSettings.spec.tsx src/utils/__tests__/interfaceLinks.test.ts --runInBand
cd ..
```

## Local

### Mode local recommande

Build local de l'API + login email local:

```powershell
docker compose -f ./deploy-compose.yml -f ./deploy-compose.local-build.yml -f ./deploy-compose.local-auth.yml up -d --build
```

### Mode local hybride

Build local de l'API + login email/password + OpenID:

```powershell
docker compose -f ./deploy-compose.yml -f ./deploy-compose.local-build.yml -f ./deploy-compose.local-hybrid-auth.yml up -d --build
```

Avec ce mode:

- l'application est servie sur `http://localhost`
- le login email/password reste actif
- le bouton OpenID reste visible pour tester Entra ID / Azure OpenID en local
- les regles d'inscription continuent de venir de `.env` (`ALLOW_REGISTRATION`, `ALLOW_SOCIAL_REGISTRATION`)
- il faut conserver des variables `OPENID_*` valides dans `.env`
- l'application Entra ID doit autoriser l'URI de callback locale `http://localhost/oauth/openid/callback`

### Mode local avec SearXNG

```powershell
docker compose -f ./deploy-compose.yml -f ./deploy-compose.local-build.yml -f ./deploy-compose.local-auth.yml -f ./deploy-compose.searxng.yml up -d --build
```

### Mode local hybride avec SearXNG

```powershell
docker compose -f ./deploy-compose.yml -f ./deploy-compose.local-build.yml -f ./deploy-compose.local-hybrid-auth.yml -f ./deploy-compose.searxng.yml up -d --build
```

### Start sans rebuild

```powershell
docker compose -f ./deploy-compose.yml -f ./deploy-compose.local-build.yml -f ./deploy-compose.local-auth.yml up -d
```

### Stop

```powershell
docker compose -f ./deploy-compose.yml -f ./deploy-compose.local-build.yml -f ./deploy-compose.local-auth.yml stop
```

### Arret complet

```powershell
docker compose -f ./deploy-compose.yml -f ./deploy-compose.local-build.yml -f ./deploy-compose.local-auth.yml down
```

### Logs

```powershell
docker compose -f ./deploy-compose.yml -f ./deploy-compose.local-build.yml -f ./deploy-compose.local-auth.yml logs -f api
```

Avec ce mode:

- l'application est servie sur `http://localhost`
- le login se fait via email/mot de passe LibreChat
- le premier utilisateur cree sur `/register` devient admin

## Production

### Deploiement du fork local

```bash
cd ~/LibreChatGOPA
git pull origin <ta-branche>
docker compose -f ./deploy-compose.yml -f ./deploy-compose.local-build.yml -f ./deploy-compose.searxng.yml -f ./deploy-compose.prod-ssl.yml up -d --build
```

### Deploiement avec image prebuild

```bash
docker compose -f ./deploy-compose.yml -f ./deploy-compose.searxng.yml -f ./deploy-compose.prod-ssl.yml up -d
```

### Redemarrer sans rebuild

```bash
docker compose -f ./deploy-compose.yml -f ./deploy-compose.local-build.yml -f ./deploy-compose.searxng.yml -f ./deploy-compose.prod-ssl.yml up -d
```

### Stop

```bash
docker compose -f ./deploy-compose.yml -f ./deploy-compose.local-build.yml -f ./deploy-compose.searxng.yml -f ./deploy-compose.prod-ssl.yml stop
```

### Arret complet

```bash
docker compose -f ./deploy-compose.yml -f ./deploy-compose.local-build.yml -f ./deploy-compose.searxng.yml -f ./deploy-compose.prod-ssl.yml down
```

### Statut des conteneurs

```bash
docker compose -f ./deploy-compose.yml -f ./deploy-compose.local-build.yml -f ./deploy-compose.searxng.yml -f ./deploy-compose.prod-ssl.yml ps
```

## Mongo Et Backups

### Conteneur et base par defaut

- conteneur MongoDB: `chat-mongodb`
- base MongoDB: `LibreChat`
- collection utilisateurs: `users`

### Lister les users

```bash
docker exec -it chat-mongodb mongosh LibreChat --eval "db.users.find({}, { email: 1, username: 1, name: 1, provider: 1, role: 1, termsAccepted: 1, emailVerified: 1 }).pretty()"
```

### Compter les users

```bash
docker exec -it chat-mongodb mongosh LibreChat --eval "db.users.countDocuments()"
```

### Changer le role d'un user

Passer un user en `ADMIN`:

```bash
docker exec -it chat-mongodb mongosh LibreChat --eval 'db.users.updateOne({ email: "user@example.com" }, { $set: { role: "ADMIN" } })'
```

Remettre un user en `USER`:

```bash
docker exec -it chat-mongodb mongosh LibreChat --eval 'db.users.updateOne({ email: "user@example.com" }, { $set: { role: "USER" } })'
```

Verifier ensuite:

```bash
docker exec -it chat-mongodb mongosh LibreChat --eval 'db.users.findOne({ email: "user@example.com" }, { email: 1, provider: 1, role: 1 })'
```

### Script de backup Linux

Le fichier [backup-librechat.sh](./backup-librechat.sh) est prevu pour le serveur Linux.

Rendre le script executable:

```bash
chmod +x ~/backup-librechat.sh
```

Lancer un backup:

```bash
~/backup-librechat.sh
```

Changer la retention:

```bash
RETENTION_DAYS=30 ~/backup-librechat.sh
```

Le script:

- cree un backup `mongodump` au format `.archive`
- le copie dans `./librechat-backups` a la racine du projet
- supprime automatiquement les backups plus vieux que `RETENTION_DAYS`

### Script de backup PowerShell

Le fichier [backup-librechat.ps1](./backup-librechat.ps1) est prevu pour Windows/PowerShell.

Lancer un backup local:

```powershell
.\backup-librechat.ps1
```

Changer la retention:

```powershell
.\backup-librechat.ps1 -RetentionDays 30
```

Changer le nom du conteneur ou de la base:

```powershell
.\backup-librechat.ps1 -ContainerName chat-mongodb -DatabaseName LibreChat
```

Par defaut, le script PowerShell ecrit aussi dans `.\librechat-backups` a la racine du projet.

## Notes Importantes

- `deploy-compose.local-auth.yml` est reserve au local. Ne pas l'utiliser en production.
- `deploy-compose.local-hybrid-auth.yml` est reserve au local. Ne pas l'utiliser en production.
- `deploy-compose.local-build.yml` est necessaire si tu veux deployer ce fork plutot que l'image upstream.
- `deploy-compose.prod-ssl.yml` ne fait que monter LetsEncrypt.
  Si tu utilises du HTTPS, il faut aussi adapter `client/nginx.conf` a ton domaine et a tes chemins de certificats.
- `deploy-compose.searxng.yml` ajoute le conteneur SearXNG, mais ton `librechat.yaml` doit aussi choisir `searchProvider: "searxng"` pour en profiter.
- `librechat.yaml` est ignore par Git. Garde une copie de reference locale ou recree-le a partir de `librechat.example.yaml`.
- Si `npm run build` casse sous Windows, verifie d'abord que `packages/client` et `packages/data-provider` ont bien ete rebuild apres un changement de config.
