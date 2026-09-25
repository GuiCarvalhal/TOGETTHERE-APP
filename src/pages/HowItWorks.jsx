import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Route, Receipt, Sparkles, ArrowRight } from 'lucide-react';

const PILLARS = [
  {
    icon: Route,
    title: 'A living itinerary',
    tagline: 'One shared timeline for the whole crew.',
    body: "Flights, stays, and activities live on one timezone-aware timeline everyone can read. Add a segment and it lands on the right day; hotels split into check-in and check-out legs; flight numbers resolve to live status. No more chasing threads across apps.",
    points: ['Timezone-aware timeline', 'Stays as check-in / check-out legs', 'Live flight status by flight number'],
  },
  {
    icon: Receipt,
    title: 'Fair splits, sorted',
    tagline: 'Track shared costs and settle up without the math.',
    body: "Log expenses in any currency, split equally or by share, and see a running balance that tells you exactly who owes whom — down to the cent. Group by family so households settle together.",
    points: ['Multi-currency with live rates', 'Equal or by-share splits', 'Running balance & settle-up suggestions'],
  },
  {
    icon: Sparkles,
    title: 'An AI concierge',
    tagline: 'Each day tuned to where the group actually is.',
    body: "A concierge that reads your itinerary, the crew's diets and interests, and where you'll actually be — then suggests where to eat, what to do, and what to prep. It adapts before and during the trip.",
    points: ['Phase-aware: before vs during', 'Real nearby places from Google', 'Prep tasks & good-to-know info'],
  },
];

export default function HowItWorks() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 bg-background/95 backdrop-blur-xl border-b border-border tt-safe-top">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link to="/" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-4 h-4" /> Back
          </Link>
          <span className="font-display text-sm font-bold tracking-tight">TOGETTHERE</span>
        </div>
      </header>

      <section className="max-w-3xl mx-auto px-4 sm:px-6 pt-10 pb-8">
        <p className="tt-label text-terra-coral mb-3">How it works</p>
        <h1 className="font-display text-3xl sm:text-4xl font-bold leading-tight tt-text-balance">
          Three things that make group travel feel effortless.
        </h1>
        <p className="text-muted-foreground mt-4 max-w-xl leading-relaxed">
          TOGETTHERE keeps your crew on one shared timeline — the itinerary, the money, and a concierge that knows where you'll actually be.
        </p>
      </section>

      <section className="max-w-3xl mx-auto px-4 sm:px-6 pb-16 space-y-5">
        {PILLARS.map((p) => (
          <div key={p.title} className="tt-card p-5">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-terra/15 border border-terra/25 flex items-center justify-center shrink-0">
                <p.icon className="w-5 h-5 text-terra-coral" />
              </div>
              <div>
                <p className="font-display text-lg font-bold text-foreground">{p.title}</p>
                <p className="text-xs text-muted-foreground">{p.tagline}</p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">{p.body}</p>
            <ul className="mt-3 space-y-1.5">
              {p.points.map((pt) => (
                <li key={pt} className="flex items-center gap-2 text-sm text-foreground">
                  <span className="w-1.5 h-1.5 rounded-full bg-terra shrink-0" /> {pt}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      <section className="max-w-3xl mx-auto px-4 sm:px-6 pb-16 text-center">
        <Button asChild className="bg-terra hover:bg-terra-deep text-cream rounded-full">
          <Link to="/">Start planning <ArrowRight className="w-4 h-4 ml-1.5" /></Link>
        </Button>
      </section>
    </div>
  );
}