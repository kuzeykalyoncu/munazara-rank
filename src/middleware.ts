import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
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
  matcher: ['/api/admin/:path*'],
};
