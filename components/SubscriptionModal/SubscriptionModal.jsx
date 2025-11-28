'use client'

import { useEffect, useState, useMemo, useCallback, memo, useRef } from 'react'
import { useApp } from '@/lib/AppContext'
import styles from './SubscriptionModal.module.css'
import { useSwipeToClose } from '@/hooks/useSwipeToClose'

// Мемоизируем содержимое модалки, чтобы оно не вызывало перерендер обертки
// Используем кастомную функцию сравнения для более точного контроля
const SubscriptionContent = memo(({ 
  subscriptions, 
  selectedSubscription, 
  setSelectedSubscription, 
  loading, 
  error, 
  fetchSubscriptions,
  handleConfirm 
}) => {
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
    <>
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
    </>
  )
}, (prevProps, nextProps) => {
  // Сравниваем только важные данные, игнорируя функции
  return (
    prevProps.loading === nextProps.loading &&
    prevProps.error === nextProps.error &&
    prevProps.selectedSubscription === nextProps.selectedSubscription &&
    prevProps.subscriptions.length === nextProps.subscriptions.length &&
    prevProps.subscriptions.every((sub, index) => {
      const nextSub = nextProps.subscriptions[index]
      return nextSub && sub.id === nextSub.id && sub.name === nextSub.name && sub.price === nextSub.price
    })
  )
})

SubscriptionContent.displayName = 'SubscriptionContent'

export default function SubscriptionModal({ onClose, onModalStateChange }) {
  const { showAlert, callApi } = useApp()
  const [selectedSubscription, setSelectedSubscription] = useState(null)
  const [subscriptions, setSubscriptions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const hasFetchedRef = useRef(false) // Флаг, что данные уже загружены
  
  // Стабильный onClose, чтобы хук не перезапускался
  const stableOnClose = useCallback(() => {
    onClose?.()
  }, [onClose])
  
  // Мемоизируем ref, чтобы он не менялся при перерендерах
  const contentRef = useSwipeToClose(stableOnClose, true)

  const fetchSubscriptions = useCallback(async () => {
    // Не загружаем повторно, если уже загружали
    if (hasFetchedRef.current && subscriptions.length > 0) {
      return
    }
    
    setLoading(true)
    setError(null)

    try {
      const resp = await callApi({ action: 'getSubscriptions' })
      if (resp?.success && resp?.subscriptions) {
        setSubscriptions(resp.subscriptions)
        setSelectedSubscription(resp.subscriptions?.[0]?.id || null)
        hasFetchedRef.current = true
      } else {
        const fallbackMessage = typeof resp?.error === 'string' ? resp.error : 'Не удалось загрузить подписки'
        setError(fallbackMessage)
      }
    } catch (err) {
      setError('Ошибка при загрузке подписок')
    }

    setLoading(false)
  }, [callApi, subscriptions.length])

  useEffect(() => {
    // Блокируем прокрутку body
    document.body.style.overflow = 'hidden'
    // Уведомляем родительский компонент, что модалка открыта
    if (onModalStateChange) {
      onModalStateChange(true)
    }
    
    // Загружаем данные только один раз при монтировании
    if (!hasFetchedRef.current) {
      fetchSubscriptions()
    }
    
    return () => {
      // Разблокируем прокрутку body
      document.body.style.overflow = ''
      // Уведомляем родительский компонент, что модалка закрыта
      if (onModalStateChange) {
        onModalStateChange(false)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Вызываем только при монтировании

  // Мемоизируем setSelectedSubscription, чтобы он не менялся
  const stableSetSelectedSubscription = useCallback((id) => {
    setSelectedSubscription(id)
  }, [])
  
  // Стабильные функции, которые не меняются при перерендерах
  const stableFetchSubscriptions = useCallback(() => {
    fetchSubscriptions()
  }, [fetchSubscriptions])
  
  const stableHandleConfirm = useCallback(async () => {
    if (!selectedSubscription) return

    const chosen = subscriptions.find(sub => sub.id === selectedSubscription)
    if (!chosen) return

    await showAlert("Подписка выбрана", `🐱 Мяу! Вы выбрали подписку "${chosen.name}". Стоимость: ${chosen.price?.toLocaleString('ru-RU')} ₽/мес`)
    onClose?.()
  }, [selectedSubscription, subscriptions, showAlert, onClose])
  
  // Мемоизируем содержимое, чтобы обертка не перерендеривалась
  // Сравниваем только при реальных изменениях данных
  const contentProps = useMemo(() => ({
    subscriptions,
    selectedSubscription,
    setSelectedSubscription: stableSetSelectedSubscription,
    loading,
    error,
    fetchSubscriptions: stableFetchSubscriptions,
    handleConfirm: stableHandleConfirm
  }), [subscriptions, selectedSubscription, loading, error, stableSetSelectedSubscription, stableFetchSubscriptions, stableHandleConfirm])

  // Стабильные обработчики для обертки
  const stableStopPropagation = useCallback((e) => {
    e.stopPropagation()
  }, [])

  return (
    <div className={`${styles.bottomSheetOverlay} ${styles.bottomSheetOverlayOpen}`} onClick={stableOnClose}>
      <div 
        key="subscription-modal-content" 
        ref={contentRef} 
        className={`${styles.bottomSheet} ${styles.bottomSheetActive}`} 
        onClick={stableStopPropagation}
      >
        <button className={styles.closeButton} onClick={stableOnClose} aria-label="Закрыть модалку">
          ✕
        </button>
        <div className={styles.bottomSheetHandle}></div>
        
        <SubscriptionContent {...contentProps} />
      </div>
    </div>
  )
}


