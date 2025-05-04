import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import DownloadModal from './DownloadModal';

describe('DownloadModal', () => {
  const mockOnClose = jest.fn();
  const mockResumePath = '/test-resume.pdf';
  const mockRecipientEmail = 'test@example.com';
  
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });
  
  test('renders all form fields and elements', () => {
    render(
      <DownloadModal 
        onClose={mockOnClose} 
        resumePath={mockResumePath} 
        recipientEmail={mockRecipientEmail} 
      />
    );
    
    // Check for heading
    expect(screen.getByRole('heading', { name: /download resume/i })).toBeInTheDocument();
    
    // Check for form fields
    expect(screen.getByLabelText(/name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/reason/i)).toBeInTheDocument();
    
    // Check for buttons
    expect(screen.getByRole('button', { name: /download resume/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /×/i })).toBeInTheDocument();
  });
  
  test('closes the modal when the close button is clicked', () => {
    render(
      <DownloadModal 
        onClose={mockOnClose} 
        resumePath={mockResumePath} 
        recipientEmail={mockRecipientEmail} 
      />
    );
    
    const closeButton = screen.getByRole('button', { name: /×/i });
    fireEvent.click(closeButton);
    
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });
  
  test('handles form submission and triggers download in DEV mode', async () => {
    // Mock document.createElement for the download link
    const mockAnchor = {
      href: '',
      download: '',
      click: jest.fn(),
    };
    
    jest.spyOn(document, 'createElement').mockImplementation((tag) => {
      if (tag === 'a') return mockAnchor as unknown as HTMLElement;
      return document.createElement(tag);
    });
    
    jest.spyOn(document.body, 'appendChild').mockImplementation(() => {});
    jest.spyOn(document.body, 'removeChild').mockImplementation(() => {});
    
    render(
      <DownloadModal 
        onClose={mockOnClose} 
        resumePath={mockResumePath} 
        recipientEmail={mockRecipientEmail} 
      />
    );
    
    // Fill out the form
    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: 'Test User' } });
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'user@example.com' } });
    fireEvent.change(screen.getByLabelText(/reason/i), { target: { value: 'Testing the download' } });
    
    // Submit the form
    fireEvent.click(screen.getByRole('button', { name: /download resume/i }));
    
    // Wait for the async operations to complete
    await waitFor(() => {
      // Check if download was triggered
      expect(mockAnchor.click).toHaveBeenCalled();
      // Check if the modal was closed
      expect(mockOnClose).toHaveBeenCalled();
    });
    
    // Verify anchor properties
    expect(mockAnchor.href).toContain(mockResumePath);
    expect(mockAnchor.download).toBe('test-resume.pdf');
  });
  
  test('displays error message when submission fails', async () => {
    // Mock a failed fetch in production mode
    Object.defineProperty(import.meta.env, 'DEV', { value: false });
    
    global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));
    
    render(
      <DownloadModal 
        onClose={mockOnClose} 
        resumePath={mockResumePath} 
        recipientEmail={mockRecipientEmail} 
      />
    );
    
    // Fill out the form
    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: 'Test User' } });
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'user@example.com' } });
    fireEvent.change(screen.getByLabelText(/reason/i), { target: { value: 'Testing error handling' } });
    
    // Submit the form
    fireEvent.click(screen.getByRole('button', { name: /download resume/i }));
    
    // Wait for the error message to appear
    await waitFor(() => {
      expect(screen.getByText(/there was an error processing your request/i)).toBeInTheDocument();
    });
    
    // The modal should not be closed
    expect(mockOnClose).not.toHaveBeenCalled();
    
    // Reset DEV flag
    Object.defineProperty(import.meta.env, 'DEV', { value: true });
  });
  
  test('disables submit button during submission', async () => {
    render(
      <DownloadModal 
        onClose={mockOnClose} 
        resumePath={mockResumePath} 
        recipientEmail={mockRecipientEmail} 
      />
    );
    
    // Fill out the form
    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: 'Test User' } });
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'user@example.com' } });
    fireEvent.change(screen.getByLabelText(/reason/i), { target: { value: 'Testing submission state' } });
    
    const submitButton = screen.getByRole('button', { name: /download resume/i });
    
    // Submit the form
    fireEvent.click(submitButton);
    
    // Check if button is disabled immediately after submission
    expect(submitButton).toBeDisabled();
    expect(submitButton.textContent).toMatch(/processing/i);
  });
});