-- Phase 12.6: Sharp compresses every attached product image and writes the
-- derivative back to S3. `url` then points at the derivative, so the file the
-- admin actually uploaded needs somewhere to live.
--
-- Keeping it is what makes the operation reversible: a re-encode that turns out
-- too aggressive can be redone from the original instead of from a JPEG that
-- has already been through AVIF once.
ALTER TABLE "product_images" ADD COLUMN "original_url" TEXT;
