'use client'

import { useState } from 'react'
import { useApp } from '@/lib/AppContext'
import NotificationsModal from '../NotificationsModal/NotificationsModal'
import styles from './Header.module.css'

export default function Header() {
  const { userName, profile, clearToasts, unreadNotificationsCount } = useApp()
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false)
  
  const getStatusText = () => {
    // Используем название подписки из базы данных, если оно есть
    if (profile?.subscription?.name) {
      return profile.subscription.name
    }
    // Если подписки нет, показываем "Start (free)"
    return "Start (free)"
  }

  // Получаем URL аватарки из профиля или используем стандартную
  const avatarUrl = profile?.avatar_url || '/img/new-desin/avatar.png'

  return (
    <>
      <header className={styles.header}>
        <img 
          className={styles.avatar} 
          src={avatarUrl} 
          alt="Avatar"
          onError={(e) => {
            // Если аватарка не загрузилась, используем стандартную
            e.target.src = '/img/new-desin/avatar.png'
          }}
        />
        <div className={styles.info}>
          <p className={styles.fio}>{userName || 'Загрузка...'}</p>
          <p className={styles.status}>{getStatusText()}</p>
        </div>
        <button 
          className={styles.bellButton}
          onClick={() => {
            if (clearToasts) {
              clearToasts()
            }
            setIsNotificationsOpen(true)
          }}
          aria-label="Уведомления"
        >
          <img 
            className={styles.bell} 
            src="/img/new-desin/bell.png" 
            alt="Notifications" 
          />
          {unreadNotificationsCount > 0 && (
            <span className={styles.bellBadge}>{unreadNotificationsCount > 99 ? '99+' : unreadNotificationsCount}</span>
          )}
        </button>
      </header>
      <NotificationsModal 
        isOpen={isNotificationsOpen}
        onClose={() => setIsNotificationsOpen(false)}
      />
    </>
  )
}


