<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/de034915-7fd9-444a-a842-fcaf8114d74c

## Run Locally

**Prerequisites:** Node.js

1. Install dependencies:
   `npm install`
2. Configure Supabase Authentication:
   - Copy `.env.example` to `.env.local` and fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from Supabase **Project Settings > API**.
   - Enable email authentication in Supabase **Authentication > Providers** and configure email confirmation as desired.
   - Set the app's local/deployed URL in **Authentication > URL Configuration** so confirmation and password-reset links return to the app.
   - Apply [`supabase/migrations/20261015200000_progress_sync.sql`](supabase/migrations/20261015200000_progress_sync.sql) in the Supabase SQL Editor to create the progress tables and per-user RLS policies.
   - Restart the development server after changing environment variables.
3. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key.
4. Run the app:
   `npm run dev`

Users can create an account, sign in, and request a password-reset email. Progress, verse mastery, and daily recitation activity are stored locally and synchronized to Supabase when connected. Local progress is retained when synchronization fails and retried on the next app session. Legacy local progress is adopted by the first account that signs in after this update; subsequent accounts use separate local storage. Never put a Supabase `service_role` key in the frontend; use only the anon or publishable key.

## Quran Whisper service

Recitation uses continuous speech recognition by default: start once and the app advances through ayahs automatically. The optional Whisper mode analyzes one recorded ayah at a time after you stop the recording.

To use the dedicated recitation recognizer, set `VITE_QURAN_ASR_URL` to your HTTPS Whisper transcription endpoint and `VITE_QURAN_ASR_MODEL` to the model identifier accepted by that service. The app records one ayah locally and uploads it when recording stops, along with the surah/ayah context. The service must accept multipart fields `file`, `model`, `language`, `response_format`, `surah_number`, and `ayah_number`, validate the Supabase access token sent as a Bearer token, and return JSON shaped as `{ "text": "recognized Arabic text" }`. Configure CORS to allow the app origin. Do not put a provider or service secret in a `VITE_` variable; the client does not bundle Whisper weights or host the model.

## Révisions et rappels locaux

La révision utilise SM-2 pour calculer la prochaine échéance à partir des récitations réussies ou échouées. Dans l’écran Révision, les utilisateurs peuvent activer un rappel quotidien et choisir son heure locale. Les notifications nécessitent l’autorisation du système et ne sont disponibles que dans une application native; elles sont planifiées lorsqu’il existe des versets à réviser ou une prochaine échéance. Après l’ajout ou la mise à jour du plugin Capacitor, exécutez `npx cap sync android` avant de reconstruire l’application Android.

# ERP-NATIVE

# 1. Installer Capacitor

npm install @capacitor/core @capacitor/cli

# 2. Initialiser

npx cap init

npm install @capacitor/android

# 3. Ajouter Android

npx cap add android

# 4. Modifier webDir dans capacitor.config.json (build ou dist)

# 5. Construire l'app React

npm run build

# 6. Copier les fichiers

npx cap copy

# 7. Ouvrir Android Studio

npx cap open android

./gradlew clean assembleDebug

npm run build
npx cap sync android
npx cap run android

npm run dev