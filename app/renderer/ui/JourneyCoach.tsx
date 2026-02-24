import { useTranslation } from 'react-i18next';

interface JourneyCoachProps {
  visible: boolean;
  onComplete: () => void;
  onSkip: () => void;
}

export function JourneyCoach({ visible, onComplete, onSkip }: JourneyCoachProps) {
  const { t } = useTranslation();
  if (!visible) {
    return null;
  }

  return (
    <div className="journey-coach-backdrop" role="dialog" aria-modal="true" aria-label={t('coach.title')}>
      <section className="journey-coach">
        <h3>{t('coach.title')}</h3>
        <p>{t('coach.subtitle')}</p>
        <ol className="journey-coach-steps">
          <li>{t('coach.step.1')}</li>
          <li>{t('coach.step.2')}</li>
          <li>{t('coach.step.3')}</li>
          <li>{t('coach.step.4')}</li>
        </ol>
        <div className="journey-coach-actions">
          <button type="button" onClick={onSkip}>
            {t('coach.skip')}
          </button>
          <button type="button" onClick={onComplete}>
            {t('coach.start')}
          </button>
        </div>
      </section>
    </div>
  );
}

