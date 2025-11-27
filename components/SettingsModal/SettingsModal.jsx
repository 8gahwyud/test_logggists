'use client'

import { useState, useEffect } from 'react'
import { useApp } from '@/lib/AppContext'
import styles from './SettingsModal.module.css'
import { useSwipeToClose } from '@/hooks/useSwipeToClose'

// Функция для загрузки настройки из localStorage
const getNotificationsEnabled = () => {
  if (typeof window === 'undefined') return true
  const saved = localStorage.getItem('notificationsEnabled')
  return saved === null || saved === 'true' // По умолчанию включены
}

export default function SettingsModal({ isOpen, onClose, onModalStateChange }) {
  const { setIsAnyModalOpen } = useApp()
  // Инициализируем состояние сразу из localStorage
  const [notificationsEnabled, setNotificationsEnabled] = useState(() => getNotificationsEnabled())
  const contentRef = useSwipeToClose(onClose, isOpen)

  useEffect(() => {
    if (isOpen) {
      // Обновляем настройку при открытии (на случай если изменилась в другом месте)
      setNotificationsEnabled(getNotificationsEnabled())
      if (onModalStateChange) {
        onModalStateChange(true)
      }
      // Уведомляем AppContext об открытии модалки
      if (setIsAnyModalOpen) {
        setIsAnyModalOpen(true)
      }
      document.body.style.overflow = 'hidden'
    }
    return () => {
      if (onModalStateChange) {
        onModalStateChange(false)
      }
      // Уведомляем AppContext о закрытии модалки
      if (setIsAnyModalOpen) {
        setIsAnyModalOpen(false)
      }
      document.body.style.overflow = ''
    }
  }, [isOpen, onModalStateChange, setIsAnyModalOpen])

  const handleNotificationsToggle = (enabled) => {
    setNotificationsEnabled(enabled)
    localStorage.setItem('notificationsEnabled', enabled.toString())
    
    // Если уведомления отключены, скрываем все текущие тосты
    if (!enabled && typeof window !== 'undefined') {
      // Отправляем событие для скрытия тостов
      window.dispatchEvent(new CustomEvent('notificationsDisabled'))
    }
  }

  if (!isOpen) return null

  return (
    <div className={styles.modal}>
      <div className={styles.overlay} onClick={onClose}></div>
      <div ref={contentRef} className={styles.content} onClick={(e) => e.stopPropagation()}>
        <div className={styles.handle}></div>
        
        <div className={styles.header}>
          <h2 className={styles.title}>Параметры</h2>
        </div>

        <div className={styles.settings}>
          <div className={styles.settingItem}>
            <div className={styles.settingInfo}>
              <h3 className={styles.settingTitle}>Всплывающие уведомления</h3>
              <p className={styles.settingDescription}>
                Показывать мини-уведомления в правом нижнем углу
              </p>
            </div>
            <div className={styles.toggle}>
              <input
                type="checkbox"
                id="notifications"
                checked={notificationsEnabled}
                onChange={(e) => handleNotificationsToggle(e.target.checked)}
                className={styles.toggleInput}
              />
              <label htmlFor="notifications" className={styles.toggleLabel}>
                <span className={styles.toggleSlider}></span>
              </label>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

