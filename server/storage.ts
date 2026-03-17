// Minimal storage interface — this app is primarily S3-backed.
// In-memory storage is only used for job status tracking.

export interface JobStatus {
  videoId: string;
  stem: string;
  messageId: string;
  queuedAt: string;
  status: "queued" | "done" | "error";
}

export interface IStorage {
  getJobStatus(videoId: string, stem: string): JobStatus | undefined;
  setJobStatus(job: JobStatus): void;
  listJobs(): JobStatus[];
}

class InMemoryStorage implements IStorage {
  private jobs = new Map<string, JobStatus>();

  private key(videoId: string, stem: string) {
    return `${videoId}:${stem}`;
  }

  getJobStatus(videoId: string, stem: string): JobStatus | undefined {
    return this.jobs.get(this.key(videoId, stem));
  }

  setJobStatus(job: JobStatus): void {
    this.jobs.set(this.key(job.videoId, job.stem), job);
  }

  listJobs(): JobStatus[] {
    return Array.from(this.jobs.values());
  }
}

export const storage = new InMemoryStorage();
