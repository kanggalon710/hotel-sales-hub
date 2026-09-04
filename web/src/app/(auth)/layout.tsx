import Image from 'next/image';
import Link from 'next/link';
import { BedDouble, MessagesSquare, ShieldCheck, Zap } from 'lucide-react';
import { ThemeToggle } from '@/components/ui/theme-toggle';

const PILLARS = [
  { icon: MessagesSquare, title: 'Conversation in context', body: 'Chatwoot keeps the conversation. The CRM keeps the deal, and shows both in one place.' },
  { icon: Zap, title: 'Next action first', body: 'Every lead states what to do next, with the SLA clock running in the open.' },
  { icon: ShieldCheck, title: 'Traceable by default', body: 'Rates, holds, and confirmations carry an actor, a source, and a timestamp.' },
];

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh grid-cols-1 lg:grid-cols-[1.05fr_minmax(420px,0.95fr)]">
      {/*
        Panel merek, disembunyikan pada layar kecil tempat formulir adalah
        seluruh pekerjaannya.

        Fotonya dipilih senada dengan navigasi: senja biru tua dengan cahaya
        hangat sebagai satu-satunya aksen. Panel ini menjadi permukaan gelap,
        jadi seluruh teks di dalamnya memakai tinta terangnya sendiri, bukan
        --ink halaman.
      */}
      <aside className="relative hidden overflow-hidden lg:flex lg:flex-col lg:justify-between lg:p-12">
        <Image
          src="/brand/signin-teak-screen.jpg"
          alt=""
          fill
          priority
          sizes="(min-width: 1024px) 52vw, 0px"
          className="object-cover"
        />
        {/*
          Tabir menegak dari kiri, bukan mendatar dari atas. Teks panel ini
          seluruhnya rata kiri, jadi kontras hanya perlu dijamin di sana;
          menabiri seluruh bidang secara merata akan mematikan tekstur kayunya,
          yang justru satu-satunya alasan foto ini dipakai.
        */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'linear-gradient(90deg, rgb(16 24 40 / 0.94) 0%, rgb(16 24 40 / 0.86) 38%, rgb(16 24 40 / 0.55) 72%, rgb(16 24 40 / 0.32) 100%)',
          }}
        />
        <div className="relative">
          <Link href="/" className="focus-ring inline-flex items-center gap-2.5 rounded-md">
            <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-on-primary shadow-e2">
              <BedDouble aria-hidden className="size-5" />
            </span>
            <span className="t-heading text-white">Hotel Sales Hub</span>
          </Link>
        </div>

        <div className="relative max-w-lg">
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-white/70">
            Sales &amp; Guest Relationship Hub
          </p>
          <h1 className="mt-4 text-[2.6rem] font-semibold leading-[1.08] tracking-[-0.025em] text-white">
            Every inquiry becomes a room night, or an answer why not.
          </h1>
          <p className="mt-4 max-w-md text-sm leading-6 text-white/75">
            One operating surface across conversations, availability, quotations, and the front-office handoff.
          </p>

          <ul className="mt-9 space-y-5">
            {PILLARS.map((p) => (
              <li key={p.title} className="flex gap-3.5">
                <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-white/12 text-white ring-1 ring-inset ring-white/20">
                  <p.icon aria-hidden className="size-4" />
                </span>
                <div>
                  <p className="text-[13px] font-semibold text-white">{p.title}</p>
                  <p className="mt-0.5 max-w-sm text-[13px] leading-5 text-white/70">{p.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative font-mono text-[11px] text-white/55">
          Chatwoot owns conversations · PMS/CRS owns inventory · CRM owns the sale
        </p>
      </aside>

      <main id="main" className="relative flex flex-col justify-center bg-bg px-5 py-10 sm:px-10">
        <div className="absolute right-4 top-4">
          <ThemeToggle />
        </div>
        <div className="mx-auto w-full max-w-[26rem]">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-on-primary">
              <BedDouble aria-hidden className="size-4" />
            </span>
            <span className="t-heading">Hotel Sales Hub</span>
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
