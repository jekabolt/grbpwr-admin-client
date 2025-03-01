import { Cross1Icon } from '@radix-ui/react-icons';
import { useArchiveStore } from 'lib/stores/archive/store';
import { useSnackBarStore } from 'lib/stores/store';
import { cn } from 'lib/utility';
import { useEffect, useRef, useState } from 'react';
import { Button } from 'ui/components/button';
import Media from 'ui/components/media';
import Text from 'ui/components/text';
import { ArchiveItem } from './archive-item';

export function ListArchive() {
  const { archives, fetchArchives, deleteArchive } = useArchiveStore();
  const { showMessage } = useSnackBarStore();
  const [selectedArchive, setSelectedArchive] = useState<number>();
  const [highlightedArchive, setHighlightedArchive] = useState<number | null>(null);
  const archiveData = archives.find((a) => a.id === selectedArchive);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchArchives(50, 0);
  }, [fetchArchives]);

  useEffect(() => {
    const handleScroll = () => {
      if (!containerRef.current) return;

      const container = containerRef.current;
      const containerRect = container.getBoundingClientRect();
      const containerCenter = containerRect.top + containerRect.height / 2;

      let closestItem: HTMLElement | null = null;
      let closestDistance = Infinity;

      container.querySelectorAll('.archive-item').forEach((item) => {
        const itemElement = item as HTMLElement;
        const itemRect = itemElement.getBoundingClientRect();
        const itemCenter = itemRect.top + itemRect.height / 2;
        const distance = Math.abs(containerCenter - itemCenter);

        if (distance < closestDistance) {
          closestDistance = distance;
          closestItem = itemElement;
        }
      });

      if (closestItem) {
        const archiveId = Number((closestItem as HTMLElement).getAttribute('data-archive-id'));
        setHighlightedArchive(archiveId);
      }
    };

    const container = containerRef.current;
    if (container) {
      container.addEventListener('scroll', handleScroll);
      handleScroll();
    }

    return () => {
      if (container) {
        container.removeEventListener('scroll', handleScroll);
      }
    };
  }, [archives]);

  useEffect(() => {
    if (highlightedArchive && containerRef.current) {
      const highlightedElement = containerRef.current.querySelector(
        `[data-archive-id="${highlightedArchive}"]`,
      ) as HTMLElement;

      if (highlightedElement) {
        const container = containerRef.current;
        const containerHeight = container.clientHeight;
        const topOffset = containerHeight / 2;
        const elementTop = highlightedElement.offsetTop;
        const scrollPosition = elementTop - topOffset;

        container.scrollTo({
          top: scrollPosition,
          behavior: 'smooth',
        });
      }
    }
  }, [highlightedArchive]);

  async function handleDeleteArchive(e: React.MouseEvent, id: number) {
    e.preventDefault();
    e.stopPropagation();
    try {
      await deleteArchive(id);
      setSelectedArchive(undefined);
      showMessage('archive deleted', 'success');
    } catch (error) {
      showMessage('failed to delete archive', 'error');
    }
  }

  return (
    <div className='h-full overflow-auto scroll-smooth no-scroll-bar' ref={containerRef}>
      {archives.map((archive) => {
        const isHighlighted = archive.id === highlightedArchive;

        return (
          <div
            key={archive.id}
            data-archive-id={archive.id}
            className={`archive-item relative px-2 transition-transform duration-300 ease-in-out ${
              isHighlighted ? 'scale-100' : 'scale-95 opacity-30'
            }`}
            onClick={() => setSelectedArchive(archive.id)}
          >
            <Button
              onClick={(e: React.MouseEvent) => handleDeleteArchive(e, archive.id || 0)}
              size='lg'
              className='absolute top-2 right-2 z-20'
            >
              <Cross1Icon />
            </Button>
            <div className='w-full h-full flex flex-col lg:flex-row items-center justify-between gap-4'>
              <Text variant='uppercase' className='w-60'>
                {archive.heading}
              </Text>

              <div
                className={cn(
                  'lg:w-[34rem] w-full flex-shrink-0 transition-all duration-300 ease-in-out',
                  {
                    'lg:w-96': !isHighlighted,
                  },
                )}
              >
                <Media
                  src={archive.media?.[0].media?.fullSize?.mediaUrl || ''}
                  alt='archive media'
                />
              </div>

              <Text variant='uppercase' className='w-60 text-right'>
                {archive.tag}
              </Text>
            </div>
          </div>
        );
      })}
      <ArchiveItem archiveData={archiveData} close={() => setSelectedArchive(undefined)} />
    </div>
  );
}
