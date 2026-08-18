// Точка входа пробы: НАСТОЯЩАЯ панель и НАСТОЯЩИЙ разбор ответа.
//
// Ничего из проверяемого здесь не переписывается — ни состояния, ни разбор `details`, ни тексты.
// Подменяется ровно одно: `window.fetch`, то есть ответ сервера. Всё остальное — тот же код,
// который поедет на бету.
import { createRoot } from 'react-dom/client';
import { useEffect } from 'react';
import { AiPanel, useNoteAssistant } from 'components/managers/files/note/ai-panel';

function Harness({ text }: { text: string }) {
  const { state, run, cancel, applied, dismiss } = useNoteAssistant();
  useEffect(() => {
    void run({ text, range: null });
  }, [run, text]);
  return (
    <AiPanel
      state={state}
      onCancel={cancel}
      onDismiss={dismiss}
      onAccept={(s) => applied(s.before, s.after, s.scope)}
      onRevert={() => {}}
      onRetry={() => {}}
    />
  );
}

declare global {
  interface Window {
    __mount: (status: number, body: unknown) => void;
  }
}

// Подменяем ответ сервера и монтируем панель. Тело передаётся как есть — проба кладёт в него
// ровно ту форму, что запинена бэкендским тестом (protojson по status.Proto()).
window.__mount = (status: number, body: unknown) => {
  window.fetch = (async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })) as typeof window.fetch;
  const host = document.getElementById('root')!;
  host.innerHTML = '';
  createRoot(host).render(<Harness text='немного текста' />);
};
