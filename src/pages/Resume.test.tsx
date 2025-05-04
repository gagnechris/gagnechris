import { render, screen, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import Resume from './Resume';

// Mock the DownloadModal component
jest.mock('../components/DownloadModal', () => {
  const DownloadModal = ({ onClose }: { onClose: () => void }) => (
    <div data-testid="mock-download-modal">
      <button onClick={onClose}>Close</button>
    </div>
  );
  return DownloadModal;
});

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
    
    // Check for download link
    expect(screen.getByText(/resume/i)).toBeInTheDocument();
  });
  
  test('opens download modal when the resume link is clicked', () => {
    render(
      <BrowserRouter>
        <Resume />
      </BrowserRouter>
    );
    
    // Initially, the modal should not be visible
    expect(screen.queryByTestId('mock-download-modal')).not.toBeInTheDocument();
    
    // Click the download link
    fireEvent.click(screen.getByText(/resume/i));
    
    // Now the modal should be visible
    expect(screen.getByTestId('mock-download-modal')).toBeInTheDocument();
  });
  
  test('closes download modal when the close function is called', () => {
    render(
      <BrowserRouter>
        <Resume />
      </BrowserRouter>
    );
    
    // Open the modal
    fireEvent.click(screen.getByText(/resume/i));
    
    // The modal should be visible
    expect(screen.getByTestId('mock-download-modal')).toBeInTheDocument();
    
    // Click the close button
    fireEvent.click(screen.getByText(/close/i));
    
    // The modal should be gone
    expect(screen.queryByTestId('mock-download-modal')).not.toBeInTheDocument();
  });
});