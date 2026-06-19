import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const host = request.headers.get('host') || '';

  // vercel.app ile biten/içeren tüm adresleri www.munazarank.com'a 308 (kalıcı) olarak yönlendir
  if (host.includes('.vercel.app')) {
    const url = request.nextUrl.clone();
    url.host = 'www.munazarank.com';
    url.protocol = 'https';
    url.port = '';
    return NextResponse.redirect(url, 308);
  }

  const path = request.nextUrl.pathname;

  // Tüm /api/admin/ rotalarını koru (login ve logout hariç)
  if (path.startsWith('/api/admin') && !path.endsWith('/login') && !path.endsWith('/logout')) {
    const adminToken = request.cookies.get('munazara_admin')?.value;

    if (!adminToken) {
      return NextResponse.json(
        { error: 'Bu işlem için yetkiniz yok. Lütfen giriş yapın.' },
        { status: 401 }
      );
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - static image/asset files
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
