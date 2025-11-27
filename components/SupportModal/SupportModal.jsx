'use client'

import { useEffect } from 'react'
import styles from './SupportModal.module.css'
import { useSwipeToClose } from '@/hooks/useSwipeToClose'

const supportTopics = [
  {
    title: 'Проблемы с оплатой',
    description: 'Вопросы по выводу средств и начислениям'
  },
  {
    title: 'Технические проблемы',
    description: 'Ошибки в работе приложения'
  },
  {
    title: 'Спорные ситуации',
    description: 'Конфликты с заказчиками и их решение'
  },
  {
    title: 'Вопросы по заказам',
    description: 'Помощь в уточнении вопросов по заказам'
  }
]

export default function SupportModal({ onClose }) {
  const contentRef = useSwipeToClose(onClose, true)
  useEffect(() => {
    // Блокируем прокрутку body
    document.body.style.overflow = 'hidden'
    return () => {
      // Разблокируем прокрутку body
      document.body.style.overflow = ''
    }
  }, [])

  return (
    <div className={styles.modal}>
      <div className={styles.overlay} onClick={onClose}></div>
      <div ref={contentRef} className={styles.content} onClick={(e) => e.stopPropagation()}>
        <div className={styles.handle}></div>
        
        <div className={styles.header}>
          <button className={styles.close} onClick={onClose}>&times;</button>
          <h2 className={styles.title}>Поддержка</h2>
          <p className={styles.subtitle}>
            Ниже указаны все темы по которым вы можете обратиться в поддержку
          </p>
        </div>

        <div className={styles.topics}>
          {supportTopics.map((topic, index) => (
            <div key={index} className={styles.topicCard}>
              <p className={styles.topicTitle}>{topic.title}</p>
              <p className={styles.topicDescription}>{topic.description}</p>
            </div>
          ))}
        </div>

        <button 
          className={styles.supportBtn}
          onClick={() => {
            window.open('https://t.me/Truvo_Support_Bot', '_blank')
          }}
        >
          Написать в поддержку
        </button>
      </div>
    </div>
  )
}


