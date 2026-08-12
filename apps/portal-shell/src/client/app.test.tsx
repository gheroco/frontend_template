// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { TabLink } from './app.js';

describe('portal navigation component', () => {
  it('exposes accessible tab state and unavailable status without blocking other tabs', () => {
    render(<MemoryRouter><TabLink to="/audit" label="Audit" icon="clipboard" selected unavailable /></MemoryRouter>);
    expect(screen.getByRole('tab', { name: /Audit/i })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTitle('Service unavailable')).toBeInTheDocument();
  });
});

