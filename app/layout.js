import './globals.css'
import { AppProvider } from '@/lib/AppContext'
import TelegramDebug from '@/components/TelegramDebug/TelegramDebug'

export const metadata = {
  title: 'Платформа для логистов',
  description: 'Платформа для управления заказами логистов',
}

export default function RootLayout({ children }) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Roboto:ital,wght@0,100..900;1,100..900&display=swap" rel="stylesheet" />
        <link href="https://fonts.googleapis.com/css2?family=Montserrat:ital,wght@0,100..900;1,100..900&display=swap" rel="stylesheet" />
        <script src="https://telegram.org/js/telegram-web-app.js"></script>
      </head>
      <body suppressHydrationWarning>
        <AppProvider>
          <div className="app-container">
            {children}
          </div>
          <TelegramDebug />
        </AppProvider>
      </body>
    </html>
  )
}


