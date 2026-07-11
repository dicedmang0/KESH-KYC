'use client';

import { useEffect, useRef, useState } from 'react';

type Props = {
  instruction: string;
  filenamePrefix: string;
  onCapture: (file: File) => Promise<void>;
  onClose: () => void;
};

type Phase = 'preview' | 'captured' | 'uploading';

export default function WebcamCapture({ instruction, filenamePrefix, onCapture, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [phase, setPhase] = useState<Phase>('preview');
  const [cameraError, setCameraError] = useState('');
  const [uploadError, setUploadError] = useState('');

  useEffect(() => {
    let cancelled = false;

    const initCamera = async () => {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        await Promise.resolve();
        if (!cancelled) setCameraError('Kamera tidak tersedia pada perangkat ini.');
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (err: unknown) {
        if (cancelled) return;
        const name = err instanceof DOMException ? err.name : '';
        if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
          setCameraError('Akses kamera ditolak. Izinkan akses kamera pada browser untuk mengambil foto.');
        } else {
          setCameraError('Kamera tidak tersedia pada perangkat ini.');
        }
      }
    };

    initCamera();

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, []);

  function stopTracks() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  function handleClose() {
    stopTracks();
    onClose();
  }

  function capturePhoto() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    setPhase('captured');
  }

  function retake() {
    setUploadError('');
    setPhase('preview');
  }

  async function handleUpload() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setPhase('uploading');
    setUploadError('');

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', 0.9);
    });

    if (!blob) {
      setUploadError('Gagal memproses foto. Silakan coba lagi.');
      setPhase('captured');
      return;
    }

    const file = new File([blob], `${filenamePrefix}-${Date.now()}.jpg`, { type: 'image/jpeg' });
    try {
      await onCapture(file);
    } catch {
      setUploadError('Upload gagal. Silakan coba lagi.');
      setPhase('captured');
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
    >
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl space-y-4 p-5">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-800">Ambil Foto</h3>
          <button
            type="button"
            onClick={handleClose}
            className="text-slate-400 hover:text-slate-600 text-lg leading-none"
          >
            ✕
          </button>
        </div>

        <p className="text-xs text-slate-500">{instruction}</p>

        {cameraError ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
            {cameraError}
          </div>
        ) : (
          <>
            <div
              className="relative overflow-hidden rounded-lg bg-black"
              style={{ aspectRatio: '4/3' }}
            >
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className={`w-full h-full object-cover${phase !== 'preview' ? ' hidden' : ''}`}
              />
              <canvas
                ref={canvasRef}
                className={`w-full h-full object-contain${phase === 'preview' ? ' hidden' : ''}`}
              />
            </div>

            {uploadError && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {uploadError}
              </div>
            )}

            <div className="flex flex-wrap gap-2 justify-end">
              {phase === 'preview' && (
                <button
                  type="button"
                  onClick={capturePhoto}
                  className="rounded-lg bg-kesh-700 px-4 py-2 text-sm text-white hover:bg-kesh-600 transition-colors"
                >
                  Ambil Foto
                </button>
              )}
              {(phase === 'captured' || phase === 'uploading') && (
                <>
                  <button
                    type="button"
                    onClick={retake}
                    disabled={phase === 'uploading'}
                    className="rounded-lg border px-4 py-2 text-sm hover:bg-slate-50 transition-colors disabled:opacity-50"
                  >
                    Ulangi
                  </button>
                  <button
                    type="button"
                    onClick={handleUpload}
                    disabled={phase === 'uploading'}
                    className="rounded-lg bg-kesh-700 px-4 py-2 text-sm text-white hover:bg-kesh-600 transition-colors disabled:opacity-50"
                  >
                    {phase === 'uploading' ? 'Mengunggah…' : 'Upload Foto'}
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={handleClose}
                disabled={phase === 'uploading'}
                className="rounded-lg border px-4 py-2 text-sm hover:bg-slate-50 transition-colors disabled:opacity-50"
              >
                Batal
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
