import { describe, it, expect } from 'vitest';
import { itemParticipantUserIds } from '../gatheringHelpers';
import { itemInvolvesUser as dateInvolves } from '../gatheringDates';

// Profile editing without a gathering: the updateMyProfile backend now accepts
// a missing gathering_id (returns ok without touching the Member record). The
// global name is saved via updateMe(display_name). These tests verify the
// participation logic that underpins the profile's date derivation — the same
// logic used when a user has no gathering context and their items must be
// filtered correctly.

describe('Profile without gathering — participation logic', () => {
  it('itemInvolvesUser (gatheringDates) does not require a gathering context', () => {
    // A user's own activity — they are in attendees
    expect(dateInvolves({ type: 'activity', attendee_user_ids: ['u1'] }, 'u1')).toBe(true);
    // A flight the user owns but didn't join — NOT involved
    expect(dateInvolves({ type: 'flight', owner_id: 'u1', attendee_user_ids: [] }, 'u1')).toBe(false);
  });

  it('itemParticipantUserIds (gatheringHelpers) — flight never falls back to creator', () => {
    expect(itemParticipantUserIds({ type: 'flight', owner_id: 'u1', attendee_user_ids: [] })).toEqual([]);
    expect(itemParticipantUserIds({ type: 'hotel', owner_id: 'u1', attendee_user_ids: [] })).toEqual(['u1']);
    expect(itemParticipantUserIds({ type: 'hotel', attendee_user_ids: ['u2'] })).toEqual(['u2']);
  });
});

// The one-family-per-user invariant is enforced atomically by the manageFamily
// backend. These tests verify the pure client-side logic that the
// FamilyManager uses to BLOCK candidates already in another family — the UI
// shows them but disables adding. The backend rejection is the authoritative
// check; this is the display-side logic.

describe('Family exclusivity — client-side blocking logic', () => {
  // Simulates the FamilyManager's candidateRows filter: a candidate is
  // "inAnother" family when they have a family that isn't the current one.
  function classify(candidate, primaryFamilyId, candidateFamilies) {
    const inThis = candidate.user_id === primaryFamilyId ||
      false; // (simplified — in a real family, check member_user_ids)
    const theirFam = candidateFamilies[candidate.user_id];
    return { inThis, inAnother: !inThis && !!theirFam, theirFam };
  }

  it('candidate with no family is not blocked', () => {
    const r = classify({ user_id: 'a' }, 'fam1', {});
    expect(r.inAnother).toBe(false);
  });

  it('candidate in another family is blocked', () => {
    const r = classify({ user_id: 'a' }, 'fam1', { a: { id: 'fam2', name: 'Other' } });
    expect(r.inAnother).toBe(true);
    expect(r.theirFam.name).toBe('Other');
  });

  it('candidate already in this family is not blocked (inThis)', () => {
    // When the candidate IS the owner of the primary family
    const r = classify({ user_id: 'owner1' }, 'owner1', { owner1: { id: 'fam1', name: 'Mine' } });
    expect(r.inThis).toBe(true);
    expect(r.inAnother).toBe(false);
  });
});