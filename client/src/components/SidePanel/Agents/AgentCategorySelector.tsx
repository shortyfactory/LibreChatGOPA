import React, { memo, useState } from 'react';
import { ControlCombobox } from '@librechat/client';
import {
  useWatch,
  FieldPath,
  Controller,
  FieldValues,
  useFormContext,
  ControllerRenderProps,
} from 'react-hook-form';
import { TranslationKeys, useLocalize, useAgentCategories } from '~/hooks';
import { getAgentCategoryFallbackLabel } from '~/constants/agentCategories';
import { cn } from '~/utils';

const DEFAULT_AGENT_CATEGORY = 'general_support';

/**
 * Custom hook to handle category synchronization
 */
const useCategorySync = (agent_id: string | null) => {
  const [handled, setHandled] = useState(false);

  return {
    syncCategory: <T extends FieldPath<FieldValues>>(
      field: ControllerRenderProps<FieldValues, T>,
    ) => {
      // Only run once and only for new agents
      if (!handled && agent_id === '' && !field.value) {
        field.onChange(DEFAULT_AGENT_CATEGORY);
        setHandled(true);
      }
    },
  };
};

/**
 * A component for selecting agent categories with form validation
 */
const AgentCategorySelector: React.FC<{ className?: string }> = ({ className }) => {
  const localize = useLocalize();
  const formContext = useFormContext();
  const { categories } = useAgentCategories();

  const agent_id = useWatch({
    name: 'id',
    control: formContext.control,
  });

  const { syncCategory } = useCategorySync(agent_id);
  const getCategoryLabel = (category: { label: string; value: string }) => {
    if (category.label && category.label.startsWith('com_')) {
      return localize(category.label as TranslationKeys);
    }
    return category.label;
  };

  const comboboxItems = categories.map((category) => ({
    label: getCategoryLabel(category),
    value: category.value,
  }));

  const getCategoryDisplayValue = (
    value: string,
    items: Array<{
      label: string;
      value: string;
    }>,
  ) => {
    const categoryItem = items.find((c) => c.value === value);
    return categoryItem?.label || items.find((c) => c.value === DEFAULT_AGENT_CATEGORY)?.label;
  };

  const searchPlaceholder = localize('com_ui_search_agent_category');
  const ariaLabel = localize('com_ui_agent_category_selector_aria');

  return (
    <Controller
      name="category"
      control={formContext.control}
      defaultValue={DEFAULT_AGENT_CATEGORY}
      render={({ field }) => {
        // Sync category if needed (without using useEffect in render)
        syncCategory(field);

        const fallbackCategory =
          field.value && !comboboxItems.some((category) => category.value === field.value)
            ? {
                value: field.value,
                label: getAgentCategoryFallbackLabel(field.value),
              }
            : null;

        const items = fallbackCategory ? [...comboboxItems, fallbackCategory] : comboboxItems;
        const displayValue = getCategoryDisplayValue(field.value, items);

        return (
          <ControlCombobox
            selectedValue={field.value}
            displayValue={displayValue}
            searchPlaceholder={searchPlaceholder}
            setValue={(value) => {
              field.onChange(value);
            }}
            items={items}
            className={cn(className)}
            ariaLabel={ariaLabel}
            isCollapsed={false}
            showCarat={true}
          />
        );
      }}
    />
  );
};

const MemoizedAgentCategorySelector = memo(
  AgentCategorySelector,
  (prevProps, nextProps) => prevProps.className === nextProps.className,
);
MemoizedAgentCategorySelector.displayName = 'AgentCategorySelector';

export default MemoizedAgentCategorySelector;
