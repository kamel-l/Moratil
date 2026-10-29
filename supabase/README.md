# Base de données Supabase

Le dossier `supabase/` contient deux migrations **additives** :

| Ordre | Migration                                                                                             | Rôle                                                                                        |
| ----- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| 1     | [`20261015200000_progress_sync.sql`](migrations/20261015200000_progress_sync.sql)                     | Tables de synchronisation historiques : `user_progress`, `verse_mastery`, `daily_activity`. |
| 2     | [`20261029090000_normalized_quran_schema.sql`](migrations/20261029090000_normalized_quran_schema.sql) | Modèle normalisé : profil, statistiques, texte coranique, progression, sessions et erreurs. |

La migration 2 ne supprime rien. Le client actuel continue d'utiliser les tables
historiques jusqu'à la migration de la couche de synchronisation (voir
[Phase 2](#phase-2--migration-du-client)).

## Modèle relationnel

```mermaid
erDiagram
    AUTH_USERS ||--|| PROFILES : "1:1"
    AUTH_USERS ||--|| USER_STATS : "1:1"
    AUTH_USERS ||--o{ DAILY_ACTIVITY : "activité"
    AUTH_USERS ||--o{ MEMORIZATION_PROGRESS : "possède"
    AUTH_USERS ||--o{ REVIEW_SCHEDULE : "planifie"
    AUTH_USERS ||--o{ RECITATION_SESSIONS : "réalise"

    SURAHS ||--o{ AYAHS : "contient"
    QURAN_EDITIONS ||--o{ AYAH_TEXTS : "publie"
    AYAHS ||--o{ AYAH_TEXTS : "texte par édition"

    AYAHS ||--o{ MEMORIZATION_PROGRESS : "suivi"
    AYAHS ||--o{ REVIEW_SCHEDULE : "planifié"
    AYAHS ||--o{ SESSION_AYAHS : "ciblé"

    RECITATION_SESSIONS ||--o{ SESSION_AYAHS : "inclut"
    SESSION_AYAHS ||--o{ RECITATION_ERRORS : "relève"
```

`AUTH_USERS` représente `auth.users`, géré par Supabase Auth. Aucune table
`Users` dupliquée n'est créée : l'identité reste centralisée par Supabase.

## Tables

### Identité et agrégats

| Table            | Clé                         | Contenu                                                                                                                  |
| ---------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `profiles`       | `id` → `auth.users.id`      | Nom affiché, objectif quotidien, langue, fuseau, réglages de rappel et `settings` JSON pour les options non structurées. |
| `user_stats`     | `user_id` → `auth.users.id` | Points, niveau, série, versets récités, durée, précision, badges et sourates terminées.                                  |
| `daily_activity` | `(user_id, activity_date)`  | Versets et sessions par jour. La table historique est réutilisée telle quelle.                                           |

### Référentiel coranique

| Table            | Clé                                  | Contenu                                                                                                             |
| ---------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| `surahs`         | `number` (1–114)                     | Nom arabe/anglais, lieu de révélation, nombre de versets, début du juz et de la page.                               |
| `quran_editions` | `id`                                 | Édition figée : type (`quran`, `tafsir`, `translation`), source, version, URL, empreinte SHA-256 et statut vérifié. |
| `ayahs`          | `id` + `(surah_number, ayah_number)` | Identité canonique d'un verset. **Aucun texte coranique ici.**                                                      |
| `ayah_texts`     | `(ayah_id, edition_id)`              | Texte d'un verset pour une édition donnée, avec le رسم عثماني et le تشكيل.                                          |

Le texte est séparé de l'identité du verset pour permettre plusieurs éditions
(رسم عثماني, tafsir, traduction) sans dupliquer la structure du mushaf.

### Progression et planification

| Table                   | Clé                  | Contenu                                                                                                                           |
| ----------------------- | -------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `memorization_progress` | `(user_id, ayah_id)` | État pédagogique : `new`, `learning`, `review_needed`, `good`, `mastered`, cible, succès consécutifs, erreurs, dernière révision. |
| `review_schedule`       | `(user_id, ayah_id)` | État SM-2 : prochaine échéance, dernier résultat, intervalle, facteur de facilité, répétitions et statut.                         |

Les deux tables sont volontairement séparées : la progression décrit
l'apprentissage, `review_schedule` décrit la file de révision. Une révision peut
être reportée ou suspendue sans effacer l'état pédagogique.

### Sessions de récitation

| Table                 | Clé                             | Contenu                                                                                                                                 |
| --------------------- | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `recitation_sessions` | `id`                            | Session : sourate/plage, début/fin, statut de traitement, résultat, précision, moteur et version du modèle ASR, chemin audio optionnel. |
| `session_ayahs`       | `id` + `(session_id, position)` | **Relation** vers les versets ciblés, avec résultat, texte reconnu et confiance.                                                        |
| `recitation_errors`   | `id`                            | Erreur rattachée à une ligne `session_ayahs` : type, index du mot, mot attendu/reconnu, confiance et confirmation utilisateur.          |

Les versets ciblés ne sont jamais stockés dans un tableau JSON ou un champ
texte. `session_ayahs` permet de joindre, filtrer et agréger les résultats par
verset, sourate ou session.

`recitation_errors.user_confirmation` vaut `pending`, `confirmed` ou `rejected`.
Cela sépare le bruit du moteur ASR des erreurs réellement confirmées par
l'utilisateur.

## Texte coranique : source, version et immutabilité

Règles appliquées :

1. **Aucun texte généré ou réécrit par une IA.** Le contenu de `ayah_texts`
   provient uniquement d'une source coranique publiée, à version fixe.
2. **Rasm uthmani et diacritiques conservés.** L'import ne normalise pas le
   texte : seuls les espaces extérieurs sont retirés.
3. **Empreinte obligatoire.** Chaque édition possède un `checksum_sha256`. Une
   source sans empreinte vérifiée est refusée par défaut.
4. **Structure contrôlée.** L'import exige 114 sourates, 6 236 versets,
   une numérotation contiguë et un texte arabe non vide.
5. **Immutabilité.** Les lignes de `ayah_texts` liées à une édition
   `is_verified = true` ne peuvent être ni modifiées ni supprimées. Une
   correction doit être publiée comme **nouvelle édition/version**.
6. **Lecture seule côté client.** `anon` et `authenticated` peuvent lire le
   référentiel, mais ne peuvent pas l'écrire. L'import utilise une clé
   `service_role` uniquement côté serveur ou `psql`.

### Édition importée

| Champ             | Valeur                                                             |
| ----------------- | ------------------------------------------------------------------ |
| `id`              | `quran-uthmani`                                                    |
| Source            | Tanzil Project — Tanzil Quran Text (Uthmani), version 1.1          |
| Licence           | Creative Commons Attribution 3.0 (copie verbatim uniquement)       |
| Page de référence | <https://tanzil.net/download/>                                     |
| Empreinte du JSON | `298ecad45a577a1451be31e7a9fbf061e1eebb06ecca6584246920eacad354ce` |
| Empreinte du SQL  | `45ed564ffde68274b2ca03d20dc795073ba00db4b6c7c693f3bbfba9014e03fa` |
| Versets           | 114 sourates / 6 236 versets                                       |

Fichiers versionnés :

```
supabase/seed/sources/tanzil-uthmani-1.1.json            # texte de référence (map "sourate:verset")
supabase/seed/sources/tanzil-uthmani-1.1.copyright.txt   # mention de copyright Tanzil, verbatim
supabase/seed/quran-uthmani.sql                          # seed généré, jamais édité à la main
supabase/seed/quran-uthmani.manifest.json                # source, version, empreintes, totaux
```

Le texte coranique provient d'un téléchargement unique et n'est **jamais**
retouché : `scripts/tanzil-to-json.mjs` refuse toute ligne dont le texte
diffère de la source, toute numérotation discontinue et tout espace parasite.
Une correction ne se fait pas en éditant ces fichiers, mais en important une
nouvelle version de la source sous un nouvel `edition_id`.

Le fichier `.copyright.txt` doit rester joint à toute copie du texte,
conformément à la licence Tanzil.

### Importer une édition

Le script [`scripts/import-quran.mjs`](../scripts/import-quran.mjs) accepte :

- une réponse complète alquran.cloud : `{ "data": { "surahs": [...] } }` ;
- une réponse par sourate : `{ "data": { "number": 1, "ayahs": [...] } }` ;
- un tableau de sourates `{ number, ayahs: [...] }` ;
- un tableau de versets `{ surah, ayah, text }` ;
- une table `"sourate:verset": "texte"` ;
- un dossier de fichiers `1.json` … `114.json`.

Exemple de workflow, de la source publiée jusqu'au seed :

```bash
# 1. Télécharger une seule fois le texte Tanzil (format « Text with aya numbers »).
#    quranType=uthmani&outType=txt-2&agree=true&marks=true&sajdah=true&alef=true&tatweel=true
curl -L -o tanzil-uthmani-1.1.txt \
  'https://tanzil.net/pub/download/index.php?quranType=uthmani&outType=txt-2&agree=true&marks=true&sajdah=true&rub=false&alef=true&tatweel=true&laa=false&stanween=false'

# 2. Convertir sans toucher au texte et relever l'empreinte du JSON.
npm run quran:source -- --input tanzil-uthmani-1.1.txt --out supabase/seed/sources/tanzil-uthmani-1.1.json

# 3. Générer le seed SQL avec l'empreinte obtenue.
npm run quran:import -- \
  --source supabase/seed/sources/tanzil-uthmani-1.1.json \
  --sha256 <empreinte-sha256-du-json> \
  --edition-id quran-uthmani \
  --edition-name-ar "الرسم العثماني" \
  --source-name "Tanzil Project" \
  --source-url "https://tanzil.net/" \
  --source-version "1.1"

# 4. Vérifier que le seed s'applique et couvre tout le mushaf.
npm run test:seed
```

L'import écrit aussi `supabase/seed/quran-uthmani.manifest.json` (source,
version, empreinte du texte, nombre de versets et empreinte du fichier SQL) pour
garder une trace vérifiable.

Appliquer le seed avec `psql` de préférence (le fichier est volumineux) :

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/seed/quran-uthmani.sql
```

Sous PowerShell :

```powershell
psql $env:DATABASE_URL -v ON_ERROR_STOP=1 -f supabase/seed/quran-uthmani.sql
```

Le seed est idempotent : les insertions utilisent `on conflict do nothing` et
une vérification finale échoue si l'édition existe avec une autre empreinte, si
le total n'est pas 6 236, ou si une sourate n'a pas le bon nombre de versets.

## Appliquer les migrations

Avec la CLI Supabase liée au projet :

```bash
npx supabase link --project-ref <project-ref>
npx supabase db push
```

Sans CLI ni `psql` (par exemple sur une machine Windows sans client
PostgreSQL), le script `scripts/apply-supabase.mjs` passe par l'API Management :

```bash
# Le jeton est lu depuis un fichier local et n'est jamais affiché.
npm run db:apply -- --migrations --seed --token-file <chemin-du-jeton>

# Vérifie uniquement l'état du mushaf.
npm run db:apply -- --verify --token-file <chemin-du-jeton>
```

Le jeton est un **Personal Access Token** Supabase (`Account > Access Tokens`).
Il ne doit jamais être commité, ni placé dans une variable `VITE_`.

Ou, dans le tableau de bord Supabase → **SQL Editor**, exécuter les fichiers
dans l'ordre des noms :

1. `20261015200000_progress_sync.sql`
2. `20261029090000_normalized_quran_schema.sql`
3. `supabase/seed/quran-uthmani.sql`

La migration 2 crée aussi les lignes `profiles` et `user_stats` des comptes
déjà présents dans `auth.users`.

## Sécurité et RLS

| Table                                             | Accès `anon` | Accès `authenticated`                             |
| ------------------------------------------------- | ------------ | ------------------------------------------------- |
| `surahs`, `quran_editions`, `ayahs`, `ayah_texts` | lecture      | lecture                                           |
| `profiles`, `user_stats`, `daily_activity`        | aucun        | ses propres lignes                                |
| `memorization_progress`, `review_schedule`        | aucun        | ses propres lignes                                |
| `recitation_sessions`                             | aucun        | ses propres sessions                              |
| `session_ayahs`                                   | aucun        | uniquement via une session possédée               |
| `recitation_errors`                               | aucun        | uniquement via une ligne `session_ayahs` possédée |

Les tables enfants héritent de la propriété par une politique `exists` sur la
session parente. Ne jamais exposer `SUPABASE_SERVICE_ROLE_KEY` dans une variable
`VITE_` ni dans l'application cliente.

## Vérification

Un test de schéma exécute réellement les migrations dans PostgreSQL en mémoire
(PGlite), sans Docker :

```bash
npm run test:schema
```

Il vérifie les tables, les triggers, l'immutabilité du texte vérifié, l'isolation
RLS entre deux utilisateurs, l'accès anonyme en lecture et la création
automatique des profils.

Un second test applique le vrai seed coranique sur une base vide :

```bash
npm run test:seed
```

Il compare les 6 236 textes stockés au fichier source versionné, contrôle le
nombre de versets par sourate, l'idempotence du seed et l'impossibilité de
modifier ou supprimer un texte vérifié.

Requêtes utiles après un import :

```sql
select count(*) from public.surahs;      -- 114
select count(*) from public.ayahs;       -- 6236
select count(*) from public.ayah_texts;  -- 6236 par édition importée

select s.number, s.ayah_count, count(a.id) as actual
  from public.surahs s
  left join public.ayahs a on a.surah_number = s.number
 group by s.number, s.ayah_count
having count(a.id) <> s.ayah_count;       -- doit renvoyer 0 ligne

select tablename, policyname, cmd, roles
  from pg_policies
 where schemaname = 'public'
 order by tablename, policyname;
```

## Phase 2 — migration du client

Le client actuel (`src/services/storageService.ts`) synchronise encore :

- `user_progress.stats` (JSON) ;
- `verse_mastery.mastery` (JSON par verset) ;
- `daily_activity`.

Correspondance prévue :

| Client actuel                                                                | Modèle normalisé                      |
| ---------------------------------------------------------------------------- | ------------------------------------- |
| `UserStats`                                                                  | `user_stats`                          |
| `VerseMastery.level`                                                         | `memorization_progress.status`        |
| `VerseMastery.consecutiveSuccessCount`, `mistakeCount`                       | colonnes de `memorization_progress`   |
| `VerseMastery.repetitionCount`, `easeFactor`, `intervalDays`, `nextReviewAt` | `review_schedule`                     |
| `VerseMastery.recentMistakes`                                                | `recitation_errors` (via une session) |
| `daily_activity`                                                             | `daily_activity`                      |

La migration devra être progressive : double écriture, reprise des données
existantes, vérification des compteurs, puis bascule des lectures. Les tables
historiques ne seront supprimées qu'après une période de validation.
