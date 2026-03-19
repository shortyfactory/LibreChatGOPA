import type {
  TInterfaceConfig,
  TInterfaceExternalLink,
  TInterfaceExternalLinkLocation,
} from 'librechat-data-provider';

export function getInterfaceExternalLinks(
  interfaceConfig: TInterfaceConfig | null | undefined,
  location: TInterfaceExternalLinkLocation,
): TInterfaceExternalLink[] {
  const externalLinks = interfaceConfig?.externalLinks ?? [];

  return externalLinks.filter(
    ({ locations }) => locations == null || locations.length === 0 || locations.includes(location),
  );
}
