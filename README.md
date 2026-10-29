# مُرتِّل — Murattil

Application web de mémorisation et de révision du Coran, en arabe (RTL), pensée pour le mobile et empaquetable avec Capacitor pour Android.

## Fonctionnalités

- **Récitation guidée** : suivi de la récitation à la voix, progression automatique entre les versets et mise en évidence des écarts détectés.
- **Mode mémorisation** : découpage du passage en unités, écoute répétée, masquage progressif et récitation complète de mémoire.
- **Révision espacée (SM-2)** : plans de révision, échéances calculées, rappels locaux et suivi des versets à consolider.
- **Explorateur de sourates** : recherche, filtres (Juz 30, mecquoise, médinoise), lecture avec le Tafsir Al-Muyassar et lecture audio.
- **Statistiques** : activité hebdomadaire, répartition de la maîtrise, erreurs récurrentes et objectif quotidien.
- **Récompenses et défis** : points, niveaux, badges et défis de récitation.
- **Synchronisation Supabase** : sauvegarde du progrès par compte, avec reprise locale si le réseau est indisponible.

## Stack

- React 19 + TypeScript + Vite
- Tailwind CSS v4
- lucide-react
- Vitest + Testing Library (jsdom)
- Capacitor (Android)
- Supabase (authentification et synchronisation)

## Démarrage

**Prérequis :** Node.js 20 ou supérieur.

```bash
npm install
cp .env.example .env.local
npm run dev
```

L'application est disponible sur `http://localhost:3000`.

### Variables d'environnement

| Variable | Description |
| --- | --- |
| `VITE_SUPABASE_URL` | URL du projet Supabase |
| `VITE_SUPABASE_ANON_KEY` | Clé publique `anon` / `publishable` (jamais `service_role`) |
| `VITE_QURAN_ASR_URL` | Endpoint HTTPS optionnel du service Whisper coranique |
| `VITE_QURAN_ASR_MODEL` | Identifiant du modèle attendu par ce service |

### Configuration Supabase

1. Activez l'authentification par e-mail dans **Authentication > Providers**.
2. Renseignez l'URL locale et l'URL déployée dans **Authentication > URL Configuration**.
3. Exécutez [`supabase/migrations/20261015200000_progress_sync.sql`](supabase/migrations/20261015200000_progress_sync.sql) dans le SQL Editor pour créer les tables et les politiques RLS.
4. Redémarrez le serveur après toute modification des variables d'environnement.

Le progrès local est conservé en cas d'échec de synchronisation et retenté à la session suivante. Le premier compte connecté reprend l'ancien progrès local ; les comptes suivants disposent d'un stockage séparé.

## Scripts

| Commande | Rôle |
| --- | --- |
| `npm run dev` | Serveur de développement |
| `npm run build` | Build de production |
| `npm run preview` | Prévisualisation du build |
| `npm run lint` | Vérification TypeScript + ESLint |
| `npm test` | Tests unitaires Vitest |
| `npm run format` | Formatage Prettier |

`postinstall` exécute `scripts/patch-speech-recognition.cjs`, qui adapte le plugin de reconnaissance vocale pour Android.

## Structure du projet

```text
src/
  components/        Écrans et composants UI
    ui/              Primitives partagées (Button, Modal, Badge, etc.)
  data/              Sourates préchargées et chargement de l'API
  hooks/             Hooks partagés (révision, reconnaissance vocale)
  services/          Stockage local, synchronisation Supabase, rappels
  types/             Types TypeScript du domaine
  utils/             Audio, texte arabe, helpers
supabase/migrations/ Schéma et politiques RLS
scripts/             Correctifs de build natifs
```

## Reconnaissance vocale

La récitation continue est le mode par défaut : une seule activation permet d'enchaîner les versets. Le mode Whisper optionnel enregistre un verset à la fois et l'envoie à un service compatible OpenAI.

Le service Whisper doit accepter les champs multipart `file`, `model`, `language`, `response_format`, `surah_number` et `ayah_number`, valider le jeton Supabase envoyé en `Authorization: Bearer`, puis renvoyer `{ "text": "texte arabe reconnu" }`. Configurez CORS pour l'origine de l'application. Ne placez jamais de secret fournisseur dans une variable `VITE_`.

## Révisions et rappels

La révision utilise SM-2 pour calculer la prochaine échéance selon la réussite ou l'échec d'une récitation. Depuis l'écran **Révision**, l'utilisateur peut activer un rappel quotidien et choisir son heure locale.

Les notifications nécessitent l'autorisation du système et ne fonctionnent que dans une application native. Elles sont planifiées lorsqu'il existe des versets à réviser ou une échéance à venir.

## Android (Capacitor)

```bash
npm run build
npx cap sync android
npx cap open android
```

Après l'ajout ou la mise à jour d'un plugin Capacitor, exécutez `npx cap sync android` avant de reconstruire l'application.

## Qualité

```bash
npm run lint
npm test
npm run build
```

Les trois commandes doivent passer avant toute publication.
