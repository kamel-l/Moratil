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

| Variable                 | Description                                                 |
| ------------------------ | ----------------------------------------------------------- |
| `VITE_SUPABASE_URL`      | URL du projet Supabase                                      |
| `VITE_SUPABASE_ANON_KEY` | Clé publique `anon` / `publishable` (jamais `service_role`) |
| `VITE_QURAN_ASR_URL`     | Endpoint HTTPS optionnel du service Whisper coranique       |
| `VITE_QURAN_ASR_MODEL`   | Identifiant du modèle attendu par ce service                |

### Configuration Supabase

1. Activez l'authentification par e-mail dans **Authentication > Providers**.
2. Renseignez l'URL locale et l'URL déployée dans **Authentication > URL Configuration**.
3. Exécutez les migrations dans l'ordre : [`20261015200000_progress_sync.sql`](supabase/migrations/20261015200000_progress_sync.sql), [`20261029090000_normalized_quran_schema.sql`](supabase/migrations/20261029090000_normalized_quran_schema.sql), [`20261029100000_drop_legacy_progress.sql`](supabase/migrations/20261029100000_drop_legacy_progress.sql), puis [`20261029110000_cap_review_schedule.sql`](supabase/migrations/20261029110000_cap_review_schedule.sql). La troisième reprend les données historiques puis supprime `user_progress` et `verse_mastery` : appliquez-la après avoir déployé le client qui n'utilise plus ces tables.
4. Redémarrez le serveur après toute modification des variables d'environnement.

Le schéma normalisé, les relations, les politiques RLS et la procédure d'import du texte coranique sont documentés dans [`supabase/README.md`](supabase/README.md).

Le progrès local est conservé en cas d'échec de synchronisation et retenté à la session suivante. Le premier compte connecté reprend l'ancien progrès local ; les comptes suivants disposent d'un stockage séparé.

La synchronisation lit et écrit uniquement le schéma normalisé (`profiles`, `user_stats`, `memorization_progress`, `review_schedule`, `daily_activity`). À la connexion, le progrès local plus récent est fusionné avec le snapshot distant puis réécrit : maximum pour les compteurs, date de révision la plus récente pour chaque verset. Un échec de lecture ou d'écriture laisse le progrès local intact et est retenté à la session suivante. Voir [Phase 4](supabase/README.md#phase-4--suppression-des-tables-historiques) pour la bascule finale.

## Scripts

| Commande                         | Rôle                                                                |
| -------------------------------- | ------------------------------------------------------------------- |
| `npm run dev`                    | Serveur de développement                                            |
| `npm run build`                  | Build de production                                                 |
| `npm run preview`                | Prévisualisation du build                                           |
| `npm run lint`                   | Vérification TypeScript + ESLint                                    |
| `npm test`                       | Tests unitaires Vitest                                              |
| `npm run test:schema`            | Migrations + RLS + immutabilité dans PostgreSQL en mémoire (PGlite) |
| `npm run test:seed`              | Application du vrai seed coranique et contrôle des 6 236 textes     |
| `npm run quran:source`           | Conversion d'un téléchargement Tanzil en JSON de référence          |
| `npm run quran:import -- --help` | Import vérifié du texte coranique                                   |
| `npm run format`                 | Formatage Prettier                                                  |

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
supabase/
  migrations/        Schéma, triggers et politiques RLS
  seed/              Seeds SQL générés (texte coranique vérifié)
  README.md          Modèle de données et procédure d'import
scripts/             Import du texte coranique, validation du schéma, correctifs natifs
```

## Reconnaissance vocale

La récitation continue est le mode par défaut : une seule activation permet d'enchaîner les versets. Le mode Whisper optionnel enregistre un verset à la fois et l'envoie à un service compatible OpenAI.

Le service Whisper doit accepter les champs multipart `file`, `model`, `language`, `response_format`, `surah_number` et `ayah_number`, valider le jeton Supabase envoyé en `Authorization: Bearer`, puis renvoyer `{ "text": "texte arabe reconnu" }`. Configurez CORS pour l'origine de l'application. Ne placez jamais de secret fournisseur dans une variable `VITE_`.

## Texte coranique et base de données

Le texte coranique n'est jamais généré ni réécrit par l'application ou par un modèle d'IA. Il est importé depuis une source publiée, à version fixe, avec le رسم عثماني et le تشكيل, puis contrôlé par empreinte SHA-256. L'import vérifie 114 sourates, 6 236 versets et une numérotation contiguë.

L'édition livrée est le **Tanzil Quran Text (Uthmani) version 1.1** (Tanzil Project, licence CC BY 3.0), figée dans `supabase/seed/`. Le texte est copié verbatim : les marques de pause, de sajdah et le tatweel sont conservés, et la mention de copyright Tanzil accompagne le fichier source.

Les versets ciblés d'une session de récitation sont stockés dans la relation `session_ayahs`, jamais dans un tableau JSON. Les éditions vérifiées sont immuables : une correction doit être publiée comme nouvelle version.

```bash
npm run quran:import -- --help
npm run test:seed
```

Voir [`supabase/README.md`](supabase/README.md) pour le modèle complet et le workflow d'import.

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
npm run test:schema
npm run test:seed
npm run build

./gradlew clean assembleDebug
```

Les quatre premières commandes doivent passer avant toute publication.
curl -I -s "https://fonts.qurancomplex.gov.sa/wp-content/uploads/2022/11/UthmanicWarsh_V21.zip"

"""
إليك وصفٌ شامل وتفصيلي لهذه النسخة من تطبيق **«مُرتِّل — Murattil»** مع **فحص بنية الكود** وإبراز الدوال والمكوّنات المفتاحية ودورها بلغة عربية سهلة وواضحة:

---

# 📖 نظرة عامة على هذه النسخة (مُرتِّل — Murattil)

**مُرتِّل** هو تطبيق قرآني تفاعلي للويب والأجهزة الذكية (عبر Capacitor لنظام Android)، يهدف إلى مساعدة المسلم على **حفظ القرآن الكريم، وضبط التسميع الصوتي بالذكاء الاصطناعي لحظيًا، وتثبيت الحفظ عبر التكرار المتباعد (SM-2)**.

تعتمد هذه النسخة مبدأ **«محلي أولًا» (Local-First)**؛ حيث يعمل التطبيق بكامل وظائفه دون الحاجة إلى اتصال دائم بالإنترنت، مع إمكانية **إنشاء حساب ومزامنة البيانات سحابيًا** عبر Supabase بمجرد توفر الشبكة.

---

# 🏗️ فحص بنية الكود وتنظيم المشروع

تم بناء التطبيق باستخدام أحدث التقنيات: **React 19** مع **TypeScript** و**Vite** و**Tailwind CSS v4**، وتم تقسيم المشروع وفق هيكلية واضحة تفصل واجهة المستخدم عن منطق المعالجة والبيانات:

```text
src/
├── components/      # شاشات التطبيق وواجهات المستخدم (UI)
│   └── ui/          # عناصر الواجهة المشتركة (أزرار، نوافذ، بطاقات تفاعلية)
├── data/            # النص القرآني الموثّق، بيانات السور، وإعدادات الروايات (حفص، ورش...)
├── hooks/           # خطافات برمجية مخصصة (Hooks) للتعرف الصوتي والصوتيات
├── services/        # خدمات الحفظ المحلي، المصادقة (Auth)، ومحرك المزامنة السحابية
├── types/           # تعريفات الأنواع البرمجية ونماذج البيانات (TypeScript Types)
└── utils/           # دوال معالجة النص العربي، المقارنة الصوتية، وحسابات التقسيم
supabase/
└── migrations/      # مخططات وتحديثات قاعدة البيانات SQL وسياسات الأمان RLS
```

---

# 🔑 أهم الوحدات والدوال المفتاحية ودورها (بشرح مبسّط)

### 1. محرك التسميع والتحليل الصوتي الذكي (`src/utils/` و `src/hooks/`)
وظيفة هذا الجزء هي الاستماع إلى صوت المستخدم ومقارنة ما يقوله بالنص القرآني في نفس اللحظة:

* **دالتا `removeTashkeel` و `normalizeArabicText` ([`arabicUtils.ts`](file:///i:/PycharmProjects/Quran/src/utils/arabicUtils.ts)):**
  * **الدور:** تنظيف النص وتجهيزه للمقارنة؛ تقومان بإزالة التشكيل وعلامات الوقف، وتوحيد رسم الحروف المتعددة (مثل أشكال الألف: أ، إ، آ، ٱ، أو التاء المربوطة والهاء). هذا يضمن عدم احتساب خطأ إذا كانت المشكلة مجرد اختلاف في طريقة كتابة الحرف أو التشكيل.
* **دالة `phoneticNormalize` ([`arabicUtils.ts`](file:///i:/PycharmProjects/Quran/src/utils/arabicUtils.ts)):**
  * **الدور:** التقريب الصوتي للحروف المتقاربة في المخارج (مثل: س/ص، د/ض، ت/ط)؛ حيث قد يلتقط اللاقط الصوتي الكلمة بحرف بديل قريب. تمنع هذه الدالة احتساب خطأ غير عادل للقارئ بسبب حساسية الميكروفون.
* **دالة `evaluateSpokenText(...)` ([`useRecitationSession.ts`](file:///i:/PycharmProjects/Quran/src/hooks/useRecitationSession.ts)):**
  * **الدور:** العقل المدبّر لجلسة التسميع؛ تقارن الكلمات المنطوقة مع آيات السورة، مع خاصية النظر للأمام (*Look-Ahead*)؛ لتحديد:
    * الكلمات التي قُرئت بشكل صحيح وتلوينها.
    * الكلمات التي نسيها القارئ وتخطاها وتنبيهه إليها.
    * الكلمات التي أخطأ في نطقها مع إظهار الصواب فورًا.

---

### 2. محرك الحفظ والتسميع التدريجي (`src/components/`)
* **مكوّن `MemorizationSession.tsx` ([`MemorizationSession.tsx`](file:///i:/PycharmProjects/Quran/src/components/MemorizationSession.tsx)):**
  * **الدور:** إدارة جلسة الحفظ خطوة بخطوة وفق منهجية علمية تمر بأربع مراحل:
    1. **الاختيار:** تحديد المقدار المراد حفظه.
    2. **الاستماع والتكرار:** الاستماع للآيات بصوت مشاهير القرّاء مع تكرار محدد.
    3. **الإخفاء التدريجي للنص (`isWordHidden`):** إخفاء الكلمات تدريجيًا (نص كامل ← ثلث مخفي ← ثلثان ← مخفي تمامًا) لاختبار قوة الذاكرة.
    4. **التسميع النهائي:** تلاوة الآيات غيبًا بالصوت لتأكيد الحفظ.
* **دالة `buildAyahUnits(...)` ([`displayUnits.ts`](file:///i:/PycharmProjects/Quran/src/utils/displayUnits.ts)):**
  * **الدور:** تقسيم النص القرآني حسب رغبة الحافظ (آية آية، صفحة مصحف كاملة، ربع حزب، أو حزب كامل).

---

### 3. خوارزمية التكرار المتباعد وتثبيت المحفوظ (SRS) (`storageService.ts` و `RevisionPlans.tsx`)
* **دالة `recordVerseResult(...)` ([`storageService.ts`](file:///i:/PycharmProjects/Quran/src/services/storageService.ts)):**
  * **الدور:** تطبيق خوارزمية **SM-2** الذكية للمراجعة الدورية؛ الآية المتقنة يتباعد موعد مراجعتها تدريجيًا (يوم ← 3 أيام ← أسبوع ← أسبوعين...)، بينما الآية التي تعثّر فيها القارئ تُدرج فورًا في قائمة **«آيات تحتاج لتثبيت»** ليعيد مراجعتها في أقرب وقت.
* **مكوّن `RevisionPlans.tsx` ([`RevisionPlans.tsx`](file:///i:/PycharmProjects/Quran/src/components/RevisionPlans.tsx)):**
  * **الدور:** عرض جداول المراجعة اليومية، وخطط الحفظ المخصصة (مثل تثبيت جزء عمّ أو سورة الملك)، والآيات المتعثرة مجمّعة حسب السورة لسهولة مراجعتها.

---

### 4. المصادقة والمزامنة السحابية وقاعدة البيانات (`src/services/`)
تم في هذه النسخة إتمام نظام الحسابات وربطه بقاعدة بيانات Supabase:

* **`authService.ts` و `AuthGate.tsx` ([`authService.ts`](file:///i:/PycharmProjects/Quran/src/services/authService.ts)):**
  * **الدور:** إدارة تسجيل الدخول وإنشاء حساب جديد بالبريد الإلكتروني (`signUpWithEmail` و `signInWithEmail`).
  * **الميزة الذكية:** دالة `claimLocalData()` التي تقوم بنقل كل الإنجازات والآيات المحفوظة التي حققها المستخدم قبل تسجيل الدخول وربطها بحسابه الجديد تلقائيًا دون أن يفقد أي تقدم.
* **دالة `syncNow()` ([`syncService.ts`](file:///i:/PycharmProjects/Quran/src/services/syncService.ts)):**
  * **الدور:** محرك المزامنة السحابية؛ يعمل بنظام دقيق:
    1. **السحب (Pull):** جلب البيانات الأحدث من السحابة إذا كان المستخدم قد راجع من جهاز آخر، والدمج وفق مبدأ «التعديل الأحدث يفوز».
    2. **الرفع (Push):** إرسال الآيات والجلسات الجديدة المنجزة محليًا إلى السحابة فور عودة الاتصال.

---

### 5. توثيق النص القرآني والروايات (`src/data/` و `supabase/`)
* **النص القرآني الموثق (Tanzil Uthmani v1.1):**
  * **الدور:** النص القرآني محفوظ برسم المصحف العثماني وتشكيله الكامل، مع التحقق الصارم من بصمته الرقمية (SHA-256) لجميع السور (114 سورة) والآيات (6236 آية) دون أي تدخّل أو توليد من الذكاء الاصطناعي.
* **دعم الروايات القرآنية ([`riwayahConfig.ts`](file:///i:/PycharmProjects/Quran/src/data/riwayahConfig.ts)):**
  * **الدور:** دعم القراءة برواية **حفص عن عاصم** ورواية **ورش عن نافع**، مع تحميل الخطوط الرسمية المعتمدة تلقائيًا لكل رواية ومراعاة فواصل الآيات الخاصة بها.

---

# 🌟 خلاصة مميزات هذه النسخة

1. **تصميم فاخر وعصري:** واجهة عربية أصيلة بتنسيق راست-إلى-يسار (RTL) وثيم «اليشم والذهب» مستوحى من زخارف المصاحف المذهبة، مع حركات وانتقالات انسيابية.
2. **استقرار تام للبيانات:** إمكانية الاستخدام دون إنترنت، وحفظ فوري مع مزامنة سحابية تضمن عدم ضياع أي آية تم حفظها.
3. **دقة التسميع الصوتي:** دعم الميكروفون المدمج للمتصفح وعلى هواتف Android، مع معالجة ذكية للأخطاء والنطق والتخطي.
4. **تدرج تعليمي واقعي:** مسار مدروس من الاستماع إلى الحفظ ثم التسميع ثم المراجعة طويلة المدى.

"""
