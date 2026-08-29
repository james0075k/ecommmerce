import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { UploadModule } from '../upload/upload.module';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  // AuthModule supplies TokenService: changing a password revokes every session.
  imports: [AuthModule, UploadModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
