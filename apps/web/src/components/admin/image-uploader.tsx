'use client';

import * as React from 'react';
import Image from 'next/image';
import {
  Crop as CropIcon,
  GripVertical,
  ImagePlus,
  Link2,
  Loader2,
  Star,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { ApiError, apiFetch } from '@/lib/api';
import { cn } from '@/lib/utils';

export interface ImageDraft {
  url: string;
  altText: string | null;
  isPrimary: boolean;
  sortOrder: number;
}

interface PresignedUpload {
  url: string;
  fields: Record<string, string>;
  publicUrl: string;
}

const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];
const MAX_BYTES = 8 * 1024 * 1024;

/**
 * Product images: drag files in, drag tiles to reorder, crop before uploading.
 *
 * Uploads go straight from the browser to S3 through a presigned POST - the
 * bytes never pass through the API, which is what keeps a 6MB photograph from
 * occupying a Node process for the length of the upload. The API only ever sees
 * the resulting URL.
 *
 * Reordering is HTML5 drag-and-drop rather than a library. The interaction is a
 * list of a dozen tiles in one container with no nesting, no virtualisation and
 * no cross-list moves - the entire problem a drag library exists to solve is
 * absent here, and the native API is a few dozen lines. Keyboard reordering is
 * provided separately by the arrow buttons on each tile, since native drag has
 * no keyboard story at all.
 */
export function ImageUploader({
  images,
  onChange,
}: {
  images: ImageDraft[];
  onChange: (next: ImageDraft[]) => void;
}) {
  const [dragActive, setDragActive] = React.useState(false);
  const [uploading, setUploading] = React.useState(0);
  const [dragIndex, setDragIndex] = React.useState<number | null>(null);
  const [overIndex, setOverIndex] = React.useState<number | null>(null);
  const [cropping, setCropping] = React.useState<File | null>(null);
  const [urlDraft, setUrlDraft] = React.useState('');

  const inputRef = React.useRef<HTMLInputElement>(null);

  /** Re-numbers `sortOrder` and guarantees exactly one primary. */
  const commit = React.useCallback(
    (next: ImageDraft[]) => {
      onChange(
        next.map((image, index) => ({
          ...image,
          sortOrder: index,
          isPrimary: next.some((entry) => entry.isPrimary)
            ? image.isPrimary
            : // Deleting the primary promotes whatever is now first, rather
              // than leaving a product with no primary image at all.
              index === 0,
        })),
      );
    },
    [onChange],
  );

  const addUrl = (url: string) => {
    commit([
      ...images,
      { url, altText: null, isPrimary: images.length === 0, sortOrder: images.length },
    ]);
  };

  /**
   * Uploads one file and appends it.
   *
   * The presign is requested per file rather than in a batch: a signature is
   * valid for five minutes, and a batch signed up front would start expiring
   * while the first large file is still going up.
   */
  const upload = React.useCallback(
    async (file: File) => {
      if (!ACCEPTED.includes(file.type)) {
        toast.error(`${file.name} is not a JPEG, PNG, WebP or AVIF.`);
        return;
      }

      if (file.size > MAX_BYTES) {
        toast.error(`${file.name} is larger than 8MB.`);
        return;
      }

      setUploading((count) => count + 1);

      try {
        const presigned = await apiFetch<PresignedUpload>('/admin/uploads/image', {
          method: 'POST',
          body: { contentType: file.type },
        });

        const form = new FormData();
        // S3 requires every policy field to precede the file field, in order.
        for (const [key, value] of Object.entries(presigned.fields)) {
          form.append(key, value);
        }
        form.append('file', file);

        const response = await fetch(presigned.url, { method: 'POST', body: form });
        if (!response.ok) throw new Error(`S3 responded ${response.status}`);

        addUrl(presigned.publicUrl);
        toast.success(`${file.name} uploaded.`);
      } catch (error) {
        // 503 means S3 is not configured, which is the normal local case -
        // worth saying plainly rather than as a generic failure.
        if (error instanceof ApiError && error.status === 503) {
          toast.error('Uploads are not configured on this server. Paste an image URL instead.');
        } else {
          toast.error(
            `${file.name} could not be uploaded. ${
              error instanceof Error ? error.message : ''
            }`.trim(),
          );
        }
      } finally {
        setUploading((count) => count - 1);
      }
    },
    [images],
  );

  const handleFiles = (files: FileList | null) => {
    if (!files?.length) return;

    const list = [...files];

    // A single file goes through the cropper; several at once skip it, since
    // cropping ten images one dialog at a time is worse than not cropping.
    if (list.length === 1 && list[0]) {
      setCropping(list[0]);
      return;
    }

    for (const file of list) void upload(file);
  };

  /* --- Reordering ------------------------------------------------------- */

  const move = (from: number, to: number) => {
    if (from === to || to < 0 || to >= images.length) return;

    const next = [...images];
    const [moved] = next.splice(from, 1);
    if (moved) next.splice(to, 0, moved);
    commit(next);
  };

  return (
    <div className="space-y-4">
      {/* --- Drop zone ---------------------------------------------------- */}
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragActive(false);
          // Only file drops - a tile being reordered also fires drop here.
          if (event.dataTransfer.files.length > 0) handleFiles(event.dataTransfer.files);
        }}
        className={cn(
          'rounded-lg border-2 border-dashed p-6 text-center transition-colors',
          dragActive ? 'border-primary bg-accent/40' : 'border-border',
        )}
      >
        <ImagePlus className="mx-auto size-6 text-muted-foreground" aria-hidden />

        <p className="mt-2 text-sm font-medium">Drop images here</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          JPEG, PNG, WebP or AVIF, up to 8MB. Drop one to crop it first.
        </p>

        <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => inputRef.current?.click()}
            disabled={uploading > 0}
            className="gap-1.5"
          >
            {uploading > 0 ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Upload className="size-4" aria-hidden />
            )}
            {uploading > 0 ? `Uploading ${uploading}…` : 'Choose files'}
          </Button>

          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED.join(',')}
            multiple
            className="sr-only"
            onChange={(event) => {
              handleFiles(event.target.files);
              // Cleared so choosing the same file twice fires change again.
              event.target.value = '';
            }}
          />
        </div>
      </div>

      {/* --- Paste a URL -------------------------------------------------- */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Link2
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={urlDraft}
            onChange={(event) => setUrlDraft(event.target.value)}
            placeholder="…or paste an image URL"
            aria-label="Image URL"
            className="pl-8"
            onKeyDown={(event) => {
              if (event.key !== 'Enter') return;
              event.preventDefault();
              if (!urlDraft.trim()) return;
              addUrl(urlDraft.trim());
              setUrlDraft('');
            }}
          />
        </div>

        <Button
          type="button"
          variant="outline"
          onClick={() => {
            if (!urlDraft.trim()) return;
            addUrl(urlDraft.trim());
            setUrlDraft('');
          }}
        >
          Add
        </Button>
      </div>

      {/* --- Tiles -------------------------------------------------------- */}
      {images.length === 0 ? (
        <p className="rounded-md border border-dashed border-border py-6 text-center text-sm text-muted-foreground">
          No images yet. The first one becomes the primary.
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {images.map((image, index) => (
            <li
              key={`${image.url}-${index}`}
              draggable
              onDragStart={(event) => {
                setDragIndex(index);
                event.dataTransfer.effectAllowed = 'move';
              }}
              onDragOver={(event) => {
                event.preventDefault();
                setOverIndex(index);
              }}
              onDragEnd={() => {
                setDragIndex(null);
                setOverIndex(null);
              }}
              onDrop={(event) => {
                event.preventDefault();
                event.stopPropagation();
                if (dragIndex !== null) move(dragIndex, index);
                setDragIndex(null);
                setOverIndex(null);
              }}
              className={cn(
                'group relative transition-opacity',
                dragIndex === index && 'opacity-40',
                overIndex === index && dragIndex !== index && 'ring-2 ring-primary ring-offset-2',
              )}
            >
              <div
                className={cn(
                  'relative aspect-square overflow-hidden rounded-md border-2 bg-muted',
                  image.isPrimary ? 'border-primary' : 'border-border',
                )}
              >
                <Image
                  src={image.url}
                  alt={image.altText ?? ''}
                  fill
                  sizes="200px"
                  className="object-cover"
                  // A pasted URL can point anywhere, and a broken remote host
                  // must not blank the tile the operator is trying to remove.
                  unoptimized
                />

                <span
                  className="absolute top-1 left-1 cursor-grab rounded bg-black/50 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100"
                  aria-hidden
                >
                  <GripVertical className="size-3.5" />
                </span>

                {image.isPrimary ? (
                  <span className="absolute top-1 right-1 rounded bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">
                    Primary
                  </span>
                ) : null}
              </div>

              <div className="mt-1.5 flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => move(index, index - 1)}
                  disabled={index === 0}
                  aria-label={`Move image ${index + 1} earlier`}
                  className="rounded px-1 py-0.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
                >
                  ←
                </button>
                <button
                  type="button"
                  onClick={() => move(index, index + 1)}
                  disabled={index === images.length - 1}
                  aria-label={`Move image ${index + 1} later`}
                  className="rounded px-1 py-0.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
                >
                  →
                </button>

                <button
                  type="button"
                  onClick={() =>
                    commit(
                      images.map((entry, position) => ({
                        ...entry,
                        isPrimary: position === index,
                      })),
                    )
                  }
                  aria-label={
                    image.isPrimary ? 'Already the primary image' : `Make image ${index + 1} primary`
                  }
                  disabled={image.isPrimary}
                  className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
                >
                  <Star className={cn('size-3.5', image.isPrimary && 'fill-current')} aria-hidden />
                </button>

                <button
                  type="button"
                  onClick={() => commit(images.filter((_, position) => position !== index))}
                  aria-label={`Remove image ${index + 1}`}
                  className="ml-auto rounded p-1 text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="size-3.5" aria-hidden />
                </button>
              </div>

              <Input
                value={image.altText ?? ''}
                onChange={(event) =>
                  onChange(
                    images.map((entry, position) =>
                      position === index ? { ...entry, altText: event.target.value } : entry,
                    ),
                  )
                }
                placeholder="Alt text"
                aria-label={`Alt text for image ${index + 1}`}
                className="mt-1 h-7 text-xs"
              />
            </li>
          ))}
        </ul>
      )}

      <CropDialog
        file={cropping}
        onCancel={() => setCropping(null)}
        onCropped={(file) => {
          setCropping(null);
          void upload(file);
        }}
        onSkip={(file) => {
          setCropping(null);
          void upload(file);
        }}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Cropper                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * A square crop, drawn to a canvas.
 *
 * Square because that is the aspect the product grid, the cart line and the
 * order row all render at - an operator cropping to their own taste and then
 * seeing it centre-cropped again by CSS is worse than not offering the tool.
 * Zoom and position are the two controls that matter for choosing *which*
 * square; rotation and free aspect are not, so they are not here.
 *
 * The output is re-encoded as WebP at 85%, which typically takes a 4MB phone
 * photograph to a couple of hundred kilobytes before it ever leaves the browser.
 */
function CropDialog({
  file,
  onCancel,
  onCropped,
  onSkip,
}: {
  file: File | null;
  onCancel: () => void;
  onCropped: (file: File) => void;
  onSkip: (file: File) => void;
}) {
  const [zoom, setZoom] = React.useState(1);
  const [offset, setOffset] = React.useState({ x: 0, y: 0 });
  const [source, setSource] = React.useState<string | null>(null);
  const [rendering, setRendering] = React.useState(false);

  const imageRef = React.useRef<HTMLImageElement>(null);
  const dragging = React.useRef<{ x: number; y: number } | null>(null);

  React.useEffect(() => {
    if (!file) {
      setSource(null);
      return;
    }

    const url = URL.createObjectURL(file);
    setSource(url);
    setZoom(1);
    setOffset({ x: 0, y: 0 });

    // Revoked on unmount: an object URL that is never released keeps the whole
    // file alive in memory for the lifetime of the tab.
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const apply = async () => {
    const element = imageRef.current;
    if (!element || !file) return;

    setRendering(true);

    try {
      const SIZE = 1200;
      const canvas = document.createElement('canvas');
      canvas.width = SIZE;
      canvas.height = SIZE;

      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas is unavailable');

      // The preview box is square and the image is `object-contain` inside it,
      // so the scale that maps preview pixels to natural pixels is the same on
      // both axes - which is what makes this arithmetic a single ratio.
      const box = element.getBoundingClientRect();
      const natural = Math.min(element.naturalWidth, element.naturalHeight);
      const visible = natural / zoom;

      const centreX = element.naturalWidth / 2 - (offset.x / box.width) * visible;
      const centreY = element.naturalHeight / 2 - (offset.y / box.height) * visible;

      context.imageSmoothingQuality = 'high';
      context.drawImage(
        element,
        clamp(centreX - visible / 2, 0, element.naturalWidth - visible),
        clamp(centreY - visible / 2, 0, element.naturalHeight - visible),
        visible,
        visible,
        0,
        0,
        SIZE,
        SIZE,
      );

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/webp', 0.85),
      );

      if (!blob) throw new Error('The crop could not be encoded');

      onCropped(
        new File([blob], `${file.name.replace(/\.[^.]+$/, '')}.webp`, { type: 'image/webp' }),
      );
    } catch (error) {
      toast.error(
        `The crop failed, uploading the original instead. ${
          error instanceof Error ? error.message : ''
        }`.trim(),
      );
      onSkip(file);
    } finally {
      setRendering(false);
    }
  };

  return (
    <Dialog open={file !== null} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Crop the image</DialogTitle>
          <DialogDescription>
            Drag to reposition, then choose how much to zoom. Product images are square.
          </DialogDescription>
        </DialogHeader>

        <div
          className="relative aspect-square w-full cursor-move overflow-hidden rounded-md border border-border bg-muted select-none"
          onPointerDown={(event) => {
            dragging.current = { x: event.clientX - offset.x, y: event.clientY - offset.y };
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            if (!dragging.current) return;
            setOffset({
              x: event.clientX - dragging.current.x,
              y: event.clientY - dragging.current.y,
            });
          }}
          onPointerUp={(event) => {
            dragging.current = null;
            event.currentTarget.releasePointerCapture(event.pointerId);
          }}
        >
          {source ? (
            // A plain <img>: this is a local object URL being transformed on a
            // canvas, so next/image's optimiser has nothing to contribute and
            // its wrapper would only complicate the geometry above.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              ref={imageRef}
              src={source}
              alt=""
              draggable={false}
              className="pointer-events-none absolute inset-0 size-full object-contain"
              style={{
                transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
              }}
            />
          ) : null}

          <div
            className="pointer-events-none absolute inset-0 ring-1 ring-white/40 ring-inset"
            aria-hidden
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="crop-zoom">Zoom</Label>
          <Slider
            id="crop-zoom"
            min={1}
            max={3}
            step={0.05}
            value={[zoom]}
            onValueChange={([value]) => setZoom(value ?? 1)}
          />
        </div>

        <DialogFooter className="sm:justify-between">
          <Button type="button" variant="ghost" onClick={onCancel} className="gap-1.5">
            <X className="size-4" aria-hidden />
            Cancel
          </Button>

          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => file && onSkip(file)}
              disabled={rendering}
            >
              Upload as-is
            </Button>
            <Button type="button" onClick={() => void apply()} disabled={rendering} className="gap-1.5">
              {rendering ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <CropIcon className="size-4" aria-hidden />
              )}
              Crop and upload
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}
