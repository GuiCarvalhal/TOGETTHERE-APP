import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { drawScale, validatePhotoFile } from '@/lib/photoCrop';
import { useI18n } from '@/lib/i18n';
import { useToast } from '@/components/ui/use-toast';
import { ZoomIn, RotateCw, RotateCcw, Check, Loader2 } from 'lucide-react';

// Square avatar editor: zoom + 90°-step rotation with a WYSIWYG canvas
// preview. The canvas IS the source of truth — on confirm we export it as a
// JPEG blob, so what the user sees is exactly what gets uploaded. The draw
// scale is always >= the minimum cover scale (zoom clamped to >= 1), so the
// crop never produces empty borders at any rotation. Cancel preserves the
// previous photo with no upload. Object URLs are released on unmount.
const CANVAS_SIZE = 400; // output resolution — square avatar

export default function PhotoCropEditor({ file, onConfirm, onCancel }) {
  const { t } = useI18n();
  const { toast } = useToast();
  const [img, setImg] = useState(null);
  const [zoom, setZoom] = useState(1); // multiplier on minCoverScale (>= 1)
  const [rotation, setRotation] = useState(0);
  const [loading, setLoading] = useState(true);
  const [errorKey, setErrorKey] = useState('');
  const [exporting, setExporting] = useState(false);
  const canvasRef = useRef(null);
  const objectUrlRef = useRef(null);

  // Load the selected file into an Image; release the object URL on unmount.
  useEffect(() => {
    const err = validatePhotoFile(file);
    if (err) { setErrorKey(err); setLoading(false); return; }
    const url = URL.createObjectURL(file);
    objectUrlRef.current = url;
    const image = new Image();
    image.onload = () => { setImg(image); setLoading(false); };
    image.onerror = () => { setErrorKey('invalid_type'); setLoading(false); };
    image.src = url;
    return () => {
      if (objectUrlRef.current) { URL.revokeObjectURL(objectUrlRef.current); objectUrlRef.current = null; }
    };
  }, [file]);

  // Redraw the canvas whenever the image, zoom, or rotation changes — this is
  // both the live preview and the export source (WYSIWYG).
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !img) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    ctx.save();
    ctx.translate(CANVAS_SIZE / 2, CANVAS_SIZE / 2);
    ctx.rotate((rotation * Math.PI) / 180);
    const scale = drawScale(img.naturalWidth, img.naturalHeight, CANVAS_SIZE, rotation, zoom);
    ctx.scale(scale, scale);
    ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
    ctx.restore();
  }, [img, zoom, rotation]);

  useEffect(() => { draw(); }, [draw]);

  async function handleConfirm() {
    const canvas = canvasRef.current;
    if (!canvas || !img) return;
    setExporting(true);
    try {
      const blob = await new Promise((resolve, reject) => {
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('export'))), 'image/jpeg', 0.9);
      });
      await onConfirm(blob);
    } catch {
      toast({ title: t('profileEdit.uploadFailed'), variant: 'destructive' });
    } finally {
      setExporting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-terra" />
      </div>
    );
  }

  if (errorKey) {
    const msg = errorKey === 'too_large' ? t('profileEdit.photoTooLarge') : t('profileEdit.photoInvalid');
    return (
      <div className="text-center py-8 space-y-3">
        <p className="text-sm text-ink-deep/60">{msg}</p>
        <Button variant="outline" onClick={onCancel}>{t('common.close')}</Button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* WYSIWYG circular preview — the canvas is the export source of truth */}
      <div className="flex justify-center">
        <canvas
          ref={canvasRef}
          width={CANVAS_SIZE}
          height={CANVAS_SIZE}
          className="w-[240px] h-[240px] rounded-full border-4 border-cream-pale shadow-lg"
        />
      </div>

      {/* Zoom */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="tt-label text-ink-deep/60 flex items-center gap-1">
            <ZoomIn className="w-3 h-3" /> {t('profileEdit.zoom')}
          </label>
          <span className="text-xs text-ink-deep/45">{zoom.toFixed(1)}×</span>
        </div>
        <Slider
          value={[zoom]}
          min={1}
          max={3}
          step={0.05}
          onValueChange={(v) => setZoom(v[0])}
          aria-label={t('profileEdit.zoom')}
        />
      </div>

      {/* Rotate */}
      <div className="flex items-center justify-between">
        <label className="tt-label text-ink-deep/60">{t('profileEdit.rotate')}</label>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setRotation((r) => (r - 90 + 360) % 360)}
            aria-label={t('profileEdit.rotateLeft')}
            disabled={exporting}
          >
            <RotateCcw className="w-4 h-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setRotation((r) => (r + 90) % 360)}
            aria-label={t('profileEdit.rotateRight')}
            disabled={exporting}
          >
            <RotateCw className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-1">
        <Button variant="outline" className="flex-1" onClick={onCancel} disabled={exporting}>
          {t('common.cancel')}
        </Button>
        <Button className="flex-1" onClick={handleConfirm} disabled={exporting}>
          {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          {t('common.confirm')}
        </Button>
      </div>
    </div>
  );
}