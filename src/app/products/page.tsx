"use client";

import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowRight,
  BadgeCheck,
  BookOpen,
  Briefcase,
  Building2,
  CheckCircle2,
  Coffee,
  Download,
  Facebook,
  Footprints,
  Gift,
  GraduationCap,
  HeartHandshake,
  IdCard,
  Instagram,
  Mail,
  MapPin,
  Menu,
  MessageCircle,
  PackageCheck,
  PenLine,
  Phone,
  ShieldCheck,
  Shirt,
  ShoppingBag,
  Sparkles,
  Tags,
  Truck,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

export const NAV_LINKS = [
  { label: 'Home', href: '/' },
  { label: 'About', href: '/about' },
  { label: 'Products', href: '/products' },
  { label: 'Catalogue', href: '/#catalogue' },
  { label: 'Contact', href: '/#catalogue' },
];

const STATS = [
  { value: '50+', label: 'schools served' },
  { value: '12+', label: 'years experience' },
  { value: '24h', label: 'select dispatch' },
  { value: '100%', label: 'customizable' },
];

const SCHOOL_ITEMS = [
  'Uniforms, PT wear, shoes and socks',
  'School bags, notebooks and diaries',
  'ID cards, lanyards and badges',
  'Pre-primary customised books',
  'Admission-cycle and annual bulk supply',
];

const CORPORATE_ITEMS = [
  'Mugs, bottles, pens and diaries',
  'Bags, T-shirts, caps and badges',
  'Corporate uniforms and branded office wear',
  'Accessories, gift boxes and event merchandise',
  'Logo placement and brand-consistent finishing',
];

const PRODUCT_CATEGORIES: Array<{ name: string; desc: string; Icon: LucideIcon }> = [
  { name: 'Uniforms', desc: 'Regular, PT and corporate uniforms with custom sizing.', Icon: Shirt },
  { name: 'Footwear', desc: 'School shoes, socks and daily-wear essentials.', Icon: Footprints },
  { name: 'ID Cards', desc: 'Student, staff and visitor identity cards.', Icon: IdCard },
  { name: 'Lanyards', desc: 'Multicolour branded lanyards for institutions.', Icon: Tags },
  { name: 'Bags', desc: 'School bags, office bags and branded carry solutions.', Icon: ShoppingBag },
  { name: 'Notebooks', desc: 'Custom notebooks, diaries and academic stationery.', Icon: BookOpen },
  { name: 'Mugs', desc: 'Printed mugs and daily-use desk merchandise.', Icon: Coffee },
  { name: 'T-Shirts', desc: 'Event, staff and campaign T-shirt printing.', Icon: Shirt },
  { name: 'Caps & Badges', desc: 'Caps, name badges and small identity accessories.', Icon: BadgeCheck },
  { name: 'Pens & Diaries', desc: 'Corporate writing kits and annual planning sets.', Icon: PenLine },
  { name: 'Gift Boxes', desc: 'Curated gifting kits for teams and events.', Icon: Gift },
  { name: 'Print ID Craft', desc: 'Multi-school ID card management and print portal.', Icon: ShieldCheck },
];

const USE_CASES = [
  {
    label: 'For Schools',
    title: 'Simplify annual procurement.',
    desc: 'Plan uniforms, identity products and academic essentials with a single dependable supplier.',
    Icon: GraduationCap,
    points: ['Bulk-ready school essentials', 'Admission and reopening season support', 'Custom branding and sizing'],
  },
  {
    label: 'For Companies',
    title: 'Build consistent branded merchandise.',
    desc: 'Equip HR, admin and event teams with polished products that represent your brand well.',
    Icon: Building2,
    points: ['Corporate gifting kits', 'Branded office wear', 'Event and onboarding merchandise'],
  },
  {
    label: 'For Teams',
    title: 'Issue identity products quickly.',
    desc: 'Create clean ID cards, lanyards and badges with a dependable process and fast turnaround.',
    Icon: Users,
    points: ['ID cards and lanyards', 'Badges and accessories', 'Select products dispatched in 24h'],
  },
];

const TRUST_POINTS = [
  {
    title: 'Customization',
    desc: 'Material, colour, logo, sizing and packaging aligned to your institution or brand.',
    Icon: Sparkles,
  },
  {
    title: 'Premium quality',
    desc: 'Comfortable fabrics, durable accessories and clean print finishing across product lines.',
    Icon: ShieldCheck,
  },
  {
    title: 'Bulk delivery',
    desc: 'Procurement-friendly planning for large school, corporate and team requirements.',
    Icon: Truck,
  },
  {
    title: 'Dedicated support',
    desc: 'Responsive support for replacements, new admissions, urgent batches and reorder needs.',
    Icon: HeartHandshake,
  },
];

const HERO_PRODUCTS = [
  { title: 'ID Cards', Icon: IdCard, className: 'left-4 top-8 rotate-[-6deg]' },
  { title: 'Lanyards', Icon: Tags, className: 'right-4 top-16 rotate-[5deg]' },
  { title: 'Uniforms', Icon: Shirt, className: 'left-8 bottom-20 rotate-[4deg]' },
  { title: 'Mugs', Icon: Coffee, className: 'right-8 bottom-10 rotate-[-5deg]' },
];

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

function useRevealOnScroll<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node || visible) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '-90px 0px -40px', threshold: 0.14 }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [visible]);

  return { ref, visible };
}

function Reveal({ children, className, delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const { ref, visible } = useRevealOnScroll<HTMLDivElement>();

  return (
    <div
      ref={ref}
      className={cn(
        'transition-all duration-500 ease-out',
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6',
        className
      )}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}

function SectionKicker({ children, center = false, light = false }: { children: React.ReactNode; center?: boolean; light?: boolean }) {
  return (
    <div className={cn('flex', center ? 'justify-center' : 'justify-start')}>
      <span
        className={cn(
          'inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em]',
          light ? 'bg-white/10 text-[#FFD76A] ring-1 ring-white/15' : 'bg-[#F7C948]/15 text-[#B7791F] ring-1 ring-[#F7C948]/30'
        )}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-current" />
        {children}
      </span>
    </div>
  );
}

function PrimaryButton({ href, children, className, external = false, download = false }: { href: string; children: React.ReactNode; className?: string; external?: boolean; download?: boolean }) {
  const commonClass = cn(
    'relative group inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-b from-[#FFD76A] to-[#F7C948] px-5 py-3 text-sm font-bold text-[#0B1F3A] shadow-[0_8px_20px_-6px_rgba(247,201,72,0.5),inset_0_1px_1px_rgba(255,255,255,0.4)] ring-1 ring-[#F7C948] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_12px_24px_-8px_rgba(247,201,72,0.6),inset_0_1px_1px_rgba(255,255,255,0.6)] hover:ring-[#FFD76A] active:translate-y-0 overflow-hidden',
    className
  );

  if (href.startsWith('#')) {
    return (
      <a href={href} download={download} className={commonClass} aria-label={typeof children === 'string' ? children : undefined}>
        {children}
      </a>
    );
  }

  return (
    <a href={href} download={download} className={commonClass} target={external ? '_blank' : undefined} rel={external ? 'noopener noreferrer' : undefined}>
      {children}
    </a>
  );
}

function SecondaryButton({ href, children, download = false }: { href: string; children: React.ReactNode; download?: boolean }) {
  return (
    <a
      href={href}
      download={download}
      className="group relative inline-flex items-center justify-center gap-2 rounded-full border border-[#0B1F3A]/10/80 bg-white/60 px-5 py-3 text-sm font-bold text-[#0B1F3A] shadow-sm backdrop-blur-md transition-all duration-300 hover:-translate-y-0.5 hover:border-[#0B1F3A]/20 hover:bg-white/90 hover:shadow-[0_8px_20px_-6px_rgba(11,31,58,0.12)] active:translate-y-0 overflow-hidden"
    >
      {children}
    </a>
  );
}

function Header() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const goToSection = (href: string) => {
    setMobileOpen(false);
    const section = document.querySelector(href);
    section?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <header
      className={cn(
        'sticky top-0 z-50 border-b transition-all duration-300',
        scrolled ? 'border-[#0B1F3A]/10/80 bg-white/95 shadow-lg shadow-slate-900/5 backdrop-blur-xl' : 'border-transparent bg-white/75 backdrop-blur-lg'
      )}
    >
      <div className={cn('mx-auto flex max-w-7xl items-center justify-between gap-5 px-5 transition-all duration-300 md:px-8', scrolled ? 'py-2' : 'py-3')}>
        <Link href="/" className="flex min-w-0 items-center gap-3" aria-label="WiseMelon Ventures home">
          <div className={cn('relative shrink-0 overflow-hidden rounded-full ring-1 ring-[#0B1F3A]/10 transition-all duration-300', scrolled ? 'h-10 w-10' : 'h-11 w-11')}>
            <Image src="/wisemelon-logo-original.png" alt="WiseMelon Ventures Pvt. Ltd." fill sizes="44px" className="object-cover" priority />
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold tracking-[-0.03em] text-[#0B1F3A] md:text-[15px]">WiseMelon Ventures</div>
            <div className="truncate text-[9px] font-bold uppercase tracking-[0.18em] text-[#0B1F3A]">Pvt. Ltd. · Pune</div>
          </div>
        </Link>

        <nav className="hidden items-center gap-8 lg:flex" aria-label="Main navigation">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm font-semibold text-[#0B1F3A]/70 transition-colors hover:text-[#0B1F3A]"
            >
              {link.label}
            </Link>
          ))}
          <Link href="/login" className="text-sm font-semibold text-[#0B1F3A]/70 transition-colors hover:text-[#0B1F3A]">
            Login
          </Link>
        </nav>

        <div className="hidden items-center gap-3 lg:flex">
          <button
            type="button"
            onClick={() => goToSection('#contact')}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-[#0B1F3A] px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-[#0B1F3A]/20 transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#111A46]"
          >
            Contact sales <ArrowRight size={15} />
          </button>
        </div>

        <button
          type="button"
          className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-[#0B1F3A]/10 bg-white text-[#0B1F3A] shadow-sm lg:hidden"
          onClick={() => setMobileOpen((open) => !open)}
          aria-label="Toggle navigation menu"
          aria-expanded={mobileOpen}
        >
          {mobileOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {mobileOpen && (
        <nav
          className="animate-slide-down overflow-hidden border-t border-[#0B1F3A]/10 bg-white lg:hidden"
          aria-label="Mobile navigation"
        >
          <div className="mx-auto grid max-w-7xl gap-1 px-5 py-4">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className="rounded-2xl px-4 py-3 text-left text-sm font-bold text-[#0B1F3A]/80 transition-colors hover:bg-[#0B1F3A]/[0.02]"
              >
                {link.label}
              </Link>
            ))}
            <Link href="/login" onClick={() => setMobileOpen(false)} className="rounded-2xl px-4 py-3 text-sm font-bold text-[#0B1F3A]/80 transition-colors hover:bg-[#0B1F3A]/[0.02]">
              Login
            </Link>
            <button
              type="button"
              onClick={() => goToSection('#contact')}
              className="mt-2 rounded-2xl bg-[#0B1F3A] px-4 py-3 text-sm font-bold text-white"
            >
              Contact sales
            </button>
          </div>
        </nav>
      )}
    </header>
  );
}

function Hero() {
  return (
    <section className="bg-white py-16 text-center">
      <div className="mx-auto max-w-6xl px-5">
        <h1 className="font-serif  tracking-tight text-[#0B1F3A] mx-auto max-w-5xl leading-[1.1]">
          School essentials & corporate gifting
        </h1>
        <div className="mt-8 flex flex-col md:flex-row items-center justify-center gap-4 text-xl font-medium text-[#0B1F3A]/90">
          <span className="font-bold">WiseMelon Ventures</span>
          <span className="hidden md:inline text-[#0B1F3A]/30">/</span>
          <span>Institutions Portal</span>
        </div>
        
        <div className="mt-16 relative">
          <div className="flex flex-col lg:flex-row items-center justify-between gap-8">
            <div className="text-left w-full lg:w-64 z-10 hidden lg:block">
               <h3 className="font-serif  text-[#0B1F3A]">44,222+</h3>
               <p className="mt-3 text-sm text-[#0B1F3A]/60 leading-relaxed font-sans">
                 Our company offers an extensive selection of institutional products available through our reliable supply chain.
               </p>
            </div>
            
            <div className="relative w-full max-w-2xl mx-auto z-0 animate-slide-up-fade">
              <Image src="/hero-collage.png" alt="Collage" width={1000} height={750} className="w-full h-auto object-cover hover:scale-[1.02] transition-transform duration-700" priority />
            </div>
            
            <div className="text-left w-full lg:w-64 z-10 hidden lg:block">
               <h3 className="font-serif  text-[#0B1F3A]">88,555+</h3>
               <p className="mt-3 text-sm text-[#0B1F3A]/60 leading-relaxed font-sans">
                 With an impressive collection of products, our portal stands as a comprehensive hub for procurement.
               </p>
            </div>
          </div>
        </div>
        
        <div className="mt-20 grid grid-cols-2 md:grid-cols-4 border-t border-l border-[#0B1F3A]/10">
           <a href="#about" className="p-6 md:p-8 border-b border-r border-[#0B1F3A]/10 text-sm font-bold text-[#0B1F3A]/90 hover:bg-[#0B1F3A]/[0.02] transition-colors flex items-center justify-center text-center">Discover WiseMelon</a>
           <a href="/wisemelon-catalogue.pdf" download className="p-6 md:p-8 border-b border-r border-[#0B1F3A]/10 text-sm font-bold text-[#0B1F3A]/90 hover:bg-[#0B1F3A]/[0.02] transition-colors flex items-center justify-center text-center">Download Catalogue</a>
           <a href="#products" className="p-6 md:p-8 border-b border-r border-[#0B1F3A]/10 text-sm font-bold text-[#0B1F3A]/90 hover:bg-[#0B1F3A]/[0.02] transition-colors flex items-center justify-center text-center">Product Range</a>
           <a href="/login" className="p-6 md:p-8 border-b border-r border-[#0B1F3A]/10 text-sm font-bold text-[#0B1F3A]/90 hover:bg-[#0B1F3A]/[0.02] transition-colors flex items-center justify-center text-center">Login to Portal</a>
        </div>
      </div>
    </section>
  );
}

function About() {
  return (
    <section id="about" className="bg-white py-20 md:py-28 scroll-mt-24">
      <div className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-12 px-5 md:px-8 lg:grid-cols-12">
        <Reveal className="lg:col-span-6">
          <SectionKicker>About WiseMelon</SectionKicker>
          <h2 className="mt-5 max-w-2xl font-serif  leading-tight tracking-tight text-[#0B1F3A] md:text-5xl">
            Procurement-friendly supply with a cleaner branding process.
          </h2>
          <div className="mt-6 space-y-4 text-base leading-8 text-[#0B1F3A]/70">
            <p>
              WiseMelon Ventures has supported public and private sector clients since 2012, originally as 3rd Eye Technovision and reorganised in January 2025 as WiseMelon Ventures Pvt. Ltd.
            </p>
            <p>
              The team helps institutions buy with confidence through reliable sourcing, clean customization, coordinated bulk delivery and fast turnaround for selected products.
            </p>
          </div>
        </Reveal>

        <Reveal className="lg:col-span-6" delay={80}>
          <div className="relative overflow-hidden rounded-[2rem] border border-[#0B1F3A]/10 bg-[#0B1F3A]/[0.02] p-6 shadow-xl shadow-slate-900/5 md:p-8">
            <div className="absolute right-0 top-0 h-40 w-40 rounded-full bg-[#0B1F3A]/10 blur-3xl" />
            <div className="absolute bottom-0 left-0 h-36 w-36 rounded-full bg-[#F7C948]/20 blur-3xl" />
            <div className="relative grid gap-4">
              {[
                { label: 'Discover', value: 'Understand sizes, quantity, branding and timeline.', Icon: MessageCircle },
                { label: 'Prepare', value: 'Finalize product mix, artwork, materials and batch plan.', Icon: PackageCheck },
                { label: 'Deliver', value: 'Coordinate dispatch, reorders and support after supply.', Icon: Truck },
              ].map(({ label, value, Icon }, index) => (
                <div key={label} className="flex gap-4 rounded-3xl border border-white bg-white/85 p-5 shadow-sm">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#0B1F3A] text-white">
                    <Icon size={22} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold uppercase tracking-[0.16em] text-[#B7791F]">0{index + 1}</span>
                      <h3 className="font-bold text-[#0B1F3A]">{label}</h3>
                    </div>
                    <p className="mt-1 text-sm leading-6 text-[#0B1F3A]/70">{value}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function OfferCard({ title, subtitle, items, Icon, href, dark = false }: { title: string; subtitle: string; items: string[]; Icon: LucideIcon; href: string; dark?: boolean }) {
  return (
    <div
      id={href.replace('#', '')}
      className={cn(
        'group relative overflow-hidden rounded-[2.5rem] border p-8 md:p-10 transition-all duration-500 hover:-translate-y-1 hover:shadow-2xl backdrop-blur-sm',
        dark ? 'border-[#F7C948]/20 bg-[#0B1F3A]/95 text-white hover:border-[#F7C948]/40 hover:shadow-[#0B1F3A]/30' : 'border-[#0B1F3A]/10/80 bg-white/90 text-[#0B1F3A] hover:border-[#F7C948]/40 hover:shadow-[0_20px_40px_-12px_rgba(11,31,58,0.1)]'
      )}
    >
      <div className={cn('absolute right-[-6rem] top-[-6rem] h-56 w-56 rounded-full blur-3xl opacity-50 transition-opacity duration-500 group-hover:opacity-80', dark ? 'bg-[#F7C948]/20' : 'bg-[#F7C948]/15')} />
      <div className="relative z-10">
        <div className={cn('flex h-14 w-14 items-center justify-center rounded-2xl', dark ? 'bg-[#F7C948] text-[#0B1F3A]' : 'bg-[#0B1F3A]/6 text-[#0B1F3A]')}>
          <Icon size={26} />
        </div>
        <div className={cn('mt-6 text-xs font-bold uppercase tracking-[0.18em]', dark ? 'text-[#FFD76A]' : 'text-[#B7791F]')}>{subtitle}</div>
        <h3 className="mt-2 font-serif  tracking-tight">{title}</h3>
        <ul className="mt-6 grid gap-3">
          {items.map((item) => (
            <li key={item} className={cn('flex items-start gap-3 text-sm leading-6', dark ? 'text-white/75' : 'text-[#0B1F3A]/70')}>
              <CheckCircle2 size={17} className={cn('mt-1 shrink-0', dark ? 'text-[#FFD76A]' : 'text-[#0B1F3A]')} />
              {item}
            </li>
          ))}
        </ul>
        <a href={href} className={cn('mt-7 inline-flex items-center gap-2 text-sm font-bold', dark ? 'text-[#FFD76A]' : 'text-[#0B1F3A]')}>
          {dark ? 'View corporate solutions' : 'View school solutions'} <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" />
        </a>
      </div>
    </div>
  );
}

function Services() {
  return (
    <section id="services" className="scroll-mt-24 bg-[#0B1F3A]/[0.02] py-20 md:py-28">
      <div className="mx-auto max-w-7xl px-5 md:px-8">
        <Reveal className="mx-auto max-w-3xl text-center">
          <SectionKicker center>What we offer</SectionKicker>
          <h2 className="mt-5 font-serif  leading-tight tracking-tight text-[#0B1F3A] md:text-5xl">Two core verticals, designed for institutional buyers.</h2>
          <p className="mt-5 text-base leading-8 text-[#0B1F3A]/70">School essentials and corporate merchandise stay organized under one reliable procurement partner.</p>
        </Reveal>
        <div className="mt-12 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Reveal>
            <OfferCard title="Institutional Supply – School Essentials" subtitle="For schools" items={SCHOOL_ITEMS} Icon={GraduationCap} href="#school-solutions" />
          </Reveal>
          <Reveal delay={80}>
            <OfferCard title="Brand Merchandise – Corporate Gifting" subtitle="For companies" items={CORPORATE_ITEMS} Icon={Briefcase} href="#corporate-solutions" dark />
          </Reveal>
        </div>
      </div>
    </section>
  );
}

function ProductRange() {
  return (
    <section id="products" className="scroll-mt-24 bg-white py-20 md:py-28">
      <div className="mx-auto max-w-7xl px-5 md:px-8">
        <Reveal className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div className="max-w-3xl">
            <SectionKicker>Product range</SectionKicker>
            <h2 className="mt-5 font-serif  leading-tight tracking-tight text-[#0B1F3A] md:text-5xl">A focused catalogue for schools, companies and teams.</h2>
          </div>
          <SecondaryButton href="/wisemelon-catalogue.pdf" download>
            <Download size={17} /> Download full product list
          </SecondaryButton>
        </Reveal>

        <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {PRODUCT_CATEGORIES.map(({ name, desc, Icon }, index) => (
            <Reveal key={name} delay={(index % 4) * 55}>
              <div className="group relative overflow-hidden h-full rounded-[2rem] border border-[#0B1F3A]/10/80 bg-white/70 p-7 backdrop-blur-sm shadow-sm transition-all duration-500 hover:-translate-y-1.5 hover:border-[#F7C948]/50 hover:bg-white/95 hover:shadow-[0_20px_40px_-12px_rgba(11,31,58,0.08)]">
                <div className="absolute inset-0 bg-gradient-to-br from-[#F7C948]/5 to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
                <div className="relative z-10">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#0B1F3A]/5 text-[#0B1F3A] shadow-sm transition-colors duration-500 group-hover:bg-[#F7C948] group-hover:text-[#0B1F3A]">
                      <Icon size={24} />
                    </div>
                    <span className="rounded-full border border-[#0B1F3A]/10 bg-white px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-[#0B1F3A]/50 shadow-sm transition-colors group-hover:border-[#F7C948]/30 group-hover:text-[#B7791F]">Product</span>
                  </div>
                  <h3 className="mt-8 font-serif  tracking-tight text-[#0B1F3A]">{name}</h3>
                  <p className="mt-3 text-sm leading-6 text-[#0B1F3A]/70">{desc}</p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function UseCases() {
  return (
    <section className="bg-[#0B1F3A]/[0.02] py-20 md:py-28">
      <div className="mx-auto max-w-7xl px-5 md:px-8">
        <Reveal className="mx-auto max-w-3xl text-center">
          <SectionKicker center>Use cases</SectionKicker>
          <h2 className="mt-5 font-serif  leading-tight tracking-tight text-[#0B1F3A] md:text-5xl">Built around how institutions actually buy.</h2>
        </Reveal>
        <div className="mt-12 grid grid-cols-1 gap-5 lg:grid-cols-3">
          {USE_CASES.map(({ label, title, desc, Icon, points }, index) => (
            <Reveal key={label} delay={index * 80}>
              <article id={index === 0 ? 'school-solutions' : index === 1 ? 'corporate-solutions' : undefined} className="group relative h-full flex-col overflow-hidden rounded-[2.5rem] border border-[#0B1F3A]/10/80 bg-white p-8 shadow-sm transition-all duration-500 hover:-translate-y-1 hover:border-[#0B1F3A]/20 hover:shadow-[0_20px_40px_-12px_rgba(11,31,58,0.1)]">
                <div className="absolute right-0 top-0 h-40 w-40 -translate-y-1/2 translate-x-1/2 rounded-full bg-[#F7C948]/10 blur-3xl transition-opacity duration-500 group-hover:bg-[#F7C948]/20" />
                <div className="relative z-10 flex h-full flex-col">
                  <div className="flex items-center gap-4">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#0B1F3A] text-white shadow-md transition-transform duration-500 group-hover:scale-110">
                      <Icon size={24} />
                    </div>
                    <div className="text-xs font-bold uppercase tracking-[0.18em] text-[#B7791F]">{label}</div>
                  </div>
                  <h3 className="mt-8 font-serif  tracking-tight text-[#0B1F3A]">{title}</h3>
                  <p className="mt-4 text-base leading-7 text-[#0B1F3A]/70">{desc}</p>
                  <ul className="mt-6 grid gap-3">
                    {points.map((point) => (
                      <li key={point} className="flex items-start gap-3 text-sm font-semibold text-[#0B1F3A]/80">
                        <div className="mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#0B1F3A]/10 text-[#0B1F3A]">
                          <CheckCircle2 size={12} strokeWidth={3} />
                        </div>
                        {point}
                      </li>
                    ))}
                  </ul>
                  <div className="mt-auto pt-8">
                    <a href="#contact" className="inline-flex items-center gap-2 rounded-full bg-[#0B1F3A]/[0.02] px-4 py-2 text-sm font-bold text-[#0B1F3A] transition-colors hover:bg-[#0B1F3A]/[0.04]">
                      Talk to us about this <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" />
                    </a>
                  </div>
                </div>
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function WhyChooseUs() {
  return (
    <section className="bg-white py-20 md:py-28">
      <div className="mx-auto max-w-7xl px-5 md:px-8">
        <Reveal className="mx-auto max-w-3xl text-center">
          <SectionKicker center>Why choose us</SectionKicker>
          <h2 className="mt-5 font-serif  leading-tight tracking-tight text-[#0B1F3A] md:text-5xl">Reliable supply, clean output and support after delivery.</h2>
        </Reveal>
        <div className="mt-12 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {TRUST_POINTS.map(({ title, desc, Icon }, index) => (
            <Reveal key={title} delay={index * 70}>
              <div className="group relative overflow-hidden h-full rounded-3xl border border-[#0B1F3A]/10/60 bg-[#0B1F3A]/[0.02]/50 p-8 transition-all duration-500 hover:-translate-y-1 hover:border-[#F7C948]/40 hover:bg-white hover:shadow-[0_16px_32px_-12px_rgba(11,31,58,0.06)]">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-[#0B1F3A] shadow-sm ring-1 ring-[#0B1F3A]/10/50 transition-colors duration-500 group-hover:bg-[#F7C948] group-hover:text-[#0B1F3A] group-hover:ring-[#F7C948]">
                  <Icon size={24} />
                </div>
                <h3 className="mt-8 font-serif  tracking-tight text-[#0B1F3A]">{title}</h3>
                <p className="mt-3 text-sm leading-6 text-[#0B1F3A]/70">{desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function CatalogueCTA() {
  return (
    <section id="catalogue" className="bg-[#0B1F3A] py-24 text-white">
      <div className="mx-auto max-w-6xl px-5 flex flex-col md:flex-row gap-16">
        <div className="flex-1">
          <Reveal>
            <h2 className="font-serif  leading-[1.1] tracking-tight">
              Want To Partner With WiseMelon?
            </h2>
            <div className="mt-12 flex gap-8 items-start">
              <span className="font-serif text-[8rem] leading-[0.7] text-[#F7C948]">W</span>
              <p className="text-sm leading-8 text-white/80 max-w-sm mt-3">
                We cordially invite you to seize the opportunity to partner with WiseMelon Ventures. Our portal is now open, providing you with a chance to streamline your procurement. Whether you are a school administrator or a corporate buyer, we warmly welcome you to join our platform.
              </p>
            </div>
          </Reveal>
        </div>
        <div className="flex-1 flex flex-col justify-center">
          <Reveal delay={80}>
             <p className="text-2xl md:text-3xl font-light leading-relaxed mb-10 max-w-md">
               Don't miss this extraordinary chance to be part of WiseMelon! Take the first step towards securing your supply chain by contacting us now.
             </p>
             <div>
               <a href="https://wa.me/919881877607" target="_blank" rel="noopener noreferrer" className="inline-block bg-[#F7C948] text-[#0B1F3A] px-8 py-4 font-bold text-sm tracking-wide hover:bg-[#FFD76A] transition-colors">
                 Become a partner
               </a>
             </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  const currentYear = useMemo(() => new Date().getFullYear(), []);

  return (
    <footer id="contact" className="scroll-mt-24 bg-[#050816] text-white">
      <div className="mx-auto max-w-7xl px-5 py-16 md:px-8 md:py-20">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <div className="flex items-center gap-4">
              <div className="relative h-14 w-14 overflow-hidden rounded-full ring-1 ring-white/10">
                <Image src="/wisemelon-logo-original.png" alt="WiseMelon Ventures Pvt. Ltd." fill sizes="56px" className="object-cover" />
              </div>
              <div>
                <div className="font-serif  tracking-tight">WiseMelon Ventures Pvt. Ltd.</div>
                <div className="mt-1 text-xs font-bold uppercase tracking-[0.18em] text-[#FFD76A]">Pune, India</div>
              </div>
            </div>
            <p className="mt-5 max-w-md text-sm leading-7 text-white/60">
              Print ID Craft, school essentials and corporate gifting solutions for institutions that need dependable quality, clear branding and smooth procurement.
            </p>
          </div>

          <div className="lg:col-span-3">
            <h3 className="text-xs font-bold uppercase tracking-[0.18em] text-[#FFD76A]">Quick links</h3>
            <div className="mt-5 grid gap-3">
              {NAV_LINKS.map((link) => (
                <a key={link.href} href={link.href} className="text-sm font-semibold text-white/60 transition-colors hover:text-white">
                  {link.label}
                </a>
              ))}
              <Link href="/login" className="text-sm font-semibold text-white/60 transition-colors hover:text-white">
                Login
              </Link>
            </div>
          </div>

          <div className="lg:col-span-4">
            <h3 className="text-xs font-bold uppercase tracking-[0.18em] text-[#FFD76A]">Contact details</h3>
            <div className="mt-5 grid gap-4 text-sm text-white/70">
              <div className="flex items-start gap-3">
                <Phone size={17} className="mt-0.5 shrink-0 text-[#FFD76A]" />
                <div className="space-x-1">
                  <a href="tel:+919881877607" className="hover:text-white">+91 98818 77607</a>
                  <span>·</span>
                  <a href="tel:+918888740323" className="hover:text-white">+91 88887 40323</a>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Mail size={17} className="mt-0.5 shrink-0 text-[#FFD76A]" />
                <a href="mailto:wisemelonventures@gmail.com" className="hover:text-white">wisemelonventures@gmail.com</a>
              </div>
              <div className="flex items-start gap-3">
                <MapPin size={17} className="mt-0.5 shrink-0 text-[#FFD76A]" />
                <span className="leading-7">Lane No-16/A, Madina Manzil, 1st Floor, Sayyed Nagar, Hadapsar, Pune-411028</span>
              </div>
            </div>
            <div className="mt-6 flex gap-3">
              <a href="https://instagram.com/wisemelon_1512_" target="_blank" rel="noopener noreferrer" aria-label="WiseMelon Instagram" className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-[#FFD76A] transition-colors hover:bg-white/15">
                <Instagram size={17} />
              </a>
              <a href="https://facebook.com/" target="_blank" rel="noopener noreferrer" aria-label="WiseMelon Facebook" className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-[#FFD76A] transition-colors hover:bg-white/15">
                <Facebook size={17} />
              </a>
            </div>
          </div>
        </div>

        <div className="mt-14 flex flex-col justify-between gap-4 border-t border-white/10 pt-7 text-xs text-white/40 md:flex-row">
          <div suppressHydrationWarning>© {currentYear} WiseMelon Ventures Pvt. Ltd. All rights reserved.</div>
          <a href="https://www.wisemelonventures.com" target="_blank" rel="noopener noreferrer" className="hover:text-white">www.wisemelonventures.com</a>
        </div>
      </div>
    </footer>
  );
}

export default function ProductsPage() {
  return (
    <div
      className="landing-page min-h-screen scroll-smooth bg-white text-[#0B1F3A] antialiased"
      style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Segoe UI", sans-serif' }}
    >
      <Header />
      <main>
        <Services />
        <ProductRange />
        <UseCases />
        <CatalogueCTA />
      </main>
      <Footer />
    </div>
  );
}
