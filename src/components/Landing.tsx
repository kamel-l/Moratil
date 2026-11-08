import React, { useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import {
  Mic,
  BookOpen,
  CalendarClock,
  Trophy,
  BarChart3,
  Sparkles,
  ShieldCheck,
  Smartphone,
  ChevronDown,
  ArrowLeft,
  Check,
  Zap,
  Brain,
  Star,
} from 'lucide-react';
import { TiltCard } from './ui/TiltCard';
import { Reveal, staggerContainer, staggerItem } from './ui/Reveal';

interface LandingProps {
  /** Lance l'application (bascule vers l'espace de travail). */
  onEnter: () => void;
}

const FEATURES = [
  {
    icon: Mic,
    title: 'تصحيح صوتي لحظي',
    description:
      'سمّع بصوتك ويتعرّف النظام على تلاوتك آيةً آية، مع تنبيه فوري عند الخطأ في الكلمات أو التجويد.',
  },
  {
    icon: CalendarClock,
    title: 'تكرار متباعد ذكي',
    description:
      'خطط مراجعة مبنية على التكرار المتباعد تُعيد عليك الآيات في اللحظة المثالية لتثبيت الحفظ.',
  },
  {
    icon: BookOpen,
    title: 'التفسير الميسّر',
    description:
      'المصحف كاملاً مع التفسير الميسّر ومعاني الكلمات، لتدبّر المعنى قبل الحفظ.',
  },
  {
    icon: Trophy,
    title: 'تحديات الأصدقاء',
    description:
      'لوحة صدارة ومسابقات حفظ يومية تنافس فيها أصدقاءك وتتحفّز لبلوغ المراتب الأولى.',
  },
  {
    icon: BarChart3,
    title: 'إحصائيات دقيقة',
    description:
      'لوحة أداء تعرض نسبة الإتقان، الآيات المتقنة، والآيات التي تحتاج تثبيتًا في لمحة واحدة.',
  },
  {
    icon: Sparkles,
    title: 'نقاط وأوسمة تحفيزية',
    description:
      'نظام حسنات وأوسمة يحتفل بإنجازك اليومي ويُبقي التزامك مستمرًا.',
  },
];

const STEPS = [
  {
    icon: Brain,
    title: 'اختر سورتك وخططك',
    description: 'حدّد السورة والآية وابدأ بخطة حفظ أو مراجعة مخصّصة لوقتك اليومي.',
  },
  {
    icon: Mic,
    title: 'سمّع بصوتك',
    description: 'التسميع الصوتي مع التصحيح اللحظي يكشف مواطن الخطأ ويسجّل إتقانك.',
  },
  {
    icon: Zap,
    title: 'راجع وثبّت',
    description: 'جدول التكرار المتباعد يعيد لك الآيات المنسيّة في الوقت المناسب تمامًا.',
  },
];

const FAQS = [
  {
    question: 'ما هو تطبيق مُرتِّل؟',
    answer:
      'مُرتِّل منصّة ذكية لحفظ ومراجعة القرآن الكريم تعتمد على التعرّف الصوتي والتصحيح الفوري، مع خطط تكرار متباعد لتثبيت الحفظ، والتفسير الميسّر، وميزات تحفيزية من نقاط وأوسمة.',
  },
  {
    question: 'كيف يعمل التصحيح الصوتي اللحظي؟',
    answer:
      'عند التسميع يستمع التطبيق لتلاوتك ويطابقها مع نص المصحف كلمةً كلمة، فيُبرز الكلمات الصحيحة والخاطئة مباشرةً ويحسب نسبة الإتقان لكل آية.',
  },
  {
    question: 'هل يدعم التطبيق نظام التكرار المتباعد؟',
    answer:
      'نعم، يبني مُرتِّل جداول مراجعة بالتكرار المتباعد تُعيد الآيات التي تحتاج تثبيتًا في الفواصل الزمنية المثالية لترسيخ الحفظ في الذاكرة طويلة المدى.',
  },
  {
    question: 'هل التطبيق متوفّر على الهواتف؟',
    answer:
      'التطبيق يعمل على الويب كتطبيق ويب تقدمي، وهو مهيّأ أيضًا للعمل على أجهزة أندرويد عبر Capacitor، فيمكنك الحفظ والمراجعة من أي جهاز.',
  },
  {
    question: 'هل يحافظ التطبيق على خصوصية تسجيلاتي؟',
    answer:
      'تُعالَج بيانات الحفظ محليًا على جهازك قدر الإمكان، ولا نطلب صلاحية الميكروفون إلا أثناء جلسة التسميع الفعلي.',
  },
];

export const Landing: React.FC<LandingProps> = ({ onEnter }) => {
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const prefersReduced = useReducedMotion();

  const heroItem = (delay: number) =>
    prefersReduced
      ? {}
      : {
          initial: { opacity: 0, y: 24 },
          animate: { opacity: 1, y: 0 },
          transition: {
            duration: 0.7,
            delay,
            ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
          },
        };

  return (
    <div className="min-h-screen bg-jade-950 text-white overflow-x-hidden">
      {/* En-tête */}
      <header className="sticky top-0 z-50 border-b border-white/10 backdrop-blur-md bg-jade-950/70">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 sm:h-20 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-gold-400 text-jade-950 flex items-center justify-center font-bold text-xl sm:text-2xl shadow-lg shadow-gold-500/20 font-display">
              مُ
            </div>
            <div>
              <div className="font-bold text-lg sm:text-xl font-display tracking-tight">مُرتِّل</div>
              <p className="text-[11px] text-jade-200/70 -mt-0.5">القرآن الذكي</p>
            </div>
          </div>

          <nav className="hidden md:flex items-center gap-8 text-sm text-jade-100/80" aria-label="التنقّل الرئيسي">
            <a href="#features" className="hover:text-gold-300 transition-colors">
              المزايا
            </a>
            <a href="#how" className="hover:text-gold-300 transition-colors">
              كيف يعمل
            </a>
            <a href="#faq" className="hover:text-gold-300 transition-colors">
              الأسئلة الشائعة
            </a>
          </nav>

          <button
            onClick={onEnter}
            className="flex items-center gap-2 bg-gold-400 hover:bg-gold-300 text-jade-950 text-sm font-bold px-4 sm:px-5 py-2.5 rounded-xl transition-colors shadow-lg shadow-gold-500/20 cursor-pointer"
          >
            <span>ابدأ الآن</span>
            <ArrowLeft className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Hero */}
      <section className="relative isolate overflow-hidden bg-brand-gradient">
        {/* Halos décoratifs */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-24 right-[-6rem] w-[28rem] h-[28rem] rounded-full bg-gold-400/20 blur-3xl animate-float-orb"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute bottom-[-8rem] left-[-6rem] w-[30rem] h-[30rem] rounded-full bg-jade-400/20 blur-3xl animate-float-orb"
          style={{ animationDelay: '2s' }}
        />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24 grid lg:grid-cols-2 gap-12 lg:gap-8 items-center">
          {/* Colonne texte */}
          <div className="space-y-7 text-center lg:text-right">
            <motion.span
              {...heroItem(0)}
              className="inline-flex items-center gap-2 text-xs font-semibold text-gold-200 bg-white/5 border border-gold-400/30 px-3.5 py-1.5 rounded-full"
            >
              <Sparkles className="w-3.5 h-3.5" />
              منصّة ذكية لحفظ القرآن الكريم
            </motion.span>

            <motion.h1
              {...heroItem(0.08)}
              className="font-display text-4xl sm:text-5xl lg:text-6xl leading-[1.15] font-bold"
            >
              احفظ القرآن الكريم
              <span className="block text-gold-gradient mt-2">بذكاء وتصحيح لحظي</span>
            </motion.h1>

            <motion.p
              {...heroItem(0.16)}
              className="text-base sm:text-lg text-jade-100/80 leading-relaxed max-w-xl mx-auto lg:mx-0"
            >
              مُرتِّل منصّة ذكية تجمع التسميع الصوتي مع التصحيح الفوري، وخطط التكرار المتباعد
              لتثبيت الحفظ، والتفسير الميسّر، وتحديات الأصدقاء — في تجربة واحدة سلسة.
            </motion.p>

            <motion.div
              {...heroItem(0.24)}
              className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-3"
            >
              <button
                onClick={onEnter}
                className="w-full sm:w-auto flex items-center justify-center gap-2 bg-gold-400 hover:bg-gold-300 text-jade-950 font-bold px-7 py-3.5 rounded-2xl transition-all shadow-xl shadow-gold-500/25 cursor-pointer"
              >
                <Mic className="w-5 h-5" />
                <span>سمّع الآن مجانًا</span>
              </button>
              <a
                href="#how"
                className="w-full sm:w-auto flex items-center justify-center gap-2 glass-panel text-white font-semibold px-7 py-3.5 rounded-2xl hover:bg-white/10 transition-colors"
              >
                <span>كيف يعمل؟</span>
              </a>
            </motion.div>

            <motion.div
              {...heroItem(0.32)}
              className="flex flex-wrap items-center justify-center lg:justify-start gap-x-6 gap-y-2 text-xs text-jade-100/70 pt-2"
            >
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-jade-300" />
                خصوصية محفوظة
              </span>
              <span className="flex items-center gap-1.5">
                <Smartphone className="w-4 h-4 text-jade-300" />
                يعمل على الويب وأندرويد
              </span>
              <span className="flex items-center gap-1.5">
                <Star className="w-4 h-4 text-gold-300" />
                المصحف كامل مع التفسير
              </span>
            </motion.div>
          </div>

          {/* Colonne maquette 3D */}
          <motion.div
            {...heroItem(0.2)}
            className="relative perspective-1200 mx-auto w-full max-w-md"
          >
            <TiltCard maxTilt={9} lift={16} className="preserve-3d">
              <div className="rounded-3xl bg-white/95 text-stone-900 shadow-2xl shadow-black/40 border border-white/40 overflow-hidden">
                <div className="bg-brand-gradient text-white px-6 py-5 flex items-center justify-between">
                  <div>
                    <p className="text-xs text-jade-100/80">الآن تتلو</p>
                    <p className="font-display font-bold text-lg">سورة الفاتحة</p>
                  </div>
                  <div className="w-12 h-12 rounded-2xl bg-gold-400/20 border border-gold-400/40 flex items-center justify-center animate-pulse-ring">
                    <Mic className="w-6 h-6 text-gold-300" />
                  </div>
                </div>

                <div className="p-6 space-y-4">
                  <p className="font-quran text-2xl leading-loose text-center text-stone-800">
                    بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ
                  </p>

                  {/* Fausse forme d'onde */}
                  <div className="flex items-end justify-center gap-1 h-12">
                    {[10, 22, 34, 18, 42, 28, 14, 30, 46, 20, 12, 26, 38, 16].map((h, i) => (
                      <motion.span
                        key={i}
                        className="w-1.5 rounded-full bg-jade-500/70"
                        animate={prefersReduced ? undefined : { height: [h, h * 1.6, h] }}
                        transition={{
                          duration: 1.1,
                          repeat: Infinity,
                          delay: i * 0.06,
                          ease: 'easeInOut',
                        }}
                        style={{ height: h }}
                      />
                    ))}
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5 font-semibold text-jade-700">
                      <Check className="w-4 h-4" />
                      إتقان 98%
                    </span>
                    <span className="text-stone-500">الآية 1 من 7</span>
                  </div>
                </div>

                <div className="px-6 py-4 bg-stone-50 border-t border-stone-100 flex items-center justify-between text-[11px] text-stone-500">
                  <span>سلسلة الالتزام: 12 يومًا</span>
                  <span className="text-gold-600 font-bold">1,240 حسنة</span>
                </div>
              </div>
            </TiltCard>
          </motion.div>
        </div>
      </section>

      {/* Bandeau de chiffres */}
      <section className="bg-jade-900/60 border-y border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
          {[
            { value: '114', label: 'سورة كاملة' },
            { value: '6236', label: 'آية مع التفسير' },
            { value: 'لحظي', label: 'تصحيح صوتي' },
            { value: '∞', label: 'خطط مراجعة' },
          ].map((stat, i) => (
            <Reveal key={stat.label} delay={i * 0.08}>
              <div className="font-display text-3xl sm:text-4xl font-bold text-gold-300">
                {stat.value}
              </div>
              <div className="text-xs sm:text-sm text-jade-100/70 mt-1">{stat.label}</div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Mazaia / Fonctionnalités */}
      <section id="features" className="bg-jade-950 py-20 sm:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <Reveal className="text-center max-w-2xl mx-auto mb-14">
            <h2 className="font-display text-3xl sm:text-4xl font-bold">
              كل ما تحتاجه <span className="text-gold-gradient">لحفظ متقن</span>
            </h2>
            <p className="text-jade-100/70 mt-4 leading-relaxed">
              أدوات مصمّمة بعناية تجمع بين التقنية الذكية وروح التدبّر، لتجعل رحلة حفظك أكثر
              التزامًا وإتقانًا.
            </p>
          </Reveal>

          <motion.div
            variants={staggerContainer}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, amount: 0.15 }}
            className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 perspective-1200"
          >
            {FEATURES.map((feature) => {
              const Icon = feature.icon;
              return (
                <motion.div key={feature.title} variants={staggerItem}>
                  <TiltCard
                    maxTilt={6}
                    className="h-full preserve-3d glass-panel rounded-2xl p-6 hover:bg-white/10 transition-colors"
                  >
                    <div className="w-12 h-12 rounded-xl bg-gold-400/15 border border-gold-400/30 text-gold-300 flex items-center justify-center mb-4">
                      <Icon className="w-6 h-6" />
                    </div>
                    <h3 className="font-bold text-lg mb-2">{feature.title}</h3>
                    <p className="text-sm text-jade-100/70 leading-relaxed">
                      {feature.description}
                    </p>
                  </TiltCard>
                </motion.div>
              );
            })}
          </motion.div>
        </div>
      </section>

      {/* Comment ça marche */}
      <section id="how" className="bg-jade-900/40 py-20 sm:py-24 border-y border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <Reveal className="text-center max-w-2xl mx-auto mb-14">
            <h2 className="font-display text-3xl sm:text-4xl font-bold">
              ثلاث خطوات <span className="text-gold-gradient">إلى الحفظ المتين</span>
            </h2>
          </Reveal>

          <div className="grid md:grid-cols-3 gap-6">
            {STEPS.map((step, i) => {
              const Icon = step.icon;
              return (
                <Reveal key={step.title} delay={i * 0.1}>
                  <div className="relative glass-panel rounded-2xl p-7 h-full">
                    <span className="absolute top-5 left-6 font-display text-5xl font-bold text-white/10">
                      {i + 1}
                    </span>
                    <div className="w-12 h-12 rounded-xl bg-jade-500/20 border border-jade-400/30 text-jade-200 flex items-center justify-center mb-4">
                      <Icon className="w-6 h-6" />
                    </div>
                    <h3 className="font-bold text-lg mb-2">{step.title}</h3>
                    <p className="text-sm text-jade-100/70 leading-relaxed">{step.description}</p>
                  </div>
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="bg-jade-950 py-20 sm:py-24">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <Reveal className="text-center mb-12">
            <h2 className="font-display text-3xl sm:text-4xl font-bold">
              الأسئلة <span className="text-gold-gradient">الشائعة</span>
            </h2>
          </Reveal>

          <div className="space-y-3">
            {FAQS.map((faq, i) => {
              const isOpen = openFaq === i;
              return (
                <Reveal key={faq.question} delay={i * 0.05}>
                  <div className="glass-panel rounded-2xl overflow-hidden">
                    <button
                      onClick={() => setOpenFaq(isOpen ? null : i)}
                      aria-expanded={isOpen}
                      className="w-full flex items-center justify-between gap-4 text-right px-5 py-4 cursor-pointer hover:bg-white/5 transition-colors"
                    >
                      <span className="font-semibold text-sm sm:text-base">{faq.question}</span>
                      <ChevronDown
                        className={`w-5 h-5 text-gold-300 shrink-0 transition-transform duration-300 ${
                          isOpen ? 'rotate-180' : ''
                        }`}
                      />
                    </button>
                    <motion.div
                      initial={false}
                      animate={{ height: isOpen ? 'auto' : 0, opacity: isOpen ? 1 : 0 }}
                      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                      className="overflow-hidden"
                    >
                      <p className="px-5 pb-5 text-sm text-jade-100/75 leading-relaxed">
                        {faq.answer}
                      </p>
                    </motion.div>
                  </div>
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* Appel à l'action final */}
      <section id="cta" className="relative isolate overflow-hidden bg-brand-gradient py-20 sm:py-24">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              'radial-gradient(#f4e1a4 1px, transparent 1px), radial-gradient(#f4e1a4 1px, transparent 1px)',
            backgroundSize: '28px 28px',
            backgroundPosition: '0 0, 14px 14px',
          }}
        />
        <Reveal className="relative max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-6">
          <h2 className="font-display text-3xl sm:text-4xl font-bold">
            ابدأ رحلة حفظك اليوم
          </h2>
          <p className="text-jade-100/80 leading-relaxed">
            انضم إلى مُرتِّل وحوّل حفظك إلى عادة يومية متقنة بمساعدة التصحيح الصوتي والتكرار
            المتباعد.
          </p>
          <button
            onClick={onEnter}
            className="inline-flex items-center gap-2 bg-gold-400 hover:bg-gold-300 text-jade-950 font-bold px-8 py-4 rounded-2xl transition-all shadow-xl shadow-gold-500/25 cursor-pointer"
          >
            <Mic className="w-5 h-5" />
            <span>افتح التطبيق مجانًا</span>
          </button>
        </Reveal>
      </section>

      {/* Pied de page */}
      <footer className="bg-jade-950 border-t border-white/10 py-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-jade-100/60">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gold-400 text-jade-950 flex items-center justify-center font-bold font-display">
              مُ
            </div>
            <span>مُرتِّل — منصّة تحفيظ ومراجعة القرآن الكريم الذكي</span>
          </div>
          <p>© {new Date().getFullYear()} مُرتِّل. جميع الحقوق محفوظة.</p>
        </div>
      </footer>
    </div>
  );
};
