import { Body, Controller, Get, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  AI_CHAT_GREETING,
  AI_CHAT_QUICK_ACTIONS,
  chatHandoffSchema,
  chatRequestSchema,
} from '@bazaar/shared';
import type { ChatHandoffInput, ChatReply, ChatRequestInput } from '@bazaar/shared';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { OptionalAuth } from '../common/decorators/optional-auth.decorator';
import { Public } from '../common/decorators/public.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { ChatService } from './chat.service';

/**
 * The customer-facing chat widget.
 *
 * @OptionalAuth rather than @Public: the widget is offered to everyone, but a
 * shopper holding a token must be recognised as themselves - that is the whole
 * difference between "I can't look up orders for you" and an answer.
 *
 * Throttled well below the global default. Every message here costs a model
 * call, so the rate limit is a cost control as much as an abuse control.
 */
@OptionalAuth()
@Controller('ai')
export class AiController {
  constructor(private readonly chat: ChatService) {}

  /**
   * What the widget reads before it opens, so it can render its greeting and
   * quick actions - or stay hidden when the server has no API key.
   */
  @Public()
  @Get('chat/config')
  config(): { available: boolean; greeting: string; quickActions: typeof AI_CHAT_QUICK_ACTIONS } {
    return {
      available: this.chat.isAvailable(),
      greeting: AI_CHAT_GREETING,
      quickActions: AI_CHAT_QUICK_ACTIONS,
    };
  }

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('chat')
  send(
    @Body(new ZodValidationPipe(chatRequestSchema)) dto: ChatRequestInput,
    @CurrentUser() user: AuthenticatedUser | undefined,
  ): Promise<ChatReply> {
    return this.chat.reply(dto, user?.id);
  }

  /** The guest half of a handover: collect a reply address, file the ticket. */
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('chat/handoff')
  handoff(
    @Body(new ZodValidationPipe(chatHandoffSchema)) dto: ChatHandoffInput,
  ): Promise<{ contactMessageId: string }> {
    return this.chat.handoff(dto);
  }
}
