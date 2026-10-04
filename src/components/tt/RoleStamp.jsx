import React from 'react';
import { useI18n } from '@/lib/i18n';

const STYLES = {
  owner: 'bg-terra text-cream border-terra',
  admin: 'bg-foreground text-background border-foreground',
  member: 'bg-cream-pale text-ink-deep border-ink-charcoal/25',
  viewer: 'bg-transparent text-ink-deep/55 border-ink-charcoal/25 border-dashed',
};

export default function RoleStamp({ role, className = '', size = 'sm' }) {
  const { t } = useI18n();
  const sizeCls = size === 'xs' ? 'px-2 py-0.5 text-[0.625rem]' : 'px-2.5 py-1 text-[0.6875rem]';
  return (
    <span className={`tt-stamp ${STYLES[role] || STYLES.member} ${sizeCls} ${className}`}>
      {t('roles.' + role) || role}
    </span>
  );
}