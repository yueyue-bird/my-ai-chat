import { get } from '@vercel/blob';

const RANGE_PATTERN = /^bytes=(\d*)-(\d*)$/;

const blobToken = () => process.env.BLOB_READ_WRITE_TOKEN
  ? { token: process.env.BLOB_READ_WRITE_TOKEN }
  : {};

export async function createPrivateBlobMediaResponse(
  request: Request,
  pathname: string,
  options: { download?: boolean } = {}
) {
  const range = request.headers.get('range')?.trim() || '';
  if (range && (!RANGE_PATTERN.test(range) || range === 'bytes=-')) {
    return new Response(null, {
      status: 416,
      headers: { 'Accept-Ranges': 'bytes' },
    });
  }

  const result = await get(pathname, {
    access: 'private',
    useCache: false,
    headers: range ? { Range: range } : undefined,
    ...blobToken(),
  });
  if (!result || result.statusCode !== 200 || !result.stream) return null;

  const contentRange = result.headers.get('content-range');
  const contentLength = result.headers.get('content-length') || String(result.blob.size);
  const headers = new Headers({
    'Accept-Ranges': result.headers.get('accept-ranges') || 'bytes',
    'Cache-Control': 'private, max-age=3600, no-transform',
    'Content-Length': contentLength,
    'Content-Type': result.blob.contentType || 'application/octet-stream',
  });

  if (contentRange) headers.set('Content-Range', contentRange);
  const etag = result.headers.get('etag');
  if (etag) headers.set('ETag', etag);
  const lastModified = result.headers.get('last-modified');
  if (lastModified) headers.set('Last-Modified', lastModified);

  if (options.download) {
    const filename = pathname.split('/').pop() || 'music.mp3';
    headers.set('Content-Disposition', `attachment; filename="${filename.replace(/["\\]/g, '_')}"`);
  }

  return new Response(result.stream, {
    status: contentRange ? 206 : 200,
    headers,
  });
}
