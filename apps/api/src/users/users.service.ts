import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import type { Address } from '@prisma/client';
import { DISTRICTS_BY_PROVINCE } from '@bazaar/shared';
import type {
  AddressInput,
  ChangePasswordInput,
  NepalProvince,
  UpdateProfileInput,
} from '@bazaar/shared';

import { PrismaService } from '../prisma/prisma.service';
import { TokenService } from '../auth/token.service';
import { MailService } from '../notifications/mail.service';
import { PUBLIC_USER_SELECT, toPublicUser } from '../auth/auth.service';
import type { PublicUserView } from '../auth/auth.service';

const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
};

export interface ProfileView extends PublicUserView {
  addresses: Address[];
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
    private readonly mail: MailService,
  ) {}

  /* --- Profile ----------------------------------------------------------- */

  async getProfile(userId: string): Promise<ProfileView> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        addresses: {
          where: { deletedAt: null },
          orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
        },
      },
    });

    if (!user) throw new NotFoundException('Account not found.');

    return { ...toPublicUser(user), addresses: user.addresses };
  }

  async updateProfile(userId: string, dto: UpdateProfileInput): Promise<PublicUserView> {
    const current = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!current) throw new NotFoundException('Account not found.');

    const email = dto.email?.toLowerCase();
    const emailChanged = !!email && email !== current.email;
    const phoneChanged = dto.phone !== undefined && dto.phone !== current.phone;

    if (emailChanged || (phoneChanged && dto.phone)) {
      const clash = await this.prisma.user.findFirst({
        where: {
          id: { not: userId },
          OR: [
            ...(emailChanged && email ? [{ email }] : []),
            ...(phoneChanged && dto.phone ? [{ phone: dto.phone }] : []),
          ],
        },
        select: { email: true },
      });

      if (clash) {
        throw new ConflictException(
          clash.email === email
            ? 'That email is already in use.'
            : 'That phone number is already in use.',
        );
      }
    }

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(dto.fullName !== undefined && { fullName: dto.fullName }),
        ...(dto.avatarUrl !== undefined && { avatarUrl: dto.avatarUrl }),
        ...(email && { email }),
        ...(dto.phone !== undefined && { phone: dto.phone }),
        // Changing either identifier invalidates the verification it carried.
        ...(emailChanged && { emailVerified: false }),
        ...(phoneChanged && { phoneVerified: false }),
      },
    });

    if (emailChanged) {
      // The new address has to prove itself before it can be used to log in.
      await this.mail.sendVerificationEmail(user.email, user.fullName, '').catch(() => undefined);
    }

    return toPublicUser(user);
  }

  async changePassword(userId: string, dto: ChangePasswordInput): Promise<{ message: string }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Account not found.');

    if (!user.passwordHash) {
      throw new BadRequestException(
        'This account signs in with Google or a phone code. Use "forgot password" to set one.',
      );
    }

    const valid = await argon2.verify(user.passwordHash, dto.currentPassword).catch(() => false);
    if (!valid) {
      throw new UnauthorizedException('Your current password is not correct.');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await argon2.hash(dto.newPassword, ARGON2_OPTIONS) },
    });

    // Every other device is logged out; the caller re-authenticates.
    await this.tokens.revokeAllSessions(userId);

    return { message: 'Password changed. Log in again on your other devices.' };
  }

  /* --- Addresses --------------------------------------------------------- */

  async listAddresses(userId: string): Promise<Address[]> {
    return this.prisma.address.findMany({
      where: { userId, deletedAt: null },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });
  }

  async addAddress(userId: string, dto: AddressInput): Promise<Address> {
    assertDistrictInProvince(dto.district, dto.province);

    const existingCount = await this.prisma.address.count({
      where: { userId, deletedAt: null },
    });

    // The first address a user saves is their default whether they asked or not.
    const shouldBeDefault = dto.isDefault || existingCount === 0;

    return this.prisma.$transaction(async (tx) => {
      if (shouldBeDefault) {
        await tx.address.updateMany({ where: { userId }, data: { isDefault: false } });
      }

      return tx.address.create({
        data: { ...dto, userId, isDefault: shouldBeDefault },
      });
    });
  }

  async updateAddress(
    userId: string,
    addressId: string,
    dto: Partial<AddressInput>,
  ): Promise<Address> {
    const existing = await this.findOwnedAddress(userId, addressId);

    const district = dto.district ?? existing.district;
    const province = (dto.province ?? existing.province) as NepalProvince;
    assertDistrictInProvince(district, province);

    return this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) {
        await tx.address.updateMany({ where: { userId }, data: { isDefault: false } });
      }

      return tx.address.update({ where: { id: addressId }, data: dto });
    });
  }

  /**
   * Soft delete: past orders snapshot their address, but keeping the row means
   * an address referenced elsewhere never dangles.
   */
  async removeAddress(userId: string, addressId: string): Promise<{ message: string }> {
    const address = await this.findOwnedAddress(userId, addressId);

    await this.prisma.$transaction(async (tx) => {
      await tx.address.update({
        where: { id: addressId },
        data: { deletedAt: new Date(), isDefault: false },
      });

      if (address.isDefault) {
        // Promote the next oldest so the account is never left without one.
        const next = await tx.address.findFirst({
          where: { userId, deletedAt: null },
          orderBy: { createdAt: 'asc' },
        });

        if (next) {
          await tx.address.update({ where: { id: next.id }, data: { isDefault: true } });
        }
      }
    });

    return { message: 'Address removed.' };
  }

  async setDefaultAddress(userId: string, addressId: string): Promise<Address> {
    await this.findOwnedAddress(userId, addressId);

    return this.prisma.$transaction(async (tx) => {
      await tx.address.updateMany({ where: { userId }, data: { isDefault: false } });
      return tx.address.update({ where: { id: addressId }, data: { isDefault: true } });
    });
  }

  /** Ownership check and existence check in one - never leaks another user's rows. */
  private async findOwnedAddress(userId: string, addressId: string): Promise<Address> {
    const address = await this.prisma.address.findFirst({
      where: { id: addressId, userId, deletedAt: null },
    });

    if (!address) throw new NotFoundException('Address not found.');
    return address;
  }

  /* --- Admin ------------------------------------------------------------- */

  async findById(userId: string): Promise<PublicUserView> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: PUBLIC_USER_SELECT,
    });

    if (!user) throw new NotFoundException('Account not found.');
    return user;
  }
}

/**
 * The Zod schema checks that district and province are each valid; this checks
 * they actually go together, so "Kathmandu, Karnali" is rejected.
 */
function assertDistrictInProvince(district: string, province: string): void {
  const districts = DISTRICTS_BY_PROVINCE[province as NepalProvince];

  if (!districts?.includes(district)) {
    throw new BadRequestException({
      message: 'Validation failed',
      errors: [{ field: 'district', message: `${district} is not a district of ${province}.` }],
    });
  }
}
