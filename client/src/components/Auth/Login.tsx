import { useEffect, useState } from 'react';
import { ErrorTypes, registerPage } from 'librechat-data-provider';
import { OpenIDIcon, useToastContext } from '@librechat/client';
import { useOutletContext, useSearchParams, useLocation } from 'react-router-dom';
import type { TInterfaceExternalLink } from 'librechat-data-provider';
import type { TLoginLayoutContext } from '~/common';
import { ErrorMessage } from '~/components/Auth/ErrorMessage';
import SocialButton from '~/components/Auth/SocialButton';
import { useAuthContext } from '~/hooks/AuthContext';
import { useLocalize, useLocalizedConfig } from '~/hooks';
import { getLoginError, persistRedirectToSession } from '~/utils';
import { getInterfaceExternalLinks } from '~/utils/interfaceLinks';
import LoginForm from './LoginForm';

interface LoginLocationState {
  redirect_to?: string;
}

const defaultBrandingTitle = 'GOPA AI Chatbot';
const defaultBrandingImageUrl = '/assets/chatbot-ui-logo.png';
const defaultBrandingImageAlt = 'GOPA AI Chatbot visual';
const infoGlyph = 'i';
const defaultNoticePrefix = 'I confirm that I have completed the ';
const defaultNoticeMiddle = ' and that I have read and agree with the ';
const defaultNoticeSuffix =
  '. I acknowledge the importance of adhering to these guidelines to maintain the integrity and effectiveness of our GOPA AI Chatbot.';
const defaultNoticeText = `${defaultNoticePrefix}GOPA AI Training${defaultNoticeMiddle}GOPA Group Policy on the Use of Generative AI${defaultNoticeSuffix}`;
const defaultLoginExternalLinks: TInterfaceExternalLink[] = [
  {
    label: {
      en: 'GOPA AI Training',
    },
    url: 'https://gopagroup.sharepoint.com/sites/Academy/SitePages/GOPA-Group-AI-Chatbot.aspx',
    locations: ['login'],
  },
  {
    label: {
      en: 'GOPA Group Policy on the Use of Generative AI',
    },
    url: 'https://gopagroup.sharepoint.com/sites/GOPAGroup-LearningPlatform/SiteAssets/Forms/AllItems.aspx?id=%2Fsites%2FGOPAGroup%2DLearningPlatform%2FSiteAssets%2FSitePages%2FGOPA%2DGroup%2DAI%2DChatbot%2FGOPA%2DGroup%5FPolicy%2Don%2Dthe%2DUse%2Dof%2DGenerative%2DAI%2Epdf&parent=%2Fsites%2FGOPAGroup%2DLearningPlatform%2FSiteAssets%2FSitePages%2FGOPA%2DGroup%2DAI%2DChatbot',
    locations: ['login'],
  },
];

function Login() {
  const localize = useLocalize();
  const getLocalizedValue = useLocalizedConfig();
  const { showToast } = useToastContext();
  const { error, setError, login } = useAuthContext();
  const { startupConfig } = useOutletContext<TLoginLayoutContext>();

  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const disableAutoRedirect = searchParams.get('redirect') === 'false';

  const [isAutoRedirectDisabled, setIsAutoRedirectDisabled] = useState(disableAutoRedirect);

  useEffect(() => {
    const redirectTo = searchParams.get('redirect_to');
    if (redirectTo) {
      persistRedirectToSession(redirectTo);
    } else {
      const state = location.state as LoginLocationState | null;
      if (state?.redirect_to) {
        persistRedirectToSession(state.redirect_to);
      }
    }

    const oauthError = searchParams?.get('error');
    if (oauthError && oauthError === ErrorTypes.AUTH_FAILED) {
      showToast({
        message: localize('com_auth_error_oauth_failed'),
        status: 'error',
      });
      const newParams = new URLSearchParams(searchParams);
      newParams.delete('error');
      setSearchParams(newParams, { replace: true });
    }
  }, [searchParams, setSearchParams, showToast, localize, location.state]);

  useEffect(() => {
    if (disableAutoRedirect) {
      setIsAutoRedirectDisabled(true);
      const newParams = new URLSearchParams(searchParams);
      newParams.delete('redirect');
      setSearchParams(newParams, { replace: true });
    }
  }, [disableAutoRedirect, searchParams, setSearchParams]);

  const shouldAutoRedirect =
    startupConfig?.openidLoginEnabled &&
    startupConfig?.openidAutoRedirect &&
    startupConfig?.serverDomain &&
    !isAutoRedirectDisabled;

  useEffect(() => {
    if (shouldAutoRedirect) {
      console.log('Auto-redirecting to OpenID provider...');
      window.location.href = `${startupConfig.serverDomain}/oauth/openid`;
    }
  }, [shouldAutoRedirect, startupConfig]);

  const authBranding = startupConfig?.interface?.authBranding;
  const brandingImageUrl =
    authBranding?.imageUrl != null && authBranding.imageUrl.trim().length > 0
      ? authBranding.imageUrl
      : defaultBrandingImageUrl;
  const brandingImageAlt =
    authBranding?.imageAlt != null
      ? getLocalizedValue(authBranding.imageAlt, defaultBrandingImageAlt)
      : defaultBrandingImageAlt;
  const noticeText =
    authBranding?.notice?.text != null
      ? getLocalizedValue(authBranding.notice.text, defaultNoticeText)
      : defaultNoticeText;
  const configuredLoginExternalLinks = getInterfaceExternalLinks(startupConfig?.interface, 'login');
  const loginExternalLinks =
    configuredLoginExternalLinks.length > 0
      ? configuredLoginExternalLinks
      : defaultLoginExternalLinks;
  const primaryLoginLink = loginExternalLinks[0];
  const secondaryLoginLink = loginExternalLinks[1];
  const brandingTitle =
    authBranding?.title != null
      ? getLocalizedValue(authBranding.title, defaultBrandingTitle)
      : defaultBrandingTitle;
  const hasBrandedResources = true;
  const useInlineGopaNotice =
    noticeText === defaultNoticeText && primaryLoginLink != null && secondaryLoginLink != null;

  if (shouldAutoRedirect) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-4">
        <p className="text-lg font-semibold">
          {localize('com_ui_redirecting_to_provider', { 0: startupConfig.openidLabel })}
        </p>
        <div className="mt-4">
          <SocialButton
            key="openid"
            enabled={startupConfig.openidLoginEnabled}
            serverDomain={startupConfig.serverDomain}
            oauthPath="openid"
            Icon={() =>
              startupConfig.openidImageUrl ? (
                <img src={startupConfig.openidImageUrl} alt="OpenID Logo" className="h-5 w-5" />
              ) : (
                <OpenIDIcon />
              )
            }
            label={startupConfig.openidLabel}
            id="openid"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col items-center gap-4 text-gray-900 dark:text-white">
      <div className="w-full text-center">
        <h1 className="text-3xl font-semibold">{brandingTitle}</h1>
      </div>
      {brandingImageUrl != null && (
        <div className="w-full overflow-hidden rounded-md border border-gray-200 shadow-sm dark:border-gray-700">
          <img
            src={brandingImageUrl}
            alt={brandingImageAlt}
            className="h-auto w-full object-contain"
          />
        </div>
      )}
      {(noticeText || loginExternalLinks.length > 0) && (
        <section className="w-full rounded-md border border-border-light bg-white px-5 py-4 shadow-sm dark:bg-gray-900/70">
          <div className="flex items-start gap-3">
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full border border-amber-400 bg-amber-50/80 text-amber-500 shadow-[0_0_0_4px_rgba(251,191,36,0.12)] dark:border-amber-500 dark:bg-amber-500/10 dark:text-amber-300">
              <span
                aria-hidden="true"
                className="font-serif text-3xl italic leading-none tracking-tight"
              >
                {infoGlyph}
              </span>
            </div>
            <div className="min-w-0">
              {useInlineGopaNotice ? (
                <p className="text-[15px] leading-9 text-gray-800 dark:text-gray-100">
                  {defaultNoticePrefix}
                  <a
                    className="font-semibold text-amber-500 underline underline-offset-4 transition-colors hover:text-amber-600 dark:text-amber-400 dark:hover:text-amber-300"
                    href={primaryLoginLink.url}
                    target={primaryLoginLink.openNewTab === false ? '_self' : '_blank'}
                    rel={primaryLoginLink.openNewTab === false ? undefined : 'noreferrer'}
                  >
                    {getLocalizedValue(primaryLoginLink.label, primaryLoginLink.url)}
                  </a>
                  {defaultNoticeMiddle}
                  <a
                    className="font-semibold text-amber-500 underline underline-offset-4 transition-colors hover:text-amber-600 dark:text-amber-400 dark:hover:text-amber-300"
                    href={secondaryLoginLink.url}
                    target={secondaryLoginLink.openNewTab === false ? '_self' : '_blank'}
                    rel={secondaryLoginLink.openNewTab === false ? undefined : 'noreferrer'}
                  >
                    {getLocalizedValue(secondaryLoginLink.label, secondaryLoginLink.url)}
                  </a>
                  {defaultNoticeSuffix}
                </p>
              ) : (
                noticeText && (
                  <p className="text-sm leading-relaxed text-gray-800 dark:text-gray-100">
                    {noticeText}
                  </p>
                )
              )}
              {!useInlineGopaNotice && loginExternalLinks.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm">
                  {loginExternalLinks.map((link) => (
                    <a
                      key={`${link.url}-${getLocalizedValue(link.label, link.url)}`}
                      className="font-semibold text-amber-500 underline underline-offset-4 transition-colors hover:text-amber-600 dark:text-amber-400 dark:hover:text-amber-300"
                      href={link.url}
                      target={link.openNewTab === false ? '_self' : '_blank'}
                      rel={link.openNewTab === false ? undefined : 'noreferrer'}
                    >
                      {getLocalizedValue(link.label, link.url)}
                    </a>
                  ))}
                </div>
              )}
              {useInlineGopaNotice && noticeText && loginExternalLinks.length > 2 && (
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm">
                  {loginExternalLinks.slice(2).map((link) => (
                    <a
                      key={`${link.url}-${getLocalizedValue(link.label, link.url)}`}
                      className="font-semibold text-amber-500 underline underline-offset-4 transition-colors hover:text-amber-600 dark:text-amber-400 dark:hover:text-amber-300"
                      href={link.url}
                      target={link.openNewTab === false ? '_self' : '_blank'}
                      rel={link.openNewTab === false ? undefined : 'noreferrer'}
                    >
                      {getLocalizedValue(link.label, link.url)}
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>
      )}
      {error != null && (
        <div className="w-full">
          <ErrorMessage>{localize(getLoginError(error))}</ErrorMessage>
        </div>
      )}
      {startupConfig?.emailLoginEnabled === true && (
        <div className="w-full">
          <LoginForm
            onSubmit={login}
            startupConfig={startupConfig}
            error={error}
            setError={setError}
          />
        </div>
      )}
      {startupConfig?.registrationEnabled === true && (
        <p className="my-4 text-center text-sm font-light text-gray-700 dark:text-white">
          {' '}
          {localize('com_auth_no_account')}{' '}
          <a
            href={registerPage()}
            className={
              hasBrandedResources
                ? 'inline-flex p-1 text-sm font-medium text-amber-600 underline decoration-transparent transition-all duration-200 hover:text-amber-700 hover:decoration-amber-700 focus:text-amber-700 focus:decoration-amber-700 dark:text-amber-400 dark:hover:text-amber-300 dark:hover:decoration-amber-300 dark:focus:text-amber-300 dark:focus:decoration-amber-300'
                : 'inline-flex p-1 text-sm font-medium text-green-600 underline decoration-transparent transition-all duration-200 hover:text-green-700 hover:decoration-green-700 focus:text-green-700 focus:decoration-green-700 dark:text-green-500 dark:hover:text-green-400 dark:hover:decoration-green-400 dark:focus:text-green-400 dark:focus:decoration-green-400'
            }
          >
            {localize('com_auth_sign_up')}
          </a>
        </p>
      )}
    </div>
  );
}

export default Login;
