import { LANGUAGES } from 'constants/constants';
import { cn } from 'lib/utility';
import { Button } from 'ui/components/button';

type Props = {
  selectedLanguageId: number;
  isLanguageFilled: (languageId: number) => boolean;
  onLanguageChange: (e: React.MouseEvent<HTMLButtonElement>, languageId: number) => void;
  showRedBorderForUnfilled?: boolean;
};

export function LanguageButtons({ selectedLanguageId, isLanguageFilled, onLanguageChange }: Props) {
  return (
    <div className='flex justify-between flex-wrap gap-2'>
      {LANGUAGES.map((language) => {
        const isFilled = isLanguageFilled(language.id);
        const isSelected = language.id === selectedLanguageId;
        return (
          <Button
            key={language.id}
            variant='simple'
            size='lg'
            type='button'
            onClick={(e: React.MouseEvent<HTMLButtonElement>) => onLanguageChange(e, language.id)}
            className={cn(
              'border border-text bg-bgColor text-text hover:bg-text hover:text-bgColor cursor-pointer',
              {
                'bg-text text-bgColor': isSelected,
                'border-green-500 bg-bgColor text-text': isFilled && !isSelected,
                'border-red-500': !isFilled,
              },
            )}
          >
            {language.code.toUpperCase()}
          </Button>
        );
      })}
    </div>
  );
}
