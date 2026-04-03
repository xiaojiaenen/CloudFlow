import { Global, Module } from '@nestjs/common';
import { TaskArtifactCleanupService } from './task-artifact-cleanup.service';
import { TaskArtifactStorageService } from './task-artifact-storage.service';

@Global()
@Module({
  providers: [TaskArtifactStorageService, TaskArtifactCleanupService],
  exports: [TaskArtifactStorageService],
})
export class StorageModule {}
