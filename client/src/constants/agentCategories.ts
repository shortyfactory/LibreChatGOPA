export interface AgentCategory {
  label: string;
  value: string;
}

// The empty category placeholder - used for form defaults
export const EMPTY_AGENT_CATEGORY: AgentCategory = {
  value: '',
  label: 'General Support',
};

const legacyAgentCategoryLabelMap: Record<string, string> = {
  general: 'General Support',
  hr: 'HR & Talent',
  rd: 'Research & Analysis',
  finance: 'Finance & Administration',
  it: 'IT & Digital Tools',
  sales: 'Business Development',
  aftersales: 'Project Management',
};

export const getAgentCategoryFallbackLabel = (value: string) => {
  const mappedValue = legacyAgentCategoryLabelMap[value];
  if (mappedValue) {
    return mappedValue;
  }

  return value
    .split(/[_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
};
