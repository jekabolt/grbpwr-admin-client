import { useTechCard } from 'components/managers/tech-cards/components/useTechCardQuery';
import { ROUTES } from 'constants/routes';
import { Link, useParams } from 'react-router-dom';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import { TechPackDocument } from './components/tech-pack-document';
import { usePackagingRecipe, useStyleAssembly } from './components/useAssemblyPacking';

// This page renders OUTSIDE the app Layout (see ProtectedBare in index.tsx), so the tech
// pack is plain top-level content in normal flow. Printing then needs no isolation tricks
// (no portal / absolute / #root hiding — those print blank in Safari): we just hide the
// toolbar and let the document paginate. The doc's own max-width/padding is dropped in
// print so it fills the @page content box.
const PRINT_CSS = `
@media print {
  @page { size: A4 portrait; margin: 12mm; }
  html, body { background: #fff !important; }
  .techpack-toolbar { display: none !important; }
  .techpack-doc { border: 0 !important; box-shadow: none !important; }
  .techpack-doc > * { max-width: none !important; margin: 0 !important; padding: 0 !important; }
  * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
}
`;

export function TechCardPrint() {
  const { id } = useParams<{ id: string }>();
  const numId = id ? parseInt(id, 10) : undefined;
  const { data: techCard, isLoading, isError } = useTechCard(numId);
  // #71 root cause: the on-garment assembly bill (labels/tags) and the packaging recipe each
  // live behind their own per-style RPC — GetTechCard alone (above) never returns them, so the
  // printed pack had nothing to render for either section no matter what TechPackDocument did
  // with the data. Fetch both here, alongside the tech card, and hand them down.
  const { data: assemblyData } = useStyleAssembly(numId ?? 0);
  const { data: packagingRecipeData } = usePackagingRecipe();

  return (
    <div className='mx-auto flex max-w-[230mm] flex-col gap-4 p-4 pb-10'>
      <style>{PRINT_CSS}</style>

      <div className='techpack-toolbar flex flex-wrap items-center justify-between gap-3 border-b border-textInactiveColor pb-3'>
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
        <div className='techpack-doc border border-textInactiveColor shadow-sm'>
          <TechPackDocument
            techCard={techCard}
            assembly={assemblyData?.items ?? []}
            packagingRecipe={packagingRecipeData?.items ?? []}
          />
        </div>
      )}
    </div>
  );
}
