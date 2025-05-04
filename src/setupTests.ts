import '@testing-library/jest-dom';

// Mock window.matchMedia for tests
global.window.matchMedia = (query) => ({
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
// Add it to global first as a workaround
global.import = {
  meta: {
    env: {
      DEV: true,
      PROD: false,
      // Add other environment variables as needed
    }
  }
};