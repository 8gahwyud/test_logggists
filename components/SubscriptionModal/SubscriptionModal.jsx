'use client'

import { useEffect, useState } from 'react'
import { useApp } from '@/lib/AppContext'
import styles from './SubscriptionModal.module.css'

export default function SubscriptionModal({ onClose, onModalStateChange }) {
  const { showAlert, callApi } = useApp()
  const [selectedSubscription, setSelectedSubscription] = useState(null)
  const [subscriptions, setSubscriptions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchSubscriptions = async () => {
    setLoading(true)
    setError(null)

    try {
      const resp = await callApi({ action: 'getSubscriptions' })
      if (resp?.success && resp?.subscriptions) {
        setSubscriptions(resp.subscriptions)
        setSelectedSubscription(resp.subscriptions?.[0]?.id || null)
      } else {
        const fallbackMessage = typeof resp?.error === 'string' ? resp.error : 'Не удалось загрузить подписки'
        setError(fallbackMessage)
      }
    } catch (err) {
      setError('Ошибка при загрузке подписок')
    }

    setLoading(false)
  }

  useEffect(() => {
    // Блокируем прокрутку body
    document.body.style.overflow = 'hidden'
    // Уведомляем родительский компонент, что модалка открыта
    if (onModalStateChange) {
      onModalStateChange(true)
    }
    
    fetchSubscriptions()
    
    return () => {
      // Разблокируем прокрутку body
      document.body.style.overflow = ''
      // Уведомляем родительский компонент, что модалка закрыта
      if (onModalStateChange) {
        onModalStateChange(false)
      }
    }
  }, []) // Убираем зависимости, чтобы избежать бесконечного цикла

  const handleConfirm = async () => {
    if (!selectedSubscription) return

    const chosen = subscriptions.find(sub => sub.id === selectedSubscription)
    if (!chosen) return

    await showAlert("Подписка выбрана", `🐱 Мяу! Вы выбрали подписку "${chosen.name}". Стоимость: ${chosen.price?.toLocaleString('ru-RU')} ₽/мес`)
    onClose?.()
  }

  const renderBody = () => {
    if (loading) {
      return <div className={styles.stateMessage}>Загружаем тарифы...</div>
    }

    if (error) {
      return (
        <div className={styles.stateMessage}>
          <p className={styles.errorMessage}>{error}</p>
          <button className={styles.retryButton} onClick={fetchSubscriptions}>
            Попробовать снова
          </button>
        </div>
      )
    }

    if (!subscriptions.length) {
      return <div className={styles.stateMessage}>Подписки не найдены</div>
    }

    return (
      <div className={styles.subscriptionsList}>
        {subscriptions.map((sub) => (
          <div
            key={sub.id}
            className={`${styles.subscriptionCardNew} ${selectedSubscription === sub.id ? styles.selected : ''}`}
            onClick={() => setSelectedSubscription(sub.id)}
          >
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: '#333', fontFamily: "'Montserrat', sans-serif" }}>{sub.name}</h3>
                </div>
                <div style={{ fontSize: '16px', fontWeight: 600, color: '#333', fontFamily: "'Montserrat', sans-serif" }}>{Number(sub.price || 0).toLocaleString('ru-RU')} ₽/мес</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {(sub.features || []).map((feature, index) => (
                  <div key={index} style={{ fontSize: '14px', color: '#666', fontFamily: "'Montserrat', sans-serif" }}>{feature}</div>
                ))}
              </div>
            </div>
            <div style={{ marginLeft: '16px', flexShrink: 0 }}>
              <div style={{ width: '24px', height: '24px', borderRadius: '50%', border: selectedSubscription === sub.id ? '2px solid #1775F1' : '2px solid #E0E0E0', background: selectedSubscription === sub.id ? '#1775F1' : 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {selectedSubscription === sub.id && <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'white' }}></div>}
              </div>
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className={`${styles.bottomSheetOverlay} ${styles.bottomSheetOverlayOpen}`} onClick={onClose}>
      <div className={`${styles.bottomSheet} ${styles.bottomSheetActive}`} onClick={(e) => e.stopPropagation()}>
        <button className={styles.closeButton} onClick={onClose} aria-label="Закрыть модалку">
          ✕
        </button>
        <div className={styles.bottomSheetHandle}></div>
        
        <div className={styles.subscriptionHeader}>
          <h2 className={styles.subscriptionTitle}>Выберите подписку</h2>
          <p className={styles.subscriptionSubtitle}>Увеличьте свои возможности и заработок</p>
        </div>

        <div className={styles.subscriptionsContainer}>
          {renderBody()}
        </div>

        <div className={styles.subscriptionFooter}>
          <p className={styles.footerText}>🐱 Мяу! Все подписки продлеваются автоматически</p>
          <button
            className={styles.confirmButton}
            disabled={!selectedSubscription || loading || !!error}
            onClick={handleConfirm}
          >
            Выбрать подписку
          </button>
        </div>
      </div>
    </div>
  )
}


