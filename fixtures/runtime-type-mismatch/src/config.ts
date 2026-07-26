export interface Config {
  retries: number;
  endpoint: URL;
}

export function loadConfig(raw: string): Config {
  return JSON.parse(raw) as Config;
}

export function retryDelay(config: Config): number {
  return config.retries * 1_000;
}
