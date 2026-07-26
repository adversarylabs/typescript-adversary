export interface Job {
  id: string;
}

export async function processJobs(
  jobs: Job[],
  process: (job: Job) => Promise<void>,
): Promise<void> {
  jobs.forEach(async (job) => {
    await process(job);
  });
}
