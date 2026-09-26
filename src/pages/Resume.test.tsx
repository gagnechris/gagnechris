import { screen, fireEvent } from '@testing-library/react';
import Resume from './Resume';
import { renderWithProviders } from '../test-utils';

describe('Resume Page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders the resume page with correct sections', () => {
    renderWithProviders(<Resume />);

    expect(screen.getByRole('heading', { name: /chris gagne/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /summary/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /core competencies/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /professional experience/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /education/i })).toBeInTheDocument();

    expect(screen.getByRole('button', { name: /resume/i })).toBeInTheDocument();
  });

  test('triggers download when the resume button is clicked', () => {
    renderWithProviders(<Resume />);

    const mockAnchor = {
      href: '',
      download: '',
      click: jest.fn(),
    };

    const originalCreateElement = document.createElement.bind(document);
    jest.spyOn(document, 'createElement').mockImplementation((tag) => {
      if (tag === 'a') return mockAnchor as unknown as HTMLElement;
      return originalCreateElement(tag);
    });

    jest.spyOn(document.body, 'appendChild').mockImplementation(() => mockAnchor as unknown as Node);
    jest.spyOn(document.body, 'removeChild').mockImplementation(() => mockAnchor as unknown as Node);

    fireEvent.click(screen.getByRole('button', { name: /resume/i }));

    expect(mockAnchor.click).toHaveBeenCalled();
    expect(mockAnchor.href).toBe('/Christopher M Gagne Resume 2026.pdf');
    expect(mockAnchor.download).toBe('Christopher M Gagne Resume 2026.pdf');
  });
});
