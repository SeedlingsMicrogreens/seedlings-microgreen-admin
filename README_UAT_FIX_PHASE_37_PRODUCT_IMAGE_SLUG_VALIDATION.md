# UAT_FIX_PHASE_37 — Product Image & Slug Validation

## Scope

This phase applies the requested Admin UAT controls to Production Products and Salable Products.

### Salable Product image requirements

Salable Product image upload now enforces:

- Exact dimensions: **1200 × 1200 px**
- Aspect ratio: **1:1**
- Formats: **PNG / JPG / JPEG** (`image/png`, `image/jpeg`)
- Ideal file size: **150–400 KB**
- Up to approximately **700 KB** is recommended
- Files **above 1 MB are rejected**

Dimension validation happens in the browser before Cloudinary upload. File type and size are rejected before upload as well.

The form displays the image requirements before upload so the admin can prepare the correct image.

### Slug input

Production Product and Salable Product slugs are normalized while typing:

- Automatically lowercase
- Allowed characters: `a-z`, `-`, `_`
- Spaces are not allowed
- Other special characters are not allowed
- No separate character-validation error is required because invalid characters are removed from the input

Existing values are also sanitized when saved.

## Files changed

- `app/products/page.tsx`
- `app/sales-products/page.tsx`
- `components/ui/ImageGalleryUploader.tsx`

No Admin business workflow outside these requested controls was intentionally changed.

## Verification

`npm run typecheck` was run. The repository still reports the pre-existing TypeScript error in `lib/growingBatchService.ts` at line 169; no new TypeScript errors were reported from the files changed in this phase.
