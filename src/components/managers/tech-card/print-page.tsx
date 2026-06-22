import { useTechCard } from 'components/managers/tech-cards/components/useTechCardQuery';
import { ROUTES } from 'constants/routes';
import { Link, useParams } from 'react-router-dom';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import { TechPackDocument } from './components/tech-pack-document';

// When printing, hide all app chrome and show only the tech-pack document, sized to the
// page. `visibility` (not `display`) keeps the document's own layout intact; the absolute
// repositioning drops it to the page origin so the sidebar/nav don't leave a gap.
const PRINT_CSS = `
@media print {
  @page { size: A4 portrait; margin: 12mm; }
  html, body { background: #fff !important; }
  body * { visibility: hidden !important; }
  #techpack-print, #techpack-print * { visibility: visible !important; }
  #techpack-print {
    position: absolute; left: 0; top: 0; width: 100%; max-width: none;
    margin: 0; padding: 0;
  }
  .techpack-print-hidden { display: none !important; }
  * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
}
`;

export function TechCardPrint() {
  const { id } = useParams<{ id: string }>();
  const numId = id ? parseInt(id, 10) : undefined;
  const { data: techCard, isLoading, isError } = useTechCard(numId);

  return (
    <div className='flex flex-col gap-4 pb-10'>
      <style>{PRINT_CSS}</style>

      <div className='techpack-print-hidden flex flex-wrap items-center justify-between gap-3 border-b border-textColor pb-3'>
        <div className='flex items-center gap-3'>
          <Button asChild variant='secondary' size='lg'>
            <Link to={id ? `/tech-cards/${id}` : ROUTES.techCards}>← back</Link>
          </Button>
          <Text variant='uppercase' size='large'>
            tech pack — pdf
          </Text>
        </div>
        <div className='flex items-center gap-3'>
          <Text variant='inactive' size='small'>
            choose “save as PDF” as the destination
          </Text>
          <Button
            variant='main'
            size='lg'
            className='uppercase'
            disabled={!techCard}
            onClick={() => window.print()}
          >
            save as pdf
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className='flex justify-center py-20'>
          <Text variant='inactive' className='animate-pulse'>
            loading tech card…
          </Text>
        </div>
      ) : isError || !techCard ? (
        <div className='flex flex-col items-center gap-4 py-20'>
          <Text variant='inactive' className='uppercase'>
            tech card not found
          </Text>
          <Button asChild variant='main' size='lg' className='uppercase'>
            <Link to={ROUTES.techCards}>← back to tech cards</Link>
          </Button>
        </div>
      ) : (
        <div className='border border-textInactiveColor shadow-sm'>
          <TechPackDocument techCard={techCard} />
        </div>
      )}
    </div>
  );
}
