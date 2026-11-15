import React, { useState } from 'react';
import { Check, LayoutGrid } from 'lucide-react';
import FormSheet from '@/components/tt/FormSheet';
import { Button } from '@/components/ui/button';
import StampArt from '@/components/passport/stamps/StampArt';
import { SAMPLE_STAMP_COUNTRIES } from '@/components/passport/stamps/landmarks';
import { STAMP_STYLES, setStampStyle, useStampStyle } from '@/lib/stampStyle';
import { countryName } from '@/lib/passport';
import { useI18n } from '@/lib/i18n';

// Stamp style approval. The library is deliberately a 12-country sample until a
// design is picked, so nobody ships 200 drawings in the wrong style: the three
// frames below are the whole decision, and "Preview all 12 samples" shows the
// same style across regions before it is confirmed for the full rollout.
const PREVIEW_CODE = 'IT';

export default function StampStyleGallery() {
  const { t, fmt } = useI18n();
  const style = useStampStyle();
  const [open, setOpen] = useState(false);

  return (
    <div className="tt-card p-4 sm:p-5 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="tt-label text-ink-deep/45">{t('passport.sampleNote')}</p>
          <p className="font-display text-base font-bold text-ink-deep mt-0.5">{t('passport.styleTitle')}</p>
        </div>
        <Button variant="secondary" size="sm" className="shrink-0" onClick={() => setOpen(true)}>
          <LayoutGrid /> <span className="truncate">{t('passport.previewLibrary')}</span>
        </Button>
      </div>

      <p className="text-xs text-ink-deep/55 leading-relaxed">{t('passport.styleHint')}</p>

      <div className="grid grid-cols-3 gap-2">
        {STAMP_STYLES.map((option) => {
          const active = style === option.id;
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => setStampStyle(option.id)}
              aria-pressed={active}
              className={`rounded-2xl border p-2 text-center transition min-w-0 ${
                active ? 'border-terra/60 bg-terra/[0.07]' : 'border-ink-charcoal/15 hover:bg-foreground/5'
              }`}
            >
              <div className={`mx-auto w-full max-w-[70px] ${active ? '' : 'opacity-60 grayscale'}`}>
                <StampArt
                  code={PREVIEW_CODE}
                  name={countryName(PREVIEW_CODE, fmt.locale)}
                  caption={t('passport.stamped')}
                  style={option.id}
                />
              </div>
              <p className="mt-1.5 text-[0.625rem] font-bold text-ink-deep truncate">{t(option.labelKey)}</p>
              {active ? (
                <p className="mt-0.5 text-[0.5625rem] font-semibold uppercase tracking-wide text-terra-deep inline-flex items-center gap-0.5">
                  <Check className="w-2.5 h-2.5" /> {t('passport.styleSelected')}
                </p>
              ) : null}
            </button>
          );
        })}
      </div>

      <FormSheet open={open} onOpenChange={setOpen} title={t('passport.libraryTitle')}>
        <div className="space-y-3">
          <p className="text-xs text-ink-deep/55 leading-relaxed">{t('passport.libraryHint')}</p>
          <div className="grid grid-cols-3 gap-3">
            {SAMPLE_STAMP_COUNTRIES.map((code) => (
              <div key={code} className="min-w-0 text-center">
                <div>
                  <StampArt
                    code={code}
                    name={countryName(code, fmt.locale)}
                    caption={t('passport.stamped')}
                    style={style}
                  />
                </div>
                <p className="mt-1 text-[0.625rem] font-semibold text-ink-deep/60 truncate">
                  {countryName(code, fmt.locale)}
                </p>
              </div>
            ))}
          </div>
          <Button className="w-full" size="lg" onClick={() => setOpen(false)}>{t('passport.done')}</Button>
        </div>
      </FormSheet>
    </div>
  );
}