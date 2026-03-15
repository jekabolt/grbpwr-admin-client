'use client';

import { useEffect, useState } from 'react';

import { cn } from 'lib/utility';
import { Arrow } from 'ui/icons/arrow';
import Text from './text';

interface FieldsGroupContainerProps {
  stage?: string;
  title: string;
  preview?: React.ReactNode;
  children: React.ReactNode;
  isOpen?: boolean;
  disabled?: boolean;
  collapsible?: boolean;
  className?: string;
  clickableAreaClassName?: string;
  childrenSpacingClass?: string;
  headerContentGapClass?: string;
  titleWrapperClassName?: string;
  onToggle?: () => void;
}

export default function FieldsGroupContainer({
  stage,
  title,
  preview,
  children,
  isOpen = false,
  disabled = false,
  collapsible = true,
  className,
  clickableAreaClassName,
  childrenSpacingClass = 'space-y-8',
  headerContentGapClass = 'space-y-4 lg:space-y-8',
  titleWrapperClassName,
  onToggle,
}: FieldsGroupContainerProps) {
  const [localIsOpen, setLocalIsOpen] = useState(isOpen);

  useEffect(() => {
    setLocalIsOpen(isOpen);
  }, [isOpen]);

  const handleToggle = () => {
    if (disabled || !collapsible) return;
    setLocalIsOpen((v) => !v);
    onToggle?.();
  };

  return (
    <div className={cn('bg-bgColor text-textColor', headerContentGapClass, className)}>
      <div
        className={cn(
          'flex items-center justify-between',
          { 'h-auto cursor-pointer lg:h-20': disabled },
          { 'cursor-pointer': collapsible && !disabled },
          clickableAreaClassName,
        )}
        onClick={collapsible ? handleToggle : undefined}
      >
        <div className='flex flex-1 items-center gap-x-6'>
          {stage && (
            <Text
              variant='uppercase'
              className={cn('w-8 text-textColor', {
                'text-textInactiveColor': disabled,
              })}
            >
              {stage}
            </Text>
          )}

          <div
            className={cn(
              'flex flex-1 items-center justify-between',
              { 'text-textInactiveColor': disabled },
              titleWrapperClassName,
            )}
          >
            <div className='flex items-center'>
              <Text
                variant='uppercase'
                className={cn('text-textColor', {
                  'text-textInactiveColor': disabled,
                })}
              >
                {title}
              </Text>
            </div>
            {preview && <div>{preview}</div>}
          </div>
        </div>

        {collapsible && <CollapsibleSign isOpen={localIsOpen} disabled={disabled} />}
      </div>

      <div
        className={cn(childrenSpacingClass, {
          hidden: collapsible && !localIsOpen,
        })}
      >
        {children}
      </div>
    </div>
  );
}

function CollapsibleSign({ isOpen, disabled }: { isOpen: boolean; disabled?: boolean }) {
  return (
    <div>
      <div
        className={cn('transition-transform', {
          'rotate-0': isOpen,
          'rotate-180': !isOpen,
        })}
      >
        <Arrow
          className={cn('text-textColor', {
            'text-textInactiveColor': disabled,
          })}
        />
      </div>
    </div>
  );
}
