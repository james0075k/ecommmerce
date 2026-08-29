import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import type { Address } from '@prisma/client';
import {
  addressInputSchema,
  changePasswordSchema,
  updateProfileSchema,
} from '@bazaar/shared';
import type { AddressInput, ChangePasswordInput, UpdateProfileInput } from '@bazaar/shared';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { UploadService } from '../upload/upload.service';
import type { PresignedUpload } from '../upload/upload.service';
import { UsersService } from './users.service';
import type { ProfileView } from './users.service';
import type { PublicUserView } from '../auth/auth.service';

/** Every route here is protected - the global JwtAuthGuard covers the controller. */
@Controller('users')
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly uploads: UploadService,
  ) {}

  /* --- Profile ----------------------------------------------------------- */

  @Get('profile')
  getProfile(@CurrentUser() user: AuthenticatedUser): Promise<ProfileView> {
    return this.users.getProfile(user.id);
  }

  @Patch('profile')
  updateProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(updateProfileSchema)) dto: UpdateProfileInput,
  ): Promise<PublicUserView> {
    return this.users.updateProfile(user.id, dto);
  }

  @Patch('password')
  changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(changePasswordSchema)) dto: ChangePasswordInput,
  ): Promise<{ message: string }> {
    return this.users.changePassword(user.id, dto);
  }

  /**
   * Returns a presigned S3 POST. The browser uploads straight to S3, then PATCHes
   * /users/profile with the returned publicUrl - the file never passes through
   * this server.
   */
  @Post('avatar')
  createAvatarUpload(
    @CurrentUser() user: AuthenticatedUser,
    @Body('contentType') contentType: string,
  ): Promise<PresignedUpload> {
    return this.uploads.createAvatarUpload(user.id, contentType ?? 'image/jpeg');
  }

  /* --- Addresses --------------------------------------------------------- */

  @Get('addresses')
  listAddresses(@CurrentUser() user: AuthenticatedUser): Promise<Address[]> {
    return this.users.listAddresses(user.id);
  }

  @Post('addresses')
  addAddress(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(addressInputSchema)) dto: AddressInput,
  ): Promise<Address> {
    return this.users.addAddress(user.id, dto);
  }

  @Patch('addresses/:id')
  updateAddress(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(addressInputSchema.partial())) dto: Partial<AddressInput>,
  ): Promise<Address> {
    return this.users.updateAddress(user.id, id, dto);
  }

  @Patch('addresses/:id/default')
  setDefaultAddress(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<Address> {
    return this.users.setDefaultAddress(user.id, id);
  }

  @Delete('addresses/:id')
  removeAddress(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ message: string }> {
    return this.users.removeAddress(user.id, id);
  }
}
