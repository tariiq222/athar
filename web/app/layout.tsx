import localFont from 'next/font/local'
import { IBM_Plex_Sans_Arabic } from 'next/font/google'
import './../styles/globals.css'

const handicrafts = localFont({
  src: [
    { path: './fonts/handicrafts/TheYearofHandicraftsTTF-Reg.ttf', weight: '400' },
    { path: './fonts/handicrafts/TheYearofHandicraftsTTF-Med.ttf', weight: '500' },
    { path: './fonts/handicrafts/TheYearofHandicraftsTTF-SemBd.ttf', weight: '600' },
    { path: './fonts/handicrafts/TheYearofHandicraftsTTF-Bold.ttf', weight: '700' },
    { path: './fonts/handicrafts/TheYearofHandicraftsTTF-Black.ttf', weight: '900' },
  ],
  variable: '--font-handicrafts',
  display: 'swap',
})

// IBM Plex Sans Arabic — served via Google Fonts (SIL OFL; same license as a
// local copy). The brief allowed this path explicitly to avoid committing the
// font binary at M1.
const plexArabic = IBM_Plex_Sans_Arabic({
  subsets: ['arabic'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-plex-arabic',
  display: 'swap',
})

const effra = localFont({
  src: [
    { path: './fonts/effra/Effra Regular.otf', weight: '400' },
    { path: './fonts/effra/Effra Medium.otf', weight: '500' },
    { path: './fonts/effra/Effra Bold.otf', weight: '700' },
  ],
  variable: '--font-effra',
  display: 'swap',
})

export const metadata = {
  title: 'أثر',
  description: 'من المعرفة إلى الأثر',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" className={`${handicrafts.variable} ${plexArabic.variable} ${effra.variable}`}>
      <body>{children}</body>
    </html>
  )
}