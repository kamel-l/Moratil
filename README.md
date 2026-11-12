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
```

Les quatre premières commandes doivent passer avant toute publication.
"""
# 📖 فحص بنية الكود — الإصدار الحالي لتطبيق «مُرتِّل» (Murattil)

تطبيق **مُرتِّل** هو منصة متكاملة لحفظ، مراجعة، وتسميع القرآن الكريم بروايتي **حفص عن عاصم** و**ورش عن نافع**. صُمم التطبيق ليعمل بكفاءة عالية على الهواتف الذكية (Android عبر **Capacitor**) والمتصفحات الحديثة، مع دعم كامل للعمل **دون اتصال بالإنترنت (Offline-First)** والمزامنة السحابية عبر **Supabase**.

---

## 🏗️ 1. البنية العامة للمشروع وتنظيم المجلدات

يعتمد المشروع هيكلية منظمة تفصل بين واجهات المستخدم، والمنطق البرمجي، ومعالجة البيانات:

```text
src/
├── components/     # الشاشات وواجهات المستخدم الرئيسية
│   └── ui/         # عناصر التصميم المشتركة (أزرار، نوافذ منبثقة، بطاقات الإحصائيات)
├── data/           # النصوص القرآنية المعتمدة (حفص وورش) وقوائم السور والتفاسير
├── hooks/          # خطافات React المخصصة (الصوت، الميكروفون، وإدارة الجلسات)
├── services/       # منطق التخزين المحلي، المزامنة السحابية، والتذكيرات اليومية
├── types/          # تعريفات الأنواع (TypeScript) لضمان أمان البيانات
└── utils/          # خوارزميات معالجة اللغة العربية، المقارنة الصوتية، وقوائم القراء
```

---

## 📱 2. الشاشات والمكونات الأساسية (`src/components/`)

### 🧭 1. المنسق العام للتطبيق: [App.tsx](file:///I:/PycharmProjects/Quran/src/App.tsx)
* **دوره** : هو النواة المركزية للتطبيق؛ يتحقق من تسجيل دخول المستخدم، ويتحكم في التنقل بين التبويبات، ويدير حالة الاتصال بالإنترنت ومزامنة البيانات في الخلفية دون تعطيل القارئ.

### 🧠 2. نمط التحفيظ الموجه: [MemorizationMode.tsx](file:///I:/PycharmProjects/Quran/src/components/MemorizationMode.tsx)
* **دوره** : مساعدة المستخدم على حفظ مقطع جديد خطوة بخطوة.
* **أبرز مزاياه** :
  * تقسيم السورة إلى وحدات قصيرة قابلة للاستيعاب أو حسب صفحات المصحف عبر دالة [`splitIntoUnits`](file:///I:/PycharmProjects/Quran/src/components/MemorizationMode.tsx#L64-L70).
  * تكرار السماع بصوت القارئ المفضل بعدد مرات محدد.
  * خاصية إخفاء الكلمات تدريجياً لتدريب الذاكرة على الاسترجاع الذاتي.

### 🎙️ 3. شاشة الاختبار والتسميع الشفهي: [MemorizationTest.tsx](file:///I:/PycharmProjects/Quran/src/components/MemorizationTest.tsx)
*(أبرز ما تم تطويره في هذه النسخة)*
* **دوره** : اختبار قوة الحفظ بطريقة تفاعلية ذكية عبر طريقتين:
  1. **التسميع الصوتي المباشر** : يستمع لقراءة المستخدم بالصوت، ويقارن ما نطق به مع الآية كلمة بكلمة؛ حيث تظهر الكلمات الصحيحة باللون الأخضر، والكلمات المنسية أو الخاطئة باللون الأحمر.
  2. **اختبار الآية التالية (اختيار من متعدد)** : يعرض آية ويطلب اختيار بدايتها أو الآية التي تليها لاختبار ترابط الآيات.

### 🔁 4. المراجعة والتكرار المتباعد: [RevisionPlans.tsx](file:///I:/PycharmProjects/Quran/src/components/RevisionPlans.tsx)
* **دوره** : تنظيم الورد اليومي للمراجعة وجدولة السور بناءً على مدى إتقان المستخدم وتفادي النسيان.

### 📚 5. مستكشف السور والمصحف: [SurahExplorer.tsx](file:///I:/PycharmProjects/Quran/src/components/SurahExplorer.tsx)
* **دوره** : قراءة السور الـ 114 بالرسم العثماني الموثوق، مع إمكانية التبديل بين روايتي حفص وورش، والاطلاع على "التفسير الميسر" ومعاني الكلمات الغريبة، والاستماع لكل آية بمفردها.

### 📊 6. لوحة المتابعة والتحفيز: [HomeDashboard.tsx](file:///I:/PycharmProjects/Quran/src/components/HomeDashboard.tsx) و [StatsDashboard.tsx](file:///I:/PycharmProjects/Quran/src/components/StatsDashboard.tsx)
* **دوره** : قياس التفاعل اليومي، تتبع عدد أيام المواظبة المتتالية (Streak)، احتساب النقاط التنافسية، وعرض رسوم بيانية لحجم المحفوظ ونسب الإتقان.

---

## ⚙️ 3. الدوال والخدمات المفتاحية (Key Functions) ودورها

### أ. معالجة النص العربي والمطابقة الصوتية

تتواجد هذه الدوال في [arabicUtils.ts](file:///I:/PycharmProjects/Quran/src/utils/arabicUtils.ts) و [MemorizationTest.tsx](file:///I:/PycharmProjects/Quran/src/components/MemorizationTest.tsx):

1. **[`removeTashkeel(text)`](file:///I:/PycharmProjects/Quran/src/utils/arabicUtils.ts#L13-L20)**:
   * **الدور** : نزع التشكيل وحركات الإعراب وعلامات الوقف والمدود من النص القرآني مؤقتاً لغرض المقارنة، لأن محركات التعرف على الصوت تعيد كلمات مجردة من التشكيل.
2. **[`normalizeArabicText(text)`](file:///I:/PycharmProjects/Quran/src/utils/arabicUtils.ts#L26-L52)**:
   * **الدور** : توحيد رسم الحروف ذات الأشكال المتعددة (مثل تحويل الهمزات `أ إ آ ٱ` إلى `ا`، والتاء المربوطة `ة` إلى `ه`، والألف المقصورة `ى` إلى `ي`).
   * **الأهمية** : تمكين النظام من الحكم بعدل على صحة النطق دون الوقوع في أخطاء ناتجة عن الفروق الإملائية أو التقنية لمستقبل الصوت.
3. **[`alignLCS(expected, recognized)`](file:///I:/PycharmProjects/Quran/src/components/MemorizationTest.tsx#L85-L111)**:
   * **الدور** : تطبيق خوارزمية **أطول تسلسل مشترك (Longest Common Subsequence)**.
   * **الفائدة** : عند تسميع الآية، إذا سها القارئ عن كلمة واحدة فقط، فإن هذه الخوارزمية الذكية لا تعتبر كل الكلمات التالية خطأً؛ بل تكتشف بدقة أي كلمة سقطت وتبقي الكلمات السليمة اللاحقة صحيحة (خضراء).
4. **[`extractWords(verseText)`](file:///I:/PycharmProjects/Quran/src/utils/arabicUtils.ts#L79-L92)**:
   * **الدور** : تفكيك الآية إلى مصفوفة كلمات متصلة ومفهرسة، مع الاحتفاظ بالنص الأصلي المشكول للعرض والنص المنظف للمطابقة.

---

### ب. خوارزميات الحفظ والتخزين والمراجعة

تتواجد هذه الدوال في [storageService.ts](file:///I:/PycharmProjects/Quran/src/services/storageService.ts):

1. **[`recordVerseResult(...)`](file:///I:/PycharmProjects/Quran/src/services/storageService.ts#L629)**:
   * **الدور** : المحرك الرياضي للحفظ القائم على خوارزمية **SM-2 (SuperMemo-2)** للتكرار المتباعد.
   * **طريقة العمل** : إذا سمع المستخدم الآية دون خطأ، يتم تمديد موعد المراجعة القادم (مثلاً: بعد 3 أيام، ثم 7، ثم 14، حتى 365 يوماً كحد أقصى). وإذا أخطأ فيها، تنخفض درجتها وتُجدول للمراجعة الفورية لترسيخها.
2. **[`scheduleDueReviewReminder()`](file:///I:/PycharmProjects/Quran/src/services/revisionReminderService.ts)**:
   * **الدور** : فحص الآيات التي حان موعد مراجعتها اليوم، وتحديد موعد إشعار تنبيه محلي على هاتف المستخدم في التوقيت الذي يختاره.

---

### ج. المزامنة السحابية والعمل دون إنترنت

1. **[`syncProgressFromCloud(userId)`](file:///I:/PycharmProjects/Quran/src/services/storageService.ts#L283)** و **[`saveNormalizedProgress(...)`](file:///I:/PycharmProjects/Quran/src/services/normalizedProgressService.ts)**:
   * **الدور** : إدارة التزامن السلس بين الذاكرة المحلية للجهاز وقاعدة بيانات Supabase.
   * **الميزة** : يعمل التطبيق حتى لو انقطع الإنترنت تماماً؛ وعند توفر الشبكة تدمج النتائج تلقائياً (باعتماد القيمة الأعلى للنقاط وأحدث تاريخ مراجعة) لمنع ضياع أي تقدم أحرزه المستخدم.

---

### د. التفاعل الصوتي والتلاوات

1. **[`useSpeechRecognition(options)`](file:///I:/PycharmProjects/Quran/src/hooks/useSpeechRecognition.ts)**:
   * **الدور** : خطاف مخصص للربط المباشر مع لاقط الصوت (سواء في المتصفح أو عبر إضافة أندرويد الأصلية) مع ضبط لغة التعرف على العربية (`ar-SA`) والمعالجة التلقائية لفترات السكوت والتوقف المؤقت.
2. **[`getAyahAudioUrl(...)`](file:///I:/PycharmProjects/Quran/src/utils/audioReciters.ts)**:
   * **الدور** : جلب المقطع الصوتي للآية بجودة عالية وفقاً للرواية المختارة (حفص أو ورش) والقارئ المفضل من خوادم EveryAyah ومصادر التلاوات المعتمدة.

---

## 💎 خلاصة تقييم هذا الإصدار

| الخاصية | الوصف |
| :--- | :--- |
| **دقة النص القرآني** | نصوص أصلية غير مولدة بالذكاء الاصطناعي، ومأخوذة من مخرجات مشروع تنزيل (Tanzil Uthmani 1.1) مع الحفاظ الكامل على الرسم العثماني. |
| **تعدد الروايات** | دعم أصيل للروايتين الأكثر انتشاراً: **حفص عن عاصم** و**ورش عن نافع** في النصوص والتلاوات. |
| **تقييم صوتي ذكي** | مطابقة فورية عبر خوارزمية LCS تحدد مواضع الخطأ دون لبس. |
| **الاعتمادية** | تصميم متين يعمل بدون إنترنت مع ضمان حفظ السجلات والمزامنة الآلية فور الاتصال. |

"""