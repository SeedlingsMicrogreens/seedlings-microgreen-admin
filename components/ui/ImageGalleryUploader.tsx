"use client";

import { useEffect, useRef, useState } from "react";
import { uploadToCloudinary } from "@/lib/cloudinary";

type Props = {
  value: string[];
  onChange: (urls: string[]) => void;
  label?: string;
  validation?: {
    exactWidth: number;
    exactHeight: number;
    maxBytes: number;
    allowedTypes: string[];
  };
  guidance?: React.ReactNode;
};

type Pending = { id: string; file: File; preview: string; busy: boolean; error: string };

export function ImageGalleryUploader({
  value,
  onChange,
  label = "Product Images",
  validation,
  guidance,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<Pending[]>([]);

  useEffect(() => () => pending.forEach((p) => URL.revokeObjectURL(p.preview)), [pending]);

  function choose(files: FileList | null) {
    if (!files?.length) return;
    const additions: Pending[] = [];
    Array.from(files).forEach((file) => {
      if (!file.type.startsWith("image/")) return;
      if (validation) {
        if (!validation.allowedTypes.includes(file.type)) {
          additions.push({
            id: `${Date.now()}-${Math.random()}`,
            file,
            preview: URL.createObjectURL(file),
            busy: false,
            error: "Unsupported image format. Please use PNG, JPG or JPEG.",
          });
          return;
        }
        if (file.size > validation.maxBytes) {
          additions.push({
            id: `${Date.now()}-${Math.random()}`,
            file,
            preview: URL.createObjectURL(file),
            busy: false,
            error: `Image is too large. Maximum accepted size is ${Math.round(validation.maxBytes / 1024)} KB.`,
          });
          return;
        }
      }
      additions.push({
        id: `${Date.now()}-${Math.random()}`,
        file,
        preview: URL.createObjectURL(file),
        busy: false,
        error: "",
      });
    });
    setPending((current) => [...current, ...additions]);
  }

  function validateDimensions(file: File): Promise<string | null> {
    if (!validation) return Promise.resolve(null);
    return new Promise((resolve) => {
      const url = URL.createObjectURL(file);
      const image = new Image();
      image.onload = () => {
        URL.revokeObjectURL(url);
        if (image.width !== validation.exactWidth || image.height !== validation.exactHeight) {
          resolve(`Image must be exactly ${validation.exactWidth} × ${validation.exactHeight} px (1:1).`);
          return;
        }
        resolve(null);
      };
      image.onerror = () => {
        URL.revokeObjectURL(url);
        resolve("Unable to read the image dimensions. Please choose a valid image file.");
      };
      image.src = url;
    });
  }

  async function uploadOne(id: string) {
    const item = pending.find((p) => p.id === id);
    if (!item) return;
    if (item.error) return;
    setPending((current) => current.map((p) => p.id === id ? { ...p, busy: true, error: "" } : p));
    try {
      const dimensionError = await validateDimensions(item.file);
      if (dimensionError) {
        setPending((current) => current.map((p) => p.id === id ? { ...p, busy: false, error: dimensionError } : p));
        return;
      }
      const url = await uploadToCloudinary(item.file);
      onChange([...value, url]);
      URL.revokeObjectURL(item.preview);
      setPending((current) => current.filter((p) => p.id !== id));
    } catch (e) {
      setPending((current) => current.map((p) => p.id === id ? { ...p, busy: false, error: e instanceof Error ? e.message : "Upload failed." } : p));
    }
  }

  function removeExisting(index: number) {
    onChange(value.filter((_, i) => i !== index));
  }

  function cancelPending(id: string) {
    const item = pending.find((p) => p.id === id);
    if (item) URL.revokeObjectURL(item.preview);
    setPending((current) => current.filter((p) => p.id !== id));
  }

  return (
    <div className="mb-3">
      <label className="form-label">{label}</label>
      {guidance && <div className="alert alert-info py-2 mb-3 small">{guidance}</div>}
      {(value.length > 0 || pending.length > 0) && (
        <div className="row g-2 mb-2">
          {value.map((url, index) => (
            <div className="col-6 col-md-4" key={`${url}-${index}`}>
              <div className="border rounded p-2 h-100">
                <img src={url} alt={`Product image ${index + 1}`} style={{ width: "100%", height: 130, objectFit: "contain" }} />
                <button type="button" className="btn btn-outline-danger btn-sm w-100 mt-2" onClick={() => removeExisting(index)}>Remove</button>
              </div>
            </div>
          ))}
          {pending.map((item) => (
            <div className="col-6 col-md-4" key={item.id}>
              <div className="border rounded p-2 h-100">
                <img src={item.preview} alt="Selected image preview" style={{ width: "100%", height: 130, objectFit: "contain" }} />
                <div className="small text-muted mt-1">Preview — not uploaded</div>
                <div className="d-flex gap-1 mt-2">
                  <button type="button" className="btn btn-success btn-sm flex-fill" disabled={item.busy || Boolean(item.error)} onClick={() => void uploadOne(item.id)}>{item.busy ? "Uploading…" : "Upload"}</button>
                  <button type="button" className="btn btn-outline-danger btn-sm" disabled={item.busy} onClick={() => cancelPending(item.id)}>Cancel</button>
                </div>
                {item.error && <div className="text-danger small mt-1">{item.error}</div>}
              </div>
            </div>
          ))}
        </div>
      )}
      <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => inputRef.current?.click()}>Choose Images</button>
      <input ref={inputRef} type="file" accept="image/*" multiple className="d-none" onChange={(e) => { choose(e.target.files); e.currentTarget.value = ""; }} />
    </div>
  );
}
