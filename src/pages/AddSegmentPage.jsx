import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGathering } from '@/lib/gatheringContext';
import { JOURNEY_TYPES, canAddJourney } from '@/lib/gatheringHelpers';
import { useI18n } from '@/lib/i18n';
import DetailActionBar from '@/components/tt/DetailActionBar';
import JourneyItemForm from '@/components/journey/JourneyItemForm';
import { journeyIcon } from '@/lib/journeyIcons';

// Full-page "Add segment" surface, mounted at /gathering/:id/journey/new.
// First step: a responsive grid of type icons (same JOURNEY_TYPES order, icons
// and colors as the Journey page). Selecting Flight navigates to the existing
// full-page FlightPage at /journey/new/flight; any other type renders the
// JourneyItemForm inline (no bottom-sheet flyover) with that type pre-selected.
// Back from the picker returns to the Journey list; Cancel from the inline form
// returns to the picker.
export default function AddSegmentPage() {
  const { gatheringId, gathering, members, currentMember, role } = useGathering();
  const navigate = useNavigate();
  const { t } = useI18n();
  const [selectedType, setSelectedType] = useState(null);

  const back = () => {
    if (window.history.state && window.history.state.idx > 0) navigate(-1);
    else navigate(`/gathering/${gatheringId}/journey`);
  };

  const canAdd = canAddJourney(role);

  function pickType(type) {
    if (type === 'flight') {
      navigate(`/gathering/${gatheringId}/journey/new/flight`);
      return;
    }
    setSelectedType(type);
  }

  if (!canAdd) {
    return (
      <div className="space-y-4">
        <DetailActionBar onBack={back} />
        <div className="tt-card p-10 text-center max-w-md mx-auto">
          <p className="font-display text-2xl mb-2 text-ink-deep">{t('common.notAllowed')}</p>
          <p className="text-ink-deep/60 text-sm">{t('common.notAllowedBody')}</p>
        </div>
      </div>
    );
  }

  if (selectedType) {
    return (
      <JourneyItemForm
        gatheringId={gatheringId}
        gatheringStartDate={gathering?.start_date}
        currentMember={currentMember}
        members={members}
        item={null}
        initial={{ type: selectedType }}
        inline
        onClose={() => setSelectedType(null)}
        onSaved={() => navigate(`/gathering/${gatheringId}/journey`, { replace: true })}
      />
    );
  }

  return (
    <div className="space-y-4">
      <DetailActionBar onBack={back} />
      <div className="mt-5">
        <h1 className="font-display text-2xl font-bold text-ink-deep mb-1">{t('journeyForm.addSegment')}</h1>
        <p className="text-sm text-ink-deep/55 mb-5">{t('journeyForm.addSegmentQ')}</p>
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
          {JOURNEY_TYPES.map((jt) => {
            const Icon = journeyIcon(jt.key);
            return (
              <button
                key={jt.key}
                type="button"
                onClick={() => pickType(jt.key)}
                className="tt-card p-4 flex flex-col items-center gap-2.5 hover:scale-[1.02] active:scale-[0.98] transition-transform"
              >
                <div className="w-12 h-12 rounded-full flex items-center justify-center shadow-sm" style={{ backgroundColor: jt.color }}>
                  <Icon className="w-6 h-6 text-white" strokeWidth={2} />
                </div>
                <span className="text-xs font-semibold text-ink-deep text-center leading-tight">{t('journeyTypes.' + jt.key)}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}