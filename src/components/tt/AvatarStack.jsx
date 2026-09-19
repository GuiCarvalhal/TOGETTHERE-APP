import React from 'react';
import MemberAvatar from './MemberAvatar';

// Overlapping avatar stack. `people` are { full_name, photo, role } shaped objects.
export default function AvatarStack({ people = [], max = 4, size = 'xs' }) {
  const shown = people.slice(0, max);
  const extra = people.length - shown.length;
  if (!people.length) return null;
  return (
    <div className="flex items-center -space-x-2">
      {shown.map((p, i) => (
        <div key={i} className="rounded-full ring-2 ring-cream">
          <MemberAvatar member={p} size={size} />
        </div>
      ))}
      {extra > 0 && (
        <div className="rounded-full ring-2 ring-cream w-7 h-7 flex items-center justify-center bg-cream-pale text-ink-deep text-[0.625rem] font-semibold border border-ink-charcoal/15">
          +{extra}
        </div>
      )}
    </div>
  );
}