import { inject, Injectable, signal } from '@angular/core';
import { delay, finalize, take, tap } from 'rxjs';
import { DuplicatiServerService } from '../openapi';
import { Subscribed } from '../types/subscribed';

export type BackupRes = Subscribed<ReturnType<DuplicatiServerService['getApiV1Backups']>>;
export type Backup = BackupRes[0];

export type BackupDraftItem = {
  id: string;
  data: BackupDraft;
};

export type BackupDraft = Backup & {
  CreatedByVersion: string;
  DisplayNames: { [key: string]: string };
};

@Injectable({
  providedIn: 'root',
})
export class BackupsState {
  #dupServer = inject(DuplicatiServerService);
  #timestamp: number | null = null;
  #draftBackups = signal<BackupDraftItem[]>([]);
  #backups = signal<BackupRes>([]);
  #backupsLoading = signal(false);
  #startingBackup = signal(false);
  #deletingBackup = signal<string | null>(null);

  backups = this.#backups.asReadonly();
  backupsLoading = this.#backupsLoading.asReadonly();
  startingBackup = this.#startingBackup.asReadonly();
  deletingBackup = this.#deletingBackup.asReadonly();
  draftBackups = this.#draftBackups.asReadonly();

  addDraftBackup(backup: BackupDraft) {
    const backupDraftId = crypto.randomUUID();

    this.#draftBackups.set([
      ...this.#draftBackups(),
      {
        id: backupDraftId,
        data: backup,
      },
    ]);

    return backupDraftId;
  }

  removeDraftBackupById(id: string) {
    this.#draftBackups.set(this.#draftBackups().filter((x) => x.id !== id));
  }

  getBackupById(id: string) {
    return this.#backups().find((x) => x.Backup?.ID === id) ?? null;
  }

  // TODO add cache that can be force refreshed
  getBackups(forceRefresh = false) {
    const timestamp = this.#timestamp;
    const now = Date.now();
    const cacheTimeLimit = timestamp && now - timestamp < 15 * 60 * 1000;
    const preventMultipleRequests = false; //timestamp && now - timestamp < 100;

    if (preventMultipleRequests || (!forceRefresh && cacheTimeLimit && this.#backups().length)) {
      return;
    }

    this.#timestamp = now;
    this.#backupsLoading.set(true);

    this.#dupServer
      .getApiV1Backups()
      .pipe(
        take(1),
        delay(1000),
        tap((res) => this.#backups.set(res)),
        finalize(() => this.#backupsLoading.set(false))
      )
      .subscribe();
  }

  startBackup(id: string) {
    this.#startingBackup.set(true);

    this.#dupServer
      .postApiV1BackupByIdStart({
        id,
      })
      .pipe(
        take(1),
        tap(() => this.getBackups()),
        finalize(() => this.#startingBackup.set(false))
      )
      .subscribe();
  }

  deleteBackup(id: string) {
    this.#deletingBackup.set(id);

    this.#dupServer
      .deleteApiV1BackupById({
        id,
      })
      .pipe(
        take(1),
        tap(() => this.getBackups()),
        finalize(() => this.#deletingBackup.set(null))
      )
      .subscribe();
  }
}
