import { useCallback, useRef, useState } from 'react';
import Cropper from 'react-easy-crop';
import {
  Camera,
  Check,
  RotateCcw,
  RotateCw,
  Trash2,
  Upload as UploadIcon,
  ZoomIn,
} from 'lucide-react';
import Button from '../../components/ui/Button.jsx';
import Modal from '../../components/ui/Modal.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { formatBytes } from '../../utils/format.js';
import AuthedImage from '../../components/ui/AuthedImage.jsx';

/** "3:4" -> 0.75. Falls back to square when the ratio is absent or malformed. */
function parseRatio(ratio) {
  if (!ratio) return 1;
  const [w, h] = String(ratio).split(':').map(Number);
  return w > 0 && h > 0 ? w / h : 1;
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener('load', () => resolve(image));
    image.addEventListener('error', reject);
    image.src = url;
  });
}

/**
 * Renders the cropped region to a canvas and returns a JPEG blob.
 *
 * Rotation is applied by drawing onto an oversized canvas first, so corners
 * are not clipped, then the crop rectangle is taken from that result.
 */
async function renderCrop(imageSrc, cropPixels, rotation, outputWidth) {
  const image = await loadImage(imageSrc);

  const radians = (rotation * Math.PI) / 180;
  const sin = Math.abs(Math.sin(radians));
  const cos = Math.abs(Math.cos(radians));
  const boxWidth = image.width * cos + image.height * sin;
  const boxHeight = image.width * sin + image.height * cos;

  const stage = document.createElement('canvas');
  stage.width = boxWidth;
  stage.height = boxHeight;
  const stageCtx = stage.getContext('2d');
  stageCtx.translate(boxWidth / 2, boxHeight / 2);
  stageCtx.rotate(radians);
  stageCtx.drawImage(image, -image.width / 2, -image.height / 2);

  const canvas = document.createElement('canvas');
  const scale = outputWidth ? outputWidth / cropPixels.width : 1;
  canvas.width = Math.round(cropPixels.width * scale);
  canvas.height = Math.round(cropPixels.height * scale);

  const ctx = canvas.getContext('2d');
  // White ground: a transparent PNG cropped to JPEG would otherwise go black.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(
    stage,
    cropPixels.x,
    cropPixels.y,
    cropPixels.width,
    cropPixels.height,
    0,
    0,
    canvas.width,
    canvas.height
  );

  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
}

/**
 * Photo / signature field with cropping.
 *
 * The crop is applied in the browser BEFORE upload, so the file that reaches
 * the server is already the right shape for the card. Sending the original and
 * cropping server-side would waste bandwidth on a phone connection and leave
 * the framing decision with someone who cannot see the person.
 */
export default function PhotoUpload({ field, value, onUpload, onRemove, disabled, error }) {
  const toast = useToast();
  const inputRef = useRef(null);

  const [source, setSource] = useState(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [cropPixels, setCropPixels] = useState(null);
  const [busy, setBusy] = useState(false);

  const settings = field.fileSettings || {};
  const aspect = parseRatio(settings.aspectRatio);
  const maxMb = settings.maxSizeMb || 5;

  const onCropComplete = useCallback((_, pixels) => setCropPixels(pixels), []);

  const pick = (file) => {
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Choose an image file.');
      return;
    }
    if (file.size > maxMb * 1024 * 1024) {
      toast.error(`That image is ${formatBytes(file.size)}. The limit is ${maxMb} MB.`);
      return;
    }

    const reader = new FileReader();
    reader.addEventListener('load', () => {
      setSource(reader.result);
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setRotation(0);
    });
    reader.readAsDataURL(file);
  };

  const confirm = async () => {
    if (!cropPixels) return;
    setBusy(true);
    try {
      // Export at twice the required width so the print file has headroom.
      const target = settings.minWidth ? settings.minWidth * 2 : 1200;
      const blob = await renderCrop(source, cropPixels, rotation, target);

      if (settings.minWidth && cropPixels.width < settings.minWidth) {
        toast.warning(
          `This crop is only ${Math.round(cropPixels.width)}px wide. It may look soft when printed.`
        );
      }

      await onUpload(new File([blob], `${field.key}.jpg`, { type: 'image/jpeg' }));
      setSource(null);
    } catch (err) {
      toast.error('Could not process that image. Try another one.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <span className="mb-1.5 block text-sm font-medium text-ink-700">
        {field.label}
        {field.required && <span className="ml-0.5 text-danger-500">*</span>}
      </span>

      {value?.url ? (
        <div className="flex flex-wrap items-center gap-4">
          {/* Stored photos come from the authenticated file route, which a
              plain <img> cannot load - see AuthedImage. */}
          <AuthedImage
            src={value.url}
            alt={field.label}
            className="rounded-lg object-cover ring-1 ring-ink-200"
            style={{
              width: aspect >= 1 ? 132 : 108,
              height: aspect >= 1 ? 132 / aspect : 108 / aspect,
            }}
            fallback={
              <div
                className="animate-pulse rounded-lg bg-ink-100 ring-1 ring-ink-200"
                style={{
                  width: aspect >= 1 ? 132 : 108,
                  height: aspect >= 1 ? 132 / aspect : 108 / aspect,
                }}
              />
            }
          />
          <div className="space-y-2">
            <p className="text-sm text-ink-600">
              {value.width}×{value.height}px · {formatBytes(value.bytes)}
            </p>
            {!disabled && (
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  icon={Camera}
                  onClick={() => inputRef.current?.click()}
                >
                  Replace
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  icon={Trash2}
                  className="text-danger-600 hover:bg-danger-50"
                  onClick={onRemove}
                >
                  Remove
                </Button>
              </div>
            )}
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
          className={
            error
              ? 'flex w-full items-center gap-3 rounded-lg border-2 border-dashed border-danger-300 bg-danger-50 p-4 text-left transition disabled:cursor-not-allowed'
              : 'flex w-full items-center gap-3 rounded-lg border-2 border-dashed border-ink-300 bg-ink-50 p-4 text-left transition hover:border-brand-400 hover:bg-brand-50/40 disabled:cursor-not-allowed disabled:opacity-60'
          }
        >
          <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-white text-ink-400">
            <UploadIcon size={19} aria-hidden="true" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-medium text-ink-700">
              Tap to upload {field.label.toLowerCase()}
            </span>
            <span className="block text-xs text-ink-500">
              {settings.aspectRatio ? `${settings.aspectRatio} ratio · ` : ''}
              {settings.minWidth ? `at least ${settings.minWidth}×${settings.minHeight}px · ` : ''}
              max {maxMb} MB
            </span>
          </span>
        </button>
      )}

      {field.helpText && <p className="mt-1.5 text-xs text-ink-500">{field.helpText}</p>}
      {error && (
        <p role="alert" className="mt-1.5 text-xs font-medium text-danger-600">
          {error}
        </p>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          pick(e.target.files?.[0]);
          // Reset so picking the same file twice still fires a change event.
          e.target.value = '';
        }}
      />

      <Modal
        open={Boolean(source)}
        onClose={() => !busy && setSource(null)}
        title={`Position your ${field.label.toLowerCase()}`}
        description="Drag to move, pinch or use the slider to zoom."
        size="md"
        closeOnOverlay={false}
        footer={
          <>
            <Button variant="secondary" onClick={() => setSource(null)} disabled={busy}>
              Cancel
            </Button>
            <Button icon={Check} onClick={confirm} loading={busy}>
              Use this photo
            </Button>
          </>
        }
      >
        <div className="relative h-72 overflow-hidden rounded-lg bg-ink-900">
          {source && (
            <Cropper
              image={source}
              crop={crop}
              zoom={zoom}
              rotation={rotation}
              aspect={aspect}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onRotationChange={setRotation}
              onCropComplete={onCropComplete}
              showGrid
            />
          )}
        </div>

        <div className="mt-4 space-y-3">
          <label className="flex items-center gap-3">
            <ZoomIn size={16} className="shrink-0 text-ink-400" aria-hidden="true" />
            <input
              type="range"
              min={1}
              max={4}
              step={0.05}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-ink-200 accent-brand-600"
              aria-label="Zoom"
            />
          </label>

          <div className="flex items-center justify-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              icon={RotateCcw}
              onClick={() => setRotation((r) => (r - 90 + 360) % 360)}
            >
              Rotate left
            </Button>
            <Button
              variant="secondary"
              size="sm"
              icon={RotateCw}
              onClick={() => setRotation((r) => (r + 90) % 360)}
            >
              Rotate right
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
