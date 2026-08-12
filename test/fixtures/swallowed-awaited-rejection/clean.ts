declare function waitForReady(): Promise<void>;
declare function optionalCleanup(): Promise<void>;
declare class StartupError extends Error {}

export async function start(): Promise<void> {
  await waitForReady().catch((error) => {
    throw new StartupError("not ready", { cause: error });
  });
  void optionalCleanup().catch(() => {});
}
