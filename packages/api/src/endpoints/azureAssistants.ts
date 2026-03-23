export type AzureAssistantsVariantAvailability = {
  enableNewAssistants: boolean;
  enableOldAssistants: boolean;
};

const truthyFlagValues = new Set(['1', 'on', 'true', 'yes']);
const falsyFlagValues = new Set(['0', 'off', 'false', 'no']);

function parseAzureAssistantsVariantFlag(value?: string | null): boolean | null {
  if (value == null) {
    return null;
  }

  const normalizedValue = value.trim().toLowerCase();
  if (normalizedValue.length === 0) {
    return null;
  }

  if (truthyFlagValues.has(normalizedValue)) {
    return true;
  }

  if (falsyFlagValues.has(normalizedValue)) {
    return false;
  }

  return null;
}

export function getAzureAssistantsVariantAvailability(
  env: NodeJS.ProcessEnv = process.env,
): AzureAssistantsVariantAvailability {
  const parsedEnableNewAssistants = parseAzureAssistantsVariantFlag(
    env.ENABLE_AZURE_ASSISTANTS_NEW,
  );
  const parsedEnableOldAssistants = parseAzureAssistantsVariantFlag(
    env.ENABLE_AZURE_ASSISTANTS_OLD,
  );

  return {
    enableNewAssistants: parsedEnableNewAssistants ?? true,
    enableOldAssistants: parsedEnableOldAssistants ?? true,
  };
}
