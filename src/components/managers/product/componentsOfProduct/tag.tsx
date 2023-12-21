import React, { FC, useState, useEffect } from 'react';
import { common_ProductTagInsert, common_ProductNew } from 'api/proto-http/admin';
import styles from 'styles/tag.scss';

interface TagProps {
  updateTags: (tags: common_ProductTagInsert[]) => void;
}

export const Tags: FC<TagProps> = ({ updateTags }) => {
  const [categoryInput, setCategoryInput] = useState<string>('');
  const [tags, setTags] = useState<common_ProductTagInsert[]>([]);

  const addTag = () => {
    if (categoryInput.trim() !== '') {
      const newTag: common_ProductTagInsert = {
        tag: categoryInput,
      };

      const updatedTags = [...tags, newTag];
      setTags(updatedTags);
      setCategoryInput('');
      updateTags(updatedTags); // Notify the parent component about the change
    }
  };

  const deleteTag = (index: number) => {
    const updatedTags = [...tags];
    updatedTags.splice(index, 1);
    setTags(updatedTags);
    updateTags(updatedTags); // Notify the parent component about the change
  };

  return (
    <div className={styles.tag_wrapper}>
      <h3 className={styles.tag_title}>TAG</h3>
      <div className={styles.tag_container}>
        <input
          className={styles.tag_input}
          type='text'
          name='categoryInput'
          value={categoryInput}
          onChange={(e) => setCategoryInput(e.target.value)}
          placeholder='Enter a category'
        />
        <button className={styles.tag_container_btn} type='button' onClick={addTag}>
          OK
        </button>
      </div>
      <ul className={styles.tags_popup}>
        {tags.map((tag, index) => (
          <li key={index} className={styles.tag}>
            <button
              type='button'
              onClick={() => deleteTag(index)}
              className={styles.tag_delete_btn}
            >
              X
            </button>
            {tag.tag}
          </li>
        ))}
      </ul>
    </div>
  );
};
