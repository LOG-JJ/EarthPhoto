import chokidar, { type FSWatcher } from 'chokidar';
import debounce from 'lodash.debounce';

const WATCH_GLOB = '**/*.{jpg,jpeg,png,heic,mov,mp4}';

export class FileWatcherService {
  private watcher: FSWatcher | null = null;
  private currentRoot: string | null = null;
  private readonly trigger: ReturnType<typeof debounce>;

  constructor(private readonly onChange: (rootPath: string) => void) {
    this.trigger = debounce(() => {
      if (this.currentRoot) {
        this.onChange(this.currentRoot);
      }
    }, 1500);
  }

  async start(rootPath: string): Promise<void> {
    await this.stop();
    this.currentRoot = rootPath;
    this.watcher = chokidar.watch(WATCH_GLOB, {
      cwd: rootPath,
      ignoreInitial: true,
      depth: 20,
      persistent: true,
      awaitWriteFinish: {
        stabilityThreshold: 1500,
        pollInterval: 100,
      },
    });

    this.watcher.on('add', this.trigger);
    this.watcher.on('change', this.trigger);
    this.watcher.on('unlink', this.trigger);
  }

  async stop(): Promise<void> {
    this.trigger.cancel();
    if (!this.watcher) {
      return;
    }
    await this.watcher.close();
    this.watcher = null;
  }
}
