import { Cross2Icon } from '@radix-ui/react-icons';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { cn } from 'lib/utility';
import { useEffect, useMemo, useState } from 'react';
import { useFormContext } from 'react-hook-form';
import { Button } from 'ui/components/button';
import Input from 'ui/components/input';
import Text from 'ui/components/text';
import { ProductFormData } from '../utility/schema';

export function Tags({
  isAddingProduct,
  isEditMode,
  editMode,
}: {
  isAddingProduct: boolean;
  isEditMode: boolean;
  editMode: boolean;
}) {
  const {
    watch,
    setValue,
    formState: { errors },
  } = useFormContext<ProductFormData>();
  const { dictionary } = useDictionary();
  const values = watch();
  const [tag, setTag] = useState('');

  // R9: dictionary-backed tag suggestions (controlled Tag list; archived hidden). The final contract
  // keeps ColorwayTagInsert as free-text `tag` (no tag_id FK), so clicking a suggestion seeds the
  // value and the dictionary is purely for autocomplete/consistency.
  const dictTagOptions = useMemo(
    () =>
      (dictionary?.tags ?? [])
        .filter((t) => !t.archived)
        .map((t) => t.name || t.code || '')
        .filter(Boolean),
    [dictionary?.tags],
  );
  // In-memory only, scoped to THIS add-product session. The old global localStorage['productTags']
  // key leaked an abandoned draft's tags onto the next, unrelated new product; dictionary tags
  // already provide cross-session suggestions.
  const [localTags, setLocalTags] = useState<string[]>([]);
  const [editedTags, setEditedTags] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [showAddTagField, setShowAddTagField] = useState(false);

  useEffect(() => {
    if (isAddingProduct) {
      setValue(
        'tags',
        selectedTags.map((tag) => ({ tag })),
        { shouldDirty: true },
      );
    }
  }, [isAddingProduct, selectedTags, setValue]);

  useEffect(() => {
    if (isEditMode && values.tags && values.tags.length > 0) {
      const currentTags =
        values.tags?.map((tag) => tag?.tag).filter((tag): tag is string => tag !== undefined) || [];
      if (JSON.stringify(editedTags) !== JSON.stringify(currentTags)) {
        setEditedTags(currentTags);
        setSelectedTags(currentTags);
      }
    }
  }, [isEditMode]);

  const addTagValue = (raw: string) => {
    const trimmedTag = raw.trim();
    if (trimmedTag === '' || localTags.includes(trimmedTag)) return;
    const newTags = [...localTags, trimmedTag];
    if (isAddingProduct) {
      setLocalTags(newTags);
    }
    if (isEditMode) {
      setEditedTags((prevTags) => [...prevTags, trimmedTag]);
    }
    setSelectedTags((prev) => (prev.includes(trimmedTag) ? prev : [...prev, trimmedTag]));
  };

  const handleAddTag = (e: React.MouseEvent) => {
    e.preventDefault();
    addTagValue(tag);
    setTag('');
  };

  const handleDeleteTag = (tagToDelete: string, e: React.MouseEvent) => {
    e.stopPropagation();
    let updatedTags = [];
    if (isAddingProduct) {
      const newTags = localTags.filter((t) => t !== tagToDelete);
      setLocalTags(newTags);
      updatedTags = newTags;
    }
    if (isEditMode) {
      const updatedEditedTags = editedTags.filter((t) => t !== tagToDelete);
      setEditedTags(updatedEditedTags);
      updatedTags = updatedEditedTags;
    }

    setSelectedTags((prevSelectedTags) => prevSelectedTags.filter((t) => t !== tagToDelete));

    setValue(
      'tags',
      selectedTags.filter((t) => t !== tagToDelete).map((tag) => ({ tag })),
      { shouldDirty: true },
    );
  };

  const handleTagClick = (tag: string) => {
    setSelectedTags((prevSelectedTags) => {
      const updatedSelectedTags = prevSelectedTags.includes(tag)
        ? prevSelectedTags.filter((t) => t !== tag)
        : [...prevSelectedTags, tag];
      return updatedSelectedTags;
    });
  };

  useEffect(() => {
    if (isEditMode) {
      setValue(
        'tags',
        selectedTags.map((tag) => ({ tag })),
        { shouldDirty: true },
      );
    }
  }, [isAddingProduct, isEditMode, selectedTags, setValue]);

  const displayedTags = useMemo(() => {
    return (
      (isAddingProduct && localTags) ||
      (isEditMode && editedTags) ||
      (!isEditMode &&
        values.tags?.map((tag) => tag?.tag).filter((tag): tag is string => tag !== undefined)) ||
      []
    );
  }, [isAddingProduct, localTags, editedTags, isEditMode, values.tags]);

  return (
    <div className='grid items-center gap-2'>
      {isAddingProduct && !showAddTagField && !isEditMode && (
        <Button size='lg' onClick={() => setShowAddTagField(true)}>
          add new tag
        </Button>
      )}
      {(isEditMode || (showAddTagField && isAddingProduct)) && (
        <div className='flex items-center border-b border-textInactiveColor w-full'>
          <div className='flex-1'>
            <Input
              name='product.tags'
              value={tag}
              placeholder='upload new tag'
              label='tags'
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTag(e.target.value)}
              className='w-full border-none leading-4 bg-transparent'
            />
          </div>
          <Button
            size='lg'
            variant='main'
            type='button'
            onClick={(e: React.MouseEvent) => handleAddTag(e)}
            className='flex-shrink-0  ml-2'
          >
            save
          </Button>
        </div>
      )}
      {editMode && dictTagOptions.length > 0 && (
        <div className='flex flex-col gap-1'>
          <Text variant='inactive' size='small'>
            dictionary tags
          </Text>
          <div className='flex flex-wrap gap-1'>
            {dictTagOptions.map((name) => (
              <Button
                key={name}
                type='button'
                size='sm'
                variant='secondary'
                className='lowercase'
                onClick={() => addTagValue(name)}
              >
                + {name}
              </Button>
            ))}
          </div>
        </div>
      )}
      {!isEditMode && !isAddingProduct && <Text variant='uppercase'>list of tags</Text>}
      <div className='grid grid-cols-2 lg:grid-cols-4 gap-1'>
        {displayedTags.map((tag, index) => (
          <div
            key={index}
            className={cn('flex justify-center items-center gap-2 p-2 border border-text group', {
              'border-3': selectedTags.includes(tag || ''),
              'hover:cursor-pointer': isEditMode || isAddingProduct,
            })}
            onClick={() => (isEditMode || isAddingProduct) && handleTagClick(tag || '')}
          >
            <Text>{tag}</Text>
            {(isEditMode || isAddingProduct) && (
              <Button
                type='button'
                className='lg:hidden lg:group-hover:block'
                onClick={(e: React.MouseEvent) => {
                  handleDeleteTag(tag || '', e);
                }}
              >
                <Cross2Icon />
              </Button>
            )}
          </div>
        ))}
      </div>
      {errors.tags && <Text variant='error'>{errors.tags.message}</Text>}
    </div>
  );
}
