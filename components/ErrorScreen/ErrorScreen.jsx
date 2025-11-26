'use client'

import { useState } from 'react'
import styles from './ErrorScreen.module.css'

export default function ErrorScreen({ error, isNetworkError = false, onRetry }) {
  const [isRetrying, setIsRetrying] = useState(false)

  const handleRetry = async () => {
    if (onRetry) {
      setIsRetrying(true)
      try {
        await onRetry()
      } finally {
        setIsRetrying(false)
      }
    } else {
      window.location.reload()
    }
  }

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        {isNetworkError ? (
          <>
            <div className={styles.icon}>📡</div>
            <h2 className={styles.title}>Проблема с подключением</h2>
            <p className={styles.message}>
              Не удалось подключиться к серверу.<br />
              Проверьте подключение к интернету и попробуйте снова.
            </p>
          </>
        ) : (
          <>
            <div className={styles.icon}>⚠️</div>
            <h2 className={styles.title}>Произошла ошибка</h2>
            <p className={styles.message}>
              {typeof error === 'string' 
                ? error 
                : error?.message || error?.code || JSON.stringify(error) || 'Произошла ошибка при загрузке данных. Попробуйте повторить позже.'}
            </p>
          </>
        )}
        
        <button 
          className={styles.retryButton}
          onClick={handleRetry}
          disabled={isRetrying}
        >
          {isRetrying ? 'Повторная попытка...' : 'Повторить попытку'}
        </button>
      </div>
    </div>
  )
}


