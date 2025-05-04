// Import Jest DOM matchers
require('@testing-library/jest-dom');

// Mock window.matchMedia for tests
window.matchMedia = (query) => ({
  matches: false,
  media: query,
  onchange: null,
  addListener: jest.fn(),
  removeListener: jest.fn(),
  addEventListener: jest.fn(),
  removeEventListener: jest.fn(),
  dispatchEvent: jest.fn(),
});

// Mock Vite's import.meta.env
jest.mock('../src/components/DownloadModal.tsx', () => {
  return {
    __esModule: true,
    default: jest.requireActual('../src/components/DownloadModal.tsx').default
  };
});

// Setup global environment variables for Vite compatibility
global.process.env.NODE_ENV = 'test';

// Mock console methods to reduce noise in tests
jest.spyOn(console, 'log').mockImplementation(() => {});
jest.spyOn(console, 'warn').mockImplementation(() => {});
jest.spyOn(console, 'error').mockImplementation(() => {});