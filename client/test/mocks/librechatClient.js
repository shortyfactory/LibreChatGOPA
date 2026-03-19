const React = require('react');

const GenericComponent = React.forwardRef(function GenericComponent(props, ref) {
  const { children, ...rest } = props;
  return React.createElement('div', { ref, ...rest }, children);
});

const IconComponent = React.forwardRef(function IconComponent(props, ref) {
  return React.createElement('svg', { ref, ...props });
});

const Button = React.forwardRef(function Button(props, ref) {
  const { children, ...rest } = props;
  return React.createElement('button', { ref, ...rest }, children);
});

const ThemeContext = React.createContext({
  theme: 'light',
});

const exportsMap = {
  __esModule: true,
  ThemeContext,
  ThemeSelector: GenericComponent,
  Spinner: () => React.createElement('span', null, 'spinner'),
  Button,
  Avatar: ({ user, ...props }) =>
    React.createElement('div', { ...props }, user?.name ?? user?.username ?? 'avatar'),
  DropdownMenuSeparator: () => React.createElement('hr'),
  OpenIDIcon: IconComponent,
  LinkIcon: IconComponent,
  GearIcon: IconComponent,
  GoogleIcon: IconComponent,
  FacebookIcon: IconComponent,
  GithubIcon: IconComponent,
  DiscordIcon: IconComponent,
  AppleIcon: IconComponent,
  SamlIcon: IconComponent,
  TextPaths: IconComponent,
  FilePaths: IconComponent,
  CodePaths: IconComponent,
  AudioPaths: IconComponent,
  VideoPaths: IconComponent,
  SheetPaths: IconComponent,
  useToastContext: () => ({
    showToast: jest.fn(),
  }),
  useMediaQuery: () => false,
  useOnClickOutside: jest.fn(),
  useCombobox: () => ({}),
  useMultiSearch: () => ({}),
  applyFontSize: jest.fn(),
  buttonVariants: () => '',
  cn: (...classes) => classes.filter(Boolean).join(' '),
  isDark: () => false,
};

module.exports = new Proxy(exportsMap, {
  get(target, prop) {
    if (prop in target) {
      return target[prop];
    }

    return GenericComponent;
  },
});
