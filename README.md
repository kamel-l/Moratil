<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/de034915-7fd9-444a-a842-fcaf8114d74c

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

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
