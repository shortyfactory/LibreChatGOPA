import { getAzureAssistantsVariantAvailability } from './azureAssistants';

describe('getAzureAssistantsVariantAvailability', () => {
  it('enables both Azure Assistants variants by default', () => {
    expect(getAzureAssistantsVariantAvailability({})).toEqual({
      enableNewAssistants: true,
      enableOldAssistants: true,
    });
  });

  it('disables Azure Assistants New when the env flag is false-like', () => {
    expect(
      getAzureAssistantsVariantAvailability({
        ENABLE_AZURE_ASSISTANTS_NEW: 'false',
      }),
    ).toEqual({
      enableNewAssistants: false,
      enableOldAssistants: true,
    });
  });

  it('disables Azure Assistants Old when the env flag is false-like', () => {
    expect(
      getAzureAssistantsVariantAvailability({
        ENABLE_AZURE_ASSISTANTS_OLD: '0',
      }),
    ).toEqual({
      enableNewAssistants: true,
      enableOldAssistants: false,
    });
  });

  it('accepts truthy aliases for both flags', () => {
    expect(
      getAzureAssistantsVariantAvailability({
        ENABLE_AZURE_ASSISTANTS_NEW: 'yes',
        ENABLE_AZURE_ASSISTANTS_OLD: 'on',
      }),
    ).toEqual({
      enableNewAssistants: true,
      enableOldAssistants: true,
    });
  });

  it('falls back to enabled when a flag contains an unsupported value', () => {
    expect(
      getAzureAssistantsVariantAvailability({
        ENABLE_AZURE_ASSISTANTS_NEW: 'maybe',
      }),
    ).toEqual({
      enableNewAssistants: true,
      enableOldAssistants: true,
    });
  });
});
