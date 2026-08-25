// СТЕНД ЧЕК-ЛИСТА: настоящий примитив `ui/components/checklist-editor`, настоящая собранная
// css админа (её подкладывает сама проба). Ничего вокруг не подменяется — примитив чистый и
// сети не касается.
import { createRoot } from 'react-dom/client';
import { ChecklistEditor } from '../src/ui/components/checklist-editor';

declare global {
  interface Window {
    __deleted: number[];
  }
}
window.__deleted = [];

createRoot(document.getElementById('root')!).render(
  <div style={{ padding: 40 }}>
    <ChecklistEditor
      label='checklist'
      canWrite
      items={[
        { id: 11, content: 'пришить бирку', isDone: false },
        { id: 12, content: 'отутюжить', isDone: true },
      ]}
      onToggle={() => {}}
      onDelete={(id) => window.__deleted.push(id)}
      onAdd={() => {}}
    />
  </div>,
);
