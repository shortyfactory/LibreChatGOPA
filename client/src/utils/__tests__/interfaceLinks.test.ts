import type { TInterfaceConfig } from 'librechat-data-provider';
import { getInterfaceExternalLinks } from '../interfaceLinks';

describe('getInterfaceExternalLinks', () => {
  it('should return all links when no locations are provided', () => {
    const interfaceConfig: TInterfaceConfig = {
      externalLinks: [
        {
          label: 'Shared link',
          url: 'https://example.com/shared',
        },
      ],
    };

    expect(getInterfaceExternalLinks(interfaceConfig, 'login')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          url: 'https://example.com/shared',
        }),
      ]),
    );
    expect(getInterfaceExternalLinks(interfaceConfig, 'account')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          url: 'https://example.com/shared',
        }),
      ]),
    );
  });

  it('should filter links by requested location', () => {
    const interfaceConfig: TInterfaceConfig = {
      externalLinks: [
        {
          label: 'Login link',
          url: 'https://example.com/login',
          locations: ['login'],
        },
        {
          label: 'Account link',
          url: 'https://example.com/account',
          locations: ['account'],
        },
      ],
    };

    expect(getInterfaceExternalLinks(interfaceConfig, 'login')).toEqual([
      expect.objectContaining({
        url: 'https://example.com/login',
      }),
    ]);
    expect(getInterfaceExternalLinks(interfaceConfig, 'account')).toEqual([
      expect.objectContaining({
        url: 'https://example.com/account',
      }),
    ]);
  });
});
