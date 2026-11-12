import { Compass, CalendarHeart, Users, Crown, ShieldCheck, Route, Plane, BedDouble, Globe2, Receipt, Coins, MailCheck, Inbox, NotebookPen, HandHeart, Home, BadgeCheck } from 'lucide-react';

// Badge catalog for Community & Awards — the single structured source of truth.
// A badge is never hand-written: each TOPIC declares the stat it reads and the
// ladder of thresholds, and buildBadgeState() expands that into ~67 concrete
// badges with live progress. Adding a tier or a topic is a one-line change, so
// the catalog stays compact and the totals stay honest.
//
//   stat    → a key in getAchievements().stats
//   unitKey → what the threshold counts (pluralized by the dictionary)
//   tiers   → ascending thresholds; the index also picks the level name
export const BADGE_TOPICS = [
  { id: 'explorer', stat: 'daysActive', Icon: Compass, unitKey: 'badges.unit.days', tiers: [1, 7, 30, 90, 180, 365] },
  { id: 'gatherings', stat: 'gatherings', Icon: CalendarHeart, unitKey: 'badges.unit.gatherings', tiers: [1, 3, 5, 10, 25, 50] },
  { id: 'companions', stat: 'companions', Icon: Users, unitKey: 'badges.unit.people', tiers: [1, 3, 5, 10, 25, 50] },
  { id: 'organizer', stat: 'organizer', Icon: Crown, unitKey: 'badges.unit.gatherings', tiers: [1, 2, 5, 10] },
  { id: 'captain', stat: 'captain', Icon: ShieldCheck, unitKey: 'badges.unit.gatherings', tiers: [1, 3, 10] },
  { id: 'planner', stat: 'segments', Icon: Route, unitKey: 'badges.unit.segments', tiers: [1, 5, 15, 40, 100] },
  { id: 'jetsetter', stat: 'flights', Icon: Plane, unitKey: 'badges.unit.flights', tiers: [1, 3, 10, 25] },
  { id: 'stays', stat: 'stays', Icon: BedDouble, unitKey: 'badges.unit.stays', tiers: [1, 3, 10] },
  { id: 'destinations', stat: 'destinations', Icon: Globe2, unitKey: 'badges.unit.places', tiers: [1, 3, 5, 10, 20] },
  { id: 'accountant', stat: 'expenses', Icon: Receipt, unitKey: 'badges.unit.expenses', tiers: [1, 10, 50, 150] },
  { id: 'currencies', stat: 'currencies', Icon: Coins, unitKey: 'badges.unit.currencies', tiers: [2, 3, 5] },
  { id: 'mailboxes', stat: 'mailboxes', Icon: MailCheck, unitKey: 'badges.unit.mailboxes', tiers: [1, 2] },
  { id: 'imports', stat: 'imports', Icon: Inbox, unitKey: 'badges.unit.imports', tiers: [1, 10, 50] },
  { id: 'storyteller', stat: 'notes', Icon: NotebookPen, unitKey: 'badges.unit.notes', tiers: [1, 10, 30] },
  { id: 'helper', stat: 'activity', Icon: HandHeart, unitKey: 'badges.unit.actions', tiers: [1, 10, 50, 200] },
  { id: 'family', stat: 'familySize', Icon: Home, unitKey: 'badges.unit.people', tiers: [2, 4, 6] },
  { id: 'profile', stat: 'profile', Icon: BadgeCheck, unitKey: 'badges.unit.details', tiers: [1, 2, 3, 4] },
];

const MAX_LEVEL = 6;

export const levelOf = (index) => Math.min(index + 1, MAX_LEVEL);

// Flatten the catalog against the user's stats. Every badge carries its own
// progress so the UI never recomputes anything.
export function buildBadges(stats = {}) {
  const badges = [];
  for (const topic of BADGE_TOPICS) {
    const current = Math.max(0, Number(stats[topic.stat]) || 0);
    topic.tiers.forEach((target, index) => {
      badges.push({
        id: `${topic.id}.${target}`,
        topic,
        target,
        current,
        level: levelOf(index),
        unlocked: current >= target,
        progress: target > 0 ? Math.min(1, current / target) : 0,
      });
    });
  }
  return badges;
}

// Ready-to-render tri-state view: what is unlocked, the single next badge of
// each topic (the one being chased right now), and everything still locked.
export function buildBadgeState(stats = {}) {
  const badges = buildBadges(stats);
  const unlocked = badges.filter((b) => b.unlocked);
  const next = [];
  for (const topic of BADGE_TOPICS) {
    const upcoming = badges.find((b) => b.topic.id === topic.id && !b.unlocked);
    if (upcoming) next.push(upcoming);
  }
  const inProgressIds = new Set(next.map((b) => b.id));
  const locked = badges.filter((b) => !b.unlocked && !inProgressIds.has(b.id));
  return { total: badges.length, unlockedCount: unlocked.length, unlocked, inProgress: next, locked };
}