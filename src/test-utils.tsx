/* eslint-disable react-refresh/only-export-components */
import { render, type RenderOptions } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import type { ReactElement, ReactNode } from 'react';

const TestProviders = ({ children }: { children: ReactNode }) => (
  <BrowserRouter>{children}</BrowserRouter>
);

export const renderWithProviders = (
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>,
) => render(ui, { wrapper: TestProviders, ...options });
