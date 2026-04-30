"use client";

import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useInView, useScroll, useSpring } from 'framer-motion';
import {
  ArrowRight,
  BookOpen,
  Briefcase,
  Camera,
  CheckCircle2,
  Coffee,
  Crown,
  Download,
  Facebook,
  Footprints,
  GraduationCap,
  HeartHandshake,
  IdCard,
  Image as ImageIcon,
  Instagram,
  Mail,
  MapPin,
  Menu,
  Pen,
  Phone,
  Shirt,
  ShoppingBag,
  Sparkles,
  Tag as TagIcon,
  Truck,
  X,
  type LucideIcon,
} from 'lucide-react';

const NAVY = '#0D1238';
const NAVY_DEEP = '#080B25';
const GOLD = '#F5B921';
const GOLD_LIGHT = '#FFD66E';
const GOLD_DEEP = '#C99514';
const CREAM = '#FAF7EE';
const MUTED = '#4C5570';

const fadeUp = {
  hidden: { opacity: 0, y: 26 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.65, ease: [0.16, 1, 0.3, 1] as const } },
};

const stagger = {
  hidden: { opacity: 1 },
  visible: { opacity: 1, transition: { staggerChildren: 0.08, delayChildren: 0.08 } },
};

function AnimatedCounter({ value, suffix = '' }: { value: string; suffix?: string }) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const isInView = useInView(ref, { once: true, margin: '-50px' });
  const [display, setDisplay] = useState('0');

  useEffect(() => {
    if (!isInView) return;
    const numericValue = parseInt(value.replace(/[^0-9]/g, ''), 10);
    const duration = 1200;
    const steps = 36;
    const increment = numericValue / steps;
    let step = 0;

    const timer = window.setInterval(() => {
      step += 1;
      setDisplay(Math.min(Math.round(increment * step), numericValue).toLocaleString());
      if (step >= steps) window.clearInterval(timer);
    }, duration / steps);

    return () => window.clearInterval(timer);
  }, [isInView, value]);

  return <span ref={ref}>{display}{suffix}</span>;
}

const PRODUCT_CATEGORIES: { label: string; Icon: LucideIcon }[] = [
  { label: 'Uniforms', Icon: Shirt },
  { label: 'Footwear', Icon: Footprints },
  { label: 'ID Cards', Icon: IdCard },
  { label: 'Lanyards', Icon: TagIcon },
  { label: 'Office Bags', Icon: ShoppingBag },
  { label: 'Notebooks', Icon: BookOpen },
  { label: 'Mugs', Icon: Coffee },
  { label: 'T-Shirt Printing', Icon: Shirt },
  { label: 'Caps & Badges', Icon: Crown },
  { label: 'Pens & Diaries', Icon: Pen },
  { label: 'Photo Frames', Icon: ImageIcon },
  { label: 'Photography', Icon: Camera },
];

const FEATURED_PRODUCTS = [
  {
    title: 'School essentials, supplied end-to-end',
    desc: 'Uniforms, PT wear, shoes, socks, bags, diaries, notebooks and identity products built for dependable annual procurement.',
    image: '/catalogue/page-04.jpg',
    tag: 'For Schools',
  },
  {
    title: 'Corporate gifting with brand consistency',
    desc: 'Diaries, mugs, caps, bottles, bags, keychains and apparel customised with crisp logo placement and premium finishing.',
    image: '/catalogue/page-10.jpg',
    tag: 'For Companies',
  },
  {
    title: 'Identity products with fast turnaround',
    desc: 'ID cards, multicolour lanyards, badges and accessories designed for clean identification and daily durability.',
    image: '/catalogue/page-18.jpg',
    tag: 'For Teams',
  },
];

const SCHOOL_OFFERINGS = [
  'Complete regular and PT uniform solutions',
  'School shoes, socks and bags',
  'Customized notebooks and student diaries',
  'Identity cards and multicolor lanyards',
  'Pre-primary customized books',
];

const CORPORATE_OFFERINGS = [
  'Office and corporate uniforms',
  'Branded diaries, office bags and calendars',
  'Custom printed T-shirts, caps and mugs',
  'Keychains, bottles, badges and accessories',
  'Logo and branding solutions for merchandise',
];

const TRUST_POINTS = [
  { title: 'Customization', desc: 'Material, colour, logo, sizing and packaging tailored to your institution.', Icon: Sparkles },
  { title: 'Premium quality', desc: 'Comfortable fabrics, vivid prints, sturdy accessories and durable finishes.', Icon: Crown },
  { title: 'Bulk delivery', desc: 'Procurement-friendly ordering with dependable timelines for large batches.', Icon: Truck },
  { title: 'Support', desc: 'Year-round help for replacements, new admissions and urgent requirements.', Icon: HeartHandshake },
];

function SectionLabel({ children, light = false, center = false }: { children: React.ReactNode; light?: boolean; center?: boolean }) {
  return (
    <div className={center ? 'flex justify-center' : ''}>
      <div className="inline-flex items-center gap-3">
        <span style={{ width: 8, height: 8, borderRadius: 2, background: GOLD, display: 'inline-block' }} />
        <span className="font-bold uppercase" style={{ color: light ? GOLD_LIGHT : GOLD_DEEP, fontSize: 11, letterSpacing: '0.2em' }}>
          {children}
        </span>
      </div>
    </div>
  );
}

function Stat({ value, suffix, label }: { value: string; suffix?: string; label: string }) {
  return (
    <div className="text-center md:text-left">
      <div className="font-extrabold" style={{ color: NAVY, fontSize: 'clamp(2rem, 4vw, 3rem)', letterSpacing: '-0.04em', lineHeight: 1 }}>
        <AnimatedCounter value={value} suffix={suffix} />
      </div>
      <div className="mt-2 font-semibold uppercase" style={{ color: MUTED, fontSize: 11, letterSpacing: '0.16em' }}>
        {label}
      </div>
    </div>
  );
}

function ProductTile({ Icon, label, index }: { Icon: LucideIcon; label: string; index: number }) {
  return (
    <motion.div
      variants={fadeUp}
      whileHover={{ y: -4 }}
      transition={{ type: 'spring', stiffness: 260, damping: 22 }}
      className="rounded-2xl p-6 h-full"
      style={{ background: '#fff', border: `1px solid ${NAVY}10`, boxShadow: `0 16px 38px -30px ${NAVY}66` }}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="rounded-xl flex items-center justify-center" style={{ width: 46, height: 46, background: `${GOLD}1A`, color: NAVY }}>
          <Icon size={22} strokeWidth={2.2} />
        </div>
        <span className="font-bold tabular-nums" style={{ color: GOLD_DEEP, fontSize: 11, letterSpacing: '0.12em' }}>
          {String(index + 1).padStart(2, '0')}
        </span>
      </div>
      <h3 className="font-bold mt-6" style={{ color: NAVY, fontSize: 16, letterSpacing: '-0.01em' }}>{label}</h3>
      <div className="mt-2 inline-flex items-center gap-1.5 font-semibold" style={{ color: GOLD_DEEP, fontSize: 12 }}>
        Available <ArrowRight size={12} />
      </div>
    </motion.div>
  );
}

function OfferingCard({ title, subtitle, items, Icon, dark = false }: { title: string; subtitle: string; items: string[]; Icon: LucideIcon; dark?: boolean }) {
  return (
    <motion.div
      variants={fadeUp}
      whileHover={{ y: -5 }}
      transition={{ type: 'spring', stiffness: 240, damping: 22 }}
      className="rounded-[2rem] p-8 md:p-10 relative overflow-hidden"
      style={{
        background: dark ? `linear-gradient(135deg, ${NAVY}, ${NAVY_DEEP})` : '#fff',
        color: dark ? '#fff' : NAVY,
        border: dark ? 'none' : `1px solid ${NAVY}10`,
        boxShadow: `0 24px 70px -42px ${NAVY}99`,
      }}
    >
      <div style={{ position: 'absolute', right: -80, top: -80, width: 220, height: 220, borderRadius: '50%', background: dark ? `${GOLD}18` : `${GOLD}22` }} />
      <div className="relative">
        <div className="rounded-2xl flex items-center justify-center" style={{ width: 58, height: 58, background: dark ? GOLD : `${GOLD}1F`, color: dark ? NAVY : GOLD_DEEP }}>
          <Icon size={28} strokeWidth={2.2} />
        </div>
        <div className="mt-7 font-bold uppercase" style={{ color: dark ? GOLD_LIGHT : GOLD_DEEP, fontSize: 11, letterSpacing: '0.18em' }}>{subtitle}</div>
        <h3 className="font-extrabold mt-2" style={{ fontSize: 'clamp(1.55rem, 3vw, 2rem)', letterSpacing: '-0.03em', lineHeight: 1.1 }}>{title}</h3>
        <ul className="mt-7 space-y-3.5">
          {items.map((item) => (
            <li key={item} className="flex items-start gap-3" style={{ color: dark ? 'rgba(255,255,255,0.78)' : MUTED, fontSize: 14, lineHeight: 1.6 }}>
              <CheckCircle2 size={17} style={{ color: dark ? GOLD_LIGHT : GOLD_DEEP, flexShrink: 0, marginTop: 2 }} />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>
    </motion.div>
  );
}

export default function LandingPage() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const { scrollYProgress } = useScroll();
  const smoothProgress = useSpring(scrollYProgress, { stiffness: 100, damping: 30 });
  const currentYear = useMemo(() => new Date().getFullYear(), []);

  useEffect(() => {
    setMounted(true);
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const navLinks = [
    { label: 'About', href: '#about' },
    { label: 'Services', href: '#services' },
    { label: 'Products', href: '#products' },
    { label: 'Catalogue', href: '#catalogue' },
    { label: 'Contact', href: '#contact' },
  ];

  return (
    <div className="landing-page min-h-screen overflow-x-hidden" style={{ background: CREAM, color: NAVY, fontFamily: "var(--font-poppins), 'Poppins', sans-serif" }}>
      <motion.div
        className="fixed top-0 left-0 right-0 z-[70]"
        style={{ height: 3, background: `linear-gradient(90deg, ${GOLD_DEEP}, ${GOLD}, ${GOLD_LIGHT})`, scaleX: smoothProgress, transformOrigin: '0%' }}
      />

      <nav
        className="sticky top-0 z-50 transition-all duration-300"
        style={{
          background: scrolled ? 'rgba(250,247,238,0.9)' : 'rgba(250,247,238,0.76)',
          backdropFilter: 'blur(18px)',
          borderBottom: `1px solid ${NAVY}${scrolled ? '14' : '08'}`,
          boxShadow: scrolled ? `0 18px 50px -36px ${NAVY}80` : 'none',
        }}
      >
        <div className="max-w-7xl mx-auto px-5 md:px-8 py-2.5 flex items-center justify-between gap-5">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="relative overflow-hidden rounded-full" style={{ width: 42, height: 42, background: NAVY }}>
              <Image src="/wisemelon-logo-original.png" alt="WiseMelon Ventures" fill sizes="42px" style={{ objectFit: 'cover' }} priority />
            </div>
            <div>
              <div className="font-bold leading-none tracking-tight" style={{ color: NAVY, fontSize: 14 }}>WiseMelon</div>
              <div className="font-semibold uppercase" style={{ color: GOLD_DEEP, fontSize: 8, letterSpacing: '0.16em', marginTop: 3 }}>Ventures Pvt. Ltd.</div>
            </div>
          </Link>

          <div className="hidden md:flex items-center gap-6">
            {navLinks.map((link) => (
              <a key={link.label} href={link.href} className="font-semibold transition-opacity hover:opacity-65" style={{ color: NAVY, fontSize: 12 }}>
                {link.label}
              </a>
            ))}
          </div>

          <div className="hidden md:flex items-center gap-2.5">
            <a href="/wisemelon-catalogue.pdf" download className="rounded-full font-bold inline-flex items-center gap-2 transition-transform hover:scale-[1.03] active:scale-[0.97]" style={{ padding: '9px 15px', background: GOLD, color: NAVY, fontSize: 12 }}>
              <Download size={14} /> Catalogue
            </a>
            <Link href="/login" className="rounded-full font-bold transition-transform hover:scale-[1.03] active:scale-[0.97]" style={{ padding: '9px 16px', background: NAVY, color: '#fff', fontSize: 12 }}>
              Login →
            </Link>
          </div>

          <button
            className="md:hidden rounded-xl flex items-center justify-center"
            style={{ width: 42, height: 42, background: '#fff', border: `1px solid ${NAVY}12`, color: NAVY }}
            onClick={() => setMobileMenuOpen((open) => !open)}
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>

        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25 }} style={{ overflow: 'hidden', borderTop: `1px solid ${NAVY}10` }}>
              <div className="px-5 py-4 flex flex-col gap-1">
                {navLinks.map((link) => (
                  <a key={link.label} href={link.href} onClick={() => setMobileMenuOpen(false)} className="rounded-xl px-3 py-3 font-semibold" style={{ color: NAVY, fontSize: 14 }}>
                    {link.label}
                  </a>
                ))}
                <a href="/wisemelon-catalogue.pdf" download onClick={() => setMobileMenuOpen(false)} className="rounded-xl px-3 py-3 font-bold text-center mt-2" style={{ background: GOLD, color: NAVY, fontSize: 14 }}>
                  Download Catalogue
                </a>
                <Link href="/login" onClick={() => setMobileMenuOpen(false)} className="rounded-xl px-3 py-3 font-bold text-center" style={{ background: NAVY, color: '#fff', fontSize: 14 }}>
                  Login →
                </Link>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </nav>

      <main>
        <section className="relative overflow-hidden" style={{ background: `linear-gradient(180deg, ${CREAM} 0%, #FFFFFF 100%)` }}>
          <div className="absolute inset-0 pointer-events-none" style={{ background: `radial-gradient(circle at 10% 20%, ${GOLD}26 0, transparent 22%), radial-gradient(circle at 90% 8%, ${NAVY}10 0, transparent 28%)` }} />
          <div className="max-w-7xl mx-auto px-5 md:px-8 pt-16 md:pt-24 pb-20 md:pb-28 relative">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-center">
              <motion.div className="lg:col-span-6" variants={stagger} initial="hidden" animate={mounted ? 'visible' : 'hidden'}>
                <motion.div variants={fadeUp}>
                  <SectionLabel>School essentials & corporate gifting</SectionLabel>
                </motion.div>
                <motion.h1 variants={fadeUp} className="font-extrabold mt-6" style={{ color: NAVY, fontSize: 'clamp(3rem, 7vw, 6rem)', letterSpacing: '-0.065em', lineHeight: 0.96 }}>
                  Premium essentials for institutions that move fast.
                </motion.h1>
                <motion.p variants={fadeUp} className="mt-7 max-w-xl" style={{ color: MUTED, fontSize: 'clamp(1rem, 1.6vw, 1.18rem)', lineHeight: 1.75 }}>
                  WiseMelon Ventures supplies uniforms, ID cards, lanyards, notebooks, bags, mugs and branded merchandise for schools and corporates with dependable quality and timelines.
                </motion.p>
                <motion.div variants={fadeUp} className="flex flex-wrap gap-3 mt-9">
                  <a href="/wisemelon-catalogue.pdf" download className="rounded-full font-bold inline-flex items-center gap-2 transition-transform hover:scale-[1.03] active:scale-[0.97]" style={{ padding: '16px 24px', background: NAVY, color: '#fff', fontSize: 15, boxShadow: `0 18px 45px -18px ${NAVY}99` }}>
                    <Download size={17} /> Download Catalogue
                  </a>
                  <a href="#products" className="rounded-full font-bold inline-flex items-center gap-2 transition-transform hover:scale-[1.03] active:scale-[0.97]" style={{ padding: '16px 24px', background: '#fff', color: NAVY, fontSize: 15, border: `1px solid ${NAVY}12` }}>
                    Explore Products <ArrowRight size={17} />
                  </a>
                </motion.div>
              </motion.div>

              <motion.div className="lg:col-span-6" initial={{ opacity: 0, y: 30 }} animate={mounted ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }} transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}>
                <div className="relative min-h-[430px] md:min-h-[540px]">
                  <div className="absolute inset-0 rounded-[2.25rem]" style={{ background: `linear-gradient(135deg, ${NAVY}, ${NAVY_DEEP})`, transform: 'rotate(-2deg)' }} />
                  <div className="absolute inset-0 rounded-[2.25rem]" style={{ background: GOLD, transform: 'rotate(2.5deg) translate(14px, 14px)' }} />
                  <div className="relative rounded-[2rem] overflow-hidden h-full min-h-[430px] md:min-h-[540px]" style={{ background: '#fff', boxShadow: `0 30px 90px -45px ${NAVY}` }}>
                    <div className="grid grid-cols-2 h-full">
                      <div className="p-5 md:p-7 flex flex-col gap-5 justify-between" style={{ background: '#fff' }}>
                        <div>
                          <div className="inline-flex rounded-full px-3 py-1 font-bold uppercase" style={{ background: `${GOLD}22`, color: GOLD_DEEP, fontSize: 10, letterSpacing: '0.14em' }}>Catalogue preview</div>
                          <h2 className="font-extrabold mt-5" style={{ color: NAVY, fontSize: 'clamp(1.55rem, 3vw, 2.35rem)', letterSpacing: '-0.04em', lineHeight: 1.05 }}>
                            A complete product range in one place.
                          </h2>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          {['50+', '12+', '24h', '100%'].map((item, index) => (
                            <div key={item} className="rounded-2xl p-4" style={{ background: index === 0 ? NAVY : CREAM, color: index === 0 ? '#fff' : NAVY }}>
                              <div className="font-extrabold" style={{ fontSize: 24, lineHeight: 1 }}>{item}</div>
                              <div className="mt-1 uppercase font-semibold" style={{ fontSize: 9, letterSpacing: '0.12em', opacity: 0.7 }}>{['Schools', 'Years', 'Dispatch', 'Custom'][index]}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="relative overflow-hidden" style={{ background: NAVY }}>
                        <Image src="/catalogue/page-01.jpg" alt="WiseMelon catalogue cover" fill sizes="(max-width: 768px) 50vw, 360px" style={{ objectFit: 'cover' }} priority />
                        <div className="absolute inset-0" style={{ background: `linear-gradient(180deg, transparent 40%, ${NAVY}B3 100%)` }} />
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            </div>
          </div>
        </section>

        <section className="bg-white border-y" style={{ borderColor: `${NAVY}0d` }}>
          <div className="max-w-7xl mx-auto px-5 md:px-8 py-8 grid grid-cols-2 md:grid-cols-4 gap-8">
            <Stat value="50" suffix="+" label="Schools served" />
            <Stat value="12" suffix="+" label="Years experience" />
            <Stat value="24" suffix="hr" label="Standard dispatch" />
            <Stat value="100" suffix="%" label="Customizable" />
          </div>
        </section>

        <section id="about" className="max-w-7xl mx-auto px-5 md:px-8 py-20 md:py-28">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            <motion.div className="lg:col-span-5" initial={{ opacity: 0, x: -24 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true, margin: '-80px' }} transition={{ duration: 0.65 }}>
              <SectionLabel>About WiseMelon</SectionLabel>
              <h2 className="font-extrabold mt-5" style={{ color: NAVY, fontSize: 'clamp(2rem, 4vw, 3.4rem)', letterSpacing: '-0.055em', lineHeight: 1 }}>
                Built for schools, teams and purchase committees.
              </h2>
            </motion.div>
            <motion.div className="lg:col-span-7 space-y-5" initial={{ opacity: 0, x: 24 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true, margin: '-80px' }} transition={{ duration: 0.65, delay: 0.1 }} style={{ color: MUTED, fontSize: 16, lineHeight: 1.8 }}>
              <p>
                WiseMelon Ventures has been supplying public and private sector clients since 2012, originally as 3rd Eye Technovision and reorganised in January 2025 as WiseMelon Ventures Pvt. Ltd.
              </p>
              <p>
                We focus on dependable institutional supply: clean branding, flexible customization, procurement-friendly ordering, competitive pricing and quick turnaround for standard requirements.
              </p>
            </motion.div>
          </div>
        </section>

        <section id="services" style={{ background: NAVY }}>
          <div className="max-w-7xl mx-auto px-5 md:px-8 py-20 md:py-28">
            <div className="max-w-2xl mb-12">
              <SectionLabel light>What we offer</SectionLabel>
              <h2 className="font-extrabold mt-5" style={{ color: '#fff', fontSize: 'clamp(2rem, 4vw, 3.4rem)', letterSpacing: '-0.055em', lineHeight: 1 }}>
                Two core verticals. One reliable partner.
              </h2>
            </div>
            <motion.div className="grid grid-cols-1 md:grid-cols-2 gap-6" variants={stagger} initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-80px' }}>
              <OfferingCard title="School Essentials" subtitle="Institutional supply" Icon={GraduationCap} items={SCHOOL_OFFERINGS} />
              <OfferingCard title="Corporate Gifting" subtitle="Brand merchandise" Icon={Briefcase} items={CORPORATE_OFFERINGS} dark />
            </motion.div>
          </div>
        </section>

        <section id="products" className="max-w-7xl mx-auto px-5 md:px-8 py-20 md:py-28">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
            <div>
              <SectionLabel>Product range</SectionLabel>
              <h2 className="font-extrabold mt-5 max-w-3xl" style={{ color: NAVY, fontSize: 'clamp(2rem, 4vw, 3.4rem)', letterSpacing: '-0.055em', lineHeight: 1 }}>
                Everything your institution needs, thoughtfully organised.
              </h2>
            </div>
            <a href="/wisemelon-catalogue.pdf" download className="rounded-full font-bold inline-flex items-center gap-2 self-start md:self-auto" style={{ padding: '14px 20px', background: GOLD, color: NAVY, fontSize: 14 }}>
              Download full list <Download size={16} />
            </a>
          </div>
          <motion.div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-5" variants={stagger} initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-80px' }}>
            {PRODUCT_CATEGORIES.map((product, index) => <ProductTile key={product.label} {...product} index={index} />)}
          </motion.div>
        </section>

        <section className="max-w-7xl mx-auto px-5 md:px-8 pb-20 md:pb-28">
          <motion.div className="grid grid-cols-1 md:grid-cols-3 gap-5" variants={stagger} initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-80px' }}>
            {FEATURED_PRODUCTS.map((item) => (
              <motion.article key={item.title} variants={fadeUp} className="rounded-[2rem] overflow-hidden bg-white" style={{ border: `1px solid ${NAVY}10`, boxShadow: `0 24px 70px -44px ${NAVY}80` }}>
                <div className="relative aspect-[4/3] overflow-hidden" style={{ background: NAVY }}>
                  <Image src={item.image} alt={item.title} fill sizes="(max-width: 768px) 100vw, 33vw" style={{ objectFit: 'cover' }} />
                </div>
                <div className="p-6 md:p-7">
                  <div className="inline-flex rounded-full px-3 py-1 font-bold uppercase" style={{ background: `${GOLD}1f`, color: GOLD_DEEP, fontSize: 10, letterSpacing: '0.14em' }}>{item.tag}</div>
                  <h3 className="font-extrabold mt-4" style={{ color: NAVY, fontSize: 22, letterSpacing: '-0.035em', lineHeight: 1.15 }}>{item.title}</h3>
                  <p className="mt-3" style={{ color: MUTED, fontSize: 14, lineHeight: 1.7 }}>{item.desc}</p>
                </div>
              </motion.article>
            ))}
          </motion.div>
        </section>

        <section style={{ background: '#fff' }}>
          <div className="max-w-7xl mx-auto px-5 md:px-8 py-20 md:py-28">
            <div className="text-center max-w-3xl mx-auto mb-12">
              <SectionLabel center>Why choose us</SectionLabel>
              <h2 className="font-extrabold mt-5" style={{ color: NAVY, fontSize: 'clamp(2rem, 4vw, 3.4rem)', letterSpacing: '-0.055em', lineHeight: 1 }}>
                A cleaner process from enquiry to delivery.
              </h2>
            </div>
            <motion.div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5" variants={stagger} initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-80px' }}>
              {TRUST_POINTS.map(({ title, desc, Icon }) => (
                <motion.div key={title} variants={fadeUp} className="rounded-2xl p-7" style={{ background: CREAM, border: `1px solid ${NAVY}0d` }}>
                  <div className="rounded-xl flex items-center justify-center" style={{ width: 50, height: 50, background: NAVY, color: GOLD_LIGHT }}>
                    <Icon size={24} strokeWidth={2.2} />
                  </div>
                  <h3 className="font-bold mt-5" style={{ color: NAVY, fontSize: 18 }}>{title}</h3>
                  <p className="mt-2" style={{ color: MUTED, fontSize: 14, lineHeight: 1.65 }}>{desc}</p>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </section>

        <motion.section
          id="catalogue"
          className="px-5 md:px-8 py-20 md:py-28"
          style={{ background: `linear-gradient(135deg, ${GOLD_LIGHT}, ${GOLD})` }}
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true, margin: '-120px' }}
          transition={{ duration: 0.6 }}
        >
          <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
            <motion.div
              className="lg:col-span-7"
              variants={stagger}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: '-100px' }}
            >
              <motion.div variants={fadeUp}>
                <SectionLabel>Catalogue</SectionLabel>
              </motion.div>
              <motion.h2 variants={fadeUp} className="font-extrabold mt-5" style={{ color: NAVY, fontSize: 'clamp(2.2rem, 5vw, 4rem)', letterSpacing: '-0.06em', lineHeight: 0.98 }}>
                Explore the complete WiseMelon product catalogue.
              </motion.h2>
              <motion.p variants={fadeUp} className="mt-5 max-w-2xl" style={{ color: `${NAVY}cc`, fontSize: 16, lineHeight: 1.75 }}>
                Browse our school essentials, identity products and corporate gifting range in one professionally prepared catalogue.
              </motion.p>
              <motion.div variants={fadeUp} className="flex flex-wrap gap-3 mt-8">
                <motion.a href="/wisemelon-catalogue.pdf" download className="rounded-full font-bold inline-flex items-center gap-2" style={{ padding: '16px 24px', background: NAVY, color: '#fff', fontSize: 15 }} whileHover={{ y: -2, scale: 1.03 }} whileTap={{ scale: 0.97 }}>
                  <Download size={17} /> Download PDF
                </motion.a>
                <motion.a href="#contact" className="rounded-full font-bold inline-flex items-center gap-2" style={{ padding: '16px 24px', background: 'rgba(255,255,255,0.42)', color: NAVY, fontSize: 15, border: `1px solid ${NAVY}18` }} whileHover={{ y: -2, scale: 1.03 }} whileTap={{ scale: 0.97 }}>
                  Contact sales <ArrowRight size={17} />
                </motion.a>
              </motion.div>
            </motion.div>
            <div className="lg:col-span-5 grid grid-cols-3 gap-3">
              {['/catalogue/page-01.jpg', '/catalogue/page-06.jpg', '/catalogue/page-15.jpg'].map((src, index) => (
                <motion.div key={src} className="relative aspect-[3/4] rounded-2xl overflow-hidden" style={{ boxShadow: `0 18px 55px -28px ${NAVY}` }} initial={{ opacity: 0, y: 28, rotate: index === 0 ? -5 : index === 1 ? 2 : 6 }} whileInView={{ opacity: 1, y: 0 }} whileHover={{ y: -10, rotate: index === 0 ? -7 : index === 1 ? 0 : 8 }} viewport={{ once: true }} transition={{ duration: 0.65, delay: index * 0.08 }}>
                  <Image src={src} alt="WiseMelon catalogue page" fill sizes="(max-width: 768px) 33vw, 180px" style={{ objectFit: 'cover' }} />
                </motion.div>
              ))}
            </div>
          </div>
        </motion.section>
      </main>

      <footer id="contact" style={{ background: `linear-gradient(180deg, ${NAVY}, ${NAVY_DEEP})`, color: '#fff' }}>
        <div className="max-w-7xl mx-auto px-5 md:px-8 py-16 md:py-20">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
            <div className="lg:col-span-5">
              <div className="flex items-center gap-4">
                <div className="relative overflow-hidden rounded-full" style={{ width: 62, height: 62, background: NAVY }}>
                  <Image src="/wisemelon-logo-original.png" alt="WiseMelon Ventures" fill sizes="62px" style={{ objectFit: 'cover' }} />
                </div>
                <div>
                  <div className="font-extrabold" style={{ fontSize: 23, letterSpacing: '-0.02em' }}>WiseMelon</div>
                  <div className="font-semibold uppercase" style={{ color: GOLD_LIGHT, fontSize: 10, letterSpacing: '0.2em' }}>Ventures Pvt. Ltd.</div>
                </div>
              </div>
              <p className="mt-5 max-w-md" style={{ color: 'rgba(255,255,255,0.68)', fontSize: 14, lineHeight: 1.75 }}>
                Perfect Solution for School Essentials & Corporate Gifting. Premium products, customized branding and dependable delivery.
              </p>
            </div>
            <div className="lg:col-span-3">
              <div className="font-bold uppercase mb-5" style={{ color: GOLD_LIGHT, fontSize: 11, letterSpacing: '0.18em' }}>Explore</div>
              <div className="grid gap-3">
                {navLinks.map((link) => (
                  <a key={link.label} href={link.href} className="transition-colors hover:text-white" style={{ color: 'rgba(255,255,255,0.66)', fontSize: 14 }}>{link.label}</a>
                ))}
              </div>
            </div>
            <div className="lg:col-span-4">
              <div className="font-bold uppercase mb-5" style={{ color: GOLD_LIGHT, fontSize: 11, letterSpacing: '0.18em' }}>Get in touch</div>
              <div className="space-y-4" style={{ color: 'rgba(255,255,255,0.75)', fontSize: 14 }}>
                <div className="flex items-start gap-3"><Phone size={16} style={{ color: GOLD_LIGHT, marginTop: 2 }} /><div><a href="tel:+919881877607">+91 98818 77607</a> · <a href="tel:+918888740323">+91 88887 40323</a></div></div>
                <div className="flex items-start gap-3"><Mail size={16} style={{ color: GOLD_LIGHT, marginTop: 2 }} /><a href="mailto:wisemelonventures@gmail.com">wisemelonventures@gmail.com</a></div>
                <div className="flex items-start gap-3"><MapPin size={16} style={{ color: GOLD_LIGHT, marginTop: 2, flexShrink: 0 }} /><span style={{ lineHeight: 1.6 }}>Lane No-16/A, Madina Manzil, 1st Floor,<br />Sayyed Nagar, Hadapsar, Pune-411028</span></div>
              </div>
              <div className="flex gap-3 mt-6">
                <a href="https://instagram.com/wisemelon_1512_" target="_blank" rel="noopener noreferrer" aria-label="Instagram" className="rounded-full flex items-center justify-center" style={{ width: 38, height: 38, background: 'rgba(255,255,255,0.07)', color: GOLD_LIGHT }}><Instagram size={16} /></a>
                <a href="https://facebook.com/" target="_blank" rel="noopener noreferrer" aria-label="Facebook" className="rounded-full flex items-center justify-center" style={{ width: 38, height: 38, background: 'rgba(255,255,255,0.07)', color: GOLD_LIGHT }}><Facebook size={16} /></a>
              </div>
            </div>
          </div>
          <div className="mt-14 pt-7 flex flex-col md:flex-row justify-between gap-4" style={{ borderTop: '1px solid rgba(255,255,255,0.09)', color: 'rgba(255,255,255,0.42)', fontSize: 12 }}>
            <div suppressHydrationWarning>© {currentYear} WiseMelon Ventures Pvt. Ltd. All rights reserved.</div>
            <a href="https://www.wisemelonventures.com" target="_blank" rel="noopener noreferrer">www.wisemelonventures.com</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
