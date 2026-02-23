import { useTranslation } from 'react-i18next';

import type { AppLanguage } from '@shared/types/settings';

interface LanguageToggleProps {
  language: AppLanguage;
  onChange: (language: AppLanguage) => void;
}

export function LanguageToggle({ language, onChange }: LanguageToggleProps) {
  const { t } = useTranslation();

  return (
    <div className="language-toggle">
      <button
        className={language === 'ko' ? 'active' : ''}
        type="button"
        onClick={() => onChange('ko')}
      >
        {t('lang.ko')}
      </button>
      <button
        className={language === 'en' ? 'active' : ''}
        type="button"
        onClick={() => onChange('en')}
      >
        {t('lang.en')}
      </button>
    </div>
  );
}
