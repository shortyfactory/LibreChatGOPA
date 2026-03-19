import userEvent from '@testing-library/user-event';
import type { TStartupConfig } from 'librechat-data-provider';
import { render, screen } from 'test/layout-test-utils';
import * as dataProvider from '~/data-provider';
import * as authContext from '~/hooks/AuthContext';
import AccountSettings from '../AccountSettings';

jest.mock('@librechat/client', () => jest.requireActual('test/mocks/librechatClient'));

jest.mock('~/data-provider', () => ({
  ...jest.requireActual('~/data-provider'),
  useGetStartupConfig: jest.fn(),
  useGetUserBalance: jest.fn(),
}));

jest.mock('~/hooks/AuthContext', () => ({
  ...jest.requireActual('~/hooks/AuthContext'),
  useAuthContext: jest.fn(),
}));

describe('AccountSettings', () => {
  const startupConfig: TStartupConfig = {
    appTitle: 'LibreChat',
    socialLogins: [],
    discordLoginEnabled: false,
    facebookLoginEnabled: false,
    githubLoginEnabled: false,
    googleLoginEnabled: false,
    openidLoginEnabled: false,
    appleLoginEnabled: false,
    samlLoginEnabled: false,
    openidLabel: 'Continue with OpenID',
    openidImageUrl: '',
    openidAutoRedirect: false,
    samlLabel: '',
    samlImageUrl: '',
    serverDomain: 'http://localhost:3080',
    emailLoginEnabled: true,
    registrationEnabled: true,
    socialLoginEnabled: false,
    passwordResetEnabled: true,
    emailEnabled: false,
    showBirthdayIcon: false,
    helpAndFaqURL: '/',
    sharedLinksEnabled: false,
    publicSharedLinksEnabled: false,
    instanceProjectId: 'project-id',
    interface: {
      externalLinks: [
        {
          label: {
            en: 'AI Training',
          },
          url: 'https://example.com/training',
          locations: ['account'],
        },
        {
          label: {
            en: 'Policy',
          },
          url: 'https://example.com/policy',
          locations: ['login', 'account'],
        },
        {
          label: {
            en: 'Login only',
          },
          url: 'https://example.com/login-only',
          locations: ['login'],
        },
      ],
    },
  };

  const mockUseGetStartupConfig = jest.spyOn(dataProvider, 'useGetStartupConfig');
  const mockUseGetUserBalance = jest.spyOn(dataProvider, 'useGetUserBalance');
  const mockUseAuthContext = jest.spyOn(authContext, 'useAuthContext');

  beforeEach(() => {
    mockUseGetStartupConfig.mockReturnValue({
      data: startupConfig,
    } as unknown as ReturnType<typeof dataProvider.useGetStartupConfig>);
    mockUseGetUserBalance.mockReturnValue({
      data: null,
    } as unknown as ReturnType<typeof dataProvider.useGetUserBalance>);
    mockUseAuthContext.mockReturnValue({
      user: {
        id: 'user-id',
        username: 'demo',
        email: 'demo@example.com',
        name: 'Demo User',
        avatar: '',
        role: 'USER',
        provider: 'local',
        createdAt: '',
        updatedAt: '',
      },
      isAuthenticated: true,
      logout: jest.fn(),
    } as unknown as ReturnType<typeof authContext.useAuthContext>);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should render configured account links and open them in a new tab', async () => {
    const openSpy = jest.spyOn(window, 'open').mockImplementation(() => null);

    render(<AccountSettings />);
    await userEvent.click(screen.getByTestId('nav-user'));

    const trainingLink = await screen.findByText('AI Training');
    const policyLink = await screen.findByText('Policy');

    expect(trainingLink).toBeInTheDocument();
    expect(policyLink).toBeInTheDocument();
    expect(screen.queryByText('Login only')).not.toBeInTheDocument();

    await userEvent.click(trainingLink);
    expect(openSpy).toHaveBeenCalledWith('https://example.com/training', '_blank');
  });
});
