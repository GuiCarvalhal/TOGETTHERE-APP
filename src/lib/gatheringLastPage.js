// Per-user, per-gathering "last visited section" persistence. Only the section
// key (a route segment) is stored in localStorage, keyed by user id + gathering
// id — no sensitive data. Unknown/stale sections are ignored safely, and
// role-gated sections (agent/expenses) are only restored when the current role
// can see them.

import { canSeeAgent, canSeeExpenses } from '@/lib/gatheringHelpers';

export const GATHERING_SECTIONS = ['agent', 'journey', 'expenses', 'members', 'settings'];

const KEY = (uid, gid) => `tt-gathering-lastpage:${uid}:${gid}`;

export function isValidSection(section) {
  return GATHERING_SECTIONS.includes(section);
}

// True only for a real gathering section the given role may view.
export function sectionAllowedForRole(section, role) {
  if (!isValidSection(section)) return false;
  if (section === 'agent') return canSeeAgent(role);
  if (section === 'expenses') return canSeeExpenses(role);
  return true; // journey, members, settings
}

export function readLastSection(uid, gid) {
  if (!uid || !gid) return null;
  try {
    const v = localStorage.getItem(KEY(uid, gid));
    return v && isValidSection(v) ? v : null;
  } catch { return null; }
}

export function writeLastSection(uid, gid, section) {
  if (!uid || !gid || !isValidSection(section)) return;
  try { localStorage.setItem(KEY(uid, gid), section); } catch {}
}

// Section of the current gathering route = the 3rd path segment, e.g.
// /gathering/:id/expenses -> 'expenses'; /gathering/:id/journey/:itemId -> 'journey'.
export function sectionFromPath(pathname) {
  const seg = (pathname || '').split('/').filter(Boolean)[2];
  return seg || null;
}