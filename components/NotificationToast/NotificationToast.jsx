'use client'

import { useEffect } from 'react'
import styles from './NotificationToast.module.css'

export default function NotificationToast({ notification, onClick, onClose }) {
  useEffect(() => {
    console.log('[NotificationToast] Компонент смонтирован с уведомлением:', notification?.id)
    // Автоматически скрываем через 10 секунд
    const timer = setTimeout(() => {
      console.log('[NotificationToast] Автоматическое закрытие через 10 секунд')
      if (onClose) {
        onClose()
      }
    }, 10000)

    return () => {
      console.log('[NotificationToast] Компонент размонтирован')
      clearTimeout(timer)
    }
  }, [onClose, notification])

  useEffect(() => {
    console.log('[NotificationToast] Уведомление изменилось:', notification?.id, notification?.message)
  }, [notification])

  if (!notification) {
    console.log('[NotificationToast] notification отсутствует, не рендерим')
    return null
  }

  console.log('[NotificationToast] Рендерим toast для уведомления:', notification.id)

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

  let payload = {}
  let type = notification.type
  
  try {
    if (notification.payload) {
      payload = typeof notification.payload === 'string' 
        ? JSON.parse(notification.payload) 
        : notification.payload
      type = payload.type || notification.type
    }
  } catch (e) {
    console.error('[NotificationToast] Ошибка парсинга payload:', e)
    type = notification.type || 'unknown'
  }

  return (
    <div className={styles.toast} onClick={onClick}>
      <div className={styles.icon}>{getNotificationIcon(type)}</div>
      <div className={styles.content}>
        <div className={styles.title}>{getNotificationTitle(type)}</div>
        <div className={styles.message}>{notification.message || 'У вас новое уведомление'}</div>
      </div>
      <button className={styles.close} onClick={(e) => {
        e.stopPropagation()
        if (onClose) onClose()
      }}>&times;</button>
    </div>
  )
}

