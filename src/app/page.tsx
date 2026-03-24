"use client";

import Link from 'next/link';
import { useRef, useEffect, useState } from 'react';
import { 
  motion, 
  useScroll, 
  useInView,
  useSpring,
  AnimatePresence
} from 'framer-motion';
import { ArrowRight, Menu, X } from 'lucide-react';

/* ─── Design System: "Craft Light" ─── */

// Stagger animation helpers
const staggerContainer = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.12, delayChildren: 0.2 } }
};
const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.7, ease: [0.16, 1, 0.3, 1] as const } }
};
const fadeIn = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.6 } }
};
const scaleIn = {
  hidden: { opacity: 0, scale: 0.92 },
  visible: { opacity: 1, scale: 1, transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] as const } }
};

// Animated counter component
function AnimatedCounter({ value, suffix = "" }: { value: string; suffix?: string }) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-50px" });
  const [display, setDisplay] = useState("0");
  
  useEffect(() => {
    if (!isInView) return;
    const numericValue = parseInt(value.replace(/[^0-9]/g, ''));
    const duration = 1500;
    const steps = 40;
    const increment = numericValue / steps;
    let current = 0;
    let step = 0;
    
    const timer = setInterval(() => {
      step++;
      current = Math.min(Math.round(increment * step), numericValue);
      setDisplay(current.toLocaleString());
      if (step >= steps) clearInterval(timer);
    }, duration / steps);
    
    return () => clearInterval(timer);
  }, [isInView, value]);
  
  return <span ref={ref}>{display}{suffix}</span>;
}

export default function LandingPage() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const heroRef = useRef(null);
  const { scrollYProgress } = useScroll();
  const smoothProgress = useSpring(scrollYProgress, { stiffness: 100, damping: 30 });
  
  useEffect(() => {
    const h = () => setScrolled(window.scrollY > 10);
    window.addEventListener('scroll', h);
    return () => window.removeEventListener('scroll', h);
  }, []);

  return (
    <div className="relative min-h-screen overflow-hidden" style={{ fontFamily: "'Poppins', sans-serif", backgroundColor: '#ffffff', color: '#1b1c1c' }}>

      {/* Google Fonts */}
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800;900&family=Inter:wght@400;500;600&display=swap');
        @import url('https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap');
        body { font-family: 'Poppins', sans-serif; background: #ffffff; }
        h1, h2, h3, h4 { font-family: 'Poppins', sans-serif; }
        .material-symbols-outlined { font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24; display: inline-block; line-height: 1; }
        .hero-card-border { border: 1px solid #E0E8F0; }
        .gradient-primary { background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); }
        ::selection { background: rgba(59, 130, 246, 0.3); color: #1e40af; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: #fbf9f8; }
        ::-webkit-scrollbar-thumb { background: #94a3b8; border-radius: 999px; }
        ::-webkit-scrollbar-thumb:hover { background: #3b82f6; }
        
        /* Landing page mobile overrides */
        @media (max-width: 768px) {
          .landing-nav-links { display: none !important; }
          .landing-mobile-toggle { display: flex !important; }
          .landing-hero-grid { grid-template-columns: 1fr !important; }
          .landing-hero-main { padding: 2rem 1.5rem !important; min-height: 360px !important; }
          .landing-hero-main h1 { font-size: 2rem !important; line-height: 1.2 !important; }
          .landing-hero-main p { font-size: 1rem !important; }
          .landing-hero-cards { display: grid !important; grid-template-columns: 1fr 1fr !important; gap: 12px !important; }
          .landing-hero-card-full { grid-column: span 2 !important; }
          .landing-partnership-grid { grid-template-columns: 1fr !important; gap: 2rem !important; }
          .landing-footer-inner h2 { font-size: 1.75rem !important; }
          .landing-footer-bottom { flex-direction: column !important; gap: 1rem !important; text-align: center !important; }
          .landing-section { padding: 0 1rem !important; }
          .landing-nav-inner { padding: 0 1rem !important; }
          .landing-footer-inner { padding: 3rem 1.5rem !important; }
          .landing-stats-row { flex-direction: column !important; gap: 1.5rem !important; padding: 1.5rem 0 !important; }
          .landing-stat-item { border-right: none !important; border-bottom: 1px solid rgba(224,232,240,0.5) !important; padding-bottom: 1.5rem !important; }
          .landing-stat-item:last-child { border-bottom: none !important; padding-bottom: 0 !important; }
        }
        @media (max-width: 480px) {
          .landing-hero-main h1 { font-size: 1.625rem !important; }
          .landing-hero-cards { grid-template-columns: 1fr !important; }
          .landing-hero-card-full { grid-column: span 1 !important; }
          .landing-footer-inner h2 { font-size: 1.5rem !important; }
        }
      `}</style>

      {/* ═══ SCROLL PROGRESS BAR ═══ */}
      <motion.div
        className="fixed top-0 left-0 right-0 z-[60]"
        style={{
          height: 3,
          background: 'linear-gradient(90deg, #3b82f6, #60a5fa)',
          scaleX: smoothProgress,
          transformOrigin: '0%',
        }}
      />

      {/* ═══ NAVIGATION ═══ */}
      <motion.nav 
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="sticky top-0 z-50 transition-all duration-300"
        style={{ 
          backgroundColor: scrolled ? 'rgba(255,255,255,0.92)' : '#ffffff',
          backdropFilter: scrolled ? 'blur(12px)' : 'none',
          boxShadow: scrolled ? '0 32px 48px -4px rgba(27,28,28,0.04)' : 'none'
        }}
      >
        <div className="landing-nav-inner flex justify-between items-center w-full px-8 py-5 max-w-7xl mx-auto">
          <div className="text-xl font-black tracking-tight uppercase" style={{ color: '#181837', letterSpacing: '-0.02em' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 32, height: 32, borderRadius: 8, background: 'linear-gradient(135deg, #3b82f6, #2563eb)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 14, fontWeight: 800 }}>P</span>
              PRINT ID CRAFT
            </span>
          </div>
          <div className="landing-nav-links hidden md:flex items-center gap-8">
            <Link 
              href="/login" 
              className="px-6 py-2.5 gradient-primary text-white rounded-xl font-semibold text-sm hover:scale-[0.97] active:scale-[0.93] transition-all duration-200 shadow-lg shadow-blue-200"
              style={{ fontSize: '13px', letterSpacing: '0.02em' }}
            >
              Sign In →
            </Link>
          </div>
          {/* Mobile hamburger */}
          <button
            className="landing-mobile-toggle"
            style={{ display: 'none', alignItems: 'center', justifyContent: 'center', width: 40, height: 40, borderRadius: 10, border: '1px solid #E0E8F0', background: 'white', cursor: 'pointer' }}
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <X size={20} color="#181837" /> : <Menu size={20} color="#181837" />}
          </button>
        </div>
        {/* Mobile menu dropdown */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              style={{ overflow: 'hidden', borderTop: '1px solid #E0E8F0' }}
            >
              <div style={{ padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                <Link 
                  href="/login" 
                  className="gradient-primary"
                  style={{ display: 'block', textAlign: 'center', color: 'white', padding: '12px', borderRadius: 12, fontWeight: 600, fontSize: 14, marginTop: 4 }}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Sign In →
                </Link>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.nav>

      {/* ═══ MAIN CONTENT ═══ */}
      <main className="landing-section max-w-7xl mx-auto px-8 py-12 lg:py-20 space-y-24">

        {/* ═══ HERO SECTION ═══ */}
        <motion.section 
          ref={heroRef}
          className="landing-hero-grid grid grid-cols-1 lg:grid-cols-10 gap-8 items-start"
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
        >
          {/* LEFT: Main Focus Card */}
          <motion.div 
            variants={fadeUp}
            className="landing-hero-main lg:col-span-6 bg-white hero-card-border rounded-2xl p-12 lg:p-20 flex flex-col items-center text-center justify-center min-h-[500px] lg:min-h-[600px] relative overflow-hidden"
            style={{ boxShadow: '0 2px 16px -4px rgba(27,28,28,0.04)' }}
          >
            {/* Subtle background pattern */}
            <div style={{
              position: 'absolute', inset: 0, opacity: 0.03,
              backgroundImage: 'radial-gradient(circle at 1px 1px, #3b82f6 1px, transparent 0)',
              backgroundSize: '24px 24px'
            }} />
            <motion.div
              className="mb-6 text-xs font-bold tracking-[0.15em] uppercase px-5 py-2 rounded-full relative"
              style={{ backgroundColor: '#eff6ff', color: '#3b82f6', border: '1px solid rgba(59,130,246,0.2)' }}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.1 }}
            >
              <span style={{ fontSize: '11px', letterSpacing: '0.15em' }}>PRINT ID CRAFT</span>
            </motion.div>
            <h1 
              className="font-bold leading-tight mb-8 max-w-2xl relative"
              style={{ color: '#181837', letterSpacing: '-0.03em', fontSize: 'clamp(2rem, 5vw, 3.5rem)', lineHeight: 1.1 }}
            >
              We build powerful
              <br />
              <span style={{ background: 'linear-gradient(135deg, #3b82f6, #60a5fa)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                ID Card systems.
              </span>
            </h1>
            <p 
              className="leading-relaxed max-w-xl relative"
              style={{ color: '#3c4949', fontSize: 'clamp(0.95rem, 1.5vw, 1.18rem)', lineHeight: 1.7 }}
            >
              We help schools and institutions with transparent card management, strong support for team structure, and commitment to preserve data accuracy.
            </p>
            {/* CTA Buttons */}
            <motion.div 
              className="flex flex-wrap gap-4 mt-10 justify-center relative"
              variants={fadeUp}
            >
              <a 
                href="#how-it-works"
                className="rounded-xl font-semibold transition-all duration-200 hover:bg-gray-50 bg-white"
                style={{ padding: '14px 40px', fontSize: '14px', border: '1.5px solid #E0E8F0', color: '#181837', boxShadow: '0 4px 12px rgba(0,0,0,0.03)' }}
              >
                Explore Solution
              </a>
              <Link 
                href="/login"
                className="rounded-xl font-semibold transition-all duration-200 hover:bg-gray-50 bg-gray-50"
                style={{ padding: '14px 40px', fontSize: '14px', border: '1.5px solid transparent', color: '#3c4949' }}
              >
                Member Login
              </Link>
            </motion.div>
          </motion.div>

          {/* RIGHT: Stacked Cards */}
          <motion.div 
            className="landing-hero-cards lg:col-span-4 flex flex-col gap-6"
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
          >
            {/* Card 1: Difference (teal bg) */}
            <motion.div 
              variants={fadeUp}
              className="landing-hero-card-full rounded-2xl p-8 transition-all duration-300 hover:shadow-lg hover:translate-y-[-2px] cursor-default"
              style={{ backgroundColor: '#3b82f6', color: '#ffffff' }}
              whileHover={{ scale: 1.02 }}
            >
              <h3 className="font-bold mb-3" style={{ fontSize: '18px' }}>The Print ID Craft difference</h3>
              <p className="leading-relaxed opacity-90" style={{ fontSize: '13px', lineHeight: 1.7 }}>
                Precision engineering meets institutional security. We don&apos;t just print; we architect identity ecosystems that scale with your growth.
              </p>
            </motion.div>

            {/* Card 2: What we look for */}
            <motion.div variants={fadeUp} className="bg-white hero-card-border rounded-2xl p-8 transition-all duration-300 hover:shadow-md hover:translate-y-[-2px]" whileHover={{ scale: 1.02 }}>
              <h3 className="font-bold mb-5" style={{ color: '#181837', fontSize: '15px' }}>What we look for</h3>
              <div className="flex gap-4">
                {[
                  { icon: 'verified', tip: 'Verified' },
                  { icon: 'shield', tip: 'Secure' },
                  { icon: 'hub', tip: 'Connected' }
                ].map((item) => (
                  <motion.div 
                    key={item.icon}
                    className="w-10 h-10 rounded-lg flex items-center justify-center"
                    style={{ backgroundColor: '#eff6ff', color: '#3b82f6' }}
                    title={item.tip}
                    whileHover={{ scale: 1.15, backgroundColor: '#dbeafe' }}
                    transition={{ type: 'spring', stiffness: 400 }}
                  >
                    <span className="material-symbols-outlined">{item.icon}</span>
                  </motion.div>
                ))}
              </div>
            </motion.div>

            {/* Card 3: Deal structure */}
            <motion.div variants={fadeUp} className="bg-white hero-card-border rounded-2xl p-8 transition-all duration-300 hover:shadow-md hover:translate-y-[-2px]" whileHover={{ scale: 1.02 }}>
              <h3 className="font-bold mb-5" style={{ color: '#181837', fontSize: '15px' }}>How we structure our deals</h3>
              <div className="flex gap-4">
                {['account_balance_wallet', 'handshake'].map((icon) => (
                  <motion.span 
                    key={icon} 
                    className="material-symbols-outlined" 
                    style={{ color: '#3b82f6' }}
                    whileHover={{ scale: 1.2 }}
                    transition={{ type: 'spring', stiffness: 400 }}
                  >
                    {icon}
                  </motion.span>
                ))}
              </div>
            </motion.div>

            {/* Card 4: Ideal client */}
            <motion.div variants={fadeUp} className="bg-white hero-card-border rounded-2xl p-8 transition-all duration-300 hover:shadow-md hover:translate-y-[-2px]" whileHover={{ scale: 1.02 }}>
              <h3 className="font-bold mb-4" style={{ color: '#181837', fontSize: '15px' }}>Here&apos;s what our ideal client looks like</h3>
              <ul className="space-y-3">
                {['Great Brand', 'Strong Systems', 'Growing Revenue'].map((item, i) => (
                  <motion.li 
                    key={item} 
                    className="flex items-center gap-3" 
                    style={{ color: '#3c4949', fontSize: '13px' }}
                    initial={{ opacity: 0, x: -10 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.1 * i }}
                  >
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: '#3b82f6' }} />
                    {item}
                  </motion.li>
                ))}
              </ul>
            </motion.div>
          </motion.div>
        </motion.section>

        {/* ═══ STATS BAR ═══ */}
        <motion.div
          className="landing-stats-row"
          style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            gap: '3rem',
            padding: '2.5rem 0',
            borderTop: '1px solid rgba(224,232,240,0.5)',
            borderBottom: '1px solid rgba(224,232,240,0.5)',
          }}
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-50px" }}
          transition={{ duration: 0.7 }}
        >
          {[
            { value: "50", suffix: "+", label: "Schools Managed" },
            { value: "25000", suffix: "+", label: "Cards Printed" },
            { value: "99", suffix: ".9%", label: "Match Accuracy" },
          ].map((stat, i) => (
            <div 
              key={stat.label}
              className="landing-stat-item"
              style={{
                textAlign: 'center',
                borderRight: i < 2 ? '1px solid rgba(224,232,240,0.5)' : 'none',
                paddingRight: i < 2 ? '3rem' : 0,
              }}
            >
              <div style={{ fontSize: 'clamp(2rem, 3.5vw, 2.75rem)', fontWeight: 900, color: '#181837', letterSpacing: '-0.03em', lineHeight: 1.1 }}>
                <AnimatedCounter value={stat.value} suffix={stat.suffix} />
              </div>
              <div style={{ fontSize: '13px', color: '#3c4949', marginTop: 6, fontWeight: 500, letterSpacing: '0.02em' }}>{stat.label}</div>
            </div>
          ))}
        </motion.div>

        {/* ═══ PARTNERSHIP-FIRST SECTION ═══ */}
        <section id="how-it-works" className="landing-partnership-grid grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          {/* Left: Text */}
          <motion.div 
            className="space-y-8"
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          >
            <h2 className="font-bold" style={{ color: '#181837', fontSize: 'clamp(1.75rem, 3.5vw, 2.75rem)', letterSpacing: '-0.03em', lineHeight: 1.15 }}>
              A Partnership-First approach.
            </h2>
            <div className="space-y-6">
              <p className="leading-relaxed" style={{ color: '#3c4949', fontSize: 'clamp(0.95rem, 1.3vw, 1.1rem)', lineHeight: 1.8 }}>
                Managing ID cards for multiple schools can be stressful. Traditional vendors leave you hanging when the pressure is on.
              </p>
              <ul className="space-y-4">
                {[
                  'What if data gets lost?',
                  "What if cards don't match?",
                  'What if the system fails during print season?'
                ].map((q, i) => (
                  <motion.li 
                    key={i} 
                    className="flex items-center gap-3 font-medium"
                    style={{ color: '#ba1a1a', fontSize: '14px' }}
                    initial={{ opacity: 0, x: -15 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.15 * i, duration: 0.5 }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>help</span>
                    {q}
                  </motion.li>
                ))}
              </ul>
              <p className="font-semibold pt-4" style={{ color: '#181837', fontSize: '15px' }}>
                You&apos;re left with a lot of unknowns.
              </p>
            </div>
          </motion.div>

          {/* Right: Submarine illustration */}
          <motion.div 
            className="bg-white hero-card-border rounded-2xl p-1 overflow-hidden group"
            style={{ boxShadow: '0 2px 16px -4px rgba(27,28,28,0.04)' }}
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1], delay: 0.15 }}
          >
            <div className="relative aspect-square rounded-xl overflow-hidden flex items-center justify-center" style={{ backgroundColor: '#f5f3f3' }}>
              {/* SVG Submarine Illustration in teal + pink */}
              <svg viewBox="0 0 500 500" className="w-full h-full p-8">
                <defs>
                  <linearGradient id="tealGrad" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#60a5fa" />
                    <stop offset="100%" stopColor="#2563eb" />
                  </linearGradient>
                  <linearGradient id="pinkGrad" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#ff9ec3" />
                    <stop offset="100%" stopColor="#E91E8C" />
                  </linearGradient>
                  <linearGradient id="waterGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f5f3f3" stopOpacity="0" />
                    <stop offset="100%" stopColor="#dbeafe" stopOpacity="0.5" />
                  </linearGradient>
                </defs>

                <rect x="0" y="0" width="500" height="500" fill="url(#waterGrad)" rx="12"/>

                {/* Bubbles */}
                {[
                  { cx: 100, cy: 130, r: 6 },
                  { cx: 140, cy: 200, r: 4 },
                  { cx: 370, cy: 110, r: 7 },
                  { cx: 320, cy: 280, r: 5 },
                  { cx: 200, cy: 90, r: 8 },
                  { cx: 420, cy: 220, r: 5 },
                  { cx: 80, cy: 300, r: 3 },
                  { cx: 440, cy: 160, r: 4 },
                ].map((b, i) => (
                  <motion.circle 
                    key={i} cx={b.cx} cy={b.cy} r={b.r} 
                    fill="rgba(59, 130, 246, 0.25)"
                    stroke="rgba(59, 130, 246, 0.4)"
                    strokeWidth="0.5"
                    initial={{ y: 0, opacity: 0.3 }}
                    animate={{ y: [-15, 15], opacity: [0.2, 0.5, 0.2] }}
                    transition={{ duration: 3.5 + i * 0.4, repeat: Infinity, repeatType: "reverse", delay: i * 0.3 }}
                  />
                ))}

                {/* Coral / Sea plants - Pink */}
                <motion.path d="M60 480 Q70 400 65 360 Q55 310 78 260 Q85 240 70 210" stroke="#ff9ec3" strokeWidth="4" fill="none" strokeLinecap="round"
                  initial={{ pathLength: 0 }} whileInView={{ pathLength: 1 }} viewport={{ once: true }} transition={{ duration: 2 }} />
                <motion.path d="M85 480 Q95 420 100 380 Q105 330 88 290" stroke="#E91E8C" strokeWidth="3" fill="none" strokeLinecap="round" opacity="0.6"
                  initial={{ pathLength: 0 }} whileInView={{ pathLength: 1 }} viewport={{ once: true }} transition={{ duration: 2, delay: 0.3 }} />
                <motion.ellipse cx="70" cy="210" rx="12" ry="20" fill="#ff9ec3" opacity="0.4" initial={{ scale: 0 }} whileInView={{ scale: 1 }} viewport={{ once: true }} transition={{ delay: 1.5 }} />
                <motion.ellipse cx="85" cy="230" rx="10" ry="16" fill="#E91E8C" opacity="0.3" initial={{ scale: 0 }} whileInView={{ scale: 1 }} viewport={{ once: true }} transition={{ delay: 1.7 }} />

                <motion.path d="M410 480 Q400 420 415 370 Q430 320 405 270" stroke="#ff9ec3" strokeWidth="4" fill="none" strokeLinecap="round"
                  initial={{ pathLength: 0 }} whileInView={{ pathLength: 1 }} viewport={{ once: true }} transition={{ duration: 2, delay: 0.2 }} />
                <motion.path d="M435 480 Q440 430 430 380 Q420 330 440 290" stroke="#E91E8C" strokeWidth="3" fill="none" strokeLinecap="round" opacity="0.5"
                  initial={{ pathLength: 0 }} whileInView={{ pathLength: 1 }} viewport={{ once: true }} transition={{ duration: 2, delay: 0.5 }} />
                <motion.ellipse cx="405" cy="270" rx="14" ry="22" fill="#ff9ec3" opacity="0.35" initial={{ scale: 0 }} whileInView={{ scale: 1 }} viewport={{ once: true }} transition={{ delay: 1.6 }} />

                <motion.path d="M230 480 Q235 430 225 390 Q215 350 240 310" stroke="#60a5fa" strokeWidth="3" fill="none" strokeLinecap="round" opacity="0.5"
                  initial={{ pathLength: 0 }} whileInView={{ pathLength: 1 }} viewport={{ once: true }} transition={{ duration: 1.8, delay: 0.4 }} />
                <motion.path d="M260 480 Q255 440 270 400" stroke="#2563eb" strokeWidth="2" fill="none" strokeLinecap="round" opacity="0.3"
                  initial={{ pathLength: 0 }} whileInView={{ pathLength: 1 }} viewport={{ once: true }} transition={{ duration: 1.5, delay: 0.6 }} />

                {/* Submarine */}
                <motion.g
                  initial={{ x: -60, opacity: 0 }}
                  whileInView={{ x: 0, opacity: 1 }}
                  viewport={{ once: true }}
                  transition={{ duration: 1.4, ease: [0.16, 1, 0.3, 1], delay: 0.3 }}
                >
                  <motion.g
                    animate={{ y: [-6, 6] }}
                    transition={{ duration: 4.5, repeat: Infinity, repeatType: "reverse", ease: "easeInOut" }}
                  >
                    <ellipse cx="250" cy="240" rx="120" ry="48" fill="url(#tealGrad)" opacity="0.9" />
                    <ellipse cx="250" cy="228" rx="100" ry="20" fill="rgba(255,255,255,0.15)" />
                    <circle cx="300" cy="232" r="18" fill="#f5f3f3" opacity="0.9" />
                    <circle cx="300" cy="232" r="14" fill="rgba(59, 130, 246, 0.15)" />
                    <circle cx="300" cy="228" r="5" fill="rgba(59, 130, 246, 0.5)" />
                    <circle cx="260" cy="232" r="12" fill="#f5f3f3" opacity="0.8" />
                    <circle cx="260" cy="232" r="9" fill="rgba(59, 130, 246, 0.12)" />
                    <circle cx="260" cy="229" r="3" fill="rgba(59, 130, 246, 0.4)" />
                    <rect x="245" y="180" width="7" height="35" rx="3.5" fill="#2563eb" opacity="0.8" />
                    <rect x="240" y="173" width="17" height="10" rx="5" fill="#2563eb" opacity="0.7" />
                    <polygon points="130,216 105,195 105,285 130,264" fill="url(#pinkGrad)" opacity="0.75" />
                    
                    <motion.g
                      animate={{ rotate: [0, 360] }}
                      transition={{ duration: 2.5, repeat: Infinity, ease: "linear" }}
                      style={{ transformOrigin: "112px 240px" }}
                    >
                      <ellipse cx="112" cy="226" rx="4" ry="16" fill="#E91E8C" opacity="0.55" />
                      <ellipse cx="112" cy="254" rx="4" ry="16" fill="#E91E8C" opacity="0.55" />
                      <ellipse cx="98" cy="240" rx="16" ry="4" fill="#E91E8C" opacity="0.55" />
                      <ellipse cx="126" cy="240" rx="16" ry="4" fill="#E91E8C" opacity="0.55" />
                    </motion.g>

                    <polygon points="370,232 460,200 460,280 370,248" fill="rgba(59, 130, 246, 0.06)" />
                    <line x1="220" y1="192" x2="210" y2="170" stroke="#2563eb" strokeWidth="2" opacity="0.5" />
                    <circle cx="210" cy="168" r="3" fill="#60a5fa" opacity="0.6" />
                  </motion.g>
                </motion.g>

                {/* Seabed */}
                <motion.path
                  d="M0 440 Q60 420 120 435 Q180 450 240 425 Q300 400 360 435 Q420 455 500 430 L500 500 L0 500 Z"
                  fill="#e4e2e2" opacity="0.5"
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 0.5, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 1 }}
                />
                <motion.path
                  d="M0 460 Q80 445 160 460 Q240 475 320 455 Q400 440 500 460 L500 500 L0 500 Z"
                  fill="#bbc9c9" opacity="0.3"
                  initial={{ opacity: 0, y: 15 }}
                  whileInView={{ opacity: 0.3, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 1, delay: 0.2 }}
                />

                {/* Small fish */}
                <motion.g
                  animate={{ x: [-20, 20] }}
                  transition={{ duration: 6, repeat: Infinity, repeatType: "reverse", ease: "easeInOut" }}
                >
                  <ellipse cx="380" cy="340" rx="12" ry="6" fill="#ff9ec3" opacity="0.5" />
                  <polygon points="392,340 402,334 402,346" fill="#ff9ec3" opacity="0.4" />
                  <circle cx="374" cy="338" r="1.5" fill="#E91E8C" opacity="0.6" />
                </motion.g>
                <motion.g
                  animate={{ x: [15, -15] }}
                  transition={{ duration: 5, repeat: Infinity, repeatType: "reverse", ease: "easeInOut", delay: 1 }}
                >
                  <ellipse cx="150" cy="370" rx="10" ry="5" fill="#60a5fa" opacity="0.4" />
                  <polygon points="140,370 130,365 130,375" fill="#60a5fa" opacity="0.3" />
                  <circle cx="155" cy="368" r="1.5" fill="#2563eb" opacity="0.5" />
                </motion.g>
              </svg>
              <div 
                className="absolute inset-0 transition-colors duration-500"
                style={{ backgroundColor: 'rgba(59, 130, 246, 0.05)' }}
              />
            </div>
          </motion.div>
        </section>
      </main>

      {/* ═══ BOTTOM BANNER / FOOTER ═══ */}
      <motion.footer 
        className="px-4 sm:px-8 mt-24"
        style={{ backgroundColor: '#181837' }}
        initial={{ opacity: 0, y: 40 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-50px" }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="landing-footer-inner max-w-7xl mx-auto flex flex-col items-start gap-12 py-24">
          <motion.h2 
            className="font-extrabold text-white leading-tight max-w-4xl"
            style={{ fontSize: 'clamp(1.75rem, 4vw, 3rem)', letterSpacing: '-0.03em', lineHeight: 1.15 }}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7, delay: 0.1 }}
          >
            Print ID Craft is a group of digital solutions that focuses on streamlining ID card manufacturing processes.
          </motion.h2>
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.25 }}
          >
            <Link 
              href="/login"
              className="gradient-primary text-white rounded-xl font-bold hover:scale-105 active:scale-95 transition-all duration-300 flex items-center gap-2 group"
              style={{ padding: '18px 48px', fontSize: '16px', boxShadow: '0 15px 40px rgba(59,130,246,0.4)' }}
            >
              Request Access →
            </Link>
          </motion.div>

          {/* Footer bottom */}
          <div className="landing-footer-bottom w-full pt-16 flex flex-col md:flex-row justify-between items-center gap-8" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
            <div className="flex flex-col gap-2">
              <div className="font-black text-white uppercase tracking-tight" style={{ fontSize: '18px' }}>
                <span className="flex items-center gap-2.5">
                  <span style={{ width: 28, height: 28, borderRadius: 7, background: 'linear-gradient(135deg, #3b82f6, #2563eb)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 13, fontWeight: 900 }}>P</span>
                  PRINT ID CRAFT
                </span>
              </div>
              <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '12px', fontWeight: 500 }}>The Future of Institutional Identity.</p>
            </div>
            <div className="flex flex-wrap justify-center gap-10">
              {['Privacy Policy', 'Terms of Service', 'Support'].map((item) => (
                <a 
                  key={item} 
                  href="#" 
                  className="font-semibold transition-all duration-200"
                  style={{ color: 'rgba(255,255,255,0.45)', fontSize: '13px', letterSpacing: '0.01em' }}
                  onMouseEnter={(e) => (e.target as HTMLElement).style.color = 'rgba(255,255,255,1)'}
                  onMouseLeave={(e) => (e.target as HTMLElement).style.color = 'rgba(255,255,255,0.45)'}
                >
                  {item}
                </a>
              ))}
            </div>
            <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: '12px', fontWeight: 500, fontFamily: 'Inter, sans-serif' }}>
              © {new Date().getFullYear()} Print ID Craft.
            </div>
          </div>
        </div>
      </motion.footer>
    </div>
  );
}
