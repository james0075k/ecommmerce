/**
 * @bazaar/shared - the single source of truth for domain types, validation and
 * constants. Imported by both apps/web (forms, API client) and apps/api
 * (DTO validation), so a schema change breaks the build on both sides at once.
 */
export * from './enums.js';
export * from './constants.js';
export * from './schemas/index.js';
export * from './types/index.js';
