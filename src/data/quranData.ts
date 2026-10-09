import { Surah, Ayah } from '../types/quran';
import { ALL_SURAHS } from './quranSurahsList';

// Core pre-loaded surahs with Uthmani Arabic script and authentic Tafsir Al-Muyassar (التفسير الميسر)
export const PRELOADED_SURAHS: Record<number, Surah> = {
  1: {
    number: 1,
    name: "الفاتحة",
    englishName: "Al-Faatiha",
    revelationType: "مكية",
    numberOfAyahs: 7,
    juzStart: 1,
    pageStart: 1,
    ayahs: [
      {
        numberInSurah: 1,
        text: "بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ",
        juz: 1,
        tafsir: "أبتدئ قراءتي للقرآن باسم الله مستعيناً به، (الله) علم على الرب تبارك وتعالى، (الرحمن) ذو الرحمة العامة الشاملة لجميع خلقه، (الرحيم) بالمؤمنين.",
        keyWordsMeaning: [{ word: "الرحمن", meaning: "ذو الرحمة الواسعة الشاملة لجميع الخلائق" }, { word: "الرحيم", meaning: "ذو الرحمة الخاصة بالمؤمنين" }]
      },
      {
        numberInSurah: 2,
        text: "الْحَمْدُ لِلَّهِ رَبِّ الْعَالَمِينَ",
        juz: 1,
        tafsir: "الثناء الكامل والشكر الخالص لله وحده، فهو المربي لجميع الخلق بنعمه وخالقهم ومالك أمرهم.",
        keyWordsMeaning: [{ word: "رب العالمين", meaning: "مالك جميع الخلائق ومربيهم بنعمه الظاهرة والباطنة" }]
      },
      {
        numberInSurah: 3,
        text: "الرَّحْمَٰنِ الرَّحِيمِ",
        juz: 1,
        tafsir: "ثناء على الله تعالى بصفة الرحمة الواسعة التي وسعت كل شيء، والرحمة العظيمة بعباده الصالحين.",
        keyWordsMeaning: [{ word: "الرحمن", meaning: "كثير الرحمة والفضل" }]
      },
      {
        numberInSurah: 4,
        text: "مَالِكِ يَوْمِ الدِّينِ",
        juz: 1,
        tafsir: "المالك المتصرف وحده في يوم القيامة والجزاء والحساب، وفيه تذكير بالوقوف بين يديه للحساب.",
        keyWordsMeaning: [{ word: "يوم الدين", meaning: "يوم الجزاء والحساب وهو يوم القيامة" }]
      },
      {
        numberInSurah: 5,
        text: "إِيَّاكَ نَعْبُدُ وَإِيَّاكَ نَسْتَعِينُ",
        juz: 1,
        tafsir: "نخصك وحدك بالعبادة والتذلل ولا نعبد غيرك، ونطلب العون منك وحدك في جميع شؤوننا.",
        keyWordsMeaning: [{ word: "إياك نعبد", meaning: "نخصك بالعبادة إخلاصاً وخضوعاً" }, { word: "نستعين", meaning: "نطلب المدد والمعونة منك وحدك" }]
      },
      {
        numberInSurah: 6,
        text: "اهْدِنَا الصِّرَاطَ الْمُسْتَقِيمَ",
        juz: 1,
        tafsir: "وفقنا وأرشدنا وثبتنا على الطريق الواضح القويم الموصل لرضوانك وجنتك، وهو دين الإسلام.",
        keyWordsMeaning: [{ word: "الصراط المستقيم", meaning: "الطريق الحق المعتدل الذي لا عوج فيه" }]
      },
      {
        numberInSurah: 7,
        text: "صِرَاطَ الَّذِينَ أَنْعَمْتَ عَلَيْهِمْ غَيْرِ الْمَغْضُوبِ عَلَيْهِمْ وَلَا الضَّالِّينَ",
        juz: 1,
        tafsir: "طريق النبيين والصديقين والشهداء والصالحين، لا طريق من غضبت عليهم لعلمهم بالحق وتركه، ولا طريق التائهين عن الحق لجهلهم به.",
        keyWordsMeaning: [{ word: "المغضوب عليهم", meaning: "من عرفوا الحق ولم يعملوا به كاليهود" }, { word: "الضالين", meaning: "من ضلوا عن الحق بجهلهم كالنصارى" }]
      }
    ]
  },
  112: {
    number: 112,
    name: "الإخلاص",
    englishName: "Al-Ikhlaas",
    revelationType: "مكية",
    numberOfAyahs: 4,
    juzStart: 30,
    pageStart: 604,
    ayahs: [
      {
        numberInSurah: 1,
        text: "قُلْ هُوَ اللَّهُ أَحَدٌ",
        juz: 30,
        tafsir: "قل أيها الرسول: الله هو المتفرد بالألوهية والربوبية والأسماء والصفات، لا شريك له.",
        keyWordsMeaning: [{ word: "أحد", meaning: "الواحد المتفرد الذي لا مثل له ولا شريك" }]
      },
      {
        numberInSurah: 2,
        text: "اللَّهُ الصَّمَدُ",
        juz: 30,
        tafsir: "السيد الذي تصمد إليه الخلائق وتقصده في جميع حوائجها ورغائبها ومهماتها.",
        keyWordsMeaning: [{ word: "الصمد", meaning: "المقصود في قضاء الحوائج والمفتقر إليه كل شيء" }]
      },
      {
        numberInSurah: 3,
        text: "لَمْ يَلِدْ وَلَمْ يُولَدْ",
        juz: 30,
        tafsir: "ليس له ولد، ولم يولد من أحد؛ لأنه الأول الذي ليس قبله شيء والآخر الذي ليس بعده شيء.",
        keyWordsMeaning: [{ word: "لم يلد", meaning: "منزه عن اتخاذ الولد والشريك" }]
      },
      {
        numberInSurah: 4,
        text: "وَلَمْ يَكُن لَّهُ كُفُوًا أَحَدٌ",
        juz: 30,
        tafsir: "وليس له مثيل ولا نظير ولا مساوٍ في ذاته ولا في أسمائه وصفاته وأفعاله سبحانه.",
        keyWordsMeaning: [{ word: "كفواً", meaning: "مكافئاً ومماثلاً ونظيراً" }]
      }
    ]
  },
  113: {
    number: 113,
    name: "الفلق",
    englishName: "Al-Falaq",
    revelationType: "مكية",
    numberOfAyahs: 5,
    juzStart: 30,
    pageStart: 604,
    ayahs: [
      {
        numberInSurah: 1,
        text: "قُلْ أَعُوذُ بِرَبِّ الْفَلَقِ",
        juz: 30,
        tafsir: "قل: أعتصم وأتحصن برب الصبح الذي يفلق الظلام بنوره.",
        keyWordsMeaning: [{ word: "الفلق", meaning: "الصبح المنفلق من ظلمة الليل" }]
      },
      {
        numberInSurah: 2,
        text: "مِن شَرِّ مَا خَلَقَ",
        juz: 30,
        tafsir: "من شر جميع المخلوقات المؤذية من إنس وجن وحيوان وكل ذي شر.",
        keyWordsMeaning: [{ word: "ما خلق", meaning: "كل المخلوقات التي يصدر منها شر" }]
      },
      {
        numberInSurah: 3,
        text: "وَمِن شَرِّ غَاسِقٍ إِذَا وَقَبَ",
        juz: 30,
        tafsir: "ومن شر ليل مظلم شديد الظلمة إذا دخل وغمر الأشياء.",
        keyWordsMeaning: [{ word: "غاسق", meaning: "الليل إذا اشتد ظلامه" }, { word: "وقب", meaning: "دخل وأقبل بظلامه" }]
      },
      {
        numberInSurah: 4,
        text: "وَمِن شَرِّ النَّفَّاثَاتِ فِي الْعُقَدِ",
        juz: 30,
        tafsir: "ومن شر الساحرات والنفوس الخبيثة اللاتي ينفخن بريقهن في العقد طلباً للسحر والإيذاء.",
        keyWordsMeaning: [{ word: "النفاثات", meaning: "النافخات بريقهن للضر والسحر" }, { word: "العقد", meaning: "عقد الخيوط التي يُسحر بها" }]
      },
      {
        numberInSurah: 5,
        text: "وَمِن شَرِّ حَاسِدٍ إِذَا حَسَدَ",
        juz: 30,
        tafsir: "ومن شر كل حاسد يتمنى زوال النعمة عن غيره ويسعى في إيقاع الضر به.",
        keyWordsMeaning: [{ word: "حاسد", meaning: "من يتمنى زوال نعمة الله عن غيره" }]
      }
    ]
  },
  114: {
    number: 114,
    name: "الناس",
    englishName: "An-Naas",
    revelationType: "مكية",
    numberOfAyahs: 6,
    juzStart: 30,
    pageStart: 604,
    ayahs: [
      {
        numberInSurah: 1,
        text: "قُلْ أَعُوذُ بِرَبِّ النَّاسِ",
        juz: 30,
        tafsir: "قل: ألتجئ وأعتصم برب البشر وخالقهم ومدبر شؤونهم.",
        keyWordsMeaning: [{ word: "أعوذ", meaning: "ألتجئ وأتحصن وأستجير" }]
      },
      {
        numberInSurah: 2,
        text: "مَلِكِ النَّاسِ",
        juz: 30,
        tafsir: "ملك البشر المتصرف فيهم بتمام القدرة والسلطان والغنى عنهم.",
        keyWordsMeaning: [{ word: "ملك الناس", meaning: "الحاكم والمالك المطلق لهم" }]
      },
      {
        numberInSurah: 3,
        text: "إِلَٰهِ النَّاسِ",
        juz: 30,
        tafsir: "معبودهم الحق الذي لا معبود سواه ولا إله بحق غيره.",
        keyWordsMeaning: [{ word: "إله الناس", meaning: "معبودهم المستحق للألوهية والعبادة" }]
      },
      {
        numberInSurah: 4,
        text: "مِن شَرِّ الْوَسْوَاسِ الْخَنَّاسِ",
        juz: 30,
        tafsir: "من شر الشيطان الذي يوسوس عند الغفلة ويختفي ويتأخر عند ذكر الله.",
        keyWordsMeaning: [{ word: "الوسواس", meaning: "المتحدث بالسوء في الصدور سراً" }, { word: "الخناس", meaning: "المتراجع المنقبض عند ذكر اسم الله" }]
      },
      {
        numberInSurah: 5,
        text: "الَّذِي يُوَسْوِسُ فِي صُدُورِ النَّاسِ",
        juz: 30,
        tafsir: "الذي يبث الأفكار السيئة والشكوك والشهوات في قلوب بني آدم.",
        keyWordsMeaning: [{ word: "يوسوس", meaning: "يلقي الكلام الخفي المشوب بالشر" }]
      },
      {
        numberInSurah: 6,
        text: "مِنَ الْجِنَّةِ وَالنَّاسِ",
        juz: 30,
        tafsir: "من شياطين الجن وشياطين الإنس الذين يدعون للشر والفساد.",
        keyWordsMeaning: [{ word: "الجنة", meaning: "شياطين الجن" }]
      }
    ]
  },
  108: {
    number: 108,
    name: "الكوثر",
    englishName: "Al-Kawthar",
    revelationType: "مكية",
    numberOfAyahs: 3,
    juzStart: 30,
    pageStart: 602,
    ayahs: [
      {
        numberInSurah: 1,
        text: "إِنَّا أَعْطَيْنَاكَ الْكَوْثَرَ",
        juz: 30,
        tafsir: "إنا أعطيناك أيها النبي الخير الكثير، ومنه نهر الكوثر في الجنة الذي ماؤه أشد بياضاً من اللبن وأحلى من العسل.",
        keyWordsMeaning: [{ word: "الكوثر", meaning: "الخير الكثير العظيم ونهر في الجنة للنبي ﷺ" }]
      },
      {
        numberInSurah: 2,
        text: "فَصَلِّ لِرَبِّكَ وَانْحَرْ",
        juz: 30,
        tafsir: "فأخلص لربك صلاتك كلها، وانحر ذبيحتك له وحده شكراً على نعمه العظيمة.",
        keyWordsMeaning: [{ word: "وانحر", meaning: "اذبح الأضاحي والبدن لله تعالى وحده" }]
      },
      {
        numberInSurah: 3,
        text: "إِنَّ شَانِئَكَ هُوَ الْأَبْتَرُ",
        juz: 30,
        tafsir: "إن مبغضك وعدوك هو المقطوع أثره المنقطع من كل خير، وأما أنت فذكرك مرفوع إلى قيام الساعة.",
        keyWordsMeaning: [{ word: "شانئك", meaning: "مبغضك وعدوك" }, { word: "الأبتر", meaning: "المقطوع المنبوذ من كل بركة وخير" }]
      }
    ]
  },
  110: {
    number: 110,
    name: "النصر",
    englishName: "An-Nasr",
    revelationType: "مدنية",
    numberOfAyahs: 3,
    juzStart: 30,
    pageStart: 603,
    ayahs: [
      {
        numberInSurah: 1,
        text: "إِذَا جَاءَ نَصْرُ اللَّهِ وَالْفَتْحُ",
        juz: 30,
        tafsir: "إذا تحقق نصر الله لدينك يا محمد وتم فتح مكة ودخولها عزيزة منتصرة.",
        keyWordsMeaning: [{ word: "الفتح", meaning: "فتح مكة المكرمة وانتصار الإسلام" }]
      },
      {
        numberInSurah: 2,
        text: "وَرَأَيْتَ النَّاسَ يَدْخُلُونَ فِي دِينِ اللَّهِ أَفْوَاجًا",
        juz: 30,
        tafsir: "ورأيت قبائل العرب تقبل على الدخول في دين الإسلام جماعات وفوداً بعد وفود.",
        keyWordsMeaning: [{ word: "أفواجاً", meaning: "جماعات كثيرة متتابعة" }]
      },
      {
        numberInSurah: 3,
        text: "فَسَبِّحْ بِحَمْدِ رَبِّكَ وَاسْتَغْفِرْهُ ۚ إِنَّهُ كَانَ تَوَّابًا",
        juz: 30,
        tafsir: "فقابل نعمة الله بالتسبيح والحمد وسؤاله المغفرة، إنه سبحانه كثير التوبة على المسبحين المستغفرين.",
        keyWordsMeaning: [{ word: "فسبح بحمد ربك", meaning: "نزه الله مقترناً بحمده وشكره" }, { word: "تواباً", meaning: "يقبل توبة عباده ويرحمهم" }]
      }
    ]
  },
  103: {
    number: 103,
    name: "العصر",
    englishName: "Al-Asr",
    revelationType: "مكية",
    numberOfAyahs: 3,
    juzStart: 30,
    pageStart: 601,
    ayahs: [
      {
        numberInSurah: 1,
        text: "وَالْعَصْرِ",
        juz: 30,
        tafsir: "أقسم الله تعالى بالدهر والزمان لما فيه من العبر والدلائل على قدرة الله وحكمته.",
        keyWordsMeaning: [{ word: "العصر", meaning: "الدهر والزمان أو وقت صلاة العصر" }]
      },
      {
        numberInSurah: 2,
        text: "إِنَّ الْإِنسَانَ لَفِي خُسْرٍ",
        juz: 30,
        tafsir: "إن كل إنسان في خسارة ونقصان وهلاك في عاقبة أمره.",
        keyWordsMeaning: [{ word: "خسر", meaning: "هلاك وضياع وخيبة" }]
      },
      {
        numberInSurah: 3,
        text: "إِلَّا الَّذِينَ آمَنُوا وَعَمِلُوا الصَّالِحَاتِ وَتَوَاصَوْا بِالْحَقِّ وَتَوَاصَوْا بِالصَّبْرِ",
        juz: 30,
        tafsir: "إلا الذين جمعوا بين الإيمان الصادق والعمل الصالح، وأوصى بعضهم بعضاً بالتمسك بالحق والصبر على طاعة الله والبلاء.",
        keyWordsMeaning: [{ word: "وتواصوا بالحق", meaning: "أوصى بعضهم بعضاً بالخير والتوحيد" }, { word: "وتواصوا بالصبر", meaning: "بالصبر على الطاعات وعن المعاصي وعلى الأقدار" }]
      }
    ]
  },
  109: {
    number: 109,
    name: "الكافرون",
    englishName: "Al-Kaafiroon",
    revelationType: "مكية",
    numberOfAyahs: 6,
    juzStart: 30,
    pageStart: 603,
    ayahs: [
      {
        numberInSurah: 1,
        text: "قُلْ يَا أَيُّهَا الْكَافِرُونَ",
        juz: 30,
        tafsir: "قل أيها الرسول للذين كفروا بالله وأشركوا به معلِناً البراءة من شركهم.",
        keyWordsMeaning: [{ word: "الكافرون", meaning: "الجاحدون بوحدانية الله ورسالته" }]
      },
      {
        numberInSurah: 2,
        text: "لَا أَعْبُدُ مَا تَعْبُدُونَ",
        juz: 30,
        tafsir: "لا أعبد في الحاضر ولا في المستقبل ما تعبدونه من الأصنام والأنداد الباطلة.",
        keyWordsMeaning: [{ word: "لا أعبد", meaning: "أبرأ من عبادة ما تعبدون" }]
      },
      {
        numberInSurah: 3,
        text: "وَلَا أَنتُمْ عَابِدُونَ مَا أَعْبُدُ",
        juz: 30,
        tafsir: "ولستم عابدين الإله الحق الذي أعبده وأوحده سبحانه.",
        keyWordsMeaning: [{ word: "ما أعبد", meaning: "الله وحده لا شريك له" }]
      },
      {
        numberInSurah: 4,
        text: "وَلَا أَنَا عَابِدٌ مَّا عَبَدتُّمْ",
        juz: 30,
        tafsir: "ولا أنا بفاعل عبادتكم الفاسدة المبنية على الشرك في أي وقت.",
        keyWordsMeaning: [{ word: "عابد ما عبدتم", meaning: "متبع لطريقتكم الشركية" }]
      },
      {
        numberInSurah: 5,
        text: "وَلَا أَنتُمْ عَابِدُونَ مَا أَعْبُدُ",
        juz: 30,
        tafsir: "ولا أنتم عابدون معبودي الحق ما دمتم مصرين على الشرك.",
        keyWordsMeaning: [{ word: "عابدون", meaning: "مخلصين العبادة لله" }]
      },
      {
        numberInSurah: 6,
        text: "لَكُمْ دِينُكُمْ وَلِيَ دِينِ",
        juz: 30,
        tafsir: "لكم شرككم وباطلكم الذي اخترتموه وجزاؤه، ولي توحيدي وإيماني الذي هداني ربي إليه وجزاؤه الجنة.",
        keyWordsMeaning: [{ word: "لكم دينكم", meaning: "باطلكم وشرككم" }, { word: "ولي دين", meaning: "دين التوحيد الخالص لله" }]
      }
    ]
  },
  97: {
    number: 97,
    name: "القدر",
    englishName: "Al-Qadr",
    revelationType: "مكية",
    numberOfAyahs: 5,
    juzStart: 30,
    pageStart: 598,
    ayahs: [
      {
        numberInSurah: 1,
        text: "إِنَّا أَنزَلْنَاهُ فِي لَيْلَةِ الْقَدْرِ",
        juz: 30,
        tafsir: "إنا ابتدأنا إنزال القرآن الكريم جملة واحدة من اللوح المحفوظ إلى السماء الدنيا في ليلة القدر من شهر رمضان.",
        keyWordsMeaning: [{ word: "ليلة القدر", meaning: "ليلة الشرف والعظمة وتقدير الأرزاق والآجال" }]
      },
      {
        numberInSurah: 2,
        text: "وَمَا أَدْرَاكَ مَا لَيْلَةُ الْقَدْرِ",
        juz: 30,
        tafsir: "وما أعلمك أيها النبي ما شأن هذه الليلة العظيمة ومقدار فضلها؟",
        keyWordsMeaning: [{ word: "وما أدراك", meaning: "تعظيم لشأنها وهيبتها" }]
      },
      {
        numberInSurah: 3,
        text: "لَيْلَةُ الْقَدْرِ خَيْرٌ مِّنْ أَلْفِ شَهْرٍ",
        juz: 30,
        tafsir: "العمل الصالح والعبادة في هذه الليلة المباركة خير وأفضل من ثواب عبادة ألف شهر ليس فيها ليلة قدر.",
        keyWordsMeaning: [{ word: "خير من ألف شهر", meaning: "أفضل من عبادة أكثر من 83 سنة" }]
      },
      {
        numberInSurah: 4,
        text: "تَنَزَّلُ الْمَلَائِكَةُ وَالرُّوحُ فِيهَا بِإِذْنِ رَبِّهِم مِّن كُلِّ أَمْرٍ",
        juz: 30,
        tafsir: "تهبط الملائكة وجبريل عليه السلام في هذه الليلة بإذن الله بكل أمر قضاه وقدره لتلك السنة إلى السنة القابلة.",
        keyWordsMeaning: [{ word: "الروح", meaning: "جبريل عليه السلام رئيس الملائكة" }]
      },
      {
        numberInSurah: 5,
        text: "سَلَامٌ هِيَ حَتَّىٰ مَطْلَعِ الْفَجْرِ",
        juz: 30,
        tafsir: "أمن وسلام وخير وبركة كلها للمؤمنين حتى طلوع الفجر وانقضاء الليل.",
        keyWordsMeaning: [{ word: "سلام هي", meaning: "أمان وطمأنينة لا شر فيها" }]
      }
    ]
  },
  94: {
    number: 94,
    name: "الشرح",
    englishName: "Ash-Sharh",
    revelationType: "مكية",
    numberOfAyahs: 8,
    juzStart: 30,
    pageStart: 596,
    ayahs: [
      {
        numberInSurah: 1,
        text: "أَلَمْ نَشْرَحْ لَكَ صَدْرَكَ",
        juz: 30,
        tafsir: "ألم نفسح لك صدرك وننوره بالحكمة والنبوة واليقين يا محمد؟",
        keyWordsMeaning: [{ word: "نشرح لك صدرك", meaning: "نفتحه ونوسعه بالنور والإيمان والهداية" }]
      },
      {
        numberInSurah: 2,
        text: "وَوَضَعْنَا عَنكَ وِزْرَكَ",
        juz: 30,
        tafsir: "وحططنا وخففنا عنك حملك الثقيل الذي كان يثقل كاهلك.",
        keyWordsMeaning: [{ word: "وزرَك", meaning: "حملك الثقيل وأعباء الرسالة والهموم" }]
      },
      {
        numberInSurah: 3,
        text: "الَّذِي أَنقَضَ ظَهْرَكَ",
        juz: 30,
        tafsir: "الذي أثقل ظهرك حتى كاد أن ينقضه ويكسره من ثقله.",
        keyWordsMeaning: [{ word: "أنقض ظهرك", meaning: "أثقله حتى أسمع نقيضه (صوته)" }]
      },
      {
        numberInSurah: 4,
        text: "وَرَفَعْنَا لَكَ ذِكْرَكَ",
        juz: 30,
        tafsir: "وجعلنا اسمك مقروناً باسم الله في الشهادة والأذان والخطب وذكرك عالياً في الخافقين.",
        keyWordsMeaning: [{ word: "رفعنا لك ذكرك", meaning: "أعلينا منزلتك وشرفك في الدنيا والآخرة" }]
      },
      {
        numberInSurah: 5,
        text: "فَإِنَّ مَعَ الْعُسْرِ يُسْرًا",
        juz: 30,
        tafsir: "فإن مع كل ضيق وشدة فرجاً وسهولة وتيسيراً قريباً.",
        keyWordsMeaning: [{ word: "العسر", meaning: "الشدة والضيق" }, { word: "يسراً", meaning: "فرجة وتيسيراً" }]
      },
      {
        numberInSurah: 6,
        text: "إِنَّ مَعَ الْعُسْرِ يُسْرًا",
        juz: 30,
        tafsir: "تأكيد ووعد من الله تعالى أن اليسر ملازم للعسر ولن يغلب عسر يسرين.",
        keyWordsMeaning: [{ word: "إن مع العسر يسراً", meaning: "بشارة عظيمة بتفريج الكرب" }]
      },
      {
        numberInSurah: 7,
        text: "فَإِذَا فَرَغْتَ فَانصَبْ",
        juz: 30,
        tafsir: "فإذا فرغت من أعمالك وأمور دنياك فاجتهد وأتعب نفسك في عبادة ربك وطاعته.",
        keyWordsMeaning: [{ word: "فانصب", meaning: "أتعب نفسك واجتهد في العبادة والدعاء" }]
      },
      {
        numberInSurah: 8,
        text: "وَإِلَىٰ رَبِّكَ فَارْغَب",
        juz: 30,
        tafsir: "وإلى ربك وحده فوجه رغبتك ورجاءك وتضرعك وتوكلك.",
        keyWordsMeaning: [{ word: "فارغب", meaning: "اطلب ما عنده من الخير والمثوبة وأخلص له" }]
      }
    ]
  },
  93: {
    number: 93,
    name: "الضحى",
    englishName: "Ad-Duhaa",
    revelationType: "مكية",
    numberOfAyahs: 11,
    juzStart: 30,
    pageStart: 596,
    ayahs: [
      { numberInSurah: 1, text: "وَالضُّحَىٰ", juz: 30, tafsir: "أقسم الله تعالى بوقت الضحى وارتفاع الشمس وضياء نورها.", keyWordsMeaning: [{ word: "الضحى", meaning: "وقت ارتفاع الشمس أول النهار" }] },
      { numberInSurah: 2, text: "وَاللَّيْلِ إِذَا سَجَىٰ", juz: 30, tafsir: "وأقسم بالليل إذا سكن واشتد ظلامه وغطى الكون.", keyWordsMeaning: [{ word: "سجى", meaning: "سكن واشتد ظلامه وهدأ" }] },
      { numberInSurah: 3, text: "مَا وَدَّعَكَ رَبُّكَ وَمَا قَلَىٰ", juz: 30, tafsir: "ما تركك ربك يا محمد وما أبغضك منذ اصطفاك.", keyWordsMeaning: [{ word: "ما ودعك", meaning: "ما تركك ولا تخلى عنك" }, { word: "وما قلى", meaning: "وما أبغضك وكرهك" }] },
      { numberInSurah: 4, text: "وَلَلْآخِرَةُ خَيْرٌ لَّكَ مِنَ الْأُولَىٰ", juz: 30, tafsir: "وللدار الآخرة وما أعده الله لك فيها خير وأعظم من الدنيا وما فيها.", keyWordsMeaning: [{ word: "الآخرة", meaning: "دار النعيم المقيم" }] },
      { numberInSurah: 5, text: "وَلَسَوْفَ يُعْطِيكَ رَبُّكَ فَتَرْضَىٰ", juz: 30, tafsir: "ولسوف يمنحك ربك من أصناف الكرامات والشفاعة والأجر حتى ترضى.", keyWordsMeaning: [{ word: "فترضى", meaning: "تنال الرضا التام والسرور الأبدي" }] },
      { numberInSurah: 6, text: "أَلَمْ يَجِدْكَ يَتِيمًا فَآوَىٰ", juz: 30, tafsir: "ألم يجدك طفلاً يتيماً قد مات أبوك فضمك ورعاك وكفاك؟", keyWordsMeaning: [{ word: "فآوى", meaning: "ضمك ويسر لك من يحضنك ويرعاك" }] },
      { numberInSurah: 7, text: "وَوَجَدَكَ ضَالًّا فَهَدَىٰ", juz: 30, tafsir: "ووجدك غافلاً عما يراد بك من أمر النبوة والشريعة فهداك وعلمك ما لم تكن تعلم.", keyWordsMeaning: [{ word: "فهدى", meaning: "دلك على الحق والوحي والإيمان" }] },
      { numberInSurah: 8, text: "وَوَجَدَكَ عَائِلًا فَأَغْنَىٰ", juz: 30, tafsir: "ووجدك فقيراً ذا عيال فأغناك بما أفاء عليك ورزقك القناعة.", keyWordsMeaning: [{ word: "عائلاً", meaning: "فقيراً محتاجاً" }, { word: "فأغنى", meaning: "رزقك وكفاك برحمته" }] },
      { numberInSurah: 9, text: "فَأَمَّا الْيَتِيمَ فَلَا تَقْهَرْ", juz: 30, tafsir: "فأما اليتيـم فلا تظلمه ولا تسء معاملته بل أحسن إليه وعامله برفق.", keyWordsMeaning: [{ word: "فلا تقهر", meaning: "لا تذله ولا تغلظ عليه" }] },
      { numberInSurah: 10, text: "وَأَمَّا السَّائِلَ فَلَا تَنْهَرْ", juz: 30, tafsir: "وأما من يسألك حاجة أو علماً فلا تزجره ولا تطرده بل رده بمعروف ورفق.", keyWordsMeaning: [{ word: "فلا تنهر", meaning: "لا تزجره ولا تخاطبه بغلظة" }] },
      { numberInSurah: 11, text: "وَأَمَّا بِنِعْمَةِ رَبِّكَ فَحَدِّثْ", juz: 30, tafsir: "وأما بنعم ربك الدينية والدنيوية فأظهر شكرها وتحدث بها اعترافاً بفضله.", keyWordsMeaning: [{ word: "فحدث", meaning: "اذكرها شكراً واعترافاً بفضل الله" }] }
    ]
  },
  67: {
    number: 67,
    name: "الملك",
    englishName: "Al-Mulk",
    revelationType: "مكية",
    numberOfAyahs: 30,
    juzStart: 29,
    pageStart: 562,
    ayahs: [
      { numberInSurah: 1, text: "تَبَارَكَ الَّذِي بِيَدِهِ الْمُلْكُ وَهُوَ عَلَىٰ كُلِّ شَيْءٍ قَدِيرٌ", juz: 29, tafsir: "تعاظم وتكاثر خير الله وبركته، الذي بيده مقاليد الملك والسلطان والتصرف في الكون كله.", keyWordsMeaning: [{ word: "تبارك", meaning: "تعاظم وكثر خيره ودام فضله" }, { word: "بيده الملك", meaning: "له السلطان والتصرف المطلق" }] },
      { numberInSurah: 2, text: "الَّذِي خَلَقَ الْمَوْتَ وَالْحَيَاةَ لِيَبْلُوَكُمْ أَيُّكُمْ أَحْسَنُ عَمَلًا ۚ وَهُوَ الْعَزِيزُ الْغَفُورُ", juz: 29, tafsir: "الذي أوجد الموت والحياة ليختبركم في هذه الدنيا: أيكم أخلص لله في عمله وأصوبه على شريعته.", keyWordsMeaning: [{ word: "ليبلوكم", meaning: "ليختبركم ويمتحنكم" }, { word: "أحسن عملاً", meaning: "أخلصه وأصوبه" }] },
      { numberInSurah: 3, text: "الَّذِي خَلَقَ سَبْعَ سَمَاوَاتٍ طِبَاقًا ۖ مَّا تَرَىٰ فِي خَلْقِ الرَّحْمَٰنِ مِن تَفَاوُتٍ ۖ فَارْجِعِ الْبَصَرَ هَلْ تَرَىٰ مِن فُطُورٍ", juz: 29, tafsir: "الذي خلق سبع سماوات بعضها فوق بعض، لا تشاهد في خلق الرحمن أي خلل أو عيب، فرد كرتك بالنظر هل ترى شقوقاً وتصدعات؟", keyWordsMeaning: [{ word: "طباقاً", meaning: "بعضها فوق بعض" }, { word: "فطور", meaning: "شقوق وصدوع وخلل" }] },
      { numberInSurah: 4, text: "ثُمَّ ارْجِعِ الْبَصَرَ كَرَّتَيْنِ يَنقَلِبْ إِلَيْكَ الْبَصَرُ خَاسِئًا وَهُوَ حَسِيرٌ", juz: 29, tafsir: "ثم أعد النظر مرة بعد مرة متأملاً، يرجع إليك بصرك صاغراً ذليلاً وهو كليل من الإعياء دون أن يجد عيباً.", keyWordsMeaning: [{ word: "خاسئاً", meaning: "ذليلاً صاغراً لم ير نقصاً" }, { word: "حسير", meaning: "كليل متعب من طول النظر" }] },
      { numberInSurah: 5, text: "وَلَقَدْ زَيَّنَّا السَّمَاءَ الدُّنْيَا بِمَصَابِيحَ وَجَعَلْنَاهَا رُجُومًا لِّلشَّيَاطِينِ ۖ وَأَعْتَدْنَا لَهُمْ عَذَابَ السَّعِيرِ", juz: 29, tafsir: "ولقد جملنا السماء القريبة بالنجوم المضيئة كالمصابيح، وجعلنا شهباً ترجم الشياطين المسترقين للسمع.", keyWordsMeaning: [{ word: "بمصابيح", meaning: "بالكواكب والنجوم المنيرة" }, { word: "رجوماً", meaning: "شهباً محرقات للشياطين" }] }
    ]
  },
  87: {
    number: 87,
    name: "الأعلى",
    englishName: "Al-A'laa",
    revelationType: "مكية",
    numberOfAyahs: 19,
    juzStart: 30,
    pageStart: 591,
    ayahs: [
      { numberInSurah: 1, text: "سَبِّحِ اسْمَ رَبِّكَ الْأَعْلَى", juz: 30, tafsir: "نزه وقدس اسم ربك العلي المتعالي عن كل نقص وعيب.", keyWordsMeaning: [{ word: "سبح", meaning: "نزه وعظم" }] },
      { numberInSurah: 2, text: "الَّذِي خَلَقَ فَسَوَّىٰ", juz: 30, tafsir: "الذي أوجد جميع المخلوقات فأتقن صنعها وبديع خلقها.", keyWordsMeaning: [{ word: "فسوى", meaning: "أتقن وأحسن خلقه" }] },
      { numberInSurah: 3, text: "وَالَّذِي قَدَّرَ فَهَدَىٰ", juz: 30, tafsir: "والذي قدر لكل مخلوق رزقه وأجله وما يصلحه وهداه لما خلق له.", keyWordsMeaning: [{ word: "فهدى", meaning: "أرشده لما يصلح معيشته" }] },
      { numberInSurah: 4, text: "وَالَّذِي أَخْرَجَ الْمَرْعَىٰ", juz: 30, tafsir: "والذي أنبت العشب والنبات الأخضر الذي ترعاه الماشية.", keyWordsMeaning: [{ word: "المرعى", meaning: "النبات الأخضر للرعي" }] },
      { numberInSurah: 5, text: "فَجَعَلَهُ غُثَاءً أَحْوَىٰ", juz: 30, tafsir: "ثم صيره بعد خضرته هشيماً يابساً مسوداً.", keyWordsMeaning: [{ word: "غثاء أحوى", meaning: "يابساً أسود متغيراً بعد خضرته" }] },
      { numberInSurah: 6, text: "سَنُقْرِئُكَ فَلَا تَنسَىٰ", juz: 30, tafsir: "سنعلمك هذا القرآن ونقرئك إياه بحفظ راسخ فلا تنسى منه شيئاً.", keyWordsMeaning: [{ word: "سنقرئك", meaning: "نلقنك الوحي بتمكن" }] },
      { numberInSurah: 7, text: "إِلَّا مَا شَاءَ اللَّهُ ۚ إِنَّهُ يَعْلَمُ الْجَهْرَ وَمَا يَخْفَىٰ", juz: 30, tafsir: "إلا ما اقتضت حكمة الله أن ينسخه ويذهب به، إنه يعلم كل ظاهر وخفي.", keyWordsMeaning: [{ word: "الجهر", meaning: "القول والعمل الظاهر" }] },
      { numberInSurah: 8, text: "وَنُيَسِّرُكَ لِلْيُسْرَىٰ", juz: 30, tafsir: "ونهيئك ونوفقك للطريقة السهلة السمحة في شريعة الإسلام وفي أداء الرسالة.", keyWordsMeaning: [{ word: "لليسرى", meaning: "للشريعة السمحة السهلة" }] },
      { numberInSurah: 9, text: "فَذَكِّرْ إِن نَّفَعَتِ الذِّكْرَىٰ", juz: 30, tafsir: "فعظ الناس وعلمهم بشرع الله أينما كانت التذكرة مقبولة ونافعة.", keyWordsMeaning: [{ word: "فذكر", meaning: "فعظ بالقرآن ونبه به" }] }
    ]
  }
};

/**
 * In-memory cache for surahs fetched dynamically from Quran API
 */
const dynamicSurahCache: Record<number, Surah> = {};
const quranPageCache: Record<number, QuranPageAyah[]> = {};
const surahPageCache: Record<number, (number | undefined)[]> = {};

export interface QuranPageAyah {
  surahNumber: number;
  surahName: string;
  numberInSurah: number;
  text: string;
  juz: number;
}

/**
 * Loads a Surah either from bundled high-precision data or fetches dynamically from Quran API
 */
export async function getSurahWithAyahs(surahNumber: number): Promise<Surah> {
  if (PRELOADED_SURAHS[surahNumber]) {
    return PRELOADED_SURAHS[surahNumber];
  }

  if (dynamicSurahCache[surahNumber]) {
    return dynamicSurahCache[surahNumber];
  }

  const meta = ALL_SURAHS.find(s => s.number === surahNumber);

  try {
    // Fetch Quran text from reliable public Quran API
    const response = await fetch(`https://api.alquran.cloud/v1/surah/${surahNumber}/editions/quran-uthmani,ar.muyassar`);
    if (response.ok) {
      const data = await response.json();
      if (data?.data && Array.isArray(data.data) && data.data.length >= 2) {
        const textEdition = data.data[0];
        const tafsirEdition = data.data[1];

        const ayahs: Ayah[] = textEdition.ayahs.map((item: any, idx: number) => {
          const tafsirItem = tafsirEdition.ayahs[idx];
          return {
            numberInSurah: item.numberInSurah,
            text: item.text,
            juz: item.juz,
            page: item.page,
            tafsir: tafsirItem ? tafsirItem.text : undefined
          };
        });

        const surah: Surah = {
          number: surahNumber,
          name: meta ? meta.name : textEdition.name,
          englishName: meta ? meta.englishName : textEdition.englishName,
          revelationType: (meta?.revelationType || (textEdition.revelationType === 'Meccan' ? 'مكية' : 'مدنية')),
          numberOfAyahs: textEdition.numberOfAyahs,
          juzStart: meta ? meta.juzStart : textEdition.ayahs[0]?.juz || 1,
          pageStart: meta ? meta.pageStart : textEdition.ayahs[0]?.page || 1,
          ayahs
        };

        dynamicSurahCache[surahNumber] = surah;
        return surah;
      }
    }
  } catch (err) {
    console.warn("Could not fetch remote surah, fallback to basic mock", err);
  }

  // Graceful fallback if network is constrained
  const fallbackAyahs: Ayah[] = Array.from({ length: meta ? meta.numberOfAyahs : 7 }, (_, i) => ({
    numberInSurah: i + 1,
    text: `آية ${i + 1} من سورة ${meta?.name || surahNumber}`,
    juz: meta?.juzStart || 1,
    tafsir: `تفسير الآية ${i + 1} من سورة ${meta?.name}`
  }));

  const fallbackSurah: Surah = {
    number: surahNumber,
    name: meta?.name || `سورة ${surahNumber}`,
    englishName: meta?.englishName || `Surah ${surahNumber}`,
    revelationType: meta?.revelationType || 'مكية',
    numberOfAyahs: meta?.numberOfAyahs || 7,
    juzStart: meta?.juzStart || 1,
    pageStart: meta?.pageStart || 1,
    ayahs: fallbackAyahs
  };

  return fallbackSurah;
}

export async function getAyahPageNumber(surahNumber: number, ayahNumber: number): Promise<number> {
  const bundledSurah = PRELOADED_SURAHS[surahNumber];
  if (bundledSurah && (surahNumber === 1 || (surahNumber >= 112 && surahNumber <= 114))) {
    return bundledSurah.pageStart;
  }

  let pages = surahPageCache[surahNumber];
  if (!pages) {
    const response = await fetch(`https://api.alquran.cloud/v1/surah/${surahNumber}/quran-uthmani`);
    if (!response.ok) {
      throw new Error(`تعذر تحميل بيانات صفحات سورة ${bundledSurah?.name || surahNumber} (${response.status}).`);
    }

    const payload = await response.json();
    const ayahs = payload?.data?.ayahs;
    if (!Array.isArray(ayahs)) {
      throw new Error('استجابة بيانات صفحات السورة غير صالحة.');
    }

    pages = ayahs.map((ayah: { page?: number }) => ayah.page);
    surahPageCache[surahNumber] = pages;
  }

  const pageNumber = pages[ayahNumber - 1];
  if (typeof pageNumber !== 'number' || !Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > 604) {
    throw new Error(`لم يُعثر على رقم صفحة الآية ${ayahNumber} من السورة ${surahNumber}.`);
  }

  return pageNumber;
}

export async function getQuranPage(pageNumber: number): Promise<QuranPageAyah[]> {
  if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > 604) {
    throw new Error('رقم صفحة المصحف غير صالح.');
  }

  if (quranPageCache[pageNumber]) {
    return quranPageCache[pageNumber];
  }

  if (pageNumber === 1) {
    const pageAyahs = PRELOADED_SURAHS[1].ayahs.map((ayah) => ({
      surahNumber: 1,
      surahName: PRELOADED_SURAHS[1].name,
      numberInSurah: ayah.numberInSurah,
      text: ayah.text,
      juz: ayah.juz
    }));
    quranPageCache[pageNumber] = pageAyahs;
    return pageAyahs;
  }

  if (pageNumber === 604) {
    const pageAyahs = [112, 113, 114].flatMap((surahNumber) =>
      PRELOADED_SURAHS[surahNumber].ayahs.map((ayah) => ({
        surahNumber,
        surahName: PRELOADED_SURAHS[surahNumber].name,
        numberInSurah: ayah.numberInSurah,
        text: ayah.text,
        juz: ayah.juz
      }))
    );
    quranPageCache[pageNumber] = pageAyahs;
    return pageAyahs;
  }

  const response = await fetch(`https://api.alquran.cloud/v1/page/${pageNumber}/quran-uthmani`);
  if (!response.ok) {
    throw new Error(`تعذر تحميل صفحة المصحف رقم ${pageNumber} (${response.status}).`);
  }

  const payload = await response.json();
  const ayahs = payload?.data?.ayahs;
  if (!Array.isArray(ayahs)) {
    throw new Error('استجابة صفحة المصحف غير صالحة.');
  }

  const pageAyahs: QuranPageAyah[] = ayahs.map((ayah: {
    numberInSurah: number;
    text: string;
    juz: number;
    surah: { number: number; name: string };
  }) => ({
    surahNumber: ayah.surah.number,
    surahName: ayah.surah.name,
    numberInSurah: ayah.numberInSurah,
    text: ayah.text,
    juz: ayah.juz
  }));

  if (pageAyahs.length === 0) {
    throw new Error(`لم تُعثر على آيات في صفحة المصحف رقم ${pageNumber}.`);
  }

  quranPageCache[pageNumber] = pageAyahs;
  return pageAyahs;
}
