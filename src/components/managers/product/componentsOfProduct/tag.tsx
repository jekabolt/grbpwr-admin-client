import React, { FC, useEffect, useState } from 'react';
import { common_ProductNew, common_ProductTagInsert } from 'api/proto-http/admin';
import styles from 'styles/tag.scss';

interface TagProps {
  product: common_ProductNew;
  setProduct: React.Dispatch<React.SetStateAction<common_ProductNew>>;
}

export const Tags: FC<TagProps> = ({ setProduct, product }) => {
  const [tagInput, setTagInput] = useState<string>('');
  const [pendingTags, setPendingTags] = useState<string[]>(() => {
    const storedTags = localStorage.getItem('pendingTags');
    return storedTags ? JSON.parse(storedTags) : [];
  });
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  useEffect(() => {
    localStorage.setItem('pendingTags', JSON.stringify(pendingTags));
  }, [pendingTags]);

  const handleTagInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTagInput(e.target.value);
  };

  const handleAddTag = () => {
    if (tagInput.trim() === '') return;

    if (!pendingTags.includes(tagInput.trim())) {
      setPendingTags((prevTags) => [...prevTags, tagInput.trim()]);
    }
    setTagInput('');
    setProduct((prevProduct) => ({
      ...prevProduct,
      tags: [],
    }));
  };

  const handleTagClick = (tag: string) => {
    const isSelected = selectedTags.includes(tag);
    let updatedProductTags = [...(product.tags || [])];

    if (isSelected) {
      updatedProductTags = updatedProductTags.filter((t) => t.tag !== tag);
    } else {
      const newTag: common_ProductTagInsert = {
        tag: tag,
      };
      updatedProductTags.push(newTag);
    }

    setProduct((prevProduct) => ({
      ...prevProduct,
      tags: updatedProductTags,
    }));

    const updatedSelectedTags = isSelected
      ? selectedTags.filter((selectedTag) => selectedTag !== tag)
      : [...selectedTags, tag];
    setSelectedTags(updatedSelectedTags);
  };

  const handleDeleteTag = (tag: string) => {
    const updatedTags = pendingTags.filter((t) => t !== tag);
    setPendingTags(updatedTags);
  };

  return (
    <div className={styles.tag_wrapper}>
      <h3 className={styles.tag_title}>TAG</h3>
      <div className={styles.tag_container}>
        <input
          className={styles.tag_input}
          type='text'
          name='categoryInput'
          placeholder='create tag'
          value={tagInput}
          onChange={handleTagInputChange}
        />
        <button className={styles.tag_container_btn} type='button' onClick={handleAddTag}>
          Add
        </button>
      </div>
      <div className={styles.select_tag_container}>
        {pendingTags.map((tag, index) => (
          <p
            key={index}
            className={`${styles.tag} ${
              selectedTags.includes(tag) ? styles.selected_tag : styles.tag
            }`}
            onClick={() => handleTagClick(tag)}
          >
            {tag}
            <button type='button' onClick={() => handleDeleteTag(tag)}>
              x
            </button>
          </p>
        ))}
      </div>
    </div>
  );
};
