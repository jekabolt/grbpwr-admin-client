import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { TechCard } from './page';

const useTechCardMock = vi.hoisted(() => vi.fn());

vi.mock('components/managers/tech-cards/components/useTechCardQuery', () => ({
  useTechCard: useTechCardMock,
}));

vi.mock('components/managers/tasks/components/related-tasks', () => ({
  RelatedTasks: () => <div>related-tasks</div>,
}));

vi.mock('./components', () => ({
  TechCardForm: () => <div>editor-present</div>,
}));

vi.mock('./components/useTechCardStaging', () => ({
  TechCardStagingProvider: ({ children }: { children: React.ReactNode }) => children,
}));

function renderPage() {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={['/tech-cards/156']}>
      <Routes>
        <Route path='/tech-cards/:id' element={<TechCard />} />
      </Routes>
    </MemoryRouter>,
  );
}

function queryResult(overrides: Record<string, unknown>) {
  return {
    data: undefined,
    error: null,
    isError: false,
    isFetching: false,
    isLoading: false,
    refetch: vi.fn(),
    ...overrides,
  };
}

describe('TechCard cold read states', () => {
  it('renders a retryable load error for a gateway timeout instead of not found', () => {
    useTechCardMock.mockReturnValue(queryResult({ error: { status: 504 }, isError: true }));

    const markup = renderPage();

    expect(markup).toContain('couldn&#x27;t load this tech card.');
    expect(markup).toContain('retry');
    expect(markup).not.toContain('tech card not found');
  });

  it('keeps the dedicated missing-card state for a real 404', () => {
    useTechCardMock.mockReturnValue(queryResult({ error: { status: 404 }, isError: true }));

    const markup = renderPage();

    expect(markup).toContain('tech card not found');
    expect(markup).not.toContain('couldn&#x27;t load this tech card.');
    expect(markup).not.toContain('retry');
  });

  it('keeps an already loaded editor mounted when a background refetch fails', () => {
    useTechCardMock.mockReturnValue(
      queryResult({ data: { id: 156 }, error: { status: 504 }, isError: true }),
    );

    const markup = renderPage();

    expect(markup).toContain('editor-present');
    expect(markup).not.toContain('couldn&#x27;t load this tech card.');
    expect(markup).not.toContain('tech card not found');
  });
});
