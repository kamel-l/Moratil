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
   - Restart the development server after changing environment variables.
3. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key.
4. Run the app:
   `npm run dev`

Users can create an account, sign in, and request a password-reset email. Quran progress continues to be stored locally on the current device; Supabase authentication does not synchronize progress between devices. Never put a Supabase `service_role` key in the frontend; use only the anon or publishable key.

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