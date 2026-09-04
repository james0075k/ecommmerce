import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import type { GenerateDescriptionInput, GeneratedDescription } from '@bazaar/shared';

import { ClaudeService, type JsonSchemaObject } from './claude.service';

/* -------------------------------------------------------------------------- */
/*  The contract Claude writes against                                        */
/* -------------------------------------------------------------------------- */

/**
 * The model returns *fields*, never markup.
 *
 * The description ends up in `dangerouslySetInnerHTML` on the product page, so
 * letting a language model author the HTML would put a generated string on the
 * far side of the store's XSS boundary. Asking for plain prose and assembling
 * the markup here keeps the tag set finite and every value escaped - and it
 * costs nothing, because the structure was always going to be intro, features,
 * benefits, closing.
 */
const copySchema = z.object({
  shortDescription: z.string().min(1).max(500),
  intro: z.string().min(1),
  features: z.array(z.string().min(1)).min(2).max(8),
  benefits: z.array(z.string().min(1)).min(1).max(6),
  closing: z.string().min(1),
});

const responseSchema = z.object({
  english: copySchema,
  nepali: copySchema,
  metaTitle: z.string().min(1).max(70),
  metaDescription: z.string().min(1).max(160),
  keywords: z.array(z.string().min(1)).min(3).max(12),
});

type CopyResponse = z.infer<typeof responseSchema>;

const COPY_PROPERTIES: JsonSchemaObject = {
  type: 'object',
  additionalProperties: false,
  required: ['shortDescription', 'intro', 'features', 'benefits', 'closing'],
  properties: {
    shortDescription: {
      type: 'string',
      description: 'One sentence for the product card. At most 200 characters.',
    },
    intro: {
      type: 'string',
      description: 'An opening paragraph of two or three sentences. Plain prose, no markup.',
    },
    features: {
      type: 'array',
      minItems: 2,
      maxItems: 8,
      items: { type: 'string' },
      description: 'Concrete, checkable product features. One short line each.',
    },
    benefits: {
      type: 'array',
      minItems: 1,
      maxItems: 6,
      items: { type: 'string' },
      description: 'What each feature means for the shopper day to day.',
    },
    closing: {
      type: 'string',
      description: 'A compelling closing line. One or two sentences.',
    },
  },
};

const OUTPUT_SCHEMA: JsonSchemaObject = {
  type: 'object',
  additionalProperties: false,
  required: ['english', 'nepali', 'metaTitle', 'metaDescription', 'keywords'],
  properties: {
    english: COPY_PROPERTIES,
    nepali: {
      ...COPY_PROPERTIES,
      description: 'The same copy in Nepali (Devanagari script), rewritten rather than translated word for word.',
    },
    metaTitle: { type: 'string', description: 'SEO title, at most 60 characters. English.' },
    metaDescription: {
      type: 'string',
      description: 'SEO meta description, at most 155 characters. English.',
    },
    keywords: {
      type: 'array',
      minItems: 3,
      maxItems: 12,
      items: { type: 'string' },
      description: 'Search keywords a Nepali shopper would actually type, English and Nepali mixed.',
    },
  },
};

const TONE_GUIDANCE: Record<GenerateDescriptionInput['tone'], string> = {
  professional: 'Clear, factual and specification-forward. No exclamation marks, no hype.',
  casual: 'Warm and conversational, the way a good shopkeeper talks. Contractions are fine.',
  luxury: 'Restrained and unhurried. Emphasise materials, craft and longevity over price.',
};

const SYSTEM_PROMPT = `You are an ecommerce copywriter for Bazaar, an online store serving Nepal and the wider South Asian market.

Write SEO-optimised product copy that a shopper in Kathmandu, Pokhara or Biratnagar would find useful and trustworthy.

Rules:
- Write for the Nepal/South Asian market. Prices are in Nepali rupees (Rs). Reference local realities where they genuinely help - load-shedding, monsoon, delivery across districts - and never where they do not.
- Cover key features, then what those features mean for the buyer, then a compelling closing line.
- Produce the copy twice: once in English, once in natural Nepali using Devanagari script. The Nepali version is a rewrite for a Nepali reader, not a word-for-word translation, and must not contain untranslated English marketing filler.
- Never invent a specification, certification, warranty, measurement or claim that was not given to you. If a detail is missing, write around it.
- Output plain prose only. No HTML, no Markdown, no bullet characters - the fields are assembled into markup by the caller.`;

/**
 * E1: "Generate with AI" on the product form.
 *
 * The result is a draft, not a save. It comes back to the form, the admin edits
 * it, and only then does it reach the database - which is why nothing here
 * writes to the product.
 */
@Injectable()
export class ProductCopyService {
  constructor(private readonly claude: ClaudeService) {}

  async generateDescription(input: GenerateDescriptionInput): Promise<GeneratedDescription> {
    const copy = await this.claude.json<CopyResponse>({
      system: SYSTEM_PROMPT,
      jsonSchema: OUTPUT_SCHEMA,
      validator: responseSchema,
      maxTokens: 4096,
      messages: [{ role: 'user', content: buildBrief(input) }],
    });

    const english = renderCopy(copy.english);
    const nepali = renderCopy(copy.nepali);

    return {
      english,
      nepali,
      metaTitle: copy.metaTitle.slice(0, 70),
      metaDescription: copy.metaDescription.slice(0, 160),
      keywords: copy.keywords,
      combinedHtml: `${english.descriptionHtml}\n<hr />\n<h3>नेपालीमा</h3>\n${nepali.descriptionHtml}`,
      model: this.claude.modelId(),
    };
  }
}

/* -------------------------------------------------------------------------- */

/** The product details, as a brief a copywriter could actually work from. */
function buildBrief(input: GenerateDescriptionInput): string {
  const lines = [`Product name: ${input.productName}`];

  if (input.category) lines.push(`Category: ${input.category}`);
  if (input.brand) lines.push(`Brand: ${input.brand}`);
  if (input.price !== undefined) lines.push(`Price: Rs ${input.price.toLocaleString('en-IN')}`);
  if (input.tags.length > 0) lines.push(`Tags: ${input.tags.join(', ')}`);

  const attributes = Object.entries(input.attributes)
    .filter(([, value]) => typeof value === 'string' || typeof value === 'number')
    .map(([key, value]) => `  - ${key}: ${String(value)}`);

  if (attributes.length > 0) lines.push('Attributes:', ...attributes);

  lines.push('', `Tone: ${input.tone}. ${TONE_GUIDANCE[input.tone]}`);

  return lines.join('\n');
}

/** Builds the markup the rich-text editor and the product page both render. */
function renderCopy(copy: z.infer<typeof copySchema>): { shortDescription: string; descriptionHtml: string } {
  const sections = [
    `<p>${escapeHtml(copy.intro)}</p>`,
    '<h4>Key features</h4>',
    `<ul>${copy.features.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`,
    '<h4>Why it works for you</h4>',
    `<ul>${copy.benefits.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`,
    `<p>${escapeHtml(copy.closing)}</p>`,
  ];

  return {
    shortDescription: copy.shortDescription.slice(0, 500),
    descriptionHtml: sections.join('\n'),
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
