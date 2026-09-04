import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ContactStatus } from '@prisma/client';
import {
  adminContactQuerySchema,
  contactMessageInputSchema,
  contactReplySchema,
  contactStatusSchema,
  UserRole,
} from '@bazaar/shared';
import type {
  AdminContactMessage,
  AdminContactQueryInput,
  ContactMessageInput,
  ContactReplyInput,
  ContactStatusInput,
  Paginated,
} from '@bazaar/shared';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { ContactsService } from './contacts.service';

/**
 * The public contact form.
 *
 * Five a minute per IP: enough for someone who mistypes their email and sends
 * again, nowhere near enough to fill the queue with junk. The endpoint returns
 * only an id and an acknowledgement - nothing about the submission is echoed
 * back, so it cannot be used to probe what the store already knows.
 */
@Controller('contact')
export class ContactController {
  constructor(private readonly contacts: ContactsService) {}

  @Post()
  @Public()
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  submit(
    @Body(new ZodValidationPipe(contactMessageInputSchema)) dto: ContactMessageInput,
  ): Promise<{ id: string; received: true }> {
    return this.contacts.submit(dto);
  }
}

/** The queue an operator works through. */
@Controller('admin/contacts')
@Roles(UserRole.ADMIN)
export class AdminContactsController {
  constructor(private readonly contacts: ContactsService) {}

  @Get()
  list(
    @Query(new ZodValidationPipe(adminContactQuerySchema)) query: AdminContactQueryInput,
  ): Promise<Paginated<AdminContactMessage>> {
    return this.contacts.list(query);
  }

  /** Declared before `:id` so "counts" is not parsed as a message id. */
  @Get('counts')
  counts(): Promise<Record<ContactStatus, number>> {
    return this.contacts.counts();
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<AdminContactMessage> {
    return this.contacts.findOne(id);
  }

  @Patch(':id/status')
  setStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(contactStatusSchema)) dto: ContactStatusInput,
  ): Promise<AdminContactMessage> {
    return this.contacts.setStatus(id, dto);
  }

  @Post(':id/reply')
  @HttpCode(HttpStatus.OK)
  reply(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(contactReplySchema)) dto: ContactReplyInput,
    @CurrentUser() admin: AuthenticatedUser,
  ): Promise<AdminContactMessage> {
    return this.contacts.reply(id, admin.id, dto);
  }
}
