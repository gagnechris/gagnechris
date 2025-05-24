import { render, screen, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import Resume from './Resume';

describe('Resume Page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });
  
  test('renders the resume page with correct sections', () => {
    render(
      <BrowserRouter>
        <Resume />
      </BrowserRouter>
    );
    
    // Check for main sections
    expect(screen.getByRole('heading', { name: /chris gagne/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /summary/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /core competencies/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /professional experience/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /education/i })).toBeInTheDocument();
    
    // Check for download button
    expect(screen.getByRole('button', { name: /resume/i })).toBeInTheDocument();
  });
  
  test('triggers download when the resume button is clicked', () => {
    render(
      <BrowserRouter>
        <Resume />
      </BrowserRouter>
    );
    
    // Mock DOM methods after render
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
    
    // Click the download button
    fireEvent.click(screen.getByRole('button', { name: /resume/i }));
    
    // Verify download was triggered
    expect(mockAnchor.click).toHaveBeenCalled();
    expect(mockAnchor.href).toBe('/Christopher M Gagne Resume 2025.pdf');
    expect(mockAnchor.download).toBe('Christopher M Gagne Resume 2025.pdf');
  });
});