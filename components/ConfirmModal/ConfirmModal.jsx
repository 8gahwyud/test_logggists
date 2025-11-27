'use client'

import { useEffect } from 'react'
import styles from './ConfirmModal.module.css'
import { useSwipeToClose } from '@/hooks/useSwipeToClose'

export default function ConfirmModal({ 
  isOpen, 
  onClose, 
  title, 
  message, 
  type = 'alert', // 'alert' или 'confirm'
  confirmText = 'OK',
  cancelText = 'Отмена',
  onConfirm,
  onCancel
}) {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  if (!isOpen) return null

  const handleConfirm = () => {
    if (onConfirm) {
      onConfirm()
    }
    // onConfirm теперь сам закрывает модалку через AppContext
  }

  const handleCancel = () => {
    if (onCancel) {
      onCancel()
    }
    // onCancel теперь сам закрывает модалку через AppContext
  }
  
  const handleClose = type === 'alert' ? handleConfirm : handleCancel
  const contentRef = useSwipeToClose(handleClose, isOpen)

  return (
    <div className={styles.modal}>
      <div className={styles.overlay} onClick={type === 'alert' ? handleConfirm : handleCancel}></div>
      <div ref={contentRef} className={styles.content} onClick={(e) => e.stopPropagation()}>
        <div className={styles.handle}></div>
        
        <div className={styles.header}>
          <h2 className={styles.title}>{title}</h2>
          {message && (
            <div className={styles.message}>
              {message.split('\n').map((line, index) => (
                <p key={index} className={styles.messageLine}>{line}</p>
              ))}
            </div>
          )}
        </div>

        <div className={styles.buttons}>
          {type === 'confirm' && (
            <button 
              className={styles.cancelButton}
              onClick={handleCancel}
            >
              {cancelText}
            </button>
          )}
          <button 
            className={type === 'confirm' ? styles.confirmButton : styles.okButton}
            onClick={handleConfirm}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}

