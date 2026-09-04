import { Module } from '@nestjs/common';

import { AdminUploadsController } from './admin-uploads.controller';
import { UploadService } from './upload.service';

@Module({
  controllers: [AdminUploadsController],
  providers: [UploadService],
  exports: [UploadService],
})
export class UploadModule {}
