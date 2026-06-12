'use client';

import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, CheckCircle2, GraduationCap, Briefcase, PackageCheck, Truck, ShieldCheck, Download, ChevronRight, Phone, Mail, MapPin, Star, Settings, FileText, UserSquare2, ArrowUpRight, Menu, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState, useEffect, useMemo } from 'react';

// Brand Palette (Derived from Logo + Prompt)
// Primary: Deep Navy/Teal (#0B1F3A)
// Secondary: Gold (#F7C948)
// Surface: Soft Beige/Off-White (#FDFCF9, #F5F5F0)
// Text: Charcoal (#1F2937, #111827)

const NAV_LINKS = [
  { label: 'Schools', href: '#schools' },
  { label: 'Corporate', href: '#corporate' },
  { label: 'Products', href: '#products' },
  { label: 'How it Works', href: '#process' },
];

function Header() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <header
      className={cn(
        'fixed inset-x-0 top-0 z-50 transition-all duration-300',
        scrolled ? 'bg-white/95 shadow-sm backdrop-blur-md py-3' : 'bg-transparent py-5'
      )}
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between px-5 md:px-8">
        <Link href="/" className="group flex items-center gap-3">
          <div className="relative h-11 w-11 overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-[#0B1F3A]/10 transition-transform group-hover:scale-105">
            <Image src="/wisemelon-logo.png" alt="WiseMelon Ventures Logo" fill sizes="44px" className="object-cover p-1" />
          </div>
          <div className="flex flex-col">
            <span className="font-serif text-lg font-bold leading-tight text-[#0B1F3A]">WiseMelon</span>
            <span className="text-[10px] font-semibold uppercase tracking-widest text-[#0B1F3A]/50">WiseMelon Pvt Ltd</span>
          </div>
        </Link>

        <nav className="hidden items-center gap-8 lg:flex">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-[#1F2937] transition-colors hover:text-[#0B1F3A]"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-4 lg:flex">
          <Link href="/login" className="text-sm font-semibold text-[#1F2937] hover:text-[#0B1F3A] transition-colors">
            Login
          </Link>
          <a
            href="https://wa.me/919881877607"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg bg-[#0B1F3A] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-[#0B1F3A]/90 hover:shadow-md"
          >
            Contact Sales
          </a>
        </div>

        <button
          className="p-2 lg:hidden text-[#0B1F3A]"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="Toggle menu"
        >
          {mobileOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Mobile Menu */}
      {mobileOpen && (
        <div className="absolute inset-x-0 top-full flex flex-col bg-white px-5 py-4 shadow-xl lg:hidden">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              onClick={() => setMobileOpen(false)}
              className="py-3 text-sm font-medium text-[#1F2937] border-b border-gray-100"
            >
              {link.label}
            </a>
          ))}
          <div className="mt-4 flex flex-col gap-3">
            <Link href="/login" onClick={() => setMobileOpen(false)} className="rounded-lg bg-gray-50 py-3 text-center text-sm font-semibold text-[#1F2937]">
              Login
            </Link>
            <a
              href="https://wa.me/919881877607"
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setMobileOpen(false)}
              className="rounded-lg bg-[#0B1F3A] py-3 text-center text-sm font-semibold text-white"
            >
              Contact Sales
            </a>
          </div>
        </div>
      )}
    </header>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden bg-[#FDFCF9] pt-32 pb-20 md:pt-40 md:pb-28">
      {/* Subtle Background Elements */}
      <div className="absolute -left-40 top-0 h-96 w-96 rounded-full bg-[#F7C948]/10 blur-3xl" />
      <div className="absolute right-0 top-20 h-80 w-80 rounded-full bg-[#0B1F3A]/5 blur-3xl" />
      
      <div className="relative mx-auto max-w-7xl px-5 md:px-8">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-12 lg:gap-8 items-center">
          
          <div className="lg:col-span-6 lg:pr-8">
            <div className="inline-flex items-center gap-2 rounded-full border border-[#0B1F3A]/10 bg-white px-3 py-1 shadow-sm mb-6">
              <span className="flex h-2 w-2 rounded-full bg-[#0B1F3A] animate-pulse" />
              <span className="text-xs font-semibold uppercase tracking-wider text-[#0B1F3A]">B2B Institutional Procurement</span>
            </div>
            
            <h1 className="font-serif text-5xl md:text-6xl font-medium tracking-tight text-[#111827] leading-[1.1]">
              Institutional Procurement, <span className="text-[#0B1F3A]">Simplified.</span>
            </h1>
            
            <p className="mt-6 text-lg text-gray-600 leading-relaxed max-w-lg">
              Sourcing uniforms, ID cards, and corporate gifting shouldn't be a logistical nightmare. WiseMelon provides premium quality, unified billing, and predictable delivery for schools and enterprises across India.
            </p>
            
            <div className="mt-10 flex flex-col sm:flex-row gap-4">
              <a
                href="https://wa.me/919881877607"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-[#0B1F3A] px-8 text-sm font-semibold text-white shadow-md transition-all hover:-translate-y-0.5 hover:shadow-lg"
              >
                Contact Sales
              </a>
              <a
                href="/wisemelon-catalogue.pdf"
                download
                className="inline-flex h-12 items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-8 text-sm font-semibold text-[#1F2937] shadow-sm transition-all hover:border-gray-300 hover:bg-gray-50"
              >
                <Download size={18} />
                Download Catalogue
              </a>
            </div>
            
            <div className="mt-12 flex items-center gap-6 text-sm font-medium text-gray-500">
              <div className="flex -space-x-2">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-8 w-8 rounded-full border-2 border-white bg-gray-200" />
                ))}
              </div>
              <p>Trusted by 100+ institutions</p>
            </div>
          </div>

          <div className="lg:col-span-6 relative">
            <div className="relative aspect-square w-full max-w-[600px] mx-auto overflow-hidden rounded-[2rem] bg-gray-100 shadow-2xl ring-1 ring-gray-900/5">
              <Image 
                src="/hero-collage.png" 
                alt="Institutional Products Collage" 
                fill 
                className="object-cover"
                priority
              />
              <div className="absolute inset-0 ring-1 ring-inset ring-[#0B1F3A]/10 rounded-[2rem]"></div>
            </div>
            {/* Floating Element */}
            <div className="absolute -bottom-6 -left-6 rounded-xl border border-gray-100 bg-white p-4 shadow-xl hidden md:block">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#0B1F3A]/5 text-[#0B1F3A]">
                  <PackageCheck size={20} />
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Delivery Rate</p>
                  <p className="text-lg font-bold text-[#111827]">99.8% On-Time</p>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}

function TrustStrip() {
  const points = [
    { label: 'Pan-India Delivery', icon: Truck },
    { label: 'Custom Branding', icon: ShieldCheck },
    { label: 'Bulk Optimization', icon: PackageCheck },
    { label: 'Account Management', icon: UserSquare2 },
  ];

  return (
    <section className="border-y border-gray-200 bg-white py-8">
      <div className="mx-auto max-w-7xl px-5 md:px-8">
        <div className="flex flex-wrap items-center justify-center gap-8 md:justify-between lg:gap-12">
          {points.map((point) => (
            <div key={point.label} className="flex items-center gap-3">
              <point.icon size={20} className="text-[#0B1F3A]/70" />
              <span className="text-sm font-semibold text-gray-700">{point.label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Verticals() {
  return (
    <section className="bg-[#FDFCF9] py-24">
      <div className="mx-auto max-w-7xl px-5 md:px-8">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <h2 className="font-serif text-3xl md:text-4xl font-medium tracking-tight text-[#111827]">Dedicated solutions for your sector</h2>
          <p className="mt-4 text-gray-600">Tailored product catalogues and procurement workflows designed specifically for educational institutions and corporate enterprises.</p>
        </div>

        <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
          {/* Schools */}
          <div id="schools" className="group rounded-[2rem] border border-gray-200 bg-white p-8 md:p-12 shadow-sm transition-all hover:shadow-xl hover:border-[#0B1F3A]/20">
            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-[#0B1F3A]/5 text-[#0B1F3A]">
              <GraduationCap size={28} />
            </div>
            <h3 className="mt-6 font-serif text-2xl font-medium text-[#111827]">For Educational Institutions</h3>
            <p className="mt-3 text-gray-600 leading-relaxed">
              Complete kitting solutions for schools and colleges. We handle everything from student IDs to daily-wear uniforms, ensuring consistency across every campus.
            </p>
            <ul className="mt-8 space-y-4">
              {['School Uniforms & Sports Wear', 'Smart ID Cards & Lanyards', 'School Bags & Backpacks', 'Notebooks & Diaries'].map((item) => (
                <li key={item} className="flex items-start gap-3">
                  <CheckCircle2 size={18} className="mt-0.5 text-[#0B1F3A]" />
                  <span className="text-sm font-medium text-gray-700">{item}</span>
                </li>
              ))}
            </ul>
            <a href="#contact" className="mt-10 inline-flex items-center gap-2 text-sm font-bold text-[#0B1F3A] hover:text-[#0B1F3A]/80 transition-colors">
              Discuss school requirements <ArrowRight size={16} />
            </a>
          </div>

          {/* Corporate */}
          <div id="corporate" className="group rounded-[2rem] border border-gray-200 bg-white p-8 md:p-12 shadow-sm transition-all hover:shadow-xl hover:border-[#0B1F3A]/20">
            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-[#F7C948]/20 text-[#B7791F]">
              <Briefcase size={28} />
            </div>
            <h3 className="mt-6 font-serif text-2xl font-medium text-[#111827]">For Corporate Enterprises</h3>
            <p className="mt-3 text-gray-600 leading-relaxed">
              Elevate your employer brand with premium corporate merchandise. Perfect for onboarding kits, event giveaways, and employee recognition programs.
            </p>
            <ul className="mt-8 space-y-4">
              {['Employee Welcome Kits', 'Corporate Gifting & Mementos', 'Staff ID Cards & Badges', 'Branded Office Supplies'].map((item) => (
                <li key={item} className="flex items-start gap-3">
                  <CheckCircle2 size={18} className="mt-0.5 text-[#B7791F]" />
                  <span className="text-sm font-medium text-gray-700">{item}</span>
                </li>
              ))}
            </ul>
            <a href="#contact" className="mt-10 inline-flex items-center gap-2 text-sm font-bold text-[#B7791F] hover:text-[#B7791F]/80 transition-colors">
              Discuss corporate requirements <ArrowRight size={16} />
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

function ProductGrid() {
  const products = [
    { name: 'ID Cards & Accessories', desc: 'RFID, Smart Cards, Lanyards, Badge Holders', icon: ShieldCheck },
    { name: 'Apparel & Uniforms', desc: 'School Uniforms, Polos, Hoodies, Sports Kits', icon: UserSquare2 },
    { name: 'Bags & Backpacks', desc: 'School Bags, Laptop Bags, Drawstrings', icon: Briefcase },
    { name: 'Stationery & Books', desc: 'Custom Notebooks, Diaries, Planners', icon: FileText },
  ];

  return (
    <section id="products" className="bg-white py-24">
      <div className="mx-auto max-w-7xl px-5 md:px-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
          <div>
            <h2 className="font-serif text-3xl md:text-4xl font-medium tracking-tight text-[#111827]">Extensive Product Catalogue</h2>
            <p className="mt-3 text-gray-600 max-w-xl">A curated selection of high-quality products ready for bulk procurement and custom institutional branding.</p>
          </div>
          <a
            href="/wisemelon-catalogue.pdf"
            download
            className="inline-flex items-center gap-2 rounded-lg bg-gray-50 px-5 py-2.5 text-sm font-semibold text-[#1F2937] border border-gray-200 hover:bg-gray-100 transition-colors"
          >
            <Download size={16} />
            Download Full PDF
          </a>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {products.map((product) => (
            <div key={product.name} className="rounded-2xl border border-gray-100 bg-gray-50 p-6 transition-all hover:bg-white hover:shadow-lg hover:border-gray-200">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white text-[#0B1F3A] shadow-sm mb-6">
                <product.icon size={22} />
              </div>
              <h3 className="font-semibold text-gray-900">{product.name}</h3>
              <p className="mt-2 text-sm text-gray-500">{product.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  const steps = [
    { title: 'Requirement Sharing', desc: 'Share your specific needs, quantities, and timelines with our team.' },
    { title: 'Product Selection', desc: 'Review samples and finalize the perfect products from our catalogue.' },
    { title: 'Custom Branding', desc: 'We apply your institutional logo and identity with strict quality control.' },
    { title: 'Reliable Delivery', desc: 'Products are dispatched securely and delivered straight to your campus or office.' },
  ];

  return (
    <section id="process" className="bg-[#0B1F3A] py-24 text-white">
      <div className="mx-auto max-w-7xl px-5 md:px-8">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <h2 className="font-serif text-3xl md:text-4xl font-medium tracking-tight">A seamless procurement process</h2>
          <p className="mt-4 text-white/70">We've refined our workflow to save you time and eliminate the headaches of traditional vendor management.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-12 relative">
          {/* Connecting line for desktop */}
          <div className="hidden lg:block absolute top-6 left-12 right-12 h-px bg-white/10" />
          
          {steps.map((step, index) => (
            <div key={step.title} className="relative">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#F7C948] text-[#0B1F3A] font-bold text-lg mb-6 ring-8 ring-[#0B1F3A] relative z-10 mx-auto lg:mx-0">
                {index + 1}
              </div>
              <div className="text-center lg:text-left">
                <h3 className="text-lg font-semibold">{step.title}</h3>
                <p className="mt-2 text-sm text-white/60 leading-relaxed">{step.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function SocialProof() {
  return (
    <section className="bg-[#FDFCF9] py-24 border-b border-gray-200">
      <div className="mx-auto max-w-7xl px-5 md:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          <div>
            <h2 className="font-serif text-3xl md:text-4xl font-medium tracking-tight text-[#111827]">Trusted by the best</h2>
            <p className="mt-4 text-gray-600">We partner with leading educational institutions and corporations to deliver excellence.</p>
          </div>

          <div className="rounded-[2rem] bg-white p-8 md:p-10 shadow-lg border border-gray-100 relative">
            <div className="absolute top-8 right-8 text-[#F7C948]/30">
              <Star size={60} fill="currentColor" />
            </div>
            <div className="flex gap-1 mb-6 text-[#F7C948]">
              {[1, 2, 3, 4, 5].map((i) => <Star key={i} size={20} fill="currentColor" />)}
            </div>
            <blockquote className="text-lg text-gray-700 leading-relaxed font-medium relative z-10">
              "Working with WiseMelon has completely transformed how we handle our annual uniform and ID card procurement. The quality is consistent, delivery is prompt, and having a single vendor for multiple categories saves us countless hours."
            </blockquote>
            <div className="mt-8 flex items-center gap-4">
              <div className="h-12 w-12 rounded-full bg-gray-200" />
              <div>
                <p className="font-bold text-gray-900">Procurement Director</p>
                <p className="text-sm text-gray-500">Leading International School, Pune</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function CTA() {
  return (
    <section className="bg-white py-24">
      <div className="mx-auto max-w-5xl px-5 md:px-8">
        <div className="rounded-[2.5rem] bg-[#0B1F3A] p-10 md:p-16 text-center relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-[#F7C948]/10 rounded-full blur-3xl" />
          <div className="absolute bottom-0 left-0 w-64 h-64 bg-white/5 rounded-full blur-3xl" />
          
          <h2 className="relative z-10 font-serif text-3xl md:text-5xl font-medium tracking-tight text-white mb-6">
            Ready to streamline your institutional procurement?
          </h2>
          <p className="relative z-10 text-lg text-white/70 mb-10 max-w-2xl mx-auto">
            Get in touch with our team today to discuss your requirements, request samples, or get a custom quotation.
          </p>
          <div className="relative z-10 flex flex-col sm:flex-row justify-center gap-4">
            <a
              href="https://wa.me/919881877607"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-14 items-center justify-center rounded-lg bg-[#F7C948] px-8 text-base font-bold text-[#0B1F3A] shadow-lg transition-transform hover:-translate-y-1"
            >
              Contact Sales Team
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  const currentYear = useMemo(() => new Date().getFullYear(), []);

  return (
    <footer id="contact" className="border-t border-gray-200 bg-white pt-16 pb-8">
      <div className="mx-auto max-w-7xl px-5 md:px-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-12 lg:gap-8 mb-16">
          
          <div className="lg:col-span-4">
            <Link href="/" className="flex items-center gap-3 mb-6">
              <div className="relative h-10 w-10 overflow-hidden rounded-lg bg-white ring-1 ring-gray-200">
                <Image src="/wisemelon-logo.png" alt="Logo" fill className="object-cover p-1" />
              </div>
              <span className="font-serif text-xl font-bold text-[#0B1F3A]">WiseMelon</span>
            </Link>
            <p className="text-gray-500 text-sm leading-relaxed max-w-sm">
              WiseMelon is a division of WiseMelon Ventures Pvt. Ltd., dedicated to providing premium institutional supplies and corporate gifting solutions.
            </p>
          </div>

          <div className="lg:col-span-2 lg:col-start-6">
            <h3 className="font-semibold text-gray-900 mb-4">Quick Links</h3>
            <ul className="space-y-3">
              {NAV_LINKS.map((link) => (
                <li key={link.href}>
                  <a href={link.href} className="text-sm text-gray-500 hover:text-[#0B1F3A] transition-colors">{link.label}</a>
                </li>
              ))}
              <li><Link href="/login" className="text-sm text-gray-500 hover:text-[#0B1F3A] transition-colors">Client Portal Login</Link></li>
            </ul>
          </div>

          <div className="lg:col-span-4 lg:col-start-9">
            <h3 className="font-semibold text-gray-900 mb-4">Contact Information</h3>
            <ul className="space-y-4">
              <li className="flex items-start gap-3">
                <Phone size={18} className="text-[#0B1F3A] mt-0.5" />
                <div className="text-sm text-gray-500">
                  <a href="tel:+919881877607" className="hover:text-[#0B1F3A] block">+91 98818 77607</a>
                  <a href="tel:+918888740323" className="hover:text-[#0B1F3A] block mt-1">+91 88887 40323</a>
                </div>
              </li>
              <li className="flex items-center gap-3">
                <Mail size={18} className="text-[#0B1F3A]" />
                <a href="mailto:wisemelonventures@gmail.com" className="text-sm text-gray-500 hover:text-[#0B1F3A]">wisemelonventures@gmail.com</a>
              </li>
              <li className="flex items-start gap-3">
                <MapPin size={18} className="text-[#0B1F3A] mt-0.5 shrink-0" />
                <span className="text-sm text-gray-500 leading-relaxed">
                  Lane No-16/A, Madina Manzil, 1st Floor, Sayyed Nagar, Hadapsar, Pune-411028
                </span>
              </li>
            </ul>
          </div>
        </div>

        <div className="flex flex-col md:flex-row items-center justify-between pt-8 border-t border-gray-100 text-xs text-gray-400">
          <p suppressHydrationWarning>© {currentYear} WiseMelon Ventures Pvt. Ltd. All rights reserved.</p>
          <div className="flex gap-4 mt-4 md:mt-0">
            <a href="#" className="hover:text-gray-600">Privacy Policy</a>
            <a href="#" className="hover:text-gray-600">Terms of Service</a>
          </div>
        </div>
      </div>
    </footer>
  );
}

export default function LandingPage() {
  return (
    <div className="min-h-screen scroll-smooth bg-white font-sans text-gray-900 selection:bg-[#0B1F3A] selection:text-white">
      <Header />
      <main>
        <Hero />
        <TrustStrip />
        <Verticals />
        <ProductGrid />
        <HowItWorks />
        <SocialProof />
        <CTA />
      </main>
      <Footer />
    </div>
  );
}
