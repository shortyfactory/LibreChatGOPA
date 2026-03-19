import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import CategoryTabs from '../CategoryTabs';
import type t from 'librechat-data-provider';

jest.mock('@librechat/client', () => ({
  useMediaQuery: jest.fn(() => false),
}));

// Mock useLocalize hook
jest.mock('~/hooks/useLocalize', () => () => (key: string) => {
  const mockTranslations: Record<string, string> = {
    com_agents_top_picks: 'Top Picks',
    com_agents_all: 'All Agents',
    com_agents_all_category: 'All',
    com_ui_no_categories: 'No categories available',
    com_agents_category_tabs_label: 'Agent Categories',
  };
  return mockTranslations[key] || key;
});

describe('CategoryTabs', () => {
  const mockCategories: t.TMarketplaceCategory[] = [
    { value: 'promoted', label: 'Top Picks', description: 'Our recommended agents', count: 5 },
    { value: 'all', label: 'All', description: 'All available agents', count: 20 },
    {
      value: 'general_support',
      label: 'General Support',
      description: 'Agents for broad support tasks',
      count: 8,
    },
    { value: 'hr_talent', label: 'HR & Talent', description: 'HR & Talent agents', count: 3 },
    {
      value: 'finance_administration',
      label: 'Finance & Administration',
      description: 'Finance & Administration agents',
      count: 4,
    },
  ];

  const mockOnChange = jest.fn();
  const user = userEvent.setup();

  beforeEach(() => {
    mockOnChange.mockClear();
  });

  it('renders provided categories', () => {
    render(
      <CategoryTabs
        categories={mockCategories}
        activeTab="promoted"
        isLoading={false}
        onChange={mockOnChange}
      />,
    );

    // Check for provided categories
    expect(screen.getByText('Top Picks')).toBeInTheDocument();
    expect(screen.getByText('All')).toBeInTheDocument();
    expect(screen.getByText('General Support')).toBeInTheDocument();
    expect(screen.getByText('HR & Talent')).toBeInTheDocument();
    expect(screen.getByText('Finance & Administration')).toBeInTheDocument();
  });

  it('handles loading state properly', () => {
    render(
      <CategoryTabs
        categories={[]}
        activeTab="promoted"
        isLoading={true}
        onChange={mockOnChange}
      />,
    );

    // SmartLoader should handle loading behavior correctly
    // The component should render without crashing during loading
    expect(screen.queryByText('No categories available')).not.toBeInTheDocument();
  });

  it('highlights the active tab', () => {
    render(
      <CategoryTabs
        categories={mockCategories}
        activeTab="general_support"
        isLoading={false}
        onChange={mockOnChange}
      />,
    );

    const generalTab = screen.getByText('General Support').closest('button');
    expect(generalTab).toHaveClass('bg-surface-hover');

    // Should have active underline
    const underline = generalTab?.querySelector('.absolute.bottom-0');
    expect(underline).toBeInTheDocument();
  });

  it('calls onChange when a tab is clicked', async () => {
    render(
      <CategoryTabs
        categories={mockCategories}
        activeTab="promoted"
        isLoading={false}
        onChange={mockOnChange}
      />,
    );

    const hrTab = screen.getByText('HR & Talent');
    await user.click(hrTab);

    expect(mockOnChange).toHaveBeenCalledWith('hr_talent');
  });

  it('handles promoted tab click correctly', async () => {
    render(
      <CategoryTabs
        categories={mockCategories}
        activeTab="general_support"
        isLoading={false}
        onChange={mockOnChange}
      />,
    );

    const topPicksTab = screen.getByText('Top Picks');
    await user.click(topPicksTab);

    expect(mockOnChange).toHaveBeenCalledWith('promoted');
  });

  it('handles all tab click correctly', async () => {
    render(
      <CategoryTabs
        categories={mockCategories}
        activeTab="promoted"
        isLoading={false}
        onChange={mockOnChange}
      />,
    );

    const allTab = screen.getByText('All');
    await user.click(allTab);

    expect(mockOnChange).toHaveBeenCalledWith('all');
  });

  it('shows inactive state for non-selected tabs', () => {
    render(
      <CategoryTabs
        categories={mockCategories}
        activeTab="promoted"
        isLoading={false}
        onChange={mockOnChange}
      />,
    );

    const generalTab = screen.getByText('General Support').closest('button');
    expect(generalTab).toHaveClass('bg-surface-secondary');
    expect(generalTab).toHaveClass('text-text-secondary');

    // Should not have active underline
    const underline = generalTab?.querySelector('.absolute.bottom-0');
    expect(underline).not.toBeInTheDocument();
  });

  it('renders with proper accessibility', () => {
    render(
      <CategoryTabs
        categories={mockCategories}
        activeTab="promoted"
        isLoading={false}
        onChange={mockOnChange}
      />,
    );

    const tabs = screen.getAllByRole('tab');
    expect(tabs.length).toBe(5);
    // Verify all tabs are properly clickable buttons
    tabs.forEach((tab) => {
      expect(tab.tagName).toBe('BUTTON');
    });
  });

  it('handles keyboard navigation', async () => {
    render(
      <CategoryTabs
        categories={mockCategories}
        activeTab="promoted"
        isLoading={false}
        onChange={mockOnChange}
      />,
    );

    const generalTab = screen.getByText('General Support').closest('button')!;

    // Focus the button and click it
    generalTab.focus();
    expect(document.activeElement).toBe(generalTab);

    await user.click(generalTab);
    expect(mockOnChange).toHaveBeenCalledWith('general_support');
  });

  it('shows empty state when categories prop is empty', () => {
    render(
      <CategoryTabs
        categories={[]}
        activeTab="promoted"
        isLoading={false}
        onChange={mockOnChange}
      />,
    );

    // Should show empty state message (localized)
    expect(screen.getByText('No categories available')).toBeInTheDocument();
  });

  it('maintains consistent ordering of categories', () => {
    render(
      <CategoryTabs
        categories={mockCategories}
        activeTab="promoted"
        isLoading={false}
        onChange={mockOnChange}
      />,
    );

    const tabs = screen.getAllByRole('tab');
    const tabTexts = tabs.map((tab) => tab.textContent);

    // Check that promoted is first and all is second
    expect(tabTexts[0]).toBe('Top Picks');
    expect(tabTexts[1]).toBe('All');
    expect(tabTexts.length).toBe(5);
  });
});
