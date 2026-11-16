import React from 'react';
import { Image } from '@/components/ui/image';

const SIZES = { xs: 'w-7 h-7 text-[0.6rem]', sm: 'w-9 h-9 text-xs', md: 'w-11 h-11 text-sm', lg: 'w-16 h-16 text-lg', xl: 'w-20 h-20 text-2xl' };

export default function MemberAvatar({ member, size = 'md', className = '', ring = false }) {
  // The profile name wins over the built-in full_name (which some accounts carry
  // as the email local part), so initials never spell the mailbox.
  const name = member?.display_name || member?.full_name || '';
  const initials = (name || '?')
    .split(' ').map((s) => s[0]).join('').slice(0, 2).toUpperCase();
  return (
    <div
      className={`tt-avatar ${SIZES[size]} rounded-full overflow-hidden border border-ink-charcoal/20 bg-cream-pale flex items-center justify-center font-display font-bold text-terra-deep shrink-0 ${ring ? 'ring-2 ring-terra ring-offset-2 ring-offset-ink' : ''} ${className}`}
    >
      {member?.photo ? (
        <Image src={member.photo} alt={name || 'Member'} className="w-full h-full object-cover" fittingType="fill" loading="eager" />
      ) : (
        <span>{initials}</span>
      )}
    </div>
  );
}