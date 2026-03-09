import { cn } from 'lib/utility';
import { FC } from 'react';
import Media from 'ui/components/media';
import Text from 'ui/components/text';

interface CareCardProps {
  method: string;
  code: string;
  img: string;
  isSelected: boolean;
  selectedCare: string;
  subCategory?: string;
  onSelectCareInstruction: (
    category: string,
    method: string,
    code: string,
    subCategory?: string,
  ) => void;
}

export const CareCard: FC<CareCardProps> = ({
  method,
  code,
  img,
  isSelected,
  onSelectCareInstruction,
  selectedCare,
  subCategory,
}) => (
  <div
    onClick={() => onSelectCareInstruction(selectedCare, method, code, subCategory)}
    className={cn(
      'border border-2 border-textColor cursor-pointer flex flex-col items-center w-full',
      { 'bg-textInactiveColor': isSelected },
    )}
  >
    <div className='w-full f-full'>
      <Media src={img} alt={method} aspectRatio='1/1' fit='contain' />
    </div>
    <Text>{isSelected ? code : method}</Text>
  </div>
);

interface CareMethodsListProps {
  methods: Record<string, unknown>;
  selectedCare: string;
  selectedInstructions: Record<string, string>;
  subCategory?: string;
  onSelectCareInstruction: (
    category: string,
    method: string,
    code: string,
    subCategory?: string,
  ) => void;
}

export const CareMethodsList: FC<CareMethodsListProps> = ({
  methods,
  selectedCare,
  selectedInstructions,
  subCategory,
  onSelectCareInstruction,
}) => {
  return (
    <>
      {Object.entries(methods).map(([method, codeOrSubMethods]) => {
        if (typeof codeOrSubMethods === 'object' && codeOrSubMethods !== null) {
          if ('code' in codeOrSubMethods || 'img' in codeOrSubMethods) {
            const { code, img } = codeOrSubMethods as { code: string; img: string };
            const selectionKey = subCategory ? `${selectedCare}-${subCategory}` : selectedCare;
            const isSelected = selectedInstructions[selectionKey] === code;

            return (
              <CareCard
                key={`${method}-${code}`}
                method={method}
                code={code}
                img={img}
                isSelected={isSelected}
                selectedCare={selectedCare}
                subCategory={subCategory}
                onSelectCareInstruction={onSelectCareInstruction}
              />
            );
          }
          return (
            <div key={`subcategory-${method}`} className='space-y-3'>
              <Text variant='uppercase' className='font-bold'>
                {method}
              </Text>
              <div className='grid grid-cols-2 lg:grid-cols-4 gap-2'>
                <CareMethodsList
                  methods={codeOrSubMethods as Record<string, unknown>}
                  selectedCare={selectedCare}
                  selectedInstructions={selectedInstructions}
                  subCategory={method}
                  onSelectCareInstruction={onSelectCareInstruction}
                />
              </div>
            </div>
          );
        }
        return null;
      })}
    </>
  );
};
