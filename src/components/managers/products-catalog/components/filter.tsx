import Color from './color';
import FromTo from './from-to';
import Gender from './gender';
import PreorderSaleHidden from './preorder-sale-hidden';
import Sizes from './sizes';
import Sort from './sort-order';
import Tag from './tag';

export default function Filter() {
  return (
    <div className='grid gap-3'>
      <div className='flex flex-col lg:flex-row gap-3'>
        <Sort />
        <Gender />
        <Color />
        <Sizes />
      </div>
      <div className='flex lg:flex-row lg:justify-between flex-col gap-3'>
        <div className='flex gap-3 flex-col lg:flex-row'>
          <FromTo />
          <Tag />
        </div>
        <PreorderSaleHidden />
      </div>
    </div>
  );
}
