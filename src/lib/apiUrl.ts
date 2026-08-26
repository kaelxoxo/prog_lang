type ApiPlatform = 'android' | 'ios' | 'macos' | 'web' | 'windows';

type ResolveApiUrlOptions = {
  configuredUrl?: string;
  developmentHostUri?: string | null;
  isDevelopment: boolean;
  platform: ApiPlatform;
};

const API_PORT = 4000;

function withoutTrailingSlash(value: string) {
  return value.replace(/\/$/, '');
}

function developmentHost(hostUri?: string | null) {
  if (!hostUri) {
    return null;
  }

  try {
    const uri = /^[a-z][a-z\d+.-]*:\/\//i.test(hostUri) ? hostUri : `http://${hostUri}`;
    const hostname = new URL(uri).hostname;

    if (!hostname) {
      return null;
    }

    return hostname.includes(':') && !hostname.startsWith('[') ? `[${hostname}]` : hostname;
  } catch {
    return null;
  }
}

export function resolveApiUrl({
  configuredUrl,
  developmentHostUri,
  isDevelopment,
  platform,
}: ResolveApiUrlOptions) {
  const configured = configuredUrl?.trim();

  if (configured && configured.toLowerCase() !== 'auto') {
    return withoutTrailingSlash(configured);
  }

  if (isDevelopment) {
    const host = developmentHost(developmentHostUri);

    if (host) {
      return `http://${host}:${API_PORT}`;
    }
  }

  if (platform === 'android') {
    return `http://10.0.2.2:${API_PORT}`;
  }

  return `http://127.0.0.1:${API_PORT}`;
}
