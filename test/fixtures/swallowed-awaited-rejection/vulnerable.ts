declare function waitForReady(): Promise<void>;
declare function launchAssertions(): void;

export async function startSuite(): Promise<void> {
  await waitForReady().catch(() => {});
  launchAssertions();
}
