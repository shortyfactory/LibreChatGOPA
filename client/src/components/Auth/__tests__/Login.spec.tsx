import reactRouter from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import { getByTestId, render, waitFor } from 'test/layout-test-utils';
import type { TStartupConfig } from 'librechat-data-provider';
import * as endpointQueries from '~/data-provider/Endpoints/queries';
import * as miscDataProvider from '~/data-provider/Misc/queries';
import * as authMutations from '~/data-provider/Auth/mutations';
import * as authQueries from '~/data-provider/Auth/queries';
import AuthLayout from '~/components/Auth/AuthLayout';
import Login from '~/components/Auth/Login';

jest.mock('librechat-data-provider/react-query');
jest.mock('@librechat/client', () => jest.requireActual('test/mocks/librechatClient'));

const mockStartupConfig = {
  isFetching: false,
  isLoading: false,
  isError: false,
  data: {
    appTitle: 'LibreChat',
    socialLogins: ['google', 'facebook', 'openid', 'github', 'discord', 'saml'],
    discordLoginEnabled: true,
    facebookLoginEnabled: true,
    githubLoginEnabled: true,
    googleLoginEnabled: true,
    openidLoginEnabled: true,
    openidLabel: 'Test OpenID',
    openidImageUrl: 'http://test-server.com',
    samlLoginEnabled: true,
    samlLabel: 'Test SAML',
    samlImageUrl: 'http://test-server.com',
    ldap: {
      enabled: false,
    },
    registrationEnabled: true,
    emailLoginEnabled: true,
    socialLoginEnabled: true,
    serverDomain: 'mock-server',
  } as TStartupConfig,
};

const setup = ({
  useGetUserQueryReturnValue = {
    isLoading: false,
    isError: false,
    data: {},
  },
  useLoginUserReturnValue = {
    isLoading: false,
    isError: false,
    mutate: jest.fn(),
    data: {},
    isSuccess: false,
  },
  useRefreshTokenMutationReturnValue = {
    isLoading: false,
    isError: false,
    mutate: jest.fn(),
    data: {
      token: 'mock-token',
      user: {},
    },
  },
  useGetStartupConfigReturnValue = mockStartupConfig,
  useGetBannerQueryReturnValue = {
    isLoading: false,
    isError: false,
    data: {},
  },
} = {}) => {
  const mockUseLoginUser = jest
    .spyOn(authMutations, 'useLoginUserMutation')
    //@ts-ignore - we don't need all parameters of the QueryObserverSuccessResult
    .mockReturnValue(useLoginUserReturnValue);
  const mockUseGetUserQuery = jest
    .spyOn(authQueries, 'useGetUserQuery')
    //@ts-ignore - we don't need all parameters of the QueryObserverSuccessResult
    .mockReturnValue(useGetUserQueryReturnValue);
  const mockUseGetStartupConfig = jest
    .spyOn(endpointQueries, 'useGetStartupConfig')
    //@ts-ignore - we don't need all parameters of the QueryObserverSuccessResult
    .mockReturnValue(useGetStartupConfigReturnValue);
  const mockUseRefreshTokenMutation = jest
    .spyOn(authMutations, 'useRefreshTokenMutation')
    //@ts-ignore - we don't need all parameters of the QueryObserverSuccessResult
    .mockReturnValue(useRefreshTokenMutationReturnValue);
  const mockUseGetBannerQuery = jest
    .spyOn(miscDataProvider, 'useGetBannerQuery')
    //@ts-ignore - we don't need all parameters of the QueryObserverSuccessResult
    .mockReturnValue(useGetBannerQueryReturnValue);
  const mockUseOutletContext = jest.spyOn(reactRouter, 'useOutletContext').mockReturnValue({
    startupConfig: useGetStartupConfigReturnValue.data,
  });
  const renderResult = render(
    <AuthLayout
      startupConfig={useGetStartupConfigReturnValue.data as TStartupConfig}
      isFetching={useGetStartupConfigReturnValue.isFetching}
      error={null}
      startupConfigError={null}
      header={'Welcome back'}
      pathname="login"
    >
      <Login />
    </AuthLayout>,
  );
  return {
    ...renderResult,
    mockUseLoginUser,
    mockUseGetUserQuery,
    mockUseOutletContext,
    mockUseGetStartupConfig,
    mockUseRefreshTokenMutation,
    mockUseGetBannerQuery,
  };
};

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useOutletContext: () => ({
    startupConfig: mockStartupConfig,
  }),
}));

test('renders login form', () => {
  const { getByLabelText, getByRole } = setup();
  expect(getByLabelText(/email/i)).toBeInTheDocument();
  expect(getByLabelText(/password/i)).toBeInTheDocument();
  expect(getByTestId(document.body, 'login-button')).toBeInTheDocument();
  expect(getByRole('link', { name: /Sign up/i })).toBeInTheDocument();
  expect(getByRole('link', { name: /Sign up/i })).toHaveAttribute('href', '/register');
  expect(getByRole('link', { name: /Continue with Google/i })).toBeInTheDocument();
  expect(getByRole('link', { name: /Continue with Google/i })).toHaveAttribute(
    'href',
    'mock-server/oauth/google',
  );
  expect(getByRole('link', { name: /Continue with Facebook/i })).toBeInTheDocument();
  expect(getByRole('link', { name: /Continue with Facebook/i })).toHaveAttribute(
    'href',
    'mock-server/oauth/facebook',
  );
  expect(getByRole('link', { name: /Continue with Github/i })).toBeInTheDocument();
  expect(getByRole('link', { name: /Continue with Github/i })).toHaveAttribute(
    'href',
    'mock-server/oauth/github',
  );
  expect(getByRole('link', { name: /Continue with Discord/i })).toBeInTheDocument();
  expect(getByRole('link', { name: /Continue with Discord/i })).toHaveAttribute(
    'href',
    'mock-server/oauth/discord',
  );
  expect(getByRole('link', { name: /Test SAML/i })).toBeInTheDocument();
  expect(getByRole('link', { name: /Test SAML/i })).toHaveAttribute(
    'href',
    'mock-server/oauth/saml',
  );
});

test('renders fallback GOPA branding and notice when login interface config is missing', () => {
  const { getByRole, getByText } = setup();

  expect(getByRole('heading', { name: 'GOPA AI Chatbot' })).toBeInTheDocument();
  expect(getByRole('img', { name: 'GOPA AI Chatbot visual' })).toHaveAttribute(
    'src',
    '/assets/chatbot-ui-logo.png',
  );
  expect(getByText(/I confirm that I have completed the GOPA AI Training/i)).toBeInTheDocument();
  expect(getByRole('link', { name: 'GOPA AI Training' })).toHaveAttribute(
    'href',
    'https://gopagroup.sharepoint.com/sites/Academy/SitePages/GOPA-Group-AI-Chatbot.aspx',
  );
  expect(
    getByRole('link', { name: 'GOPA Group Policy on the Use of Generative AI' }),
  ).toHaveAttribute(
    'href',
    'https://gopagroup.sharepoint.com/sites/GOPAGroup-LearningPlatform/SiteAssets/Forms/AllItems.aspx?id=%2Fsites%2FGOPAGroup%2DLearningPlatform%2FSiteAssets%2FSitePages%2FGOPA%2DGroup%2DAI%2DChatbot%2FGOPA%2DGroup%5FPolicy%2Don%2Dthe%2DUse%2Dof%2DGenerative%2DAI%2Epdf&parent=%2Fsites%2FGOPAGroup%2DLearningPlatform%2FSiteAssets%2FSitePages%2FGOPA%2DGroup%2DAI%2DChatbot',
  );
});

test('renders fallback GOPA branding for OpenID-only login', () => {
  const { getByRole, queryByLabelText } = setup({
    useGetStartupConfigReturnValue: {
      ...mockStartupConfig,
      data: {
        ...mockStartupConfig.data,
        emailLoginEnabled: false,
        socialLoginEnabled: true,
        registrationEnabled: false,
      },
    },
  });

  expect(queryByLabelText(/email/i)).not.toBeInTheDocument();
  expect(getByRole('heading', { name: 'GOPA AI Chatbot' })).toBeInTheDocument();
  expect(getByRole('img', { name: 'GOPA AI Chatbot visual' })).toHaveAttribute(
    'src',
    '/assets/chatbot-ui-logo.png',
  );
  expect(getByRole('checkbox', { name: /Accept terms and conditions/i })).toBeInTheDocument();
  expect(getByRole('link', { name: /Test OpenID/i })).toHaveAttribute('aria-disabled', 'true');
});

test('renders configured auth branding and login resource links', () => {
  const { getByRole, getByText, queryByRole } = setup({
    useGetStartupConfigReturnValue: {
      ...mockStartupConfig,
      data: {
        ...mockStartupConfig.data,
        appTitle: 'LibreChat',
        interface: {
          authBranding: {
            title: {
              en: 'GOPA AI Chatbot',
            },
            imageUrl: '/assets/chatbot-ui-logo.png',
            imageAlt: {
              en: 'GOPA visual',
            },
            notice: {
              text: {
                en: 'Complete the internal AI training before using the chatbot.',
              },
            },
          },
          externalLinks: [
            {
              label: {
                en: 'AI Training',
              },
              url: 'https://example.com/training',
              locations: ['login'],
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
                en: 'Account only',
              },
              url: 'https://example.com/account',
              locations: ['account'],
            },
          ],
        },
      },
    },
  });

  expect(getByRole('heading', { name: 'GOPA AI Chatbot' })).toBeInTheDocument();
  expect(getByRole('img', { name: 'GOPA visual' })).toHaveAttribute(
    'src',
    '/assets/chatbot-ui-logo.png',
  );
  expect(
    getByText('Complete the internal AI training before using the chatbot.'),
  ).toBeInTheDocument();
  expect(getByRole('link', { name: 'AI Training' })).toHaveAttribute(
    'href',
    'https://example.com/training',
  );
  expect(getByRole('link', { name: 'Policy' })).toHaveAttribute(
    'href',
    'https://example.com/policy',
  );
  expect(queryByRole('link', { name: 'Account only' })).not.toBeInTheDocument();
});

test('calls loginUser.mutate on login', async () => {
  const mutate = jest.fn();
  const { getByLabelText } = setup({
    // @ts-ignore - we don't need all parameters of the QueryObserverResult
    useLoginUserReturnValue: {
      isLoading: false,
      mutate: mutate,
      isError: false,
    },
  });

  const emailInput = getByLabelText(/email/i);
  const passwordInput = getByLabelText(/password/i);
  const submitButton = getByTestId(document.body, 'login-button');

  await userEvent.type(emailInput, 'test@test.com');
  await userEvent.type(passwordInput, 'password');
  await userEvent.click(submitButton);

  waitFor(() => expect(mutate).toHaveBeenCalled());
});

test('Navigates to / on successful login', async () => {
  const { getByLabelText } = setup({
    // @ts-ignore - we don't need all parameters of the QueryObserverResult
    useLoginUserReturnValue: {
      isLoading: false,
      mutate: jest.fn(),
      isError: false,
      isSuccess: true,
    },
    useGetStartupConfigReturnValue: {
      ...mockStartupConfig,
      data: {
        ...mockStartupConfig.data,
        emailLoginEnabled: true,
        registrationEnabled: true,
      },
    },
  });

  const emailInput = getByLabelText(/email/i);
  const passwordInput = getByLabelText(/password/i);
  const submitButton = getByTestId(document.body, 'login-button');

  await userEvent.type(emailInput, 'test@test.com');
  await userEvent.type(passwordInput, 'password');
  await userEvent.click(submitButton);

  await waitFor(() => expect(window.location.pathname).toBe('/'));
});
