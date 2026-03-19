# Migration Checklist

Migration cible: `librachatbot-v1` -> `LibreChatGOPA`

Objectif:

- conserver les fonctions GOPA utiles
- migrer vers la base la plus récente et maintenable
- limiter les changements legacy JS au strict necessaire

Regle directrice:

- nouveaux schemas Mongo: `packages/data-schemas`
- nouvelle logique backend: `packages/api`
- contrats API/types/hooks partages: `packages/data-provider`
- UI React: `client`
- wrappers Express legacy: `api/server` uniquement si necessaire

## Lot 0 - Preparation

- [x] Creer une branche de travail, par exemple `migration/v1-to-gopa`
- [x] Geler `librachatbot-v1` comme reference fonctionnelle
- [x] Lister les variables GOPA depuis `librechat.yaml`, `RUNBOOK.md` et les fichiers `deploy-compose*.yml`
- [x] Lister les assets GOPA a reprendre depuis `client/public/assets`
- [x] Valider le scope MVP:
  - [x] Admin Users
  - [x] Admin Moderation
  - [x] User Guide
  - [x] QuickLinks
  - [x] SDG
  - [x] DeepL
  - [x] Analytics
  - [x] Branding GOPA

Sortie attendue:

- backlog valide
- env vars identifiees
- ordre de migration fige

Statut:

- cloture le `2026-03-18`
- branche active: `migration/v1-to-gopa`
- depot source fonctionnel: `D:\Developement2026\librachatbot-v1`
- depot cible de migration: `D:\Developement2026\LibreChatGOPA`

Mini inventaire lot 0:

Env vars GOPA reperees:

- recherche web:
  - `SERPER_API_KEY`
  - `SEARXNG_INSTANCE_URL`
  - `SEARXNG_API_KEY`
  - `SEARXNG_SECRET`
  - `FIRECRAWL_API_KEY`
  - `FIRECRAWL_API_URL`
  - `FIRECRAWL_VERSION`
  - `JINA_API_KEY`
  - `JINA_API_URL`
  - `COHERE_API_KEY`
- Azure OpenAI:
  - `AZURE_OPENAI_API_KEY_SWEDEN`
  - `AZURE_OPENAI_INSTANCE_NAME`
- outils GOPA:
  - `SDG_API_KEY`
  - `DEEPL_API_KEY`
  - `DEEPL_API_SERVER_URL`
- a externaliser en config runtime plutot qu'en dur:
  - lien GOPA training SharePoint
  - lien GOPA policy SharePoint

Assets GOPA a reprendre en priorite:

- `AI_Translator_grey.png`
- `ai_translator_icon.png`
- `analytics_32.png`
- `chatbot-ui-logo.png`
- `moderation_32.png`
- `sdg_32.png`
- `sdg_goals.png`
- `sdg_wheel_icon.png`
- `user_guide_32.png`
- `users_32.png`

Fichiers de deploiement GOPA a garder en reference:

- `deploy-compose.yml`
- `deploy-compose.searxng.yml`
- `deploy-compose.local-build.yml`
- `deploy-compose.local-auth.yml`
- `deploy-compose.prod-ssl.yml`
- `RUNBOOK.md`

Decision de travail:

- `librachatbot-v1` devient la reference fonctionnelle "read-only"
- `LibreChatGOPA` devient l'unique base de migration
- les fonctions GOPA seront portees vers les couches modernes avant toute recopie d'UI

## Lot 1 - Squelette Backend Admin

But:

- recreer une vraie zone admin dans `LibreChatGOPA` sans recopier le gros `admin.js` legacy

Actions:

- [x] Creer `packages/api/src/admin/`
- [x] Ajouter au minimum:
  - [x] `packages/api/src/admin/moderation.ts`
  - [x] `packages/api/src/admin/users.ts`
  - [x] `packages/api/src/admin/analytics.ts`
- [x] Exporter ces modules depuis `packages/api/src/index.ts`
- [x] Creer un wrapper Express, par exemple `api/server/routes/admin/index.js`
- [x] Mettre a jour `api/server/routes/index.js`
- [x] Mettre a jour `api/server/index.js`
- [x] Garder `api/server/routes/admin/auth.js` separe du nouveau router admin fonctionnel

Etat actuel:

- endpoints squelettes disponibles:
  - `GET /api/admin/moderation`
  - `GET /api/admin/users`
  - `GET /api/admin/analytics/users`
- les reponses respectent deja une shape compatible avec `librachatbot-v1`
- les vraies requetes Mongo, bans, moderation cache et analytics arriveront aux lots 2 a 4

Sources utiles:

- `D:\Developement2026\librachatbot-v1\api\server\routes\admin.js`
- `D:\Developement2026\LibreChatGOPA\api\server\routes\admin\auth.js`
- `D:\Developement2026\LibreChatGOPA\api\server\controllers\UserController.js`

Sortie attendue:

- zone `/api/admin` montee proprement
- auth admin existante intacte

## Lot 2 - Data Schemas Et Modeles Mongo

But:

- porter les structures manquantes pour l'analytics GOPA

Actions:

- [x] Porter `retentionEligible` vers:
  - [x] `packages/data-schemas/src/schema/file.ts`
  - [x] `packages/data-schemas/src/types/file.ts`
- [x] Ajouter le schema/modele/methods DeepL jobs
- [x] Ajouter le schema/modele/methods file retention settings
- [x] Ajouter le schema/modele/methods file upload stats
- [x] Enregistrer les modeles dans `packages/data-schemas/src/models/index.ts`
- [x] Enregistrer les methods dans `packages/data-schemas/src/methods/index.ts`
- [x] Verifier le chargement runtime via:
  - [x] `api/db/models.js`
  - [x] `api/models/index.js`

Etat actuel:

- nouveaux modeles disponibles via `createModels`:
  - `DeepLJobAnalytics`
  - `FileRetentionSettings`
  - `FileUploadStats`
- nouvelles methods disponibles via `createMethods`:
  - `createDeepLJob`
  - `updateDeepLJobByDocumentId`
  - `listRecentDeepLJobs`
  - `searchDeepLJobs`
  - `getSidebarFileRetentionSettings`
  - `updateSidebarFileRetentionSettings`
  - `getSidebarUploadsForCleanup`
  - `recordSidebarFileUpload`
  - `getSidebarUploadCountsByUserIds`
  - `syncSidebarUploadCountsFromFiles`
- tests cibles ajoutes dans:
  - `packages/data-schemas/src/methods/deeplJob.spec.ts`
  - `packages/data-schemas/src/methods/fileRetention.spec.ts`
  - `packages/data-schemas/src/methods/fileUploadStat.spec.ts`
- validation effectuee:
  - `npm run build:data-schemas`
  - `jest` cible sur les 3 nouvelles specs

Sources utiles:

- `D:\Developement2026\librachatbot-v1\packages\data-schemas\src\schema\file.ts`
- `D:\Developement2026\librachatbot-v1\packages\data-schemas\src\types\file.ts`
- `D:\Developement2026\librachatbot-v1\api\server\services\DeepLJobStore.js`
- `D:\Developement2026\librachatbot-v1\api\server\services\FileRetentionStore.js`

Sortie attendue:

- build `data-schemas` OK
- modeles disponibles au runtime

## Lot 3 - Retention Et Analytics Des Uploads

But:

- brancher correctement l'analytics GOPA sur les uploads fichiers existants

Actions:

- [x] Porter la logique de:
  - [x] `api/server/services/FileRetentionStore.js`
  - [x] `api/server/services/FileRetentionService.js`
- [x] Brancher `retentionEligible` dans `api/server/services/Files/process.js`
- [x] Ajouter l'enregistrement des uploads sidebar
- [x] Ajouter des tests cibles backend

Point sensible:

- ne pas casser les uploads actuels

Etat actuel:

- services legacy ajoutes:
  - `api/server/services/FileRetentionStore.js`
  - `api/server/services/FileRetentionService.js`
- `api/server/services/Files/process.js` marque maintenant les uploads eligibles:
  - upload standard `message_attachment`
  - upload assistants seulement si `message_file === true`
  - upload agent `context` seulement si `message_file === true`
- les compteurs sidebar sont enregistres via `recordSidebarFileUpload`
- la purge planifiee est initialisee au demarrage du serveur dans `api/server/index.js`
- tests backend ajoutes ou etendus:
  - `api/server/services/Files/process.spec.js`
  - `api/server/services/FileRetentionService.spec.js`
- validation effectuee:
  - `npx eslint api/server/services/FileRetentionStore.js api/server/services/FileRetentionService.js api/server/services/FileRetentionService.spec.js api/server/services/Files/process.js api/server/services/Files/process.spec.js api/server/index.js`
  - `cd api && npx jest server/services/FileRetentionService.spec.js server/services/Files/process.spec.js --runInBand`

Sortie attendue:

- les fichiers attaches aux messages alimentent bien les stats de retention

## Lot 4 - Endpoints Admin Fonctionnels

But:

- porter les endpoints admin en blocs logiques

Actions:

- [x] Implementer `GET /api/admin/moderation`
- [x] Implementer `GET /api/admin/users`
- [x] Implementer `POST /api/admin/users/:userId/ban`
- [x] Implementer `POST /api/admin/users/:userId/unban`
- [x] Implementer `POST /api/admin/users/:userId/reset-password`
- [x] Implementer `DELETE /api/admin/users/:userId`
- [x] Implementer `GET /api/admin/analytics/users`
- [x] Implementer `GET /api/admin/analytics/file-retention`
- [x] Implementer `PATCH /api/admin/analytics/file-retention`
- [x] Implementer `POST /api/admin/analytics/file-retention/purge`
- [x] Preparer `GET /api/admin/analytics/deepl-jobs` pour le lot DeepL

Etat actuel:

- la logique admin GOPA a ete remontee dans `packages/api/src/admin/`:
  - `moderation.ts`
  - `users.ts`
  - `analytics.ts`
- `api/server/routes/admin/index.js` est maintenant un wrapper fin branche sur:
  - `User`, `Prompt`, `PromptGroup`, `Preset`, `File`, `DeepLJobAnalytics`
  - `~/models` pour `searchDeepLJobs`, `deleteAllUserSessions`, et les methods file retention
  - `~/cache` pour les stores de moderation et de ban
- endpoints fonctionnels exposes:
  - `GET /api/admin/moderation`
  - `GET /api/admin/users`
  - `POST /api/admin/users/:userId/ban`
  - `POST /api/admin/users/:userId/unban`
  - `POST /api/admin/users/:userId/reset-password`
  - `DELETE /api/admin/users/:userId`
  - `GET /api/admin/analytics/users`
  - `GET /api/admin/analytics/file-retention`
  - `PATCH /api/admin/analytics/file-retention`
  - `POST /api/admin/analytics/file-retention/purge`
  - `GET /api/admin/analytics/deepl-jobs`
- tests backend ajoutes:
  - `api/server/routes/admin/index.spec.js`
- validation effectuee:
  - `npx eslint packages/api/src/admin/types.ts packages/api/src/admin/utils.ts packages/api/src/admin/moderation.ts packages/api/src/admin/users.ts packages/api/src/admin/analytics.ts api/server/routes/admin/index.js api/server/routes/admin/index.spec.js`
  - `npm run build:api`
  - `cd api && npx jest server/routes/admin/index.spec.js --runInBand`

Sources utiles:

- `D:\Developement2026\librachatbot-v1\api\server\routes\admin.js`
- `D:\Developement2026\LibreChatGOPA\api\server\controllers\UserController.js`
- `D:\Developement2026\LibreChatGOPA\api\server\services\AuthService.js`

Sortie attendue:

- endpoints admin testables depuis le navigateur ou Postman

## Lot 5 - Couche Data Provider Partagee

But:

- eviter les appels `request.*` directs dans les pages React

Actions:

- [x] Ajouter les endpoints admin dans `packages/data-provider/src/api-endpoints.ts`
- [x] Ajouter les appels dans `packages/data-provider/src/data-service.ts`
- [x] Ajouter les `QueryKeys` et `MutationKeys` dans `packages/data-provider/src/keys.ts`
- [ ] Ajouter les types dans:
  - [x] `packages/data-provider/src/types/queries.ts`
  - [x] `packages/data-provider/src/types/mutations.ts`
- [ ] Creer:
  - [x] `client/src/data-provider/Admin/queries.ts`
  - [x] `client/src/data-provider/Admin/mutations.ts`
  - [x] `client/src/data-provider/Admin/index.ts`
- [x] Exporter depuis `client/src/data-provider/index.ts`

Etat actuel:

- contrats admin centralises dans `packages/data-provider/src/types/admin.ts`
- `packages/api/src/admin/types.ts` re-exporte maintenant ces types partages
- endpoints partages ajoutes dans:
  - `packages/data-provider/src/api-endpoints.ts`
- data service admin ajoute dans:
  - `packages/data-provider/src/data-service.ts`
- cles React Query ajoutees dans:
  - `packages/data-provider/src/keys.ts`
- hooks React Query admin ajoutes dans:
  - `client/src/data-provider/Admin/queries.ts`
  - `client/src/data-provider/Admin/mutations.ts`
- export client ajoute dans:
  - `client/src/data-provider/index.ts`
- correction de contrat:
  - `file-retention.settings.updatedAt` est maintenant serialise en `string | null` pour correspondre au JSON reel
- validation effectuee:
  - `npx eslint packages/data-provider/src/types/admin.ts packages/data-provider/src/types.ts packages/data-provider/src/types/index.ts packages/data-provider/src/types/queries.ts packages/data-provider/src/types/mutations.ts packages/data-provider/src/api-endpoints.ts packages/data-provider/src/data-service.ts packages/data-provider/src/keys.ts packages/data-provider/src/index.ts packages/api/src/admin/types.ts packages/api/src/admin/analytics.ts client/src/data-provider/Admin/queries.ts client/src/data-provider/Admin/mutations.ts client/src/data-provider/Admin/index.ts client/src/data-provider/index.ts`
  - `npm run build:data-provider`
  - `npm run build:api`

Sortie attendue:

- les pages admin utilisent React Query proprement

## Lot 6 - UI Admin Et Navigation GOPA

But:

- remettre la navigation et les pages GOPA visibles dans l'application

Actions:

- [x] Ajouter ou recreer:
  - [x] `client/src/routes/AdminUsers.tsx`
  - [x] `client/src/routes/AdminModeration.tsx`
  - [x] `client/src/routes/AdminAnalytics.tsx`
  - [x] `client/src/routes/UserGuide.tsx`
  - [x] `client/src/routes/SDG.tsx`
  - [x] `client/src/routes/DeepL.tsx`
- [x] Ajouter:
  - [x] `client/src/components/Nav/QuickLinks.tsx`
  - [x] `client/src/components/PageHeaderCard.tsx`
  - [x] `client/src/components/AssetIcon.tsx`
- [x] Injecter `QuickLinks` dans `client/src/components/Nav/Nav.tsx`
- [x] Declarer les routes dans `client/src/routes/index.tsx`
- [x] Remplacer les textes hardcodes par `useLocalize()`
- [x] Mettre a jour `client/src/locales/en/translation.json`

Etat actuel:

- navigation GOPA visible dans la sidebar:
  - `guide`
  - `sdg`
  - `deepl`
  - `admin/users`
  - `admin/moderation`
  - `admin/analytics`
- pages admin branchees sur les hooks React Query du lot 5
- `UserGuide` disponible dans `LibreChatGOPA`
- `SDG` et `DeepL` exposes comme pages de transition propres, en attendant les lots 7 et 8
- composants UI mutualises ajoutes:
  - `client/src/components/AssetIcon.tsx`
  - `client/src/components/PageHeaderCard.tsx`
  - `client/src/components/Nav/QuickLinks.tsx`
- assets GOPA recopies depuis `librachatbot-v1/client/public/assets`:
  - `ai_translator_icon.png`
  - `analytics_32.png`
  - `moderation_32.png`
  - `sdg_32.png`
  - `user_guide_32.png`
  - `users_32.png`

Validation effectuee:

- `npx prettier --write` sur les fichiers frontend touches
- `npx eslint` cible sur les fichiers frontend du lot 6
- `npx tsc -p client/tsconfig.json --noEmit`
  - le typecheck global du client echoue encore hors perimetre du lot 6
  - aucun diagnostic releve n'impliquait les fichiers modifies pour ce lot

Sources utiles:

- `D:\Developement2026\librachatbot-v1\client\src\routes\AdminUsers.tsx`
- `D:\Developement2026\librachatbot-v1\client\src\routes\AdminModeration.tsx`
- `D:\Developement2026\librachatbot-v1\client\src\routes\AdminAnalytics.tsx`
- `D:\Developement2026\librachatbot-v1\client\src\routes\UserGuide.tsx`
- `D:\Developement2026\librachatbot-v1\client\src\components\Nav\QuickLinks.tsx`

Sortie attendue:

- les pages GOPA existent dans `LibreChatGOPA`
- la navigation laterale permet de les ouvrir

## Lot 7 - Portage SDG

But:

- porter SDG en profitant du parsing serveur moderne

Actions:

- [x] Creer la logique backend dans:
  - [x] `packages/api/src/files/sdg.ts`
- [x] Creer le wrapper legacy:
  - [x] `api/server/routes/sdg.js`
- [x] Reutiliser le parsing serveur de:
  - [x] `packages/api/src/files/documents/crud.ts`
- [x] Ajouter les endpoints/types/hooks SDG dans:
  - [x] `packages/data-provider`
  - [x] `client/src/data-provider/SDG`
- [x] Reprendre l'UI depuis:
  - [x] `client/src/components/SDG/SDGMapper.tsx`
- [x] Simplifier l'UI en evitant le parsing navigateur inutile

Sources utiles:

- `D:\Developement2026\librachatbot-v1\api\server\routes\sdg.js`
- `D:\Developement2026\librachatbot-v1\api\server\services\SDGService.js`
- `D:\Developement2026\librachatbot-v1\client\src\components\SDG\SDGMapper.tsx`
- `D:\Developement2026\LibreChatGOPA\packages\api\src\files\documents\crud.ts`

Sortie attendue:

- un document ou un texte libre peut etre soumis et retourne un resultat SDG exploitable

Validation:

- [x] `npm run build:data-provider`
- [x] `npm run build:api`
- [x] `cd packages/api && npx jest src/files/sdg.spec.ts --runInBand`
- [x] `npx eslint ...` sur les fichiers touches du lot 7
- [x] controle TS client cible: aucune erreur remontee sur `client/src/components/SDG/SDGMapper.tsx`, `client/src/routes/SDG.tsx` ou `client/src/data-provider/SDG`

## Lot 8 - Portage DeepL

But:

- remettre la traduction documentaire GOPA

Actions:

- [x] Ajouter `deepl-node` dans `api/package.json`
- [x] Creer la logique backend DeepL
- [x] Ajouter ou porter:
  - [x] route legacy `api/server/routes/deepl.js`
  - [x] service DeepL
  - [x] job store DeepL via `~/models`
- [x] Ajouter les endpoints/types/hooks DeepL dans:
  - [x] `packages/data-provider`
  - [x] `client/src/data-provider/DeepL`
- [x] Reprendre l'UI depuis:
  - [x] `client/src/components/DeepL/DeeplTranslator.tsx`
- [x] Finaliser `GET /api/admin/analytics/deepl-jobs`

Validation lot 8:

- [x] `npx prettier --write ...` sur les fichiers touches du lot 8
- [x] `npx eslint ...` sur les fichiers touches du lot 8
- [x] `npm run build:data-provider`
- [x] `npm run build:api`
- [x] `cd packages/api && npx jest src/files/deepl.spec.ts --runInBand`
- [x] `cd api && npx jest server/routes/deepl.spec.js --runInBand`
- [x] controle TS client cible: aucune erreur remontee sur `client/src/components/DeepL/DeeplTranslator.tsx`, `client/src/routes/DeepL.tsx` ou `client/src/data-provider/DeepL`

Sources utiles:

- `D:\Developement2026\librachatbot-v1\api\server\routes\deepl.js`
- `D:\Developement2026\librachatbot-v1\api\server\services\DeepLService.js`
- `D:\Developement2026\librachatbot-v1\api\server\services\DeepLJobStore.js`
- `D:\Developement2026\librachatbot-v1\client\src\components\DeepL\DeeplTranslator.tsx`

Sortie attendue:

- upload
- polling statut
- download
- analytics DeepL

## Lot 9 - Branding Et Config GOPA

But:

- reporter le branding GOPA sans hardcoder la logique dans les composants

Actions:

- [x] Reprendre le comportement de:
  - [x] `client/src/components/Auth/Login.tsx`
  - [x] `client/src/components/Nav/AccountSettings.tsx`
- [x] Ajouter des champs de config generiques dans:
  - [x] `packages/data-provider/src/config.ts`
  - [x] `api/server/routes/config.js`
    - aucun changement de code requis: la route republiait deja `interfaceConfig` via `startupConfig.interface`
- [x] Passer les liens GOPA training/policy par config runtime
- [x] Reprendre les assets de branding utiles
  - deja copies pendant le lot 6

Validation:

- [x] `npx eslint` sur les fichiers modifies du lot 9
- [x] `npm run build:data-provider`
- [x] `npm run build:data-schemas`
- [x] `cd packages/api && npx jest src/app/AppService.interface.spec.ts --runInBand`
- [x] `cd packages/client && npm run build`
- [x] `cd client && npx jest src/components/Auth/__tests__/Login.spec.tsx src/components/Nav/__tests__/AccountSettings.spec.tsx src/utils/__tests__/interfaceLinks.test.ts --runInBand`
- [x] typecheck cible du client sur les fichiers du lot 9 apres build de `@librechat/client`

Sortie attendue:

- branding GOPA pilote par config
- aucun lien GOPA important en dur dans le code

## Lot 10 - Deploiement Et Validation Finale

Actions:

- [x] Reprendre si necessaire:
  - [x] `deploy-compose.local-auth.yml`
  - [x] `deploy-compose.local-build.yml`
  - [x] `deploy-compose.prod-ssl.yml`
  - [x] `deploy-compose.searxng.yml`
- [x] Ecrire un runbook adapte a `LibreChatGOPA`
- [x] Lancer `npm run build:data-provider`
- [x] Lancer `npm run build`
- [x] Lancer les tests cibles des zones modifiees
- [x] Corriger les erreurs lint et typecheck

Etat actuel:

- overlays de deploiement ajoutes:
  - `deploy-compose.local-auth.yml`
  - `deploy-compose.local-build.yml`
  - `deploy-compose.prod-ssl.yml`
  - `deploy-compose.searxng.yml`
- configuration SearXNG ajoutee dans `searxng/settings.yml`
- documentation de deploiement centralisee dans `RUNBOOK.md`
- exemples mis a jour:
  - `.env.example`
  - `librechat.example.yaml`
- build racine stabilise sur Windows via `packages/data-provider/rollup.config.js`
  - cache `rollup-plugin-typescript2` isole par bundle
  - cache local ignore par Git via `.gitignore`

Validation:

- [x] `npx eslint packages/data-provider/rollup.config.js packages/api/src/files/deepl.ts`
- [x] `npm run build:data-provider`
- [x] `docker compose -f ./deploy-compose.yml -f ./deploy-compose.local-build.yml -f ./deploy-compose.local-auth.yml config`
- [x] `npm run build`
- [x] `cd packages/data-schemas && npx jest src/methods/fileRetention.spec.ts src/methods/fileUploadStat.spec.ts src/methods/deeplJob.spec.ts --runInBand`
- [x] `cd packages/api && npx jest src/app/AppService.interface.spec.ts src/files/sdg.spec.ts src/files/deepl.spec.ts --runInBand`
- [x] `cd api && npx jest server/services/FileRetentionService.spec.js server/services/Files/process.spec.js server/routes/admin/index.spec.js server/routes/deepl.spec.js --runInBand`
- [x] `cd client && npx jest src/components/Auth/__tests__/Login.spec.tsx src/components/Nav/__tests__/AccountSettings.spec.tsx src/utils/__tests__/interfaceLinks.test.ts --runInBand`

Warnings non bloquants observes:

- `npm run build` remonte encore des warnings frontend Vite sur la taille de certains chunks
- le build frontend remonte aussi des warnings PWA de glob patterns, alors que le post-build confirme la copie des assets
- les tests client affichent des warnings React Router v6 -> v7, sans echec de suite

Sortie attendue:

- build OK
- docs de deploiement a jour
- pas de regression bloquante connue

## Ordre Recommande

- [x] Lot 0
- [x] Lot 1
- [x] Lot 2
- [x] Lot 3
- [x] Lot 4
- [x] Lot 5
- [x] Lot 6
- [x] Lot 7
- [x] Lot 8
- [x] Lot 9
- [x] Lot 10

## MVP Recommande

Si tu veux avancer vite:

- [x] Lot 0
- [x] Lot 1
- [x] Lot 2
- [x] Lot 3
- [x] Lot 4
- [x] Lot 5
- [x] Lot 6
- [x] Lot 7
- [x] Lot 8

## Premier Sous-Lot Conseille Dans VS Code

Quand tu ouvres le projet, commence par:

- [ ] creer `packages/api/src/admin/`
- [ ] creer `api/server/routes/admin/index.js`
- [ ] brancher ce router dans `api/server/routes/index.js`
- [ ] brancher ce router dans `api/server/index.js`
- [ ] implementer d'abord `GET /api/admin/users`

C'est le meilleur point d'entree:

- impact visible rapidement
- faible dependance UI
- peu de risque sur les flux chat principaux
