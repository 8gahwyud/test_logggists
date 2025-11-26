'use client'

import styles from './ProfileSupport.module.css'

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

export default function ProfileSupport({ onSupportClick }) {
  return (
    <div className={styles.support}>
      <p className={styles.intro}>
        Ниже указаны все темы по которым вы можете обратиться в поддержку
      </p>

      <div className={styles.topics}>
        {supportTopics.map((topic, index) => (
          <div key={index} className={styles.topicCard}>
            <p className={styles.topicTitle}>{topic.title}</p>
            <p className={styles.topicDescription}>{topic.description}</p>
          </div>
        ))}
      </div>

      <button className={styles.supportBtn} onClick={onSupportClick}>
        <img src="/img/supportIcon.png" alt="Support" className={styles.supportIcon} />
        <span className={styles.supportText}>Написать в поддержку</span>
      </button>
    </div>
  )
}








