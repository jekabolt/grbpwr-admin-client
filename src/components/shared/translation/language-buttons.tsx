import { CheckIcon } from '@radix-ui/react-icons';
import { LANGUAGES } from 'constants/constants';
import { cn } from 'lib/utility';

type Props = {
  selectedLanguageId: number;
  isLanguageFilled: (languageId: number) => boolean;
  onLanguageChange: (e: React.MouseEvent<HTMLButtonElement>, languageId: number) => void;
  /** Highlight empty languages in red (use for strictly-required translation sets). */
  showRedBorderForUnfilled?: boolean;
};

export function LanguageButtons({
  selectedLanguageId,
  isLanguageFilled,
  onLanguageChange,
  showRedBorderForUnfilled = false,
}: Props) {
  return (
    <div className='flex flex-wrap gap-1.5'>
      {LANGUAGES.map((language) => {
        const isFilled = isLanguageFilled(language.id);
        const isSelected = language.id === selectedLanguageId;
        return (
          <button
            key={language.id}
            type='button'
            onClick={(e: React.MouseEvent<HTMLButtonElement>) => onLanguageChange(e, language.id)}
            className={cn(
              'flex items-center gap-1 border px-2 py-1 text-textBaseSize uppercase transition-colors cursor-pointer',
              // base (unfilled, not selected)
              'border-textInactiveColor text-textInactiveColor hover:border-textInactiveColor hover:text-textColor',
              {
                // selected
                'border-textColor bg-textColor text-bgColor hover:text-bgColor': isSelected,
                // filled, not selected
                'border-textInactiveColor text-textColor': isFilled && !isSelected,
                // required-but-empty emphasis
                'border-error text-error hover:border-error':
                  showRedBorderForUnfilled && !isFilled && !isSelected,
              },
            )}
          >
            {isFilled && <CheckIcon className='size-3 shrink-0' />}
            {language.code.toUpperCase()}
          </button>
        );
      })}
    </div>
  );
}
