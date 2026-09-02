const SUPPORTED_WIDTHS = [320, 640, 1280];

export function createImageService({ storedImageResponse }) {
  async function responsiveImage(object, request, env, { storedCacheControl, transformedCacheControl }) {
    const width = Number(new URL(request.url).searchParams.get('width'));
    if (!object || !env.IMAGES || !SUPPORTED_WIDTHS.includes(width)) {
      return storedImageResponse(object, request, storedCacheControl);
    }
    const acceptsAvif = String(request.headers.get('Accept') || '').includes('image/avif');
    const format = acceptsAvif ? 'image/avif' : 'image/webp';
    const transformed = (await env.IMAGES.input(object.body).transform({ width }).output({ format, quality: 82 })).response();
    const headers = new Headers(transformed.headers);
    headers.set('Cache-Control', transformedCacheControl);
    headers.set('Vary', 'Accept');
    return new Response(transformed.body, { status: transformed.status, headers });
  }
  return Object.freeze({ responsiveImage });
}
