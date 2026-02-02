import { Button } from 'ui/components/button';
import { Overlay } from 'ui/components/overlay';
import Text from 'ui/components/text';
import Color from './color';
import FromTo from './from-to';
import Gender from './gender';
import PreorderSaleHidden from './preorder-sale-hidden';
import ShowLatestLimit from './show-latest-limit';
import { Sizes } from './sizes';
import Sort from './sort-order';
import { useRouteParams } from './useRouteParams';

export default function Filter({
  isOpen,
  toggleModal,
}: {
  isOpen: boolean;
  toggleModal: () => void;
}) {
  const { gender } = useRouteParams();
  return (
    <div className='z-50 w-full'>
      {isOpen && (
        <div className='hidden lg:block'>
          <Overlay cover='screen' onClick={toggleModal} disablePointerEvents={false} />
          <div className='fixed inset-y-2 right-2 z-30 w-[445px] border border-textInactiveColor bg-bgColor p-2.5 text-textColor'>
            <div className='flex h-full flex-col'>
              <div className='flex items-center justify-between'>
                <Text variant='uppercase'>filter</Text>
                <Button variant='simple' onClick={toggleModal}>
                  [x]
                </Button>
              </div>
              <div className='h-full space-y-10 overflow-y-scroll pt-6'>
                <div className='space-y-6'>
                  <Text variant='uppercase'>sort by</Text>
                  <Sort />
                </div>
                <PreorderSaleHidden />
                <ShowLatestLimit />
                <Gender />
                <Color />
                <FromTo />
                <Sizes gender={gender} />
              </div>
              <div className='flex items-center justify-end gap-2 bg-bgColor'>
                <Button className='w-1/2 uppercase' size='lg' onClick={() => {}}>
                  clear all
                </Button>
                <Button className='w-1/2 uppercase' size='lg' onClick={() => toggleModal()}>
                  show
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
    // <div className='grid gap-3'>
    //   <div className='flex flex-col lg:flex-row gap-3'>
    //     <Sort />
    //     <Gender />
    //     <Color />
    //     <Sizes />
    //     <Categories />
    //   </div>
    //   <div className='flex lg:flex-row lg:justify-between flex-col gap-3'>
    //     <div className='flex gap-3 flex-col lg:flex-row'>
    //       <FromTo />
    //       <Tag />
    //     </div>
    //     <PreorderSaleHidden />
    //   </div>
    // </div>
  );
}
