'use client'

import { useEffect } from 'react'
import { useApp } from '@/lib/AppContext'
import styles from './NotificationsModal.module.css'

export default function NotificationsModal({ isOpen, onClose }) {
  const { notifications, loadNotifications, markNotificationAsRead, handleNotificationClick } = useApp()

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
      // Обновляем уведомления в фоне при открытии (без показа loading)
      if (loadNotifications) {
        loadNotifications(true) // silent = true, чтобы не показывать toast'ы
      }
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen, loadNotifications])

  if (!isOpen) return null

  const getNotificationIcon = (type) => {
    switch (type) {
      case 'new_response':
        return '👋'
      case 'response_accepted':
      case 'order_confirmed':
        return '✅'
      case 'new_message':
        return '💬'
      case 'order_cancelled':
        return '❌'
      default:
        return '🔔'
    }
  }

  const getNotificationTitle = (type) => {
    switch (type) {
      case 'new_response':
        return 'Новый отклик'
      case 'response_accepted':
      case 'order_confirmed':
        return 'Заказ подтвержден'
      case 'new_message':
        return 'Новое сообщение'
      case 'order_cancelled':
        return 'Заказ отменен'
      default:
        return 'Уведомление'
    }
  }

  const formatTime = (dateString) => {
    if (!dateString) return ''
    const date = new Date(dateString)
    const now = new Date()
    const diff = now - date
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    const days = Math.floor(diff / 86400000)

    if (minutes < 1) return 'только что'
    if (minutes < 60) return `${minutes} ${minutes === 1 ? 'минуту' : minutes < 5 ? 'минуты' : 'минут'} назад`
    if (hours < 24) return `${hours} ${hours === 1 ? 'час' : hours < 5 ? 'часа' : 'часов'} назад`
    return `${days} ${days === 1 ? 'день' : days < 5 ? 'дня' : 'дней'} назад`
  }

  const handleNotificationClickLocal = async (notification) => {
    // Отмечаем как прочитанное
    if (!notification.read && !notification.is_read && markNotificationAsRead) {
      await markNotificationAsRead(notification.id)
    }
    
    // Обрабатываем клик
    if (handleNotificationClick) {
      handleNotificationClick(notification)
    }
    
    // Закрываем модалку
    onClose()
  }

  const notificationsList = notifications || []

  return (
    <div className={styles.modal}>
      <div className={styles.overlay} onClick={onClose}></div>
      <div className={styles.content} onClick={(e) => e.stopPropagation()}>
        <div className={styles.handle}></div>
        
        <div className={styles.header}>
          <h2 className={styles.title}>Уведомления</h2>
          <button className={styles.close} onClick={onClose}>&times;</button>
        </div>

        <div className={styles.body}>
          {notificationsList.length === 0 ? (
            <div className={styles.empty}>
              <div className={styles.emptyIcon}>🔕</div>
              <p className={styles.emptyText}>Пока нет уведомлений</p>
            </div>
          ) : (
            <div className={styles.list}>
              {notificationsList.map((notification) => {
                const payload = notification.payload ? (typeof notification.payload === 'string' ? JSON.parse(notification.payload) : notification.payload) : {}
                const type = payload.type || notification.type
                const isUnread = !notification.read && !notification.is_read

                return (
                  <div
                    key={notification.id}
                    className={`${styles.notification} ${isUnread ? styles.unread : ''}`}
                    onClick={() => handleNotificationClickLocal(notification)}
                  >
                    <div className={styles.notificationIcon}>
                      {getNotificationIcon(type)}
                    </div>
                    <div className={styles.notificationContent}>
                      <div className={styles.notificationHeader}>
                        <h3 className={styles.notificationTitle}>{getNotificationTitle(type)}</h3>
                        {isUnread && <span className={styles.unreadBadge}></span>}
                      </div>
                      <p className={styles.notificationMessage}>
                        {notification.message || 'У вас новое уведомление'}
                      </p>
                      <span className={styles.notificationTime}>
                        {formatTime(notification.created_at)}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

