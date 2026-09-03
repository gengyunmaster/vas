interface LaunchParams {
  files?: { getFile(): Promise<File> }[];
}

interface LaunchQueue {
  setConsumer(consumer: (params: LaunchParams) => void): void;
}

// File Handling API (Chromium-only): delivers files the OS opened with the
// installed PWA. Absent elsewhere; the app simply never gets such launches.
export function watchLaunchFiles(onFiles: (files: File[]) => void): void {
  const launchQueue = (window as unknown as { launchQueue?: LaunchQueue }).launchQueue;
  if (!launchQueue || typeof launchQueue.setConsumer !== "function") return;
  launchQueue.setConsumer((params) => {
    void (async () => {
      const files = await Promise.all((params.files ?? []).map((handle) => handle.getFile()));
      if (files.length > 0) onFiles(files);
    })();
  });
}
