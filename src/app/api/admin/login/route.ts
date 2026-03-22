import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function POST(req: Request) {
  try {
    const { username, password } = await req.json();

    if (!username || !password) {
      return NextResponse.json({ error: 'Kullanıcı adı ve şifre gerekli.' }, { status: 400 });
    }

    const credentialsStr = process.env.ADMIN_CREDENTIALS;
    if (!credentialsStr) {
      return NextResponse.json({ error: 'Oturum sistemi yapılandırılmamış (ADMIN_CREDENTIALS eksik).' }, { status: 500 });
    }

    const validAdmins = credentialsStr.split(',').map((pair) => {
      const [u, p] = pair.split(':');
      return { user: u?.trim(), pass: p?.trim() };
    });

    const isValid = validAdmins.some((admin) => admin.user === username && admin.pass === password);

    if (isValid) {
      // Güvenli (HttpOnly) Cookie ataması
      const token = Buffer.from(`${username}:${Date.now()}`).toString('base64');
      
      const cookieStore = await cookies();
      cookieStore.set({
        name: 'munazara_admin',
        value: token,
        httpOnly: true,
        path: '/',
        secure: process.env.NODE_ENV === 'production',
        maxAge: 60 * 60 * 24 * 7, // 1 hafta
      });

      return NextResponse.json({ success: true, username });
    }

    return NextResponse.json({ error: 'Kullanıcı adı veya şifre hatalı.' }, { status: 401 });
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json({ error: 'Giriş işlemi başarısız.' }, { status: 500 });
  }
}
