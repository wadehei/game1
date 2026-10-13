/**
 * 照片头像上传：客户端裁成正方形并压缩到 256px（webp，Safari 退 jpeg）
 * 返回可直接存入 avatar 字段的相对 URL
 */
export const uploadPhotoAvatar = async (file: File): Promise<string> => {
  const bitmap = await createImageBitmap(file);

  const SIZE = 256;
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('canvas 不可用');
  }
  // cover 裁切为正方形
  const scale = Math.max(SIZE / bitmap.width, SIZE / bitmap.height);
  const w = bitmap.width * scale;
  const h = bitmap.height * scale;
  ctx.drawImage(bitmap, (SIZE - w) / 2, (SIZE - h) / 2, w, h);
  bitmap.close?.();

  let blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.85));
  if (!blob) {
    blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
  }
  if (!blob) {
    throw new Error('压缩失败');
  }

  const res = await fetch('/api/upload/avatar', {
    method: 'POST',
    headers: { 'Content-Type': blob.type },
    body: blob,
  });
  const data = await res.json();
  if (!res.ok || data?.code !== 200) {
    throw new Error(data?.message || '上传失败');
  }
  return data.data.url as string;
};
